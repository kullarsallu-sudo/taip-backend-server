const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyFirebaseToken } = require('../middleware/auth');

// GET /api/deliveries/:orderId — Get delivery tracking for an order
router.get('/:orderId', verifyFirebaseToken, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM order_tracking WHERE order_id = $1 ORDER BY created_at ASC',
            [req.params.orderId]
        );
        res.json({ success: true, tracking: result.rows });
    } catch (err) { next(err); }
});

module.exports = router;
