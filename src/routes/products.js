const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const crypto = require('crypto');
const { verifyFirebaseToken, requireAdmin } = require('../middleware/auth');

// GET /api/products — List products (with optional filters)
router.get('/', async (req, res, next) => {
    try {
        const { gender, category_id, search, min_price, max_price, limit = 20, offset = 0 } = req.query;

        let query = `
            SELECT 
                p.id, p.name, p.description, p.price, 
                p.original_price as "originalPrice", 
                p.discount_pct as "discountPct", 
                p.category_id as "categoryId", 
                p.gender, p.brand, 
                p.image_url as "imageUrl", 
                p.images, p.sizes, p.colors, p.stock, 
                p.rating, 
                p.reviews_count as "reviewsCount",
                p.fabric_details as "fabricDetails",
                p.bottom_details as "bottomDetails",
                p.stitching_details as "stitchingDetails",
                p.fit_details as "fitDetails",
                p.highlights,
                p.model_no as "modelNo",
                p.material,
                p.weight,
                p.is_stitched as "isStitched",
                p.state_reference as "stateReference",
                c.name as "categoryName"
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            WHERE p.is_active = true
        `;
        const params = [];
        let idx = 1;

        if (gender) { query += ` AND p.gender IN ($${idx++}, 'all')`; params.push(gender); }
        if (category_id) { query += ` AND p.category_id = $${idx++}`; params.push(category_id); }
        if (search) { query += ` AND p.name ILIKE $${idx++}`; params.push(`%${search}%`); }
        if (min_price) { query += ` AND p.price >= $${idx++}`; params.push(min_price); }
        if (max_price) { query += ` AND p.price <= $${idx++}`; params.push(max_price); }

        query += ` ORDER BY p.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`;
        params.push(limit, offset);

        const result = await pool.query(query, params);
        res.json({ success: true, products: result.rows, count: result.rowCount });
    } catch (err) { next(err); }
});

