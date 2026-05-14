-- Notifications: push-only. Drop the email/SMS device-level lists and
-- introduce a per-device push opt-in table so a user can choose which
-- devices they want pushes for (mirrors how alert_emails used to be a
-- per-device list, but now scoped to opted-in team members).

BEGIN;

-- Per-device push opt-in. (device_id, user_id) is unique.
CREATE TABLE IF NOT EXISTS device_push_subscribers (
  device_id  TEXT NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id)          ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, user_id)
);
CREATE INDEX IF NOT EXISTS device_push_subscribers_user_idx
  ON device_push_subscribers (user_id);

-- Purge historical email/sms rows (no longer meaningful).
DELETE FROM notification_events WHERE channel IN ('email', 'sms');

-- Drop the per-device email/phone lists. We are intentionally NOT
-- preserving the data — the same UI now drives device_push_subscribers.
ALTER TABLE devices DROP COLUMN IF EXISTS alert_emails;
ALTER TABLE devices DROP COLUMN IF EXISTS alert_phones;

COMMIT;
