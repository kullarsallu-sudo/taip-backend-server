const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyFirebaseToken, requireAdmin } = require('../middleware/auth');

// Helper: get user PostgreSQL id from firebase uid
const getUserId = async (firebaseUid) => {
    const r = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [firebaseUid]);
    return r.rows[0]?.id;
};

// GET /api/orders — Get orders for current user
router.get('/', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const result = await pool.query(`
      SELECT o.*,
        json_agg(json_build_object(
          'id', oi.id, 'product_id', oi.product_id, 'name', oi.name,
          'image_url', oi.image_url, 'price', oi.price,
          'quantity', oi.quantity, 'size', oi.size, 'color', oi.color, 'brand', oi.brand
        )) AS items,
        row_to_json(da.*) AS shipping_info
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN delivery_addresses da ON da.id = o.address_id
      WHERE o.user_id = $1
      GROUP BY o.id, da.id
      ORDER BY o.created_at DESC;
    `, [userId]);
        res.json({ success: true, orders: result.rows });
    } catch (err) { next(err); }
});

// GET /api/orders/:id — Get single order with tracking
router.get('/:id', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const orderResult = await pool.query(`
      SELECT o.*,
        json_agg(DISTINCT jsonb_build_object(
          'id', oi.id, 'product_id', oi.product_id, 'name', oi.name,
          'image_url', oi.image_url, 'price', oi.price,
          'quantity', oi.quantity, 'size', oi.size, 'color', oi.color, 'brand', oi.brand
        )) AS items,
        row_to_json(da.*) AS shipping_info
      FROM orders o
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN delivery_addresses da ON da.id = o.address_id
      WHERE o.id = $1 AND o.user_id = $2
      GROUP BY o.id, da.id;
    `, [req.params.id, userId]);

        if (!orderResult.rows[0]) return res.status(404).json({ success: false, message: 'Order not found' });

        const trackingResult = await pool.query(
            'SELECT * FROM order_tracking WHERE order_id = $1 ORDER BY created_at ASC',
            [req.params.id]
        );

        res.json({ success: true, order: { ...orderResult.rows[0], tracking: trackingResult.rows } });
    } catch (err) { next(err); }
});

// POST /api/orders — Place a new order
router.post('/', verifyFirebaseToken, async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const userId = await getUserId(req.user.uid);
        const { items, addressId, subtotal, discount, shippingCharge, totalAmount, paymentMethod, notes } = req.body;

        // Generate order number
        const orderNumber = 'ORD-' + Date.now();

        const orderResult = await client.query(`
      INSERT INTO orders (order_number, user_id, address_id, subtotal, discount, shipping_charge, total_amount, payment_method, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING *;
    `, [orderNumber, userId, addressId, subtotal, discount || 0, shippingCharge || 0, totalAmount, paymentMethod || 'COD', notes]);

        const order = orderResult.rows[0];

        // Insert order items
        for (const item of items) {
            await client.query(`
        INSERT INTO order_items (order_id, product_id, name, image_url, price, quantity, size, color, brand)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [order.id, item.productId || item.id, item.name, item.image || item.imageUrl, item.price, item.quantity, item.size, item.color, item.brand]);
        }

        // Add initial tracking event
        await client.query(`
      INSERT INTO order_tracking (order_id, status, description)
      VALUES ($1, 'Order Placed', 'Your order has been placed successfully.')
    `, [order.id]);

        // Clear cart for user
        await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, order: { ...order, orderNumber } });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// PATCH /api/orders/:id/cancel — Cancel an order (user)
router.patch('/:id/cancel', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const result = await pool.query(`
      UPDATE orders SET status = 'Cancelled', updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND status IN ('Processing', 'Confirmed')
      RETURNING *;
    `, [req.params.id, userId]);

        if (!result.rows[0]) return res.status(400).json({ success: false, message: 'Cannot cancel this order' });

        await pool.query(
            'INSERT INTO order_tracking (order_id, status, description) VALUES ($1, $2, $3)',
            [req.params.id, 'Cancelled', 'Order was cancelled by customer.']
        );

        res.json({ success: true, order: result.rows[0] });
    } catch (err) { next(err); }
});

// ── Tailor Routes (Manager App) ──────────────────────────────────────────────

// GET /api/orders/tailor/:uid — Get all orders for a specific tailor
router.get('/tailor/:uid', async (req, res, next) => {
    try {
        const { uid } = req.params;
        const { limit = 20, offset = 0 } = req.query;

        const result = await pool.query(`
            SELECT 
                o.*, 
                u.name AS customer_name, 
                u.phone AS customer_phone,
                u.avatar_url AS customer_avatar,
                row_to_json(da.*) AS shipping_info,
                (SELECT json_agg(oi.*) FROM order_items oi WHERE oi.order_id = o.id) AS items,
                (SELECT json_agg(ot.*) FROM (SELECT * FROM order_tracking WHERE order_id = o.id ORDER BY created_at DESC) ot) AS tracking
            FROM orders o
            JOIN users u ON u.id = o.user_id
            LEFT JOIN delivery_addresses da ON da.id = o.address_id
            JOIN tailors t ON t.id = o.tailor_id
            WHERE t.firebase_uid = $1
            ORDER BY o.created_at DESC
            LIMIT $2 OFFSET $3;
        `, [uid, limit, offset]);

        res.json({ success: true, orders: result.rows });
    } catch (err) { next(err); }
});

// PATCH /api/orders/:id/tailor-status — Update status (Tailor Manager App)
router.patch('/:id/tailor-status', async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { id } = req.params;
        const { status, description, location, tailor_uid } = req.body;

        // Verify tailor and update order
        const orderResult = await client.query(`
            UPDATE orders 
            SET status = $1, updated_at = NOW() 
            WHERE id = $2 AND tailor_id = (SELECT id FROM tailors WHERE firebase_uid = $3)
            RETURNING id;
        `, [status, id, tailor_uid]);

        if (orderResult.rows.length === 0) {
            throw new Error('Order not found or not assigned to this tailor');
        }

        // Add tracking entry
        await client.query(`
            INSERT INTO order_tracking (order_id, status, description, location)
            VALUES ($1, $2, $3, $4);
        `, [id, status, description, location]);

        await client.query('COMMIT');
        res.json({ success: true, message: `Order updated to ${status}` });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally {
        client.release();
    }
});

// ── Admin Routes ──────────────────────────────────────────────────────────────

// GET /api/orders/admin/all — All orders (Admin)
router.get('/admin/all', verifyFirebaseToken, requireAdmin, async (req, res, next) => {
    try {
        const { status, limit = 50, offset = 0 } = req.query;
        let query = `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone FROM orders o LEFT JOIN users u ON u.id = o.user_id`;
        const params = [];
        if (status) { query += ' WHERE o.status = $1'; params.push(status); }
        query += ` ORDER BY o.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);
        const result = await pool.query(query, params);
        res.json({ success: true, orders: result.rows });
    } catch (err) { next(err); }
});

// PATCH /api/orders/:id/status — Update order status (Admin)
router.patch('/:id/status', verifyFirebaseToken, requireAdmin, async (req, res, next) => {
    try {
        const { status, description, location } = req.body;
        await pool.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
        await pool.query(
            'INSERT INTO order_tracking (order_id, status, description, location) VALUES ($1,$2,$3,$4)',
            [req.params.id, status, description, location]
        );
        res.json({ success: true, message: `Order status updated to ${status}` });
    } catch (err) { next(err); }
});

module.exports = router;
