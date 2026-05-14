import { test } from "node:test";
import assert from "node:assert/strict";
import type { DeviceRow, ReadingRow } from "@sauna/shared";
import { evaluateRules } from "./rules.js";

function device(overrides: Partial<DeviceRow> = {}): DeviceRow {
	return {
		id: "00000000-0000-0000-0000-000000000001",
		device_id: "sauna-01",
		name: "Test sauna",
		customer_id: null,
		site_id: null,
		site_name: "Oslo",
		low_temp_threshold: 70,
		battery_warning_threshold: 3.4,
		battery_warning_percent: 20,
		last_seen: new Date("2026-05-13T18:00:00Z"),
		last_temp: 72,
		last_battery_voltage: 3.8,
		last_battery_percent: 70,
		last_signal: -85,
		active_window_start: "00:00",
		active_window_end: "23:59",
		active_days: [0, 1, 2, 3, 4, 5, 6],
		timezone: "UTC",
		snoozed_until: null,
		...overrides,
	};
}

function reading(temp: number, t: string, batt: number | null = 3.8, pct: number | null = 70): ReadingRow {
	return {
		device_id: "sauna-01",
		created_at: new Date(t),
		temperature: temp,
		battery_voltage: batt,
		battery_percent: pct,
		signal_strength: -85,
	};
}

const NOW = new Date("2026-05-13T18:30:00Z");

const baseInput = {
	now: NOW,
	lastFired: {} as Record<string, Date>,
	hasRecoveredSinceLastLowTemp: false,
	hasRecoveredSinceLastLowBattery: false,
	hasReportedSinceLastOffline: false,
};

test("single dip below threshold fires low_temp", () => {
	const d = evaluateRules({
		...baseInput,
		device: device(),
		recentReadings: [reading(65, "2026-05-13T18:30:00Z"), reading(72, "2026-05-13T18:00:00Z")],
	});
	assert.ok(d.some((x) => x.kind === "low_temp"));
});

test("low_temp does not re-fire without recovery", () => {
	const d = evaluateRules({
		...baseInput,
		device: device(),
		recentReadings: [reading(64, "2026-05-13T18:30:00Z"), reading(65, "2026-05-13T18:00:00Z")],
		lastFired: { low_temp: new Date("2026-05-13T17:30:00Z") },
		hasRecoveredSinceLastLowTemp: false,
	});
	assert.equal(d.find((x) => x.kind === "low_temp"), undefined);
});

test("low_temp re-fires after recovery above threshold", () => {
	const d = evaluateRules({
		...baseInput,
		device: device(),
		recentReadings: [reading(64, "2026-05-13T18:30:00Z"), reading(72, "2026-05-13T18:00:00Z")],
		lastFired: { low_temp: new Date("2026-05-13T17:30:00Z") },
		hasRecoveredSinceLastLowTemp: true,
	});
	assert.ok(d.some((x) => x.kind === "low_temp"));
});

test("out-of-window dip does not alert", () => {
	const d = evaluateRules({
		...baseInput,
		device: device({ active_window_start: "06:00", active_window_end: "08:00" }),
		recentReadings: [reading(64, "2026-05-13T18:30:00Z")],
	});
	assert.equal(d.find((x) => x.kind === "low_temp"), undefined);
});

test("low battery fires when below threshold", () => {
	const d = evaluateRules({
		...baseInput,
		device: device(),
		recentReadings: [reading(72, "2026-05-13T18:30:00Z", 3.2, 12)],
	});
	assert.ok(d.some((x) => x.kind === "low_battery"));
});

test("low_battery does not re-fire without recovery", () => {
	const d = evaluateRules({
		...baseInput,
		device: device(),
		recentReadings: [reading(72, "2026-05-13T18:30:00Z", 3.2, 8)],
		lastFired: { low_battery: new Date("2026-05-13T05:00:00Z") },
		hasRecoveredSinceLastLowBattery: false,
	});
	assert.equal(d.find((x) => x.kind === "low_battery"), undefined);
});

test("low_battery re-fires after battery swap recovery", () => {
	const d = evaluateRules({
		...baseInput,
		device: device(),
		recentReadings: [reading(72, "2026-05-13T18:30:00Z", 3.2, 12)],
		lastFired: { low_battery: new Date("2026-05-13T05:00:00Z") },
		hasRecoveredSinceLastLowBattery: true,
	});
	assert.ok(d.some((x) => x.kind === "low_battery"));
});

test("offline alert fires when last_seen > 90 min during active window", () => {
	const d = evaluateRules({
		...baseInput,
		device: device({ last_seen: new Date("2026-05-13T16:30:00Z") }),
		recentReadings: [],
	});
	assert.ok(d.some((x) => x.kind === "offline"));
});

test("offline does not re-fire while still silent", () => {
	const d = evaluateRules({
		...baseInput,
		device: device({ last_seen: new Date("2026-05-13T16:30:00Z") }),
		recentReadings: [],
		lastFired: { offline: new Date("2026-05-13T17:00:00Z") },
		hasReportedSinceLastOffline: false,
	});
	assert.equal(d.find((x) => x.kind === "offline"), undefined);
});

test("snoozed device suppresses all alerts", () => {
	const d = evaluateRules({
		...baseInput,
		device: device({ snoozed_until: new Date("2026-05-13T20:00:00Z") }),
		recentReadings: [reading(64, "2026-05-13T18:30:00Z", 3.2, 5)],
	});
	assert.equal(d.length, 0);
});

test("offline alert silent outside active window (e.g. overnight)", () => {
	const d = evaluateRules({
		...baseInput,
		device: device({
			last_seen: new Date("2026-05-13T22:00:00Z"),
			active_window_start: "06:00",
			active_window_end: "23:59",
		}),
		recentReadings: [],
		now: new Date("2026-05-14T02:00:00Z"),
	});
	assert.equal(d.find((x) => x.kind === "offline"), undefined);
});
