-- Allow 'push' as a channel for notification_events.
ALTER TABLE notification_events DROP CONSTRAINT IF EXISTS notification_events_channel_check;
ALTER TABLE notification_events
  ADD CONSTRAINT notification_events_channel_check
  CHECK (channel IN ('email','sms','push'));
