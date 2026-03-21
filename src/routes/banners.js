const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('crypto');
const { verifyFirebaseToken, requireAdmin } = require('../middleware/auth');

// GET /api/banners?gender=man&type=main
router.get('/', async (req, res, next) => {
    try {
        const { gender, type } = req.query;
        let query = 'SELECT id, gender, banner_type as "bannerType", title, subtitle, cta_text as "ctaText", image_url as "imageUrl", sort_order as "sortOrder", is_active as "isActive" FROM banners WHERE is_active = true';
        const params = [];
        let idx = 1;
        if (gender) { query += ` AND gender IN ($${idx++}, 'all')`; params.push(gender); }
        if (type) { query += ` AND banner_type = $${idx++}`; params.push(type); }
        query += ' ORDER BY sort_order ASC';
        const result = await pool.query(query, params);
        res.json({ success: true, banners: result.rows });
    } catch (err) { next(err); }
});

// POST /api/banners (Admin only)
router.post('/', async (req, res, next) => {
    try {
        const { gender, bannerType, title, subtitle, ctaText, imageUrl, sortOrder } = req.body;
        const bannerId = crypto.randomUUID();
        const result = await pool.query(`
      INSERT INTO banners (id, gender, banner_type, title, subtitle, cta_text, image_url, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
      RETURNING id, gender, banner_type as "bannerType", title, subtitle, cta_text as "ctaText", image_url as "imageUrl", sort_order as "sortOrder", is_active as "isActive";
    `, [bannerId, gender || 'all', bannerType || 'main', title, subtitle, ctaText, imageUrl, sortOrder || 0]);
        res.status(201).json({ success: true, banner: result.rows[0] });
    } catch (err) { next(err); }
});

// PUT /api/banners/:id (Admin only)
router.put('/:id', async (req, res, next) => {
    try {
        const { gender, bannerType, title, subtitle, ctaText, imageUrl, sortOrder, isActive } = req.body;
        const result = await pool.query(`
      UPDATE banners SET
        gender      = COALESCE($1, gender),
        banner_type = COALESCE($2, banner_type),
        title       = COALESCE($3, title),
        subtitle    = COALESCE($4, subtitle),
        cta_text    = COALESCE($5, cta_text),
        image_url   = COALESCE($6, image_url),
        sort_order  = COALESCE($7, sort_order),
        is_active   = COALESCE($8, is_active)
      WHERE id = $9 
      RETURNING id, gender, banner_type as "bannerType", title, subtitle, cta_text as "ctaText", image_url as "imageUrl", sort_order as "sortOrder", is_active as "isActive";
    `, [gender, bannerType, title, subtitle, ctaText, imageUrl, sortOrder, isActive, req.params.id]);
        res.json({ success: true, banner: result.rows[0] });
    } catch (err) { next(err); }
});

// DELETE /api/banners/:id (Admin only)
router.delete('/:id', async (req, res, next) => {
    try {
        await pool.query('DELETE FROM banners WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Banner deleted' });
    } catch (err) { next(err); }
});

module.exports = router;
