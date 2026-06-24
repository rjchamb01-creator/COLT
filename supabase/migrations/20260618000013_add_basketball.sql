-- COLT — add Basketball as a third sport (enum value only).
--
-- Postgres requires a NEW enum value to be COMMITTED before it can be USED, so
-- this migration ONLY adds the value. Any content that references 'basketball'
-- (skills, drills) lives in the next migration (..._000014) so it runs in a
-- separate transaction. Run THIS file first, then run 0014.
--
-- `if not exists` makes it safe to re-run.

alter type public.sport add value if not exists 'basketball';
