const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('crypto');
const { verifyFirebaseToken, requireAdmin } = require('../middleware/auth');

// GET /api/categories
router.get('/', async (req, res, next) => {
    try {
        const { gender } = req.query;
        let query = 'SELECT id, name, gender, image_url as "imageUrl", icon, sort_order as "sortOrder", is_active as "isActive" FROM categories WHERE is_active = true';
        const params = [];
        if (gender) { query += ` AND gender IN ($1, 'all')`; params.push(gender); }
        query += ' ORDER BY sort_order ASC, name ASC';
        const result = await pool.query(query, params);
        res.json({ success: true, categories: result.rows });
    } catch (err) { next(err); }
});

// POST /api/categories (Admin)
router.post('/', async (req, res, next) => {
    const { name, gender, imageUrl, icon, sortOrder } = req.body;
    console.log('📝 Incoming Category Request:', { name, gender });

    try {
        if (!name) return res.status(400).json({ success: false, message: 'Name is required' });

        const safeId = 'cat_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
        const result = await pool.query(
            'INSERT INTO categories (id, name, gender, image_url, icon, sort_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, gender, image_url as "imageUrl", icon, sort_order as "sortOrder", is_active as "isActive"',
            [safeId, name, gender || 'all', imageUrl || '', icon || '', sortOrder || 0]
        );
        console.log('✅ DATABASE SUCCESS: Category saved with ID:', result.rows[0].id);
        res.status(201).json({ success: true, category: result.rows[0] });
    } catch (err) {
        console.error('❌ DATABASE ERROR (Categories):', err);
        next(err);
    }
});

// PUT /api/categories/:id (Admin)
router.put('/:id', async (req, res, next) => {
    try {
        const { name, gender, imageUrl, icon, sortOrder, isActive } = req.body;
        const result = await pool.query(`
      UPDATE categories SET
        name       = COALESCE($1, name),
        gender     = COALESCE($2, gender),
        image_url  = COALESCE($3, image_url),
        icon       = COALESCE($4, icon),
        sort_order = COALESCE($5, sort_order),
        is_active  = COALESCE($6, is_active)
      WHERE id = $7 
      RETURNING id, name, gender, image_url as "imageUrl", icon, sort_order as "sortOrder", is_active as "isActive"`,
            [name, gender, imageUrl, icon, sortOrder, isActive, req.params.id]
        );
        res.json({ success: true, category: result.rows[0] });
    } catch (err) { next(err); }
});

// DELETE /api/categories/:id (Admin)
router.delete('/:id', async (req, res, next) => {
    try {
        await pool.query('UPDATE categories SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Category deleted' });
    } catch (err) { next(err); }
});

module.exports = router;
