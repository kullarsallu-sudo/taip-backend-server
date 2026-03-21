require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const pool = require('./pool');

const createTables = async () => {
  const client = await pool.connect();
  try {
    console.log('🔄 Running migrations...');

    // ── RESET TABLES (To apply new TEXT ID changes) ──
    await client.query(`
      DROP TABLE IF EXISTS cart_items, wishlists, order_items, order_tracking, 
                        orders, delivery_addresses, products, categories CASCADE;
    `);
    console.log('  ⚠️ Existing tables dropped to update ID formats');

    await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto";`);

    // ── USERS ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        firebase_uid  VARCHAR(128) UNIQUE NOT NULL,
        name          VARCHAR(255),
        email         VARCHAR(255),
        phone         VARCHAR(20),
        gender        VARCHAR(10),
        age           INT,
        state         VARCHAR(100),
        avatar_url    TEXT,
        is_admin      BOOLEAN DEFAULT false,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ users table');

    // ── USER MEASUREMENTS ──────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_measurements (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
        chest         DECIMAL(6,2),
        waist         DECIMAL(6,2),
        hips          DECIMAL(6,2),
        shoulder      DECIMAL(6,2),
        inseam        DECIMAL(6,2),
        height        DECIMAL(6,2),
        weight        DECIMAL(6,2),
        shirt_size    VARCHAR(10),
        pant_size     VARCHAR(10),
        dress_size    VARCHAR(10),
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ user_measurements table');

    // ── CATEGORIES ────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id          TEXT PRIMARY KEY,
        name        VARCHAR(255) NOT NULL,
        gender      VARCHAR(10) NOT NULL DEFAULT 'all',
        image_url   TEXT,
        icon        VARCHAR(100),
        sort_order  INT DEFAULT 0,
        is_active   BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ categories table');

    // ── PRODUCTS ──────────────────────────────────────────────────────────────
    // product_id is TEXT to allow various ID formats (e.g., custom IDs or UUIDs)
    await client.query(`
      CREATE TABLE IF NOT EXISTS products (
        id            TEXT PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        description   TEXT,
        price         DECIMAL(10,2) NOT NULL,
        original_price DECIMAL(10,2),
        discount_pct  INT DEFAULT 0,
        category_id   TEXT REFERENCES categories(id) ON DELETE SET NULL,
        gender        VARCHAR(10) DEFAULT 'all',
        brand         VARCHAR(255),
        image_url     TEXT,
        images        TEXT[],
        sizes         TEXT[],
        colors        TEXT[],
        stock         INT DEFAULT 0,
        rating        DECIMAL(3,2) DEFAULT 0,
        reviews_count INT DEFAULT 0,
        is_active     BOOLEAN DEFAULT true,
        created_at    TIMESTAMP DEFAULT NOW(),
        updated_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ products table');

    // ── DELIVERY ADDRESSES ────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS delivery_addresses (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
        full_name     VARCHAR(255) NOT NULL,
        phone         VARCHAR(20) NOT NULL,
        address_line1 TEXT NOT NULL,
        address_line2 TEXT,
        city          VARCHAR(100) NOT NULL,
        state         VARCHAR(100) NOT NULL,
        pincode       VARCHAR(10) NOT NULL,
        type          VARCHAR(20) DEFAULT 'Home',
        is_default    BOOLEAN DEFAULT false,
        created_at    TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ delivery_addresses table');

    // ── ORDERS ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number    VARCHAR(50) UNIQUE NOT NULL,
        user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
        address_id      UUID REFERENCES delivery_addresses(id),
        subtotal        DECIMAL(10,2) NOT NULL,
        discount        DECIMAL(10,2) DEFAULT 0,
        shipping_charge DECIMAL(10,2) DEFAULT 0,
        total_amount    DECIMAL(10,2) NOT NULL,
        status          VARCHAR(50) DEFAULT 'Processing',
        payment_method  VARCHAR(50) DEFAULT 'COD',
        payment_status  VARCHAR(30) DEFAULT 'pending',
        notes           TEXT,
        created_at      TIMESTAMP DEFAULT NOW(),
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ orders table');

    // ── ORDER ITEMS ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
        product_id  TEXT NOT NULL,
        name        VARCHAR(255) NOT NULL,
        image_url   TEXT,
        price       DECIMAL(10,2) NOT NULL,
        quantity    INT NOT NULL,
        size        VARCHAR(20),
        color       VARCHAR(50),
        brand       VARCHAR(255)
      );
    `);
    console.log('  ✅ order_items table');

    // ── ORDER TRACKING ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_tracking (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id    UUID REFERENCES orders(id) ON DELETE CASCADE,
        status      VARCHAR(100) NOT NULL,
        description TEXT,
        location    VARCHAR(255),
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ order_tracking table');

    // ── CART ──────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        product_id  TEXT NOT NULL,
        quantity    INT DEFAULT 1,
        size        VARCHAR(20),
        color       VARCHAR(50),
        added_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, product_id, size, color)
      );
    `);
    console.log('  ✅ cart_items table');

    // ── WISHLIST ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS wishlists (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
        product_id  TEXT NOT NULL,
        added_at    TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, product_id)
      );
    `);
    console.log('  ✅ wishlists table');

    // ── BANNERS ───────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS banners (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gender      VARCHAR(10) NOT NULL DEFAULT 'all',
        banner_type VARCHAR(20) DEFAULT 'main',
        title       VARCHAR(255),
        subtitle    TEXT,
        cta_text    VARCHAR(100),
        image_url   TEXT NOT NULL,
        sort_order  INT DEFAULT 0,
        is_active   BOOLEAN DEFAULT true,
        created_at  TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ banners table');

    // ── HOME CONFIG ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS home_config (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        gender          VARCHAR(10) NOT NULL UNIQUE,
        sections_order  TEXT[] DEFAULT ARRAY['BannerCarousel','SuggestedProduct','HalfBanner','DiscountCategories'],
        video_bg_cats   TEXT[],
        full_config     JSONB DEFAULT '{}',
        updated_at      TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('  ✅ home_config table');

    // Seed default home config
    await client.query(`
      INSERT INTO home_config (gender, sections_order, video_bg_cats)
      VALUES
        ('man',   ARRAY['BannerCarousel','SuggestedProduct','HalfBanner','DiscountCategories','CultureLoved','ImageBgSection','VideoBgSection','RelevantStyle','SeasonSpecial'], ARRAY['Formal','Sport','Denim']),
        ('woman', ARRAY['BannerCarousel','SuggestedProduct','HalfBanner','DiscountCategories','CultureLoved','ImageBgSection','VideoBgSection','RelevantStyle','SeasonSpecial'], ARRAY['Dresses','Jewelry','Bags'])
      ON CONFLICT (gender) DO NOTHING;
    `);

    console.log('\n🎉 All migrations completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

createTables();
