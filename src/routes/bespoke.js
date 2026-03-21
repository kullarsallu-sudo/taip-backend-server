const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyFirebaseToken } = require('../middleware/auth');

/**
 * 📝 BESPOKE DRAFTS
 */

// POST /api/bespoke/drafts — Save or Update a draft
router.post('/drafts', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userResult = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [req.user.uid]);
        const userId = userResult.rows[0]?.id;
        if (!userId) return res.status(404).json({ success: false, message: 'User not found' });

        const requestData = req.body;

        // Logic: Keep only one most recent draft per user for simplicity
        const existingDraft = await pool.query(
            'SELECT id FROM bespoke_drafts WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
            [userId]
        );

        let result;
        if (existingDraft.rows.length > 0) {
            result = await pool.query(`
                UPDATE bespoke_drafts 
                SET request_data = $1, updated_at = NOW() 
                WHERE id = $2 
                RETURNING *;
            `, [requestData, existingDraft.rows[0].id]);
        } else {
            result = await pool.query(`
                INSERT INTO bespoke_drafts (user_id, request_data) 
                VALUES ($1, $2) 
                RETURNING *;
            `, [userId, requestData]);
        }

        res.json({ success: true, draft: result.rows[0] });
    } catch (err) { next(err); }
});

// GET /api/bespoke/drafts — Get all drafts for user (usually returns an array for the list)
router.get('/drafts', verifyFirebaseToken, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT d.* FROM bespoke_drafts d
            JOIN users u ON u.id = d.user_id
            WHERE u.firebase_uid = $1
            ORDER BY d.updated_at DESC;
        `, [req.user.uid]);

        // Flatten for frontend
        const drafts = result.rows.map(row => ({
            id: row.id,
            ...row.request_data,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        res.json(drafts);
    } catch (err) { next(err); }
});

/**
 * ✂️ BESPOKE PRODUCTS (Final Requests)
 */

// POST /api/bespoke/my-products — Save final product request
router.post('/my-products', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userResult = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [req.user.uid]);
        const userId = userResult.rows[0]?.id;
        if (!userId) return res.status(404).json({ success: false, message: 'User not found' });

        const requestData = req.body;

        const result = await pool.query(`
            INSERT INTO bespoke_products (user_id, request_data) 
            VALUES ($1, $2) 
            RETURNING *;
        `, [userId, requestData]);

        // Clean up the draft once it becomes a real product request
        await pool.query('DELETE FROM bespoke_drafts WHERE user_id = $1', [userId]);

        res.status(201).json({ success: true, product: result.rows[0] });
    } catch (err) { next(err); }
});

// GET /api/bespoke/my-products — Get all bespoke products for user
router.get('/my-products', verifyFirebaseToken, async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT p.* FROM bespoke_products p
            JOIN users u ON u.id = p.user_id
            WHERE u.firebase_uid = $1
            ORDER BY p.created_at DESC;
        `, [req.user.uid]);

        const products = result.rows.map(row => ({
            id: row.id,
            status: row.status,
            ...row.request_data,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        res.json(products);
    } catch (err) { next(err); }
});

module.exports = router;
