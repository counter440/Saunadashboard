/**
 * Returns true if `instant` falls inside the device's active window for
 * its configured days, evaluated in the device's IANA timezone.
 *
 * Window is [start, end). If start > end (e.g. 22:00..06:00) the window
 * is treated as wrapping past midnight.
 */
export function isWithinActiveWindow(
	instant: Date,
	tz: string,
	startHHMM: string,
	endHHMM: string,
	activeDays: number[],
): boolean {
	const local = parseInTz(instant, tz);
	if (!activeDays.includes(local.weekday)) return false;
	const minutesNow = local.hour * 60 + local.minute;
	const startMin = hhmmToMinutes(startHHMM);
	const endMin = hhmmToMinutes(endHHMM);
	if (startMin <= endMin) {
		return minutesNow >= startMin && minutesNow < endMin;
	}
	return minutesNow >= startMin || minutesNow < endMin;
}

function hhmmToMinutes(s: string): number {
	const [hh, mm] = s.split(":").map(Number);
	return (hh ?? 0) * 60 + (mm ?? 0);
}

interface LocalParts {
	weekday: number; // 0=Sun..6=Sat
	hour: number;
	minute: number;
}

const DAY_INDEX: Record<string, number> = {
	Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function parseInTz(instant: Date, tz: string): LocalParts {
	const fmt = new Intl.DateTimeFormat("en-US", {
		timeZone: tz,
		weekday: "short",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
	});
	const parts = fmt.formatToParts(instant);
	let weekday = 0;
	let hour = 0;
	let minute = 0;
	for (const p of parts) {
		if (p.type === "weekday") weekday = DAY_INDEX[p.value] ?? 0;
		else if (p.type === "hour") hour = parseInt(p.value, 10) % 24;
		else if (p.type === "minute") minute = parseInt(p.value, 10);
	}
	return { weekday, hour, minute };
}
