"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { StatusPill } from "@/components/status-pill";
import { statusFor, formatBatteryPercent } from "@/lib/format";
import { relativeFromNowI18n, tFor, type Locale, type TKey } from "@/lib/i18n";

export interface DeviceLiveData {
	last_temp: number | null;
	last_seen: Date | null;
	last_battery_percent: number | null;
	last_signal: number | null;
	recent: Array<{ created_at: Date; temperature: number; battery_percent: number | null }>;
}

export interface DeviceLiveMeta {
	device_id: string;
	low_temp_threshold: number | null;
	battery_warning_percent: number;
}

const LiveCtx = createContext<{ live: DeviceLiveData; meta: DeviceLiveMeta } | null>(null);

interface LiveApiResponse {
	last_temp: number | null;
	last_seen: string | null;
	last_battery_percent: number | null;
	last_signal: number | null;
	recent: Array<{ created_at: string; temperature: number; battery_percent: number | null }>;
}

const STATUS_KEY: Record<"ok" | "warn" | "bad", TKey> = {
	ok: "status.ok",
	warn: "status.warn",
	bad: "status.bad",
};

export function DeviceLiveProvider({
	meta,
	initial,
	intervalMs = 10000,
	children,
}: {
	meta: DeviceLiveMeta;
	initial: DeviceLiveData;
	intervalMs?: number;
	children: ReactNode;
}) {
	const [data, setData] = useState<DeviceLiveData>(initial);
	useEffect(() => {
		let stopped = false;
		const poll = async () => {
			if (stopped) return;
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
			try {
				const res = await fetch(`/api/devices/${encodeURIComponent(meta.device_id)}/live`, {
					cache: "no-store",
					credentials: "same-origin",
				});
				if (!res.ok) return;
				const json = (await res.json()) as LiveApiResponse;
				if (stopped) return;
				setData({
					last_temp: json.last_temp,
					last_seen: json.last_seen ? new Date(json.last_seen) : null,
					last_battery_percent: json.last_battery_percent,
					last_signal: json.last_signal,
					recent: (json.recent ?? []).map((r) => ({
						created_at: new Date(r.created_at),
						temperature: Number(r.temperature),
						battery_percent: r.battery_percent,
					})),
				});
			} catch {
				// transient — try again on the next tick
			}
		};
		const id = window.setInterval(poll, intervalMs);
		return () => {
			stopped = true;
			window.clearInterval(id);
		};
	}, [meta.device_id, intervalMs]);

	return <LiveCtx.Provider value={{ live: data, meta }}>{children}</LiveCtx.Provider>;
}

function useLive() {
	const v = useContext(LiveCtx);
	if (!v) throw new Error("DeviceLive consumers must be inside DeviceLiveProvider");
	return v;
}

function deriveStatus(live: DeviceLiveData, meta: DeviceLiveMeta): "ok" | "warn" | "bad" {
	return statusFor({
		last_seen: live.last_seen,
		last_temp: live.last_temp,
		last_battery_percent: live.last_battery_percent,
		low_temp_threshold: meta.low_temp_threshold,
		battery_warning_percent: meta.battery_warning_percent,
	});
}

export function LiveStatusPill({ locale }: { locale: Locale }) {
	const { live, meta } = useLive();
	const status = deriveStatus(live, meta);
	return <StatusPill status={status}>{tFor(locale, STATUS_KEY[status])}</StatusPill>;
}

export function LiveHeroMetrics({ locale }: { locale: Locale }) {
	const { live, meta } = useLive();
	const status = deriveStatus(live, meta);
	const color = status === "bad" ? "text-bad" : status === "warn" ? "text-warn" : "text-ink";
	return (
		<>
			<div className="text-2xs uppercase tracking-wider text-inkMute">
				{tFor(locale, "device.metric.temperature")}
			</div>
			<div className="flex items-baseline gap-2 mt-1">
				<span className={`text-6xl md:text-7xl font-semibold tabular-nums leading-none ${color}`}>
					{live.last_temp === null ? "—" : Number(live.last_temp).toFixed(1)}
				</span>
				<span className={`text-3xl font-semibold ${color}`}>°C</span>
			</div>
			{meta.low_temp_threshold !== null && (
				<div className="text-2xs text-inkMute uppercase tracking-wider mt-1">
					min {meta.low_temp_threshold}°
				</div>
			)}
			<div className="grid grid-cols-3 gap-2 mt-5 text-xs">
				<MetricInline
					label={tFor(locale, "device.metric.battery")}
					value={formatBatteryPercent(live.last_battery_percent)}
				/>
				<MetricInline
					label={tFor(locale, "device.metric.signal")}
					value={live.last_signal !== null ? `${live.last_signal} dBm` : "—"}
				/>
				<MetricInline
					label={tFor(locale, "device.metric.lastSeen")}
					value={relativeFromNowI18n(locale, live.last_seen)}
				/>
			</div>
		</>
	);
}

function MetricInline({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<div className="text-2xs uppercase tracking-wider text-inkMute">{label}</div>
			<div className="font-medium tabular-nums mt-0.5">{value}</div>
		</div>
	);
}

export function LiveRecentTable({ locale }: { locale: Locale }) {
	const { live } = useLive();
	if (live.recent.length === 0) {
		return <div className="text-sm text-inkDim italic">{tFor(locale, "device.noReadings")}</div>;
	}
	const dateLocale = locale === "nb" ? "nb-NO" : "en-US";
	return (
		<div className="overflow-x-auto -mx-4">
			<table className="min-w-full text-sm">
				<thead className="text-inkDim">
					<tr>
						<th className="text-left px-4 py-2 font-medium">{tFor(locale, "device.col.when")}</th>
						<th className="text-right px-4 py-2 font-medium">{tFor(locale, "device.col.temp")}</th>
						<th className="text-right px-4 py-2 font-medium">{tFor(locale, "device.col.battery")}</th>
					</tr>
				</thead>
				<tbody>
					{live.recent.map((r) => (
						<tr key={r.created_at.toISOString()} className="border-t border-border">
							<td className="px-4 py-2 whitespace-nowrap">{r.created_at.toLocaleString(dateLocale)}</td>
							<td className="px-4 py-2 text-right tabular-nums">{r.temperature.toFixed(1)} °C</td>
							<td className="px-4 py-2 text-right tabular-nums">
								{r.battery_percent !== null ? `${r.battery_percent}%` : "—"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
