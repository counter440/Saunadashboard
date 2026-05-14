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
	/** Last fired_at per kind for this device, used for the recovery gate. */
	lastFired: LastFiredMap;
	/**
	 * Has any reading at-or-above low_temp_threshold landed AFTER the last low_temp alert?
	 * If true, the next sub-threshold breach may re-fire.
	 */
	hasRecoveredSinceLastLowTemp: boolean;
	/** Same idea for battery: has battery_percent ≥ threshold landed AFTER the last low_battery alert? */
	hasRecoveredSinceLastLowBattery: boolean;
	/** Has any fresh reading landed AFTER the last offline alert? */
	hasReportedSinceLastOffline: boolean;
	/** Threshold (in minutes) above which a device is considered offline. */
	offlineThresholdMinutes?: number;
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
 * should fire right now. Edge-triggered: each kind fires once, then waits for the
 * underlying condition to recover before it can fire again.
 */
export function evaluateRules(input: EvaluateInput): AlertDecision[] {
	const decisions: AlertDecision[] = [];
	const {
		device,
		recentReadings,
		now,
		lastFired,
		hasRecoveredSinceLastLowTemp,
		hasRecoveredSinceLastLowBattery,
		hasReportedSinceLastOffline,
		offlineThresholdMinutes = 90,
	} = input;

	// Maintenance / snooze — suppress all alerts until snoozed_until passes.
	if (device.snoozed_until && device.snoozed_until.getTime() > now.getTime()) {
		return decisions;
	}

	// ── 1. Low temperature ─────────────────────────────────────────────────
	// Single sub-threshold reading fires (device only reports every 30 min,
	// waiting for a second confirmation would delay alerts by another full cycle).
	if (device.low_temp_threshold !== null && recentReadings.length >= 1) {
		const inWindow = isWithinActiveWindow(
			now,
			device.timezone,
			device.active_window_start,
			device.active_window_end,
			device.active_days,
		);
		if (inWindow) {
			const r0 = recentReadings[0]!;
			if (Number(r0.temperature) < device.low_temp_threshold) {
				const armed = !lastFired.low_temp || hasRecoveredSinceLastLowTemp;
				if (armed) {
					decisions.push({
						kind: "low_temp",
						reason: `temp ${r0.temperature.toFixed(1)} < ${device.low_temp_threshold}`,
						temperature: Number(r0.temperature),
						reading_at: r0.created_at,
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
			const armed = !lastFired.low_battery || hasRecoveredSinceLastLowBattery;
			if (armed) {
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
				const armed = !lastFired.offline || hasReportedSinceLastOffline;
				if (armed) {
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
