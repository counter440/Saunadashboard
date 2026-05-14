import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import pino from "pino";
import type { DeviceRow, ReadingRow, NotificationKind } from "@sauna/shared";
import { evaluateRules, type AlertDecision, type LastFiredMap } from "./rules.js";
import { Dispatcher } from "./dispatch.js";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

const log = pino({ level: process.env.NOTIFIER_LOG_LEVEL ?? "info" });
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
	log.error("DATABASE_URL is required");
	process.exit(1);
}

const dispatcher = new Dispatcher(log);
await dispatcher.ready();

const pool = new pg.Pool({ connectionString: databaseUrl, max: 4 });

// Persistent client for LISTEN/NOTIFY
const listenClient = new pg.Client({ connectionString: databaseUrl });
await listenClient.connect();
await listenClient.query("LISTEN reading_inserted");

listenClient.on("notification", (msg) => {
	const deviceId = msg.payload;
	if (!deviceId) return;
	void evaluateAndDispatchByDeviceId(deviceId).catch((err) =>
		log.error({ err, deviceId }, "evaluate failed"),
	);
});

listenClient.on("error", (err) => log.error({ err }, "listener error"));

// 1-minute sweep — catches "device went silent" cases the LISTEN path can't see.
const SWEEP_INTERVAL_MS = 60_000;
setInterval(() => {
	void sweepAllDevices().catch((err) => log.error({ err }, "sweep failed"));
}, SWEEP_INTERVAL_MS);

log.info("notifier ready");

// ────────────────────────────────────────────────────────────────────────

async function sweepAllDevices(): Promise<void> {
	const { rows } = await pool.query<{ device_id: string }>(
		`SELECT device_id FROM devices WHERE customer_id IS NOT NULL`,
	);
	for (const r of rows) {
		try {
			await evaluateAndDispatchByDeviceId(r.device_id);
		} catch (err) {
			log.error({ err, device_id: r.device_id }, "sweep eval failed");
		}
	}
}

async function evaluateAndDispatchByDeviceId(deviceId: string): Promise<void> {
	const device = await loadDevice(deviceId);
	if (!device) return;

	const recentReadings = await loadRecentReadings(deviceId, 2);
	const lastFired = await loadLastFired(deviceId);
	const hasRecoveredSinceLastLowTemp = await hasRecoveredSinceLastLowTempEvent(
		deviceId,
		lastFired.low_temp,
		device.low_temp_threshold,
	);
	const hasRecoveredSinceLastLowBattery = await hasRecoveredSinceLastLowBatteryEvent(
		deviceId,
		lastFired.low_battery,
		device.battery_warning_percent,
	);
	const hasReportedSinceLastOffline = await hasReportedSinceLastOfflineEvent(
		deviceId,
		lastFired.offline,
	);

	const now = new Date();
	const decisions = evaluateRules({
		device,
		recentReadings,
		now,
		lastFired,
		hasRecoveredSinceLastLowTemp,
		hasRecoveredSinceLastLowBattery,
		hasReportedSinceLastOffline,
	});

	for (const decision of decisions) {
		await fireDecision(device, decision);
	}
}

async function fireDecision(device: DeviceRow, decision: AlertDecision): Promise<void> {
	const subject = subjectFor(device, decision);
	const body = bodyFor(device, decision);
	log.info({ device_id: device.device_id, kind: decision.kind, reason: decision.reason }, "alert");
	const results: Awaited<ReturnType<typeof dispatcher.sendPush>>[] = [];

	// Web Push to every subscription whose user has opted in to this device.
	const subs = await pool.query<{ id: string; endpoint: string; p256dh: string; auth: string; user_email: string }>(
		`SELECT ps.id, ps.endpoint, ps.p256dh, ps.auth, u.email AS user_email
		   FROM device_push_subscribers dps
		   JOIN users u                  ON u.id  = dps.user_id
		   JOIN push_subscriptions ps    ON ps.user_id = u.id
		  WHERE dps.device_id = $1`,
		[device.device_id],
	);
	if (subs.rows.length === 0) {
		log.warn({ device_id: device.device_id, kind: decision.kind }, "no push subscribers for device");
	}
	for (const sub of subs.rows) {
		const r = await dispatcher.sendPush(sub, {
			title: subject,
			body,
			tag: `ember-${device.device_id}-${decision.kind}`,
			url: "/alerts",
		});
		results.push(r);
		if (dispatcher.isExpired(r)) {
			await pool.query(`DELETE FROM push_subscriptions WHERE id = $1`, [sub.id]).catch(() => {});
		}
	}

	for (const r of results) {
		await pool.query(
			`INSERT INTO notification_events
			   (device_id, kind, fired_at, reading_at, temperature, battery_voltage, channel, destination, status, error)
			 VALUES ($1, $2, now(), $3, $4, $5, $6, $7, $8, $9)`,
			[
				device.device_id,
				decision.kind,
				decision.reading_at ?? null,
				decision.temperature ?? null,
				decision.battery_voltage ?? null,
				r.channel,
				r.destination,
				r.status,
				r.error ?? null,
			],
		);
	}
}

