/*
# POS Billing App Schema

1. New Tables
  - `products` — product catalog with code, name, cost price, selling rate
  - `bills` — generated bills with customer info, payment method, discount, totals
  - `bill_items` — line items for each bill (product snapshot + qty + price)

2. Security
  - RLS enabled on all tables
  - Anon + authenticated CRUD (single-tenant, no auth required)
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  name text NOT NULL,
  cost_price numeric(10,2),
  selling_price numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_products" ON products;
CREATE POLICY "anon_select_products" ON products FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_products" ON products;
CREATE POLICY "anon_insert_products" ON products FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_products" ON products;
CREATE POLICY "anon_update_products" ON products FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_products" ON products;
CREATE POLICY "anon_delete_products" ON products FOR DELETE TO anon, authenticated USING (true);


CREATE TABLE IF NOT EXISTS bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_number text NOT NULL,
  customer_name text,
  payment_method text NOT NULL DEFAULT 'Cash',
  bill_language text NOT NULL DEFAULT 'English',
  discount_type text NOT NULL DEFAULT 'percent',
  discount_value numeric(10,2) NOT NULL DEFAULT 0,
  subtotal numeric(10,2) NOT NULL,
  discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  total numeric(10,2) NOT NULL,
  total_items integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bills" ON bills;
CREATE POLICY "anon_select_bills" ON bills FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bills" ON bills;
CREATE POLICY "anon_insert_bills" ON bills FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bills" ON bills;
CREATE POLICY "anon_update_bills" ON bills FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bills" ON bills;
CREATE POLICY "anon_delete_bills" ON bills FOR DELETE TO anon, authenticated USING (true);


CREATE TABLE IF NOT EXISTS bill_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id uuid NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  product_code text NOT NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(10,2) NOT NULL,
  total_price numeric(10,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bill_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bill_items" ON bill_items;
CREATE POLICY "anon_select_bill_items" ON bill_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_bill_items" ON bill_items;
CREATE POLICY "anon_insert_bill_items" ON bill_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_bill_items" ON bill_items;
CREATE POLICY "anon_update_bill_items" ON bill_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_bill_items" ON bill_items;
CREATE POLICY "anon_delete_bill_items" ON bill_items FOR DELETE TO anon, authenticated USING (true);

-- seed some default products
INSERT INTO products (code, name, cost_price, selling_price) VALUES
  ('BR5', 'Basmati Rice 5kg', 400.00, 450.00),
  ('SO1', 'Sunflower Oil 1L', 155.00, 180.00),
  ('TD1', 'Toor Dal 1kg', 130.00, 160.00),
  ('SG1', 'Sugar 1kg', 42.00, 48.00),
  ('WA10', 'Wheat Atta 10kg', 480.00, 520.00),
  ('TP5', 'Tea Powder 500g', 190.00, 220.00),
  ('ST1', 'Salt 1kg', 20.00, 25.00),
  ('TP2', 'Turmeric Powder 200g', 38.00, 45.00)
ON CONFLICT DO NOTHING;
