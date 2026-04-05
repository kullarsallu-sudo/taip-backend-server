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

// GET /api/admin/home-config (List all)
router.get('/home-config', async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT id, gender, state, config_name as "configName", target_states as "targetStates", updated_at as "updatedAt"
            FROM home_config 
            ORDER BY updated_at DESC
        `);
        res.json({ success: true, configs: result.rows });
    } catch (err) { next(err); }
});

// GET /api/admin/home-config/:gender
router.get('/home-config/:gender', async (req, res, next) => {
    try {
        const { state } = req.query;
        let query = 'SELECT * FROM home_config WHERE gender = $1';
        const params = [req.params.gender];
        // 1. Try Exact Match or Target States containing the requested state
        let result = await pool.query(
            `SELECT * FROM home_config 
             WHERE gender = $1 
             AND (state = $2 OR target_states @> JSONB_BUILD_ARRAY($2::text))
             ORDER BY (state = $2) DESC, created_at DESC 
             LIMIT 1`,
            [req.params.gender, req.query.state || null]
        );

        let config = result.rows[0];

        // 2. Fallback to Global if no regional match
        if (!config) {
            const fallback = await pool.query(
                'SELECT * FROM home_config WHERE gender = $1 AND (state IS NULL OR state = \'\') LIMIT 1',
                [req.params.gender]
            );
            config = fallback.rows[0];
        }

        // Merge full_config into the top-level object for frontend compatibility
        const mergedConfig = {
            ...config?.full_config,
            sections: config?.sections_order,
            videoBgCats: config?.video_bg_cats,
            gender: config?.gender,
            state: config?.state,
            configName: config?.config_name,
            targetStates: config?.target_states || []
        };

        res.json({ success: true, config: mergedConfig });
    } catch (err) { next(err); }
});

// PUT /api/admin/home-config/:gender
router.put('/home-config/:gender', async (req, res, next) => {
    try {
        const { state, config: rest, configName, targetStates } = req.body;
        const sections = rest?.sections;
        const videoBgCats = rest?.videoBgCats;
        const gender = req.params.gender;

        // Check if a config already exists for this gender/state
        const existing = await pool.query(
            'SELECT id FROM home_config WHERE gender = $1 AND (state = $2 OR (state IS NULL AND $2 IS NULL))',
            [gender, state || null]
        );

        let result;
        if (existing.rows.length > 0) {
            result = await pool.query(`
                UPDATE home_config SET
                    sections_order = COALESCE($1, sections_order),
                    video_bg_cats  = COALESCE($2, video_bg_cats),
                    full_config    = $3,
                    config_name    = $4,
                    target_states  = $5,
                    updated_at     = NOW()
                WHERE id = $6 RETURNING *;
            `, [sections, videoBgCats, rest, configName || null, JSON.stringify(targetStates || []), existing.rows[0].id]);
        } else {
            result = await pool.query(`
                INSERT INTO home_config (gender, state, sections_order, video_bg_cats, full_config, config_name, target_states)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *;
            `, [gender, state || null, sections, videoBgCats, rest, configName || null, JSON.stringify(targetStates || [])]);
        }

        const config = result.rows[0];
        const mergedConfig = {
            ...config.full_config,
            sections: config.sections_order,
            videoBgCats: config.video_bg_cats,
            gender: config.gender,
            state: config.state
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
