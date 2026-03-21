const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyFirebaseToken, requireAdmin } = require('../middleware/auth');

// ── Dashboard Stats ───────────────────────────────────────────────────────────

// GET /api/admin/stats — Overview numbers for admin dashboard
router.get('/stats', verifyFirebaseToken, requireAdmin, async (req, res, next) => {
    try {
        const [users, orders, products, revenue] = await Promise.all([
            pool.query('SELECT COUNT(*) FROM users'),
            pool.query('SELECT COUNT(*) FROM orders'),
            pool.query('SELECT COUNT(*) FROM products WHERE is_active = true'),
            pool.query(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM orders WHERE status != 'Cancelled'`),
        ]);

        const recentOrders = await pool.query(`
      SELECT o.*, u.name AS customer_name FROM orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC LIMIT 10
    `);

        res.json({
            success: true,
            stats: {
                totalUsers: parseInt(users.rows[0].count),
                totalOrders: parseInt(orders.rows[0].count),
                totalProducts: parseInt(products.rows[0].count),
                totalRevenue: parseFloat(revenue.rows[0].total),
            },
            recentOrders: recentOrders.rows,
        });
    } catch (err) { next(err); }
});

// ── Users Management ──────────────────────────────────────────────────────────

// GET /api/admin/users — List all users
router.get('/users', verifyFirebaseToken, requireAdmin, async (req, res, next) => {
    try {
        const { search, limit = 50, offset = 0 } = req.query;
        let query = 'SELECT * FROM users';
        const params = [];
        if (search) {
            query += ' WHERE name ILIKE $1 OR email ILIKE $1 OR phone ILIKE $1';
            params.push(`%${search}%`);
        }
        query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        const result = await pool.query(query, params);
        res.json({ success: true, users: result.rows });
    } catch (err) { next(err); }
});

// PATCH /api/admin/users/:id/admin — Toggle admin role
router.patch('/users/:id/admin', verifyFirebaseToken, requireAdmin, async (req, res, next) => {
    try {
        const { isAdmin } = req.body;

        // 1️⃣ Update is_admin flag in Postgres
        const result = await pool.query(
            'UPDATE users SET is_admin = $1 WHERE id = $2 RETURNING id, name, email, is_admin, firebase_uid',
            [isAdmin, req.params.id]
        );

        const updatedUser = result.rows[0];

        // 2️⃣ Set Firebase Custom Claim so Firestore Security Rules enforce admin access
        if (updatedUser?.firebase_uid) {
            try {
                const firebaseAdmin = require('../config/firebase');
                await firebaseAdmin.auth().setCustomUserClaims(updatedUser.firebase_uid, {
                    admin: isAdmin,
                });
                console.log(`✅ Custom claim set: ${updatedUser.firebase_uid} → admin: ${isAdmin}`);
            } catch (claimErr) {
                console.error('⚠️  Failed to set custom claim:', claimErr.message);
                // Don't fail the whole request — Postgres is the source of truth for backend
            }
        }

        res.json({ success: true, user: updatedUser });
    } catch (err) { next(err); }
});

// ── Home Config ───────────────────────────────────────────────────────────────

// GET /api/admin/home-config/:gender
router.get('/home-config/:gender', async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM home_config WHERE gender = $1',
            [req.params.gender]
        );
        const config = result.rows[0];

        // Merge full_config into the top-level object for frontend compatibility
        const mergedConfig = {
            ...config?.full_config,
            sections: config?.sections_order,
            videoBgCats: config?.video_bg_cats,
            gender: config?.gender
        };

        res.json({ success: true, config: mergedConfig });
    } catch (err) { next(err); }
});

// PUT /api/admin/home-config/:gender
router.put('/home-config/:gender', async (req, res, next) => {
    try {
        const { sections, videoBgCats, ...rest } = req.body;
        const result = await pool.query(`
      UPDATE home_config SET
        sections_order = COALESCE($1, sections_order),
        video_bg_cats  = COALESCE($2, video_bg_cats),
        full_config    = $3,
        updated_at     = NOW()
      WHERE gender = $4 RETURNING *;
    `, [sections, videoBgCats, rest, req.params.gender]);

        const config = result.rows[0];
        const mergedConfig = {
            ...config.full_config,
            sections: config.sections_order,
            videoBgCats: config.video_bg_cats,
            gender: config.gender
        };

        res.json({ success: true, config: mergedConfig });
    } catch (err) { next(err); }
});

// ── Products (bulk) ───────────────────────────────────────────────────────────

// GET /api/admin/products — All products including inactive
router.get('/products', verifyFirebaseToken, requireAdmin, async (req, res, next) => {
    try {
        const result = await pool.query(`
      SELECT p.*, c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC
    `);
        res.json({ success: true, products: result.rows });
    } catch (err) { next(err); }
});

module.exports = router;