function subjectFor(device: DeviceRow, d: AlertDecision): string {
	const name = device.name || device.device_id;
	switch (d.kind) {
		case "low_temp":
			return `${name}: Lav temperatur`;
		case "low_battery":
			return `${name}: Lavt batteri`;
		case "offline":
			return `${name}: Offline`;
	}
}

function bodyFor(device: DeviceRow, d: AlertDecision): string {
	const name = device.name || device.device_id;
	switch (d.kind) {
		case "low_temp": {
			const temp = d.temperature !== undefined && d.temperature !== null
				? `${d.temperature.toFixed(1)} °C`
				: "ukjent";
			return `Sauna "${name}" har for lav temperatur. Siste registrerte temperatur var ${temp}.`;
		}
		case "low_battery": {
			const pct = d.battery_percent !== undefined && d.battery_percent !== null
				? `${d.battery_percent} %`
				: "ukjent";
			return `Sauna "${name}" har lavt batteri. Siste registrerte nivå var ${pct}.`;
		}
		case "offline":
			return `Sauna "${name}" har ikke sendt data på en stund.`;
	}
}

// ── DB loaders ─────────────────────────────────────────────────────────────
async function loadDevice(deviceId: string): Promise<DeviceRow | null> {
	const r = await pool.query<DeviceRow>(
		`SELECT d.id, d.device_id, d.name, d.customer_id, d.site_id, s.name AS site_name,
		        d.low_temp_threshold::float8 AS low_temp_threshold,
		        d.battery_warning_threshold::float8 AS battery_warning_threshold,
		        d.battery_warning_percent,
		        d.snoozed_until,
		        d.last_seen,
		        d.last_temp::float8 AS last_temp,
		        d.last_battery_voltage::float8 AS last_battery_voltage,
		        d.last_battery_percent, d.last_signal,
		        d.active_window_start::text AS active_window_start,
		        d.active_window_end::text AS active_window_end,
		        d.active_days, d.timezone
		   FROM devices d
		   LEFT JOIN sites s ON s.id = d.site_id
		  WHERE d.device_id = $1`,
		[deviceId],
	);
	return r.rows[0] ?? null;
}

async function loadRecentReadings(deviceId: string, n: number): Promise<ReadingRow[]> {
	const r = await pool.query<ReadingRow>(
		`SELECT device_id, created_at,
		        temperature::float8 AS temperature,
		        battery_voltage::float8 AS battery_voltage,
		        battery_percent, signal_strength
		   FROM temperature_readings
		  WHERE device_id = $1
		  ORDER BY created_at DESC
		  LIMIT $2`,
		[deviceId, n],
	);
	return r.rows;
}

async function loadLastFired(deviceId: string): Promise<LastFiredMap> {
	const r = await pool.query<{ kind: NotificationKind; max: Date }>(
		`SELECT kind, max(fired_at) AS max
		   FROM notification_events
		  WHERE device_id = $1 AND status IN ('sent','dry_run')
		  GROUP BY kind`,
		[deviceId],
	);
	const out: LastFiredMap = {};
	for (const row of r.rows) out[row.kind] = row.max;
	return out;
}

async function hasRecoveredSinceLastLowTempEvent(
	deviceId: string,
	lastLowTempAt: Date | undefined,
	threshold: number | null,
): Promise<boolean> {
	if (!lastLowTempAt || threshold === null) return false;
	const r = await pool.query<{ exists: boolean }>(
		`SELECT EXISTS (
		    SELECT 1 FROM temperature_readings
		     WHERE device_id = $1
		       AND created_at > $2
		       AND temperature >= $3
		 ) AS exists`,
		[deviceId, lastLowTempAt, threshold],
	);
	return Boolean(r.rows[0]?.exists);
}

async function hasRecoveredSinceLastLowBatteryEvent(
	deviceId: string,
	lastLowBatteryAt: Date | undefined,
	threshold: number,
): Promise<boolean> {
	if (!lastLowBatteryAt) return false;
	const r = await pool.query<{ exists: boolean }>(
		`SELECT EXISTS (
		    SELECT 1 FROM temperature_readings
		     WHERE device_id = $1
		       AND created_at > $2
		       AND battery_percent IS NOT NULL
		       AND battery_percent >= $3
		 ) AS exists`,
		[deviceId, lastLowBatteryAt, threshold],
	);
	return Boolean(r.rows[0]?.exists);
}

async function hasReportedSinceLastOfflineEvent(
	deviceId: string,
	lastOfflineAt: Date | undefined,
): Promise<boolean> {
	if (!lastOfflineAt) return false;
	const r = await pool.query<{ exists: boolean }>(
		`SELECT EXISTS (
		    SELECT 1 FROM temperature_readings
		     WHERE device_id = $1
		       AND created_at > $2
		 ) AS exists`,
		[deviceId, lastOfflineAt],
	);
	return Boolean(r.rows[0]?.exists);
}

// ── Shutdown ───────────────────────────────────────────────────────────────
async function shutdown(signal: string) {
	log.info({ signal }, "shutting down");
	await listenClient.end().catch(() => {});
	await pool.end().catch(() => {});
	process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
