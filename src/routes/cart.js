const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const redis = require('../config/redis');
const { verifyFirebaseToken } = require('../middleware/auth');

const getUserId = async (uid) => {
    const r = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [uid]);
    return r.rows[0]?.id;
};

const CART_TTL = 60 * 60 * 24 * 7; // 7 days in seconds

// Helper: get cart from Redis, fallback to PostgreSQL
const getCartFromCache = async (userId) => {
    try {
        const cached = await redis.get(`cart:${userId}`);
        if (cached) return JSON.parse(cached);
    } catch (_) { }
    return null;
};

// Helper: sync cart to Redis cache
const syncCartToCache = async (userId, cart) => {
    try {
        await redis.setex(`cart:${userId}`, CART_TTL, JSON.stringify(cart));
    } catch (_) { }
};

// Helper: invalidate cart cache
const invalidateCart = async (userId) => {
    try { await redis.del(`cart:${userId}`); } catch (_) { }
};

// GET /api/cart — Get cart (Redis first, then PostgreSQL)
router.get('/', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);

        // ⚡ Try Redis first
        const cached = await getCartFromCache(userId);
        if (cached) {
            return res.json({ success: true, cart: cached, source: 'cache' });
        }

        // 🐘 Fallback to PostgreSQL
        const result = await pool.query(`
      SELECT ci.id, ci.quantity, ci.size, ci.color, ci.added_at,
             p.id AS product_id, p.name, p.price, p.image_url, p.brand, p.stock
      FROM cart_items ci
      JOIN products p ON p.id = ci.product_id
      WHERE ci.user_id = $1
      ORDER BY ci.added_at DESC;
    `, [userId]);

        await syncCartToCache(userId, result.rows);
        res.json({ success: true, cart: result.rows, source: 'db' });
    } catch (err) { next(err); }
});

// POST /api/cart — Add to cart
router.post('/', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const { productId, quantity = 1, size, color } = req.body;

        await pool.query(`
      INSERT INTO cart_items (user_id, product_id, quantity, size, color)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (user_id, product_id, size, color)
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
    `, [userId, productId, quantity, size || '', color || '']);

        await invalidateCart(userId); // clear cache so next GET fetches fresh data
        res.status(201).json({ success: true, message: 'Added to cart' });
    } catch (err) { next(err); }
});

// PATCH /api/cart/:itemId — Update quantity
router.patch('/:itemId', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const { quantity } = req.body;

        if (quantity <= 0) {
            await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.itemId, userId]);
        } else {
            await pool.query(
                'UPDATE cart_items SET quantity = $1 WHERE id = $2 AND user_id = $3',
                [quantity, req.params.itemId, userId]
            );
        }

        await invalidateCart(userId);
        res.json({ success: true, message: 'Cart updated' });
    } catch (err) { next(err); }
});

// DELETE /api/cart/:itemId — Remove single item
router.delete('/:itemId', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2', [req.params.itemId, userId]);
        await invalidateCart(userId);
        res.json({ success: true, message: 'Item removed from cart' });
    } catch (err) { next(err); }
});

// DELETE /api/cart — Clear entire cart
router.delete('/', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
        await invalidateCart(userId);
        res.json({ success: true, message: 'Cart cleared' });
    } catch (err) { next(err); }
});

module.exports = router;
