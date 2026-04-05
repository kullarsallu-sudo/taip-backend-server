const admin = require('firebase-admin');
const pool = require('./pool');
const serviceAccount = require('../../serviceAccountKey.json'); // User should have this or firebase config

// Initialize Firebase Admin
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

const migrateData = async () => {
    try {
        console.log('🚀 Starting Migration from Firebase to PostgreSQL...');

        // 1. Migrate Categories
        console.log('📦 Migrating Categories...');
        const catSnap = await db.collection('categories').get();
        for (const doc of catSnap.docs) {
            const data = doc.data();
            await pool.query(
                'INSERT INTO categories (id, name, gender, image_url, icon, sort_order) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [doc.id, data.name, data.gender || 'all', data.image || data.imageUrl || '', data.icon || '', data.sortOrder || 0]
            );
        }
        console.log(`✅ Migrated ${catSnap.size} categories`);

        // 2. Migrate Products
        console.log('🛍️ Migrating Products...');
        const prodSnap = await db.collection('products').get();
        for (const doc of prodSnap.docs) {
            const data = doc.data();
            await pool.query(`
                INSERT INTO products (
                    id, name, description, price, original_price, discount_pct, 
                    category_id, gender, brand, image_url, images, sizes, colors, stock,
                    fabric_details, bottom_details, stitching_details, fit_details,
                    highlights, model_no, material, weight, is_stitched, state_reference
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
                ON CONFLICT (id) DO NOTHING
            `, [
                doc.id, data.name, data.description || '', parseFloat(data.price) || 0, 
                parseFloat(data.originalPrice) || 0, parseFloat(data.discountPct) || 0,
                data.categoryId || data.category || null, data.gender || 'all', data.brand || 'Taiplore',
                data.imageUrl || data.image || '', data.images || [], data.sizes || [], data.colors || [],
                parseInt(data.stock) || 0, data.fabricDetails || '', data.bottomDetails || '',
                data.stitchingDetails || '', data.fitDetails || '', JSON.stringify(data.highlights || []),
                data.modelNo || '', data.material || '', data.weight || '', !!data.isStitched, data.stateReference || null
            ]);
        }
        console.log(`✅ Migrated ${prodSnap.size} products`);

        console.log('🎉 Migration completed successfully!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        process.exit();
    }
};

migrateData();
