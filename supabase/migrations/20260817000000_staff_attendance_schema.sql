/*
# Staff Management & Attendance Schema

1. New Tables
  - `staff` — staff directory with name, phone number, role, active status
  - `staff_attendance` — one row per staff member per calendar date, tracking
    daily attendance status (Present / Absent / Half Day / Leave) and check-in time

2. Security
  - RLS enabled on all tables
  - Anon + authenticated CRUD (single-tenant, no auth required) to match existing tables

3. Notes
  - `staff_attendance` has a UNIQUE(staff_id, attendance_date) constraint so marking
    attendance twice for the same person on the same day updates the same row
    (upsert) instead of creating duplicates.
*/

CREATE TABLE IF NOT EXISTS staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL,
  role text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_staff" ON staff;
CREATE POLICY "anon_select_staff" ON staff FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_staff" ON staff;
CREATE POLICY "anon_insert_staff" ON staff FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_staff" ON staff;
CREATE POLICY "anon_update_staff" ON staff FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_staff" ON staff;
CREATE POLICY "anon_delete_staff" ON staff FOR DELETE TO anon, authenticated USING (true);

GRANT ALL ON staff TO anon, authenticated;


CREATE TABLE IF NOT EXISTS staff_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'Present',
  check_in_time time,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (staff_id, attendance_date)
);

ALTER TABLE staff_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_staff_attendance" ON staff_attendance;
CREATE POLICY "anon_select_staff_attendance" ON staff_attendance FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_staff_attendance" ON staff_attendance;
CREATE POLICY "anon_insert_staff_attendance" ON staff_attendance FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_staff_attendance" ON staff_attendance;
CREATE POLICY "anon_update_staff_attendance" ON staff_attendance FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_staff_attendance" ON staff_attendance;
CREATE POLICY "anon_delete_staff_attendance" ON staff_attendance FOR DELETE TO anon, authenticated USING (true);

GRANT ALL ON staff_attendance TO anon, authenticated;
NOTIFY pgrst, 'reload schema';

CREATE INDEX IF NOT EXISTS idx_staff_attendance_date ON staff_attendance (attendance_date);
CREATE INDEX IF NOT EXISTS idx_staff_attendance_staff ON staff_attendance (staff_id);
