const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { verifyFirebaseToken } = require('../middleware/auth');

// POST /api/users/sync — Called after Firebase login to create/update user in PostgreSQL
router.post('/sync', verifyFirebaseToken, async (req, res, next) => {
    try {
        const { uid, email, phone_number, name: fbName } = req.user;
        const { name, gender, age, state, avatarUrl } = req.body;

        const result = await pool.query(`
      INSERT INTO users (firebase_uid, name, email, phone, gender, age, state, avatar_url)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (firebase_uid) DO UPDATE SET
        name       = COALESCE(EXCLUDED.name, users.name),
        email      = COALESCE(EXCLUDED.email, users.email),
        phone      = COALESCE(EXCLUDED.phone, users.phone),
        gender     = COALESCE(EXCLUDED.gender, users.gender),
        age        = COALESCE(EXCLUDED.age, users.age),
        state      = COALESCE(EXCLUDED.state, users.state),
        avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
        updated_at = NOW()
      RETURNING *;
    `, [uid, name || fbName, email, phone_number, gender, age, state, avatarUrl]);

        res.json({ success: true, user: result.rows[0] });
    } catch (err) { next(err); }
});

// GET /api/users/me — Get current user profile
router.get('/me', verifyFirebaseToken, async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE firebase_uid = $1',
            [req.user.uid]
        );
        if (!result.rows[0]) return res.status(404).json({ success: false, message: 'User not found' });
        res.json({ success: true, user: result.rows[0] });
    } catch (err) { next(err); }
});

// PUT /api/users/me — Update current user profile
router.put('/me', verifyFirebaseToken, async (req, res, next) => {
    try {
        const { name, gender, age, state, avatarUrl } = req.body;
        const result = await pool.query(`
      UPDATE users SET
        name       = COALESCE($1, name),
        gender     = COALESCE($2, gender),
        age        = COALESCE($3, age),
        state      = COALESCE($4, state),
        avatar_url = COALESCE($5, avatar_url),
        updated_at = NOW()
      WHERE firebase_uid = $6
      RETURNING *;
    `, [name, gender, age, state, avatarUrl, req.user.uid]);

        res.json({ success: true, user: result.rows[0] });
    } catch (err) { next(err); }
});

// ── Measurements ──────────────────────────────────────────────────────────────

// POST /api/users/measurements — Save AI measurement result
router.post('/measurements', verifyFirebaseToken, async (req, res, next) => {
    try {
        const userResult = await pool.query('SELECT id FROM users WHERE firebase_uid = $1', [req.user.uid]);
        const userId = userResult.rows[0]?.id;
        if (!userId) return res.status(404).json({ success: false, message: 'User not found' });

        const { chest, waist, hips, shoulder, inseam, height, weight, shirtSize, pantSize, dressSize } = req.body;
        const result = await pool.query(`
      INSERT INTO user_measurements (user_id, chest, waist, hips, shoulder, inseam, height, weight, shirt_size, pant_size, dress_size)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *;
    `, [userId, chest, waist, hips, shoulder, inseam, height, weight, shirtSize, pantSize, dressSize]);

        res.status(201).json({ success: true, measurement: result.rows[0] });
    } catch (err) { next(err); }
});

// GET /api/users/measurements — Get all measurements for current user
router.get('/measurements', verifyFirebaseToken, async (req, res, next) => {
    try {
        const result = await pool.query(`
      SELECT m.* FROM user_measurements m
      JOIN users u ON u.id = m.user_id
      WHERE u.firebase_uid = $1
      ORDER BY m.created_at DESC;
    `, [req.user.uid]);

        res.json({ success: true, measurements: result.rows });
    } catch (err) { next(err); }
});

// ── TAILORS ──────────────────────────────────────────────────────────────

// POST /api/users/tailor/register — Register a new tailor
router.post('/tailor/register', async (req, res, next) => {
    try {
        const { 
            phone, name, idType, idNumber, city, state, hometown, shopName, experience, firebase_uid 
        } = req.body;

        const uid = firebase_uid || `demo_${Date.now()}`; // For demo if Firebase UID not provided
        const email = `${uid}@tailor.com`; // Mock email if not provided

        const result = await pool.query(`
      INSERT INTO tailors (
        firebase_uid, name, email, phone, id_type, id_number, city, state, hometown, shop_name, experience
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (firebase_uid) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        id_type = EXCLUDED.id_type,
        id_number = EXCLUDED.id_number,
        city = EXCLUDED.city,
        state = EXCLUDED.state,
        shop_name = EXCLUDED.shop_name,
        experience = EXCLUDED.experience,
        updated_at = NOW()
      RETURNING *;
    `, [uid, name, email, phone, idType, idNumber, city, state, hometown, shopName, experience]);

        res.status(201).json({ success: true, tailor: result.rows[0] });
    } catch (err) { 
        console.error('Tailor Registration API Error:', err.message);
        next(err); 
    }
});

// GET /api/users/tailor/:uid — Get tailor profile by UID
router.get('/tailor/:uid', async (req, res, next) => {
    try {
        const result = await pool.query(
            'SELECT * FROM tailors WHERE firebase_uid = $1',
            [req.params.uid]
        );
        if (!result.rows[0]) return res.status(404).json({ success: false, message: 'Tailor not found' });
        res.json({ success: true, tailor: result.rows[0] });
    } catch (err) { next(err); }
});

module.exports = router;
