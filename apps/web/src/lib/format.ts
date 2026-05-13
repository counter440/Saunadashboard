export function formatTemp(t: number | null | undefined): string {
	if (t === null || t === undefined) return "—";
	return `${Number(t).toFixed(1)} °C`;
}

export function formatBattery(v: number | null | undefined, pct: number | null | undefined): string {
	if (v === null || v === undefined) return "—";
	const vv = Number(v).toFixed(2);
	if (pct === null || pct === undefined) return `${vv} V`;
	return `${vv} V (${pct}%)`;
}

/** Customer-friendly battery display: percentage only. */
export function formatBatteryPercent(pct: number | null | undefined): string {
	return pct === null || pct === undefined ? "—" : `${pct}%`;
}

export function relativeFromNow(d: Date | string | null | undefined): string {
	if (!d) return "never";
	const date = typeof d === "string" ? new Date(d) : d;
	const ms = Date.now() - date.getTime();
	const min = Math.round(ms / 60_000);
	if (min < 1) return "just now";
	if (min < 60) return `${min} min ago`;
	const h = Math.round(min / 60);
	if (h < 24) return `${h} h ago`;
	const day = Math.round(h / 24);
	return `${day} d ago`;
}

export function statusFor(opts: {
	last_seen: Date | string | null | undefined;
	last_temp: number | null | undefined;
	last_battery_percent: number | null | undefined;
	low_temp_threshold: number | null | undefined;
	battery_warning_percent: number;
}): "ok" | "warn" | "bad" {
	const tempBad =
		opts.low_temp_threshold !== null &&
		opts.low_temp_threshold !== undefined &&
		opts.last_temp !== null &&
		opts.last_temp !== undefined &&
		Number(opts.last_temp) < opts.low_temp_threshold;
	if (tempBad) return "bad";
	const battWarn =
		opts.last_battery_percent !== null &&
		opts.last_battery_percent !== undefined &&
		Number(opts.last_battery_percent) < opts.battery_warning_percent;
	const stale =
		!opts.last_seen ||
		Date.now() - new Date(opts.last_seen).getTime() > 90 * 60_000;
	if (battWarn || stale) return "warn";
	return "ok";
}
