-- ============================================
-- Supabase Authentication Setup
-- ============================================
-- Execute this SQL in Supabase SQL Editor
-- This creates the users table and Row Level Security policies

-- ============================================
-- PART 1: Users Table
-- ============================================

-- 1. Create users table (extends Supabase Auth)
CREATE TABLE IF NOT EXISTS users (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'gestora')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 3. Enable Row Level Security on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 4. Drop existing policies if they exist (for re-run safety)
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Users can view own profile" ON users;
DROP POLICY IF EXISTS "Only admins can insert users" ON users;
DROP POLICY IF EXISTS "Only admins can update users" ON users;
DROP POLICY IF EXISTS "Only admins can delete users" ON users;

-- 5. RLS Policies for users table

-- Admins can see all users (check role from JWT)
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::json ->> 'role' = 'admin'
  );

-- Users can see their own profile
CREATE POLICY "Users can view own profile"
  ON users FOR SELECT
  TO authenticated
  USING (id = auth.uid());

-- Only admins can insert users (check role from JWT)
CREATE POLICY "Only admins can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_metadata')::json ->> 'role' = 'admin'
  );

-- Only admins can update users (check role from JWT)
CREATE POLICY "Only admins can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::json ->> 'role' = 'admin'
  );

-- Only admins can delete users (check role from JWT)
CREATE POLICY "Only admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::json ->> 'role' = 'admin'
  );

-- ============================================
-- PART 2: RLS for customers table (data isolation)
-- ============================================

-- 6. Drop existing public policies on customers
DROP POLICY IF EXISTS "Allow public read access" ON customers;
DROP POLICY IF EXISTS "Allow public insert access" ON customers;
DROP POLICY IF EXISTS "Allow public update access" ON customers;
DROP POLICY IF EXISTS "Allow public delete access" ON customers;

-- 7. Drop new policies if they exist (for re-run safety)
DROP POLICY IF EXISTS "Admins can view all customers" ON customers;
DROP POLICY IF EXISTS "Gestoras can view own customers" ON customers;
DROP POLICY IF EXISTS "Only admins can insert customers" ON customers;
DROP POLICY IF EXISTS "Only admins can update customers" ON customers;
DROP POLICY IF EXISTS "Only admins can delete customers" ON customers;

-- 8. RLS Policies for customers table

-- Admins can see everything
CREATE POLICY "Admins can view all customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Gestoras can only see their own customers
-- (orders JSONB array contains gestorName that matches user's display_name)
CREATE POLICY "Gestoras can view own customers"
  ON customers FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM users 
      WHERE id = auth.uid() 
        AND role = 'gestora'
        AND EXISTS (
          SELECT 1 
          FROM jsonb_array_elements(customers.orders) AS order_item
          WHERE order_item->>'gestorName' = users.display_name
        )
    )
  );

-- Only admins can insert customers
CREATE POLICY "Only admins can insert customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can update customers
CREATE POLICY "Only admins can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Only admins can delete customers
CREATE POLICY "Only admins can delete customers"
  ON customers FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM users WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- PART 3: Utility Functions
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Success message
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Supabase authentication setup complete!';
  RAISE NOTICE '';
  RAISE NOTICE '📋 Next steps:';
  RAISE NOTICE '   1. Run: node scripts/setupAuth.js (to create admin user)';
  RAISE NOTICE '   2. Configure Supabase credentials in .env.local';
  RAISE NOTICE '';
  RAISE NOTICE '🔒 Security enabled:';
  RAISE NOTICE '   - Row Level Security active on users table';
  RAISE NOTICE '   - Row Level Security active on customers table';
  RAISE NOTICE '   - Gestoras can only see their own customers';
END $$;
