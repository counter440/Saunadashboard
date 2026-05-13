import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import mqtt from "mqtt";
import pg from "pg";
import pino from "pino";
import { deviceIdFromTopic, parseStatus } from "@sauna/shared";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const log = pino({ level: process.env.INGEST_LOG_LEVEL ?? "info" });

const mqttUrl = `mqtt://${process.env.MQTT_HOST ?? "localhost"}:${process.env.MQTT_PORT ?? "1883"}`;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	log.error("DATABASE_URL is required");
	process.exit(1);
}

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });

const client = mqtt.connect(mqttUrl, {
	username: process.env.MQTT_INGEST_USER,
	password: process.env.MQTT_INGEST_PASS,
	reconnectPeriod: 2_000,
	clientId: `ingest-${process.pid}-${Math.random().toString(36).slice(2, 8)}`,
	clean: true,
});

const TOPIC = "sauna/+/status";

client.on("connect", () => {
	log.info({ mqttUrl }, "mqtt connected");
	client.subscribe(TOPIC, { qos: 1 }, (err) => {
		if (err) {
			log.error({ err }, "subscribe failed");
			process.exit(1);
		}
		log.info({ topic: TOPIC }, "subscribed");
	});
});

client.on("error", (err) => {
	log.error({ err }, "mqtt error");
});

client.on("offline", () => log.warn("mqtt offline"));
client.on("reconnect", () => log.info("mqtt reconnecting"));

client.on("message", async (topic, message) => {
	const topicDeviceId = deviceIdFromTopic(topic);
	if (!topicDeviceId) {
		log.warn({ topic }, "ignoring message on unexpected topic");
		return;
	}

	const parsed = parseStatus(message);
	if (!parsed.ok) {
		log.warn({ topic, error: parsed.error }, "invalid payload");
		return;
	}
	const p = parsed.value;
	if (p.device_id !== topicDeviceId) {
		log.warn(
			{ topic, payloadDeviceId: p.device_id, topicDeviceId },
			"payload device_id != topic device_id; using topic id",
		);
	}

	const conn = await pool.connect();
	try {
		await conn.query("BEGIN");

		const insert = await conn.query(
			`INSERT INTO temperature_readings
			   (device_id, created_at, temperature, battery_voltage, battery_percent, signal_strength)
			 VALUES ($1, $2, $3, $4, $5, $6)
			 ON CONFLICT (device_id, created_at) DO NOTHING
			 RETURNING device_id`,
			[
				topicDeviceId,
				p.timestamp,
				p.temperature,
				p.battery_voltage ?? null,
				p.battery_percent ?? null,
				p.signal ?? null,
			],
		);

		// Only update device "last_*" snapshot if this reading is newer than what we have.
		const update = await conn.query(
			`UPDATE devices
			    SET last_seen             = GREATEST(COALESCE(last_seen, 'epoch'::timestamptz), $2),
			        last_temp             = CASE WHEN last_seen IS NULL OR $2 >= last_seen THEN $3 ELSE last_temp END,
			        last_battery_voltage  = CASE WHEN last_seen IS NULL OR $2 >= last_seen THEN $4 ELSE last_battery_voltage END,
			        last_battery_percent  = CASE WHEN last_seen IS NULL OR $2 >= last_seen THEN $5 ELSE last_battery_percent END,
			        last_signal           = CASE WHEN last_seen IS NULL OR $2 >= last_seen THEN $6 ELSE last_signal END
			  WHERE device_id = $1
			RETURNING id`,
			[
				topicDeviceId,
				p.timestamp,
				p.temperature,
				p.battery_voltage ?? null,
				p.battery_percent ?? null,
				p.signal ?? null,
			],
		);

		if (update.rowCount === 0) {
			log.warn({ device_id: topicDeviceId }, "unknown device — reading stored but no device row");
		}

		// Notify the notifier worker (LISTEN reading_inserted).
		if (insert.rowCount && insert.rowCount > 0) {
			await conn.query("SELECT pg_notify('reading_inserted', $1)", [topicDeviceId]);
		}

		await conn.query("COMMIT");
		log.debug(
			{
				device_id: topicDeviceId,
				temperature: p.temperature,
				battery_voltage: p.battery_voltage,
				battery_percent: p.battery_percent,
				signal: p.signal,
				ts: p.timestamp.toISOString(),
				stored: insert.rowCount,
			},
			"reading ingested",
		);
	} catch (err) {
		await conn.query("ROLLBACK");
		log.error({ err, device_id: topicDeviceId }, "insert failed");
	} finally {
		conn.release();
	}
});

async function shutdown(signal: string) {
	log.info({ signal }, "shutting down");
	client.end(true);
	await pool.end();
	process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
