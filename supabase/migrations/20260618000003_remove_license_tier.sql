-- Talyn — remove the stale licence concept
-- The revised business model (June 2026) makes clubs FREE: they pay no licence
-- and earn 30% of athlete/parent subscriptions instead. The `license_tier` column
-- and enum date from the dead licence-tier pricing model and are now misleading.
--
-- create_club never wrote license_tier (it relied on the column default), so no
-- function needs recreating — dropping the column is enough. The function returns
-- the `public.clubs` row type, which simply no longer includes the dropped column.

alter table public.clubs drop column if exists license_tier;

drop type if exists public.license_tier;
