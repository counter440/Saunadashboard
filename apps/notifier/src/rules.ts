import { isWithinActiveWindow, type DeviceRow, type ReadingRow, type NotificationKind } from "@sauna/shared";

export interface LastFiredMap {
	low_temp?: Date;
	low_battery?: Date;
	offline?: Date;
}

export interface EvaluateInput {
	device: DeviceRow;
	/** Most recent readings for this device, newest first. Need ≥2 for the consecutive-breach rule. */
	recentReadings: ReadingRow[];
	/** When this evaluation is being run. Pass an injected clock for tests. */
	now: Date;
	/** Last fired_at per kind for this device, used for cooldown. */
	lastFired: LastFiredMap;
	/**
	 * The reading immediately preceding the most recent low-temp run we've already alerted on.
	 * Used to implement "cooldown resets when temperature recovered above threshold".
	 * If the device has had any reading at-or-above threshold AFTER the last `low_temp` event,
	 * we consider the cooldown reset.
	 */
	hasRecoveredSinceLastLowTemp: boolean;
	/** Threshold (in minutes) above which a device is considered offline. */
	offlineThresholdMinutes?: number;
	/** Default cooldown for low_battery alerts (hours). */
	lowBatteryCooldownHours?: number;
}

export interface AlertDecision {
	kind: NotificationKind;
	reason: string;
	temperature?: number;
	battery_voltage?: number;
	battery_percent?: number;
	reading_at?: Date;
}

/**
 * Pure function — given a snapshot of a device's state, decide which alerts (if any)
 * should fire right now. Caller is responsible for dispatching them and recording
 * notification_events rows.
 */
export function evaluateRules(input: EvaluateInput): AlertDecision[] {
	const decisions: AlertDecision[] = [];
	const {
		device,
		recentReadings,
		now,
		lastFired,
		hasRecoveredSinceLastLowTemp,
		offlineThresholdMinutes = 90,
		lowBatteryCooldownHours = 24,
	} = input;

	// Maintenance / snooze — suppress all alerts until snoozed_until passes.
	if (device.snoozed_until && device.snoozed_until.getTime() > now.getTime()) {
		return decisions;
	}

	// ── 1. Low temperature ─────────────────────────────────────────────────
	if (
		device.low_temp_threshold !== null &&
		recentReadings.length >= 2
	) {
		const inWindow = isWithinActiveWindow(
			now,
			device.timezone,
			device.active_window_start,
			device.active_window_end,
			device.active_days,
		);
		if (inWindow) {
			const [r0, r1] = recentReadings;
			const breach =
				Number(r0!.temperature) < device.low_temp_threshold &&
				Number(r1!.temperature) < device.low_temp_threshold;
			if (breach) {
				const cooldownExpired = lastFired.low_temp
					? hoursBetween(now, lastFired.low_temp) >= device.alert_cooldown_hours
					: true;
				if (cooldownExpired || hasRecoveredSinceLastLowTemp) {
					decisions.push({
						kind: "low_temp",
						reason: `temp ${r0!.temperature.toFixed(1)} < ${device.low_temp_threshold} for 2 consecutive readings`,
						temperature: Number(r0!.temperature),
						reading_at: r0!.created_at,
					});
				}
			}
		}
	}

	// ── 2. Low battery (percent-based, customer-facing) ────────────────────
	const latest = recentReadings[0];
	if (latest && latest.battery_percent !== null) {
		const pct = Number(latest.battery_percent);
		if (pct < device.battery_warning_percent) {
			const cooldownExpired = lastFired.low_battery
				? hoursBetween(now, lastFired.low_battery) >= lowBatteryCooldownHours
				: true;
			if (cooldownExpired) {
				decisions.push({
					kind: "low_battery",
					reason: `battery ${pct}% < ${device.battery_warning_percent}%`,
					battery_voltage: latest.battery_voltage !== null ? Number(latest.battery_voltage) : undefined,
					battery_percent: pct,
					reading_at: latest.created_at,
				});
			}
		}
	}

	// ── 3. Offline / stale ─────────────────────────────────────────────────
	if (device.last_seen) {
		const minutesSilent = (now.getTime() - device.last_seen.getTime()) / 60_000;
		if (minutesSilent > offlineThresholdMinutes) {
			const inWindow = isWithinActiveWindow(
				now,
				device.timezone,
				device.active_window_start,
				device.active_window_end,
				device.active_days,
			);
			if (inWindow) {
				const cooldownExpired = lastFired.offline
					? hoursBetween(now, lastFired.offline) >= device.alert_cooldown_hours
					: true;
				if (cooldownExpired) {
					decisions.push({
						kind: "offline",
						reason: `no reading for ${Math.round(minutesSilent)} min during active window`,
						reading_at: device.last_seen,
					});
				}
			}
		}
	}

	return decisions;
}

function hoursBetween(a: Date, b: Date): number {
	return Math.abs(a.getTime() - b.getTime()) / 3_600_000;
}
