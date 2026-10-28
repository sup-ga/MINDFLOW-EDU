-- Mark class sessions and classes as completed automatically when their end time passes.
-- pg_cron runs this once per minute; UI labels also derive status from timestamps.
create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'mindflow-auto-complete-ended-sessions',
  '* * * * *',
  $job$
    update public.class_sessions
    set status = 'completed', updated_at = now()
    where status = 'scheduled'
      and ends_at is not null
      and ends_at <= now();

    update public.professional_classes
    set status = 'completed', updated_at = now()
    where status in ('planned', 'open', 'in_progress')
      and end_at is not null
      and end_at <= now();
  $job$
);
