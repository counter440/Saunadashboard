-- Add an optional image for each device. Path is relative to the web app's
-- public folder (e.g. "/uploads/devices/sauna-01.webp"), so the browser can
-- fetch it directly without an API route.
ALTER TABLE devices ADD COLUMN image_path text;
