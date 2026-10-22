CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_ci_idx ON categories(LOWER(name));

CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_price_text TEXT NOT NULL DEFAULT '',
  price_amount BIGINT,
  currency_code CHAR(3),
  image_url TEXT,
  review_status TEXT NOT NULL DEFAULT 'needs_review' CHECK (review_status IN ('needs_review','confirmed')),
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  is_available BOOLEAN NOT NULL DEFAULT FALSE,
  source_menu_date DATE NOT NULL DEFAULT DATE '2026-06-30',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(category_id, name),
  CHECK (price_amount IS NULL OR price_amount >= 0),
  CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$'),
  CHECK (NOT is_available OR (is_published AND review_status = 'confirmed' AND price_amount > 0 AND currency_code IS NOT NULL)),
  CHECK (NOT is_published OR (review_status = 'confirmed' AND price_amount > 0 AND currency_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS products_public_idx ON products(is_published, is_available, category_id, name);

CREATE TABLE IF NOT EXISTS business_settings (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  settings JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  fee_amount BIGINT NOT NULL CHECK (fee_amount >= 0),
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS availability_slots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  fulfillment_mode TEXT NOT NULL CHECK (fulfillment_mode IN ('pickup','delivery','both')),
  max_orders INTEGER NOT NULL CHECK (max_orders BETWEEN 1 AND 200),
  reserved_orders INTEGER NOT NULL DEFAULT 0 CHECK (reserved_orders >= 0),
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_time > start_time),
  UNIQUE(service_date, start_time, fulfillment_mode)
);
CREATE INDEX IF NOT EXISTS availability_open_idx ON availability_slots(is_open, service_date, start_time);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY,
  order_reference TEXT NOT NULL UNIQUE,
  idempotency_key UUID NOT NULL UNIQUE,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  fulfillment TEXT NOT NULL CHECK (fulfillment IN ('pickup','delivery')),
  delivery_zone_id UUID REFERENCES delivery_zones(id) ON DELETE SET NULL,
  delivery_zone_name TEXT,
  delivery_address TEXT,
  service_date DATE NOT NULL,
  start_time TIME NOT NULL,
  slot_id UUID REFERENCES availability_slots(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'awaiting_whatsapp' CHECK (status IN ('awaiting_whatsapp','pending_business_acceptance','accepted','rejected','preparing','dispatched','completed','cancelled')),
  subtotal_amount BIGINT NOT NULL CHECK (subtotal_amount >= 0),
  delivery_fee_amount BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee_amount >= 0),
  total_amount BIGINT NOT NULL CHECK (total_amount >= 0),
  currency_code CHAR(3) NOT NULL CHECK (currency_code ~ '^[A-Z]{3}$'),
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at TIMESTAMPTZ,
  CHECK ((fulfillment = 'delivery' AND delivery_address IS NOT NULL AND delivery_zone_name IS NOT NULL) OR (fulfillment = 'pickup' AND delivery_address IS NULL))
);
CREATE INDEX IF NOT EXISTS orders_created_idx ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 50),
  unit_price BIGINT NOT NULL CHECK (unit_price > 0),
  line_total BIGINT NOT NULL CHECK (line_total > 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions(expires_at);

CREATE TABLE IF NOT EXISTS login_rate_limits (
  bucket_key CHAR(64) PRIMARY KEY,
  bucket_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);

INSERT INTO categories(name, sort_order) VALUES
  ('Meals', 1), ('Protein', 2), ('Drinks', 3), ('Extras', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products(category_id, name, source_price_text, source_menu_date, review_status, is_published, is_available)
SELECT c.id, seed.name, seed.source_price_text, DATE '2026-06-30', 'needs_review', FALSE, FALSE
FROM (VALUES
  ('Meals','Pasta','3,000'),
  ('Meals','Pasta II (More is Better!)','4,000'),
  ('Meals','Rice (Jollof and Fried)','3,000'),
  ('Meals','Rice II (More is Better!)','4,000'),
  ('Meals','Single Decker Burger & Fries','6,000'),
  ('Meals','Double Decker Burger & Fries','8,000'),
  ('Meals','Loaded Fries I','14,000'),
  ('Meals','Loaded Fries II (The Extra Combo)','20,000'),
  ('Meals','Mini Loaded Fries','7,000'),
  ('Meals','Chicken and Chips','6,000'),
  ('Protein','Full Chicken Lap (Big)','5,000'),
  ('Protein','Full Chicken Lap (Small)','4,000'),
  ('Protein','Chicken Drumstick','2,500'),
  ('Protein','Turkey','8,000'),
  ('Protein','Chicken Thigh','3,000'),
  ('Drinks','Vanilla Milkshake','6,500'),
  ('Drinks','Coffee Milkshake','6,500'),
  ('Drinks','Caramel Milkshake','6,500'),
  ('Drinks','Hollandia Yoghurt','2,000/3,000 (size mapping unspecified)'),
  ('Drinks','Caprisun','1,000'),
  ('Extras','Egg','500'),
  ('Extras','Sausage','500'),
  ('Extras','Plantain','500'),
  ('Extras','Cheese','3,500'),
  ('Extras','French Fries','2,000'),
  ('Extras','Top Up','1,500'),
  ('Extras','Patty (burger beef)','2,000'),
  ('Extras','Burger (Stand alone)','4,000')
) AS seed(category_name, name, source_price_text)
JOIN categories c ON c.name = seed.category_name
ON CONFLICT(category_id, name) DO NOTHING;

INSERT INTO business_settings(id, settings) VALUES
  (1, '{"businessName":"Your Foodie Friend","serviceArea":"Port Harcourt, Rivers State, Nigeria","whatsappNumber":"+2348137523400","preorderDays":[0,2,4,5],"minimumLeadDays":null,"checkoutEnabled":false,"pickupEnabled":false,"pickupDetails":"","deliveryEnabled":false,"currencyCode":null,"operatingHours":"","currentPolicies":"","settingsConfirmed":false}'::jsonb)
ON CONFLICT (id) DO NOTHING;
