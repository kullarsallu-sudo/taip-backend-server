require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./pool');

async function fixColumns() {
  const client = await pool.connect();
  try {
    console.log('� Starting column fix migration...');

    // 1. Add missing specific detail columns to products
    await client.query(`
      ALTER TABLE products 
      ADD COLUMN IF NOT EXISTS fabric_details TEXT,
      ADD COLUMN IF NOT EXISTS bottom_details TEXT,
      ADD COLUMN IF NOT EXISTS stitching_details TEXT,
      ADD COLUMN IF NOT EXISTS fit_details TEXT,
      ADD COLUMN IF NOT EXISTS highlights JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS model_no VARCHAR(100),
      ADD COLUMN IF NOT EXISTS material VARCHAR(100),
      ADD COLUMN IF NOT EXISTS weight VARCHAR(50),
      ADD COLUMN IF NOT EXISTS is_stitched BOOLEAN DEFAULT false;
    `);
    console.log('✅ Added detail columns to products table');

    console.log('✨ Migration completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    client.release();
    process.exit();
  }
}
npm 
fixColumns();