// GET /api/products/:id — Single product
router.get('/:id', async (req, res, next) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id, p.name, p.description, p.price, 
                p.original_price as "originalPrice", 
                p.discount_pct as "discountPct", 
                p.category_id as "categoryId", 
                p.gender, p.brand, 
                p.image_url as "imageUrl", 
                p.images, p.sizes, p.colors, p.stock, 
                p.rating, 
                p.reviews_count as "reviewsCount",
                p.fabric_details as "fabricDetails",
                p.bottom_details as "bottomDetails",
                p.stitching_details as "stitchingDetails",
                p.fit_details as "fitDetails",
                p.highlights,
                p.model_no as "modelNo",
                p.material,
                p.weight,
                p.is_stitched as "isStitched",
                p.state_reference as "stateReference",
                c.name as "categoryName"
            FROM products p 
            LEFT JOIN categories c ON c.id = p.category_id 
            WHERE p.id = $1
        `, [req.params.id]);
        if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Product not found' });
        res.json({ success: true, product: result.rows[0] });
    } catch (err) { next(err); }
});

// POST /api/products — Create product (Admin only)
router.post('/', async (req, res, next) => {
    const { name, price, categoryId, tailorId } = req.body;
    console.log('📦 Incoming Product Request:', { name, price, categoryId, tailorId });

    try {
        const {
            description, originalPrice, discountPct,
            gender, brand, imageUrl, images, sizes, colors, stock,
            fabricDetails, bottomDetails, stitchingDetails, fitDetails,
            highlights, modelNo, material, weight, isStitched
        } = req.body;

        if (!name || !price) {
            return res.status(400).json({ success: false, message: 'Name and Price are required' });
        }

        // --- Category Logic ---
        // If categoryId is a name (like 'Suits'), find the real UUID
        let finalCategoryId = null;
        if (categoryId) {
            const catCheck = await pool.query('SELECT id FROM categories WHERE name ILIKE $1 LIMIT 1', [categoryId]);
            if (catCheck.rows.length > 0) {
                finalCategoryId = catCheck.rows[0].id;
            } else {
                // If not found, see if there is any category to use as default or leave null
                console.log(`⚠️ Category "${categoryId}" not found, leaving null`);
            }
        }

        const safeId = 'prod_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

        const result = await pool.query(`
      INSERT INTO products (
        id, name, description, price, original_price, discount_pct, 
        category_id, gender, brand, image_url, images, sizes, colors, stock,
        fabric_details, bottom_details, stitching_details, fit_details,
        highlights, model_no, material, weight, is_stitched, tailor_id, state_reference
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING 
        id, name, description, price, 
        original_price as "originalPrice", 
        discount_pct as "discountPct", 
        category_id as "categoryId", 
        gender, brand, 
        image_url as "imageUrl", 
        images, sizes, colors, stock, 
        rating, 
        reviews_count as "reviewsCount",
        fabric_details as "fabricDetails",
        bottom_details as "bottomDetails",
        stitching_details as "stitchingDetails",
        fit_details as "fitDetails",
        highlights,
        model_no as "modelNo",
        material,
        weight,
        is_stitched as "isStitched",
        state_reference as "stateReference",
        tailor_id as "tailorId",
        is_active as "isActive";
    `, [
            safeId, name, description || '', price, originalPrice || price, discountPct || 0,
            finalCategoryId, gender || 'all', brand || 'Taiplore', imageUrl || '',
            images || [], sizes || [], colors || [], Math.floor(stock) || 0,
            fabricDetails || '', bottomDetails || '', stitchingDetails || '', fitDetails || '',
            JSON.stringify(highlights || []), modelNo || '', material || '', weight || '', isStitched || false,
            tailorId || null, req.body.stateReference || null
        ]);

        console.log('✅ DATABASE SUCCESS: Product saved with ID:', result.rows[0].id);
        res.status(201).json({ success: true, product: result.rows[0] });
    } catch (err) {
        console.error('❌ DATABASE ERROR (Products):', err);
        next(err);
    }
});

// PUT /api/products/:id — Update product (Admin only)
router.put('/:id', async (req, res, next) => {
    try {
        const {
            name, description, price, originalPrice, discountPct,
            categoryId, gender, brand, imageUrl, images, sizes, colors, stock,
            isActive, fabricDetails, bottomDetails, stitchingDetails, fitDetails,
            highlights, modelNo, material, weight, isStitched
        } = req.body;

        const result = await pool.query(`
      UPDATE products SET
        name               = COALESCE($1, name),
        description        = COALESCE($2, description),
        price              = COALESCE($3, price),
        original_price     = COALESCE($4, original_price),
        discount_pct       = COALESCE($5, discount_pct),
        category_id        = COALESCE($6, category_id),
        gender             = COALESCE($7, gender),
        brand              = COALESCE($8, brand),
        image_url          = COALESCE($9, image_url),
        images             = COALESCE($10, images),
        sizes              = COALESCE($11, sizes),
        colors             = COALESCE($12, colors),
        stock              = COALESCE($13, stock),
        is_active          = COALESCE($14, is_active),
        fabric_details     = COALESCE($15, fabric_details),
        bottom_details     = COALESCE($16, bottom_details),
        stitching_details  = COALESCE($17, stitching_details),
        fit_details        = COALESCE($18, fit_details),
        highlights         = COALESCE($19, highlights),
        model_no           = COALESCE($20, model_no),
        material           = COALESCE($21, material),
        weight             = COALESCE($22, weight),
        is_stitched        = COALESCE($23, is_stitched),
        state_reference    = COALESCE($24, state_reference),
        updated_at         = NOW()
      WHERE id = $25 
      RETURNING 
        id, name, description, price, 
        original_price as "originalPrice", 
        discount_pct as "discountPct", 
        category_id as "categoryId", 
        gender, brand, 
        image_url as "imageUrl", 
        images, sizes, colors, stock, 
        rating, 
        reviews_count as "reviewsCount",
        fabric_details as "fabricDetails",
        bottom_details as "bottomDetails",
        stitching_details as "stitchingDetails",
        fit_details as "fitDetails",
        highlights,
        model_no as "modelNo",
        material,
        weight,
        is_stitched as "isStitched",
        state_reference as "stateReference",
        is_active as "isActive";
    `, [
            name, description, price, originalPrice, discountPct, categoryId, gender, brand,
            imageUrl, images, sizes, colors, stock, isActive,
            fabricDetails, bottomDetails, stitchingDetails, fitDetails,
            highlights ? JSON.stringify(highlights) : null,
            modelNo, material, weight, isStitched, req.body.stateReference, req.params.id
        ]);
        res.json({ success: true, product: result.rows[0] });
    } catch (err) { next(err); }
});

// GET /api/products/tailor/:identifier — Get products for a specific tailor
router.get('/tailor/:identifier', async (req, res, next) => {
    try {
        const { identifier } = req.params;
        console.log('🔍 Fetching products for tailor:', identifier);

        // This identifier could be a UUID (id) OR a firebase_uid
        const result = await pool.query(`
            SELECT 
                p.*, 
                c.name as "categoryName"
            FROM products p
            LEFT JOIN categories c ON c.id = p.category_id
            JOIN tailors t ON (t.id = p.tailor_id)
            WHERE (t.id::text = $1 OR t.firebase_uid = $1)
              AND p.is_active = true
            ORDER BY p.created_at DESC
        `, [identifier]);

        res.json({ success: true, products: result.rows });
    } catch (err) {
        console.error('❌ Error fetching tailor products:', err.message);
        next(err);
    }
});

// DELETE /api/products/:id — Soft delete (Admin only)
router.delete('/:id', async (req, res, next) => {
    try {
        await pool.query('UPDATE products SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ success: true, message: 'Product deleted' });
    } catch (err) { next(err); }
});

module.exports = router;
