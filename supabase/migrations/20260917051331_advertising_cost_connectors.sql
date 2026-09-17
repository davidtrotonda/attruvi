-- Enum values are committed separately so later migrations can use them safely.
alter type public.source_kind add value if not exists 'manual';
alter type public.sync_status add value if not exists 'retryable_failed';
alter type public.sync_status add value if not exists 'permanently_failed';
