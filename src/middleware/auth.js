const admin = require('../config/firebase');

/**
 * Middleware: Verify Firebase ID Token
 * Attaches decoded user info to req.user
 */
const verifyFirebaseToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ success: false, message: 'Unauthorized: No token provided' });
        }

        const token = authHeader.split('Bearer ')[1];

        // 🛠️ DEVELOPER BYPASS: demo_ prefix for testing
        if (token.startsWith('demo_')) {
            req.user = { uid: token, firebase_uid: token };
            return next();
        }

        // Try verifying as a real Firebase JWT token first
        try {
            const decoded = await admin.auth().verifyIdToken(token);
            req.user = decoded;
            return next();
        } catch (firebaseErr) {
            // If it's not a JWT, it may be a plain UID from the AsyncStorage fallback.
            // Check if the token looks like a Firebase UID (28 chars, alphanumeric) 
            // or a phone-session UID and look it up in the DB.
            const pool = require('../db/pool');
            const isPlainUid = /^[a-zA-Z0-9_\-]{10,128}$/.test(token);
            if (isPlainUid) {
                const result = await pool.query(
                    'SELECT firebase_uid FROM users WHERE firebase_uid = $1 LIMIT 1',
                    [token]
                );
                if (result.rows.length > 0) {
                    req.user = { uid: token, firebase_uid: token };
                    return next();
                }
            }
            return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
        }
    } catch (err) {
        console.error('Auth error:', err.message);
        return res.status(401).json({ success: false, message: 'Unauthorized: Invalid token' });
    }
};

/**
 * Middleware: Require Admin role
 * Must be used AFTER verifyFirebaseToken
 */
const requireAdmin = async (req, res, next) => {
    const pool = require('../db/pool');
    try {
        const result = await pool.query(
            'SELECT is_admin FROM users WHERE firebase_uid = $1',
            [req.user.uid]
        );
        if (!result.rows[0]?.is_admin) {
            return res.status(403).json({ success: false, message: 'Forbidden: Admin access required' });
        }
        next();
    } catch (err) {
        next(err);
    }
};

module.exports = { verifyFirebaseToken, requireAdmin };
