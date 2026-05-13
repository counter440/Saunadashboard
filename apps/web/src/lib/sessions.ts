import { q } from "./db";

const SESSION_TEMP_C = 50;          // a sauna is "fired" when readings reach this
const MIN_DURATION_MS = 15 * 60_000; // and stay there for at least 15 min
const GAP_TOLERANCE_MS = 75 * 60_000; // tolerate up to 75 min between readings before ending a session

export interface Session {
	started_at: Date;
	ended_at: Date;
	peak_c: number;
	duration_seconds: number;
}

interface Reading { created_at: Date; temperature: number; }

/**
 * Walk a chronologically-ascending series and emit "session" runs:
 * continuous stretches above SESSION_TEMP_C, at least MIN_DURATION_MS long.
 */
export function detectSessions(readings: Reading[]): Session[] {
	const out: Session[] = [];
	let current: { start: Date; lastTs: Date; peak: number } | null = null;

	const closeIfValid = () => {
		if (!current) return;
		const dur = current.lastTs.getTime() - current.start.getTime();
		if (dur >= MIN_DURATION_MS) {
			out.push({
				started_at: current.start,
				ended_at: current.lastTs,
				peak_c: current.peak,
				duration_seconds: Math.round(dur / 1000),
			});
		}
		current = null;
	};

	for (const r of readings) {
		const ts = new Date(r.created_at);
		const temp = Number(r.temperature);
		if (temp >= SESSION_TEMP_C) {
			if (!current) {
				current = { start: ts, lastTs: ts, peak: temp };
			} else if (ts.getTime() - current.lastTs.getTime() > GAP_TOLERANCE_MS) {
				// Long gap — treat as session end + new start
				closeIfValid();
				current = { start: ts, lastTs: ts, peak: temp };
			} else {
				current.lastTs = ts;
				if (temp > current.peak) current.peak = temp;
			}
		} else if (current) {
			closeIfValid();
		}
	}
	closeIfValid();
	return out;
}

export async function recentSessions(deviceId: string, days = 30): Promise<Session[]> {
	const rows = await q<{ created_at: Date; temperature: number }>(
		`SELECT created_at, temperature::float8 AS temperature
		   FROM temperature_readings
		  WHERE device_id = $1 AND created_at > now() - ($2 || ' days')::interval
		  ORDER BY created_at ASC`,
		[deviceId, days],
	);
	return detectSessions(rows.map((r) => ({ created_at: new Date(r.created_at), temperature: Number(r.temperature) })));
}

/** Format duration like "1t 45m" / "1h 45m". */
export function formatDuration(seconds: number, locale: "nb" | "en"): string {
	const h = Math.floor(seconds / 3600);
	const m = Math.round((seconds % 3600) / 60);
	const hLabel = locale === "nb" ? "t" : "h";
	if (h === 0) return `${m}m`;
	if (m === 0) return `${h}${hLabel}`;
	return `${h}${hLabel} ${m}m`;
}
