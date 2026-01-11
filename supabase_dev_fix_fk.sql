-- Remove Foreign Key constraint on institutions.user_id
-- This allows saving data for the "Test User" (ID: 11111111-...) which does not exist in the real auth.users table.

ALTER TABLE institutions DROP CONSTRAINT IF EXISTS institutions_user_id_fkey;

-- Also ensure user_id is still NOT NULL (optional, but good for consistency)
-- ALTER TABLE institutions ALTER COLUMN user_id SET NOT NULL;
