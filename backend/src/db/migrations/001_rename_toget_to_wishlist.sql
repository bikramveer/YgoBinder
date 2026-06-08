-- Migration 001: rename toget_entries → wishlist_entries
-- Run once against the Railway PostgreSQL database.

-- 1. Rename the table
ALTER TABLE toget_entries RENAME TO wishlist_entries;

-- 2. Rename the unique constraint (name may vary — adjust if needed)
ALTER TABLE wishlist_entries RENAME CONSTRAINT toget_entries_user_id_entry_key_key TO wishlist_entries_user_id_entry_key_key;

-- 3. Rename the index
ALTER INDEX IF EXISTS idx_toget_user RENAME TO idx_wishlist_user;

-- 4. Drop the old CHECK constraint BEFORE updating rows (otherwise the new value is rejected)
ALTER TABLE binder_slots DROP CONSTRAINT IF EXISTS binder_slots_source_check;

-- 5. Update existing binder_slots rows that stored 'toGet' as the source value
UPDATE binder_slots SET source = 'wishlist' WHERE source = 'toGet';

-- 6. Add the new CHECK constraint
ALTER TABLE binder_slots ADD CONSTRAINT binder_slots_source_check CHECK (source IN ('collection', 'wishlist'));
