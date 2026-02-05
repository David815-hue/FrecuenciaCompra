-- FIX RLS POLICIES
-- Run this in Supabase SQL Editor

-- 1. Drop existing problematic policies
DROP POLICY IF EXISTS "Only admins can insert users" ON users;
DROP POLICY IF EXISTS "Admins can view all users" ON users;
DROP POLICY IF EXISTS "Only admins can update users" ON users;
DROP POLICY IF EXISTS "Only admins can delete users" ON users;

-- 2. Re-create with safer JSON extraction syntax

-- VIEW
CREATE POLICY "Admins can view all users"
  ON users FOR SELECT
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin'
  );

-- INSERT
CREATE POLICY "Only admins can insert users"
  ON users FOR INSERT
  TO authenticated
  WITH CHECK (
    ((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin'
  );

-- UPDATE
CREATE POLICY "Only admins can update users"
  ON users FOR UPDATE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin'
  );

-- DELETE
CREATE POLICY "Only admins can delete users"
  ON users FOR DELETE
  TO authenticated
  USING (
    ((auth.jwt() -> 'user_metadata') ->> 'role') = 'admin'
  );
