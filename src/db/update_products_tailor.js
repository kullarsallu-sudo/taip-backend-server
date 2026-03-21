require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./pool');

const updateProductsTable = async () => {
    let client;
    try {
        client = await pool.connect();
        console.log('🔄 Adding tailor_id to products table...');

        await client.query(`
            ALTER TABLE products 
            ADD COLUMN IF NOT EXISTS tailor_id UUID REFERENCES tailors(id) ON DELETE SET NULL;
        `);
        
        console.log('✅ tailor_id column added to products');
        
        // Update existing products to some default tailor if needed, 
        // but for now, we just want new products to have it.

    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        if (client) client.release();
        process.exit();
    }
};

updateProductsTable();
