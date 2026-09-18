-- =====================================================================
-- 0013  A part can leave the shelf inside a bigger part
--
-- Alone in its own migration, for the same reason 0010 was: Postgres will
-- not let a value added to an enum be *used* in the transaction that
-- added it, and the migration runner wraps each file in one.
--
-- Sell a complete engine and the head, the oil pan and the injectors go
-- out of the gate bolted to it. They are not sold -- nobody paid for them
-- separately, and counting them as sales would invent revenue. They are
-- not scrapped either; they left in working order. They went with
-- something else, which is its own thing and now says so.
-- =====================================================================

alter type public.part_status add value if not exists 'included' after 'sold';
