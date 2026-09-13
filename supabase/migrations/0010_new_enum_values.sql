-- =====================================================================
-- 0010  New enum values
--
-- Alone in its own migration on purpose. Postgres will not let a value
-- added to an enum be *used* in the same transaction that added it, and
-- the migration runner wraps each file in one. Splitting the additions
-- from everything that reads them keeps 0011 free to use them.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Where a car came from. Facebook Marketplace is now a regular source,
-- not an "other".
-- ---------------------------------------------------------------------
alter type public.vehicle_source add value if not exists 'facebook_marketplace' before 'other';
alter type public.vehicle_source add value if not exists 'dealer' before 'other';

-- ---------------------------------------------------------------------
-- A car bought to repair and sell whole ends its life sold, not
-- depleted or scrapped.
-- ---------------------------------------------------------------------
alter type public.vehicle_status add value if not exists 'sold';

-- ---------------------------------------------------------------------
-- Costs that arrive after a car does. Repair and inspection belong to
-- the ones bought to fix and resell; storage and disposal come up on
-- anything that sits long enough.
-- ---------------------------------------------------------------------
alter type public.expense_category add value if not exists 'repair' before 'parts_cleaning';
alter type public.expense_category add value if not exists 'inspection' before 'parts_cleaning';
alter type public.expense_category add value if not exists 'parts_purchase' before 'parts_cleaning';
alter type public.expense_category add value if not exists 'storage' before 'misc';
alter type public.expense_category add value if not exists 'disposal' before 'misc';
