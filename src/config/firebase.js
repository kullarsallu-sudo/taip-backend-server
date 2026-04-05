const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
// Resolve relative to project root
if (!path.isAbsolute(serviceAccountPath)) {
    serviceAccountPath = path.join(__dirname, '../../', serviceAccountPath);
}

if (!admin.apps.length) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        // Option 1: Load from environment variable (Best for Railway/Production)
        try {
            const serviceAccount = JSON.parse(
                process.env.FIREBASE_SERVICE_ACCOUNT_JSON.startsWith('{')
                ? process.env.FIREBASE_SERVICE_ACCOUNT_JSON
                : Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_JSON, 'base64').toString()
            );
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
            });
            console.log('🔥 Firebase Admin SDK initialized (from ENV)');
        } catch (err) {
            console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', err.message);
        }
    } else if (fs.existsSync(serviceAccountPath)) {
        // Option 2: Load from file (Local development)
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('🔥 Firebase Admin SDK initialized (from File)');
    } else {
        // Fallback: use project ID only (limited features)
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || 'taip-f583a',
        });
        console.warn('⚠️  Firebase Admin using projectId only. Download service account for full features.');
    }
}

module.exports = admin;
