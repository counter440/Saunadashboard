import { q } from "./db";

interface Sample { created_at: Date; battery_percent: number; }

/**
 * Linear regression on battery_percent over time; returns rounded days until 0%,
 * or null if the data is too sparse / not draining.
 */
export function batteryRunwayDays(readings: Sample[]): number | null {
	const pts = readings
		.filter((r) => r.battery_percent !== null && r.battery_percent !== undefined)
		.map((r) => ({ t: new Date(r.created_at).getTime(), y: Number(r.battery_percent) }))
		.sort((a, b) => a.t - b.t);
	if (pts.length < 5) return null;

	const t0 = pts[0]!.t;
	const n = pts.length;
	let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
	for (const p of pts) {
		const x = (p.t - t0) / 86_400_000; // days
		const y = p.y;
		sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x;
	}
	const denom = n * sumX2 - sumX * sumX;
	if (denom === 0) return null;
	const slope = (n * sumXY - sumX * sumY) / denom; // %/day
	// Require at least 0.05 %/day drain — otherwise prediction is meaningless.
	if (slope >= -0.05) return null;
	const lastY = pts[pts.length - 1]!.y;
	const days = -lastY / slope;
	if (!isFinite(days) || days < 0) return null;
	return Math.round(days);
}

/** Compute runway for every device of a customer in one query. */
export async function runwaysForCustomer(customerId: string): Promise<Map<string, number | null>> {
	const rows = await q<{ device_id: string; created_at: Date; battery_percent: number }>(
		`SELECT r.device_id, r.created_at, r.battery_percent
		   FROM temperature_readings r
		   JOIN devices d ON d.device_id = r.device_id
		  WHERE d.customer_id = $1
		    AND r.battery_percent IS NOT NULL
		    AND r.created_at > now() - INTERVAL '14 days'`,
		[customerId],
	);
	const byDevice = new Map<string, Sample[]>();
	for (const r of rows) {
		const list = byDevice.get(r.device_id) ?? [];
		list.push({ created_at: new Date(r.created_at), battery_percent: Number(r.battery_percent) });
		byDevice.set(r.device_id, list);
	}
	const out = new Map<string, number | null>();
	for (const [deviceId, pts] of byDevice) {
		out.set(deviceId, batteryRunwayDays(pts));
	}
	return out;
}

/** Single-device runway query. */
export async function runwayForDevice(deviceId: string): Promise<number | null> {
	const rows = await q<{ created_at: Date; battery_percent: number }>(
		`SELECT created_at, battery_percent
		   FROM temperature_readings
		  WHERE device_id = $1 AND battery_percent IS NOT NULL
		    AND created_at > now() - INTERVAL '14 days'`,
		[deviceId],
	);
	return batteryRunwayDays(rows.map((r) => ({ created_at: new Date(r.created_at), battery_percent: Number(r.battery_percent) })));
}
