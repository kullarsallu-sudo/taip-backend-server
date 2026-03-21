const Redis = require('ioredis');

const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    // Retry strategy — don't crash server if Redis is down
    retryStrategy: (times) => {
        if (times > 3) {
            console.warn('⚠️  Redis unavailable, falling back to PostgreSQL for cart');
            return null; // stop retrying
        }
        return Math.min(times * 100, 2000);
    },
    lazyConnect: true,
});

redis.on('connect', () => console.log('⚡ Redis connected'));
redis.on('error', (err) => console.warn('⚠️  Redis error:', err.message));

// Try to connect but don't block startup
redis.connect().catch(() => { });

module.exports = redis;
