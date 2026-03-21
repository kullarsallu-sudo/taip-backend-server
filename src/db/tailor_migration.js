require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./pool');

const runTailorMigration = async () => {
    let client;
    let retries = 3;
    
    while (retries > 0) {
        try {
            client = await pool.connect();
            break; 
        } catch (err) {
            console.log(`⚠️ Connection failed, retrying... (${retries} left)`);
            retries--;
            if (retries === 0) throw err;
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }

    try {
        console.log('🔄 Running Tailor migrations...');

        // ── TAILORS ────────────────────────────────────────────────────────────────
        await client.query(`
      CREATE TABLE IF NOT EXISTS tailors (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid  VARCHAR(128) UNIQUE NOT NULL,
        name          VARCHAR(255) NOT NULL,
        email         VARCHAR(255) UNIQUE NOT NULL,
        phone         VARCHAR(20) UNIQUE,
        shop_name     VARCHAR(255),
        shop_address  TEXT,
        city          VARCHAR(100),
        state         VARCHAR(100),
        experience    VARCHAR(50),
        id_type       VARCHAR(50), -- PAN, Aadhaar
        id_number     VARCHAR(100),
        pan_number    VARCHAR(20),
        adhar_number  VARCHAR(20),
        hometown      VARCHAR(100),
        bank_account  VARCHAR(100),
        is_verified   BOOLEAN DEFAULT false,
        is_active     BOOLEAN DEFAULT true,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);
        console.log('  ✅ tailors table created');

        // ── ADD TAILOR_ID TO ORDERS ────────────────────────────────────────────────
        await client.query(`
      ALTER TABLE orders 
      ADD COLUMN IF NOT EXISTS tailor_id UUID REFERENCES tailors(id) ON DELETE SET NULL;
    `);
        console.log('  ✅ tailor_id column added to orders');

        // ── SEED DUMMY TAILOR FOR TESTING ──────────────────────────────────────────
        await client.query(`
            INSERT INTO tailors (firebase_uid, name, email, phone, shop_name, city, state, is_verified)
            VALUES ('demo_tailor_123', 'Master Alessandro', 'alessandro@tailor.com', '9876543210', 'Bespoke Atelier', 'Mumbai', 'Maharashtra', true)
            ON CONFLICT (firebase_uid) DO NOTHING;
        `);
        console.log('  ✅ Seeded dummy tailor');

        // ── ASSIGN SOME ORDERS TO THIS TAILOR (Optional for testing) ────────────────
        const tailorResult = await client.query("SELECT id FROM tailors WHERE firebase_uid = 'demo_tailor_123'");
        const tailorId = tailorResult.rows[0].id;

        await client.query(`
            UPDATE orders SET tailor_id = $1 WHERE id IN (SELECT id FROM orders WHERE tailor_id IS NULL LIMIT 2);
        `, [tailorId]);
        console.log('  ✅ Assigned some orders to dummy tailor');

        console.log('\n🎉 Tailor migrations completed successfully!');
    } catch (err) {
        console.error('❌ Tailor Migration failed:', err.message);
        throw err;
    } finally {
        client.release();
        process.exit();
    }
};

runTailorMigration();
