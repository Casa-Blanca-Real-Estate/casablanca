-- CR-D, before phase 2 (Dispatch 10): zero data retention becomes a switch,
-- CR_JEV_ZDR, because Casa starts Jev on Kimani's existing Vercel account,
-- which isn't on Pro. With it off, a lane whose text isn't public is refused
-- before it's sent, recorded as its own drop: zdr-required. The earlier
-- migrations are frozen; this one only widens the ledger's list of reasons.
alter table comp_report.decide_requests
  drop constraint decide_requests_drop_reason_check,
  add constraint decide_requests_drop_reason_check check (
    drop_reason is null
    or drop_reason ~ '^(no-key|queue-full|retries-exhausted|network|malformed|unanswered|out-of-time|zdr-required|http-[0-9]{3})$'
  );
