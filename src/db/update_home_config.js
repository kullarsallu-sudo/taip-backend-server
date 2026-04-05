const pool = require('./pool');

const updateHomeConfigTable = async () => {
    const client = await pool.connect();
    try {
        console.log('🔄 Updating home_config table...');

        // 1. Remove the unique constraint on gender
        await client.query(`
            ALTER TABLE home_config DROP CONSTRAINT IF EXISTS home_config_gender_key;
        `);
        console.log('  ✅ Removed unique constraint on gender');

        // 2. Increase gender column length
        await client.query(`
            ALTER TABLE home_config ALTER COLUMN gender TYPE VARCHAR(50);
        `);
        console.log('  ✅ Increased gender column length');

        // 3. Add state column if it doesn't exist
        await client.query(`
            ALTER TABLE home_config ADD COLUMN IF NOT EXISTS state VARCHAR(100);
        `);
        console.log('  ✅ Added state column');

        // 4. Add unique constraint on (gender, state)
        // Handle existing null states by considering them as 'all' or empty string if needed,
        // but for now, we'll just allow multiple gender='man' with different states.
        await client.query(`
            ALTER TABLE home_config DROP CONSTRAINT IF EXISTS home_config_gender_state_key;
            ALTER TABLE home_config ADD CONSTRAINT home_config_gender_state_key UNIQUE (gender, state);
        `);
        console.log('  ✅ Added unique constraint on (gender, state)');

        console.log('🎉 Table update completed successfully!');
    } catch (err) {
        console.error('❌ Update failed:', err.message);
    } finally {
        client.release();
        process.exit();
    }
};

updateHomeConfigTable();
