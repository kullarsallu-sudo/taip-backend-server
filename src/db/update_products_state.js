const pool = require('./pool');

const updateProductsTable = async () => {
    const client = await pool.connect();
    try {
        console.log('🔄 Updating products table to support regional stateReference...');

        // 1. Add state_reference column if it doesn't exist
        await client.query(`
            ALTER TABLE products ADD COLUMN IF NOT EXISTS state_reference VARCHAR(100);
        `);
        console.log('  ✅ Added state_reference column');

        console.log('🎉 Table update completed successfully!');
    } catch (err) {
        console.error('❌ Update failed:', err.message);
    } finally {
        client.release();
        process.exit();
    }
};

updateProductsTable();
