const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyFirebaseToken } = require('../middleware/auth');

const getUserId = async (uid) => {
    const r = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [uid]);
    return r.rows[0]?.id;
};

// GET /api/addresses — Get all addresses for user
router.get('/', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        const result = await pool.query(
            'SELECT * FROM delivery_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
            [userId]
        );
        res.json({ success: true, addresses: result.rows });
    } catch (err) { next(err); }
});

// POST /api/addresses — Add new address
router.post('/', verifyFirebaseToken, async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userId = await getUserId(req.user.uid);
        const { fullName, phone, addressLine1, addressLine2, city, state, pincode, type, isDefault } = req.body;

        // If new address is default, unset all others
        if (isDefault) {
            await client.query('UPDATE delivery_addresses SET is_default = false WHERE user_id = $1', [userId]);
        }

        const result = await client.query(`
      INSERT INTO delivery_addresses (user_id, full_name, phone, address_line1, address_line2, city, state, pincode, type, is_default)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *;
    `, [userId, fullName, phone, addressLine1, addressLine2, city, state, pincode, type || 'Home', isDefault || false]);

        await client.query('COMMIT');
        res.status(201).json({ success: true, address: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally { client.release(); }
});

// PUT /api/addresses/:id — Update address
router.put('/:id', verifyFirebaseToken, async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userId = await getUserId(req.user.uid);
        const { fullName, phone, addressLine1, addressLine2, city, state, pincode, type, isDefault } = req.body;

        if (isDefault) {
            await client.query('UPDATE delivery_addresses SET is_default = false WHERE user_id = $1', [userId]);
        }

        const result = await client.query(`
      UPDATE delivery_addresses SET
        full_name     = COALESCE($1, full_name),
        phone         = COALESCE($2, phone),
        address_line1 = COALESCE($3, address_line1),
        address_line2 = COALESCE($4, address_line2),
        city          = COALESCE($5, city),
        state         = COALESCE($6, state),
        pincode       = COALESCE($7, pincode),
        type          = COALESCE($8, type),
        is_default    = COALESCE($9, is_default)
      WHERE id = $10 AND user_id = $11 RETURNING *;
    `, [fullName, phone, addressLine1, addressLine2, city, state, pincode, type, isDefault, req.params.id, userId]);

        await client.query('COMMIT');
        res.json({ success: true, address: result.rows[0] });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally { client.release(); }
});

// DELETE /api/addresses/:id — Delete address
router.delete('/:id', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userId = await getUserId(req.user.uid);
        await pool.query('DELETE FROM delivery_addresses WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
        res.json({ success: true, message: 'Address deleted' });
    } catch (err) { next(err); }
});

// PATCH /api/addresses/:id/default — Set as default
router.patch('/:id/default', verifyFirebaseToken, async (req, res, next) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const userId = await getUserId(req.user.uid);
        await client.query('UPDATE delivery_addresses SET is_default = false WHERE user_id = $1', [userId]);
        await client.query('UPDATE delivery_addresses SET is_default = true WHERE id = $1 AND user_id = $2', [req.params.id, userId]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Default address updated' });
    } catch (err) {
        await client.query('ROLLBACK');
        next(err);
    } finally { client.release(); }
});

module.exports = router;
