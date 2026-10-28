CREATE TABLE admins (
  id serial PRIMARY KEY,
  login text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner', 'seller')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_sessions (
  token text PRIMARY KEY,
  admin_id int NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE customers (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL DEFAULT '',
  lang text NOT NULL DEFAULT 'ru',
  email_notifications boolean NOT NULL DEFAULT true,
  banned_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE customer_sessions (
  token text PRIMARY KEY,
  customer_id int NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE login_codes (
  id serial PRIMARY KEY,
  email text NOT NULL,
  code_hash text NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  used boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX login_codes_email ON login_codes (email, created_at DESC);

CREATE TABLE categories (
  id serial PRIMARY KEY,
  names jsonb NOT NULL,
  counts_in_limit boolean NOT NULL DEFAULT true,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE menu_items (
  id serial PRIMARY KEY,
  category_id int NOT NULL REFERENCES categories(id),
  names jsonb NOT NULL,
  descriptions jsonb NOT NULL DEFAULT '{}',
  price int NOT NULL CHECK (price >= 0),
  available boolean NOT NULL DEFAULT true,
  archived boolean NOT NULL DEFAULT false,
  sort int NOT NULL DEFAULT 0
);

CREATE TABLE orders (
  id serial PRIMARY KEY,
  day date NOT NULL,
  number int NOT NULL,
  customer_id int REFERENCES customers(id) ON DELETE SET NULL,
  device_id text,
  name text NOT NULL DEFAULT '',
  lang text NOT NULL DEFAULT 'ru',
  status text NOT NULL CHECK (status IN ('new','accepted','cooking','ready','picked_up','no_show','cancelled','rejected')),
  flagged boolean NOT NULL DEFAULT false,
  total int NOT NULL,
  units int NOT NULL,
  ready_at timestamptz NOT NULL,
  start_at timestamptz NOT NULL,
  ready_marked_at timestamptz,
  reminder_sent boolean NOT NULL DEFAULT false,
  staff_alert_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (day, number)
);
CREATE INDEX orders_status ON orders (status);
CREATE INDEX orders_customer ON orders (customer_id, created_at DESC);
CREATE INDEX orders_device ON orders (device_id);

CREATE TABLE order_items (
  id serial PRIMARY KEY,
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  item_id int REFERENCES menu_items(id),
  names jsonb NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  price int NOT NULL,
  counted boolean NOT NULL
);

-- Какие 10-минутные окна кухни занимает заказ
CREATE TABLE order_slots (
  order_id int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  slot_start timestamptz NOT NULL,
  units int NOT NULL,
  PRIMARY KEY (order_id, slot_start)
);

CREATE TABLE push_subscriptions (
  id serial PRIMARY KEY,
  endpoint text NOT NULL UNIQUE,
  keys jsonb NOT NULL,
  customer_id int REFERENCES customers(id) ON DELETE CASCADE,
  admin_id int REFERENCES admins(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
