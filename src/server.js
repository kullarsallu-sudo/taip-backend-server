require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const app = express();

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet());
const corsOptions = {
    origin: process.env.ALLOWED_ORIGINS === '*' ? '*' : (process.env.ALLOWED_ORIGINS?.split(',') || '*'),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Enable pre-flight for all routes
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
    res.json({ status: 'TAIP Backend Running ✅', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/users', require('./routes/users'));
app.use('/api/products', require('./routes/products'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/addresses', require('./routes/addresses'));
app.use('/api/deliveries', require('./routes/deliveries'));
app.use('/api/cart', require('./routes/cart'));
app.use('/api/wishlist', require('./routes/wishlist'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/banners', require('./routes/banners'));
app.use('/api/bespoke', require('./routes/bespoke'));

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Route not found' });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ Error:', err.message);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal Server Error',
    });
});

// ─── Auto-Migration Logic ─────────────────────────────────────────────
const migrateDb = async () => {
    try {
        const pool = require('./db/pool');
        console.log('🔄 Upgrading Home Layout Engine - Finalizing schema...');
        
        // 1. Remove outdated constraints
        await pool.query('ALTER TABLE home_config DROP CONSTRAINT IF EXISTS home_config_gender_key');
        
        // 2. Add required columns (including multi-state and timestamps)
        await pool.query('ALTER TABLE home_config ADD COLUMN IF NOT EXISTS state VARCHAR(100)');
        await pool.query('ALTER TABLE home_config ADD COLUMN IF NOT EXISTS config_name VARCHAR(255)');
        await pool.query('ALTER TABLE home_config ADD COLUMN IF NOT EXISTS target_states JSONB DEFAULT \'[]\'');
        await pool.query('ALTER TABLE home_config ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()');
        await pool.query('ALTER TABLE home_config ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()');
        
        await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS state_reference VARCHAR(100)');
        
        // 3. New smart constraint (Allows one global + multiple named configs)
        await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_home_config_gender_state ON home_config (gender, (COALESCE(state, \'GLOBAL\')))');
        
        console.log('✅ Home Layout Engine schema is fully modernized.');
    } catch (err) {
        console.error('❌ Schema upgrade failed:', err.message);
    }
};
migrateDb();

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 TAIP Backend running on http://localhost:${PORT}`);
});

module.exports = app;
