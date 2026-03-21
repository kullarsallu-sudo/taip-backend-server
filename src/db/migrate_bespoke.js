require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./pool');

const createBespokeTables = async () => {
    const client = await pool.connect();
    try {
        console.log('🔄 Running Bespoke migrations...');

        // ── BESPOKE DRAFTS ────────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS bespoke_drafts (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
        request_data  JSONB NOT NULL,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log('  ✅ bespoke_drafts table');

        // ── BESPOKE PRODUCTS ──────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS bespoke_products (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
        request_data  JSONB NOT NULL,
        status        VARCHAR(50) DEFAULT 'Processing',
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log('  ✅ bespoke_products table');

        console.log('\n🎉 Bespoke migrations completed successfully!');
    } catch (err) {
        console.error('❌ Bespoke Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
};

createBespokeTables();
