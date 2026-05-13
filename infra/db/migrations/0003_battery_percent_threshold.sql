-- Battery warning expressed as a percentage (customer-facing).
-- Backend keeps the voltage column for compatibility but no longer uses it for alerts.
ALTER TABLE devices
  ADD COLUMN battery_warning_percent int NOT NULL DEFAULT 10
    CHECK (battery_warning_percent BETWEEN 0 AND 100);

-- Bump the low-temp default for newly created devices.
ALTER TABLE devices ALTER COLUMN low_temp_threshold SET DEFAULT 55;

-- Seed sensible defaults on existing devices that don't have an explicit threshold yet.
UPDATE devices SET low_temp_threshold = 55 WHERE low_temp_threshold IS NULL;
