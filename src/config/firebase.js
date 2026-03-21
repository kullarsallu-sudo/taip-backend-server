const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './firebase-service-account.json';
// Resolve relative to project root
if (!path.isAbsolute(serviceAccountPath)) {
    serviceAccountPath = path.join(__dirname, '../../', serviceAccountPath);
}

if (!admin.apps.length) {
    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
        });
        console.log('🔥 Firebase Admin SDK initialized');
    } else {
        // Fallback: use project ID only (limited features)
        admin.initializeApp({
            projectId: process.env.FIREBASE_PROJECT_ID || 'taip-f583a',
        });
        console.warn('⚠️  Firebase Admin using projectId only. Download service account for full features.');
    }
}

module.exports = admin;
