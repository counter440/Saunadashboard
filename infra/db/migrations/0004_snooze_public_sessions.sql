-- Snooze / maintenance mode: silence all alerts until this timestamp.
ALTER TABLE devices ADD COLUMN snoozed_until timestamptz;

-- Public read-only sharing: unguessable token for /p/<token>.
ALTER TABLE devices ADD COLUMN public_token text UNIQUE;

-- Push subscriptions for Web Push (PWA notifications).
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, endpoint)
);
CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions(user_id);
