-- Drop the per-device alert cooldown. Replaced by an edge-triggered model:
-- an alert only re-fires after the device has "recovered" (reading above
-- threshold for low_temp/low_battery, any fresh reading for offline).

ALTER TABLE devices DROP COLUMN IF EXISTS alert_cooldown_hours;
