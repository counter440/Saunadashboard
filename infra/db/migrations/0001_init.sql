-- ─────────────────────────────────────────────────────────────────────────
-- sauna-monitor 0001 — initial schema (rev 2: admin / customer split)
-- Postgres 16 + TimescaleDB
-- ─────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ── Tenancy ───────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  billing_email citext NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id              uuid REFERENCES customers(id) ON DELETE CASCADE,   -- NULL only for super_admin
  email                    citext UNIQUE NOT NULL,
  password_hash            text NOT NULL,
  role                     text NOT NULL CHECK (role IN ('super_admin','customer_owner','customer_member')),
  must_change_password     bool NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  CHECK (role = 'super_admin' OR customer_id IS NOT NULL)
);
CREATE INDEX users_customer_id_idx ON users(customer_id);

-- ── Sites ─────────────────────────────────────────────────────────────────
CREATE TABLE sites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name        text NOT NULL,
  address     text,
  timezone    text NOT NULL DEFAULT 'Europe/Oslo',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sites_customer_id_idx ON sites(customer_id);

-- ── Devices ───────────────────────────────────────────────────────────────
CREATE TABLE devices (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id                   text UNIQUE NOT NULL,
  name                        text NOT NULL,
  customer_id                 uuid REFERENCES customers(id) ON DELETE SET NULL,  -- NULL = in admin inventory
  site_id                     uuid REFERENCES sites(id)     ON DELETE SET NULL,  -- NULL = assigned to a customer but no site yet
  -- operational (customer-editable)
  low_temp_threshold          numeric(5,2),
  battery_warning_threshold   numeric(4,2) NOT NULL DEFAULT 3.40,
  active_window_start         time NOT NULL DEFAULT '00:00',
  active_window_end           time NOT NULL DEFAULT '23:59',
  active_days                 int[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}',
  timezone                    text NOT NULL DEFAULT 'Europe/Oslo',
  alert_cooldown_hours        int  NOT NULL DEFAULT 4,
  alert_emails                text[] NOT NULL DEFAULT '{}',
  alert_phones                text[] NOT NULL DEFAULT '{}',
  -- runtime
  last_seen                   timestamptz,
  last_temp                   numeric(5,2),
  last_battery_voltage        numeric(4,2),
  last_battery_percent        int,
  last_signal                 int,
  -- admin-only
  mqtt_username               text,
  fw_version                  text,
  notes                       text,
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX devices_customer_id_idx ON devices(customer_id);
CREATE INDEX devices_site_id_idx     ON devices(site_id);

-- ── Time-series readings (Timescale hypertable) ───────────────────────────
CREATE TABLE temperature_readings (
  device_id        text NOT NULL,
  created_at       timestamptz NOT NULL,
  temperature      numeric(5,2) NOT NULL,
  battery_voltage  numeric(4,2),
  battery_percent  int,
  signal_strength  int,
  PRIMARY KEY (device_id, created_at)
);
SELECT create_hypertable('temperature_readings', 'created_at');
CREATE INDEX temperature_readings_device_time_desc_idx
  ON temperature_readings (device_id, created_at DESC);

CREATE MATERIALIZED VIEW readings_5m
  WITH (timescaledb.continuous) AS
  SELECT
    device_id,
    time_bucket('5 minutes', created_at) AS bucket,
    avg(temperature)::numeric(5,2)        AS temp_avg,
    min(temperature)                      AS temp_min,
    max(temperature)                      AS temp_max,
    avg(battery_voltage)::numeric(4,2)    AS bat_avg
  FROM temperature_readings
  GROUP BY device_id, bucket
  WITH NO DATA;

CREATE MATERIALIZED VIEW readings_1h
  WITH (timescaledb.continuous) AS
  SELECT
    device_id,
    time_bucket('1 hour', created_at) AS bucket,
    avg(temperature)::numeric(5,2)        AS temp_avg,
    min(temperature)                      AS temp_min,
    max(temperature)                      AS temp_max,
    avg(battery_voltage)::numeric(4,2)    AS bat_avg
  FROM temperature_readings
  GROUP BY device_id, bucket
  WITH NO DATA;

SELECT add_continuous_aggregate_policy('readings_5m',
  start_offset => INTERVAL '7 days',
  end_offset   => INTERVAL '5 minutes',
  schedule_interval => INTERVAL '5 minutes');

SELECT add_continuous_aggregate_policy('readings_1h',
  start_offset => INTERVAL '60 days',
  end_offset   => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour');

-- ── Notification audit ────────────────────────────────────────────────────
CREATE TABLE notification_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id       text NOT NULL,
  kind            text NOT NULL CHECK (kind IN ('low_temp','low_battery','offline')),
  fired_at        timestamptz NOT NULL DEFAULT now(),
  reading_at      timestamptz,
  temperature     numeric(5,2),
  battery_voltage numeric(4,2),
  channel         text NOT NULL CHECK (channel IN ('email','sms')),
  destination     text NOT NULL,
  status          text NOT NULL CHECK (status IN ('sent','failed','dry_run')),
  error           text
);
CREATE INDEX notification_events_device_kind_fired_idx
  ON notification_events (device_id, kind, fired_at DESC);

-- ── Auth.js helper tables (kept for future OAuth / verification flows) ────
CREATE TABLE verification_token (
  identifier text NOT NULL,
  expires    timestamptz NOT NULL,
  token      text NOT NULL,
  PRIMARY KEY (identifier, token)
);

CREATE TABLE accounts (
  id                   SERIAL PRIMARY KEY,
  "userId"             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type                 text NOT NULL,
  provider             text NOT NULL,
  "providerAccountId"  text NOT NULL,
  refresh_token        text,
  access_token         text,
  expires_at           bigint,
  id_token             text,
  scope                text,
  session_state        text,
  token_type           text
);
CREATE UNIQUE INDEX accounts_provider_pa_idx ON accounts (provider, "providerAccountId");

CREATE TABLE sessions (
  id              SERIAL PRIMARY KEY,
  "userId"        uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires         timestamptz NOT NULL,
  "sessionToken"  text NOT NULL UNIQUE
);
