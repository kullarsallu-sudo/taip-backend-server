const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyFirebaseToken } = require('../middleware/auth');

const getUserId = async (uid) => {
    const r = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [uid]);
    return r.rows[0]?.id;
};

// GET /api/wishlist
router.get('/', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const result = await pool.query(`
      SELECT w.id AS wishlist_id, w.added_at, p.*
      FROM wishlists w
      JOIN products p ON p.id = w.product_id
      WHERE w.user_id = $1
      ORDER BY w.added_at DESC;
    `, [userId]);
        res.json({ success: true, wishlist: result.rows });
    } catch (err) { next(err); }
});

// POST /api/wishlist — Toggle (add/remove)
router.post('/toggle', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const { productId } = req.body;

        const existing = await pool.query(
            'SELECT id FROM wishlists WHERE user_id = $1 AND product_id = $2',
            [userId, productId]
        );

        if (existing.rows[0]) {
            await pool.query('DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2', [userId, productId]);
            return res.json({ success: true, action: 'removed', message: 'Removed from wishlist' });
        } else {
            await pool.query('INSERT INTO wishlists (user_id, product_id) VALUES ($1,$2)', [userId, productId]);
            return res.json({ success: true, action: 'added', message: 'Added to wishlist' });
        }
    } catch (err) { next(err); }
});

// DELETE /api/wishlist/:productId
router.delete('/:productId', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        await pool.query('DELETE FROM wishlists WHERE user_id = $1 AND product_id = $2', [userId, req.params.productId]);
        res.json({ success: true, message: 'Removed from wishlist' });
    } catch (err) { next(err); }
});

module.exports = router;
