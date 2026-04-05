const { Pool } = require('pg');
const dns = require('dns');

// ─── DNS PATCH FOR WINDOWS ENOTFOUND (Neon hostnames) ───────────────────────
if (process.platform === 'win32') {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
    const oldLookup = dns.lookup;
    dns.lookup = function (hostname, options, callback) {
        if (typeof options === 'function') { callback = options; options = {}; }
        if (hostname && hostname.includes('neon.tech')) {
            dns.resolve4(hostname, (err, addresses) => {
                if (err) return oldLookup(hostname, options, callback);
                if (addresses && addresses.length > 0) {
                    if (options && options.all) {
                        return callback(null, addresses.map(ip => ({ address: ip, family: 4 })));
                    } else {
                        return callback(null, addresses[0], 4);
                    }
                }
                oldLookup(hostname, options, callback);
            });
        } else {
            oldLookup(hostname, options, callback);
        }
    };
}
// ────────────────────────────────────────────────────────────────────────────

const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 10000,  // ✅ FIXED: was 0 (infinite), now 10s
        idleTimeoutMillis: 10000,        // ✅ FIXED: drop idle connections faster
        max: 5,                          // ✅ smaller pool for serverless
        allowExitOnIdle: true,
    }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'taip_ecommerce',
        ssl: process.env.DB_HOST && process.env.DB_HOST !== 'localhost' ? { rejectUnauthorized: false } : false,
        connectionTimeoutMillis: 10000,
        idleTimeoutMillis: 10000,
        max: 5,
        allowExitOnIdle: true,
    };

let pool = new Pool(poolConfig);

// ─── AUTO-RECONNECT ON ECONNRESET ────────────────────────────────────────────
pool.on('error', (err) => {
    console.error('⚠️ Idle DB client error:', err.message);
    if (err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ETIMEDOUT') {
        console.log('🔄 Reconnecting pool...');
        pool = new Pool(poolConfig);
    }
});
// ─────────────────────────────────────────────────────────────────────────────

// ─── QUERY WITH AUTO-RETRY ────────────────────────────────────────────────────
// Save a reference to the ORIGINAL pool.query BEFORE wrapping anything.
// This prevents infinite recursion (stack overflow).
const _originalQuery = pool.query.bind(pool);

const query = async (text, params) => {
    try {
        return await _originalQuery(text, params);
    } catch (err) {
        const isRetryable = err.code === 'ECONNRESET' || err.code === 'EPIPE' || err.code === 'ETIMEDOUT' || err.message?.includes('Connection terminated');
        if (isRetryable) {
            console.warn('🔁 Query failed due to connection reset, retrying once...');
            return await _originalQuery(text, params);
        }
        throw err;
    }
};

// Override pool.query with the retry wrapper so all routes benefit automatically
pool.query = query;
// ─────────────────────────────────────────────────────────────────────────────

pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ PostgreSQL initial connection error:', err.message);
    } else {
        console.log('✅ PostgreSQL connected successfully');
        release();
    }
});

// Export both the pool (for .connect()) and the retry-wrapped query
module.exports = pool;
module.exports.query = query;
