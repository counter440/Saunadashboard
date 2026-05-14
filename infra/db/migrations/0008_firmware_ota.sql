-- Firmware releases + per-device pending OTA / cmd assignments.

CREATE TABLE firmware_releases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version       text NOT NULL,
  channel       text NOT NULL DEFAULT 'stable' CHECK (channel IN ('stable','beta')),
  filename      text NOT NULL,                 -- e.g. "ember-0.2.0-phaseB.bin"
  size_bytes    int  NOT NULL,
  sha256        text NOT NULL,                 -- 64 hex chars
  release_notes text,
  uploaded_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (version, channel)
);

CREATE TABLE device_pending_commands (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id    text NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('ota','reboot','force_publish','snooze')),
  payload      jsonb NOT NULL,                 -- e.g. {url, sha256, version}
  created_by   uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz                     -- set when MQTT publish succeeds
);
CREATE INDEX device_pending_commands_undelivered_idx
  ON device_pending_commands (device_id) WHERE delivered_at IS NULL;
