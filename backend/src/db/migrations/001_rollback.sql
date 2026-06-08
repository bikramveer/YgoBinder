-- Rollback for migration 001: wishlist_entries → toget_entries
-- Run this to undo 001_rename_toget_to_wishlist.sql

ALTER TABLE binder_slots DROP CONSTRAINT IF EXISTS binder_slots_source_check;

UPDATE binder_slots SET source = 'toGet' WHERE source = 'wishlist';

ALTER TABLE binder_slots ADD CONSTRAINT binder_slots_source_check CHECK (source IN ('collection', 'toGet'));

ALTER INDEX IF EXISTS idx_wishlist_user RENAME TO idx_toget_user;

ALTER TABLE wishlist_entries RENAME CONSTRAINT wishlist_entries_user_id_entry_key_key TO toget_entries_user_id_entry_key_key;

ALTER TABLE wishlist_entries RENAME TO toget_entries;
