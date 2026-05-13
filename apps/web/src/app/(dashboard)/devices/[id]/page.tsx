import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { StatusPill } from "@/components/status-pill";
import { ChartCard } from "@/components/chart-card";
import { formatBatteryPercent, statusFor } from "@/lib/format";
import { getT } from "@/lib/i18n.server";
import { relativeFromNowI18n, tFor, type Locale, type TKey } from "@/lib/i18n";
import { recentSessions, formatDuration } from "@/lib/sessions";
import { runwayForDevice } from "@/lib/battery";

interface Device {
	id: string;
	device_id: string;
	name: string;
	site_id: string | null;
	site_name: string | null;
	image_path: string | null;
	last_seen: Date | null;
	last_temp: number | null;
	last_battery_percent: number | null;
	last_signal: number | null;
	low_temp_threshold: number | null;
	battery_warning_percent: number;
	active_window_start: string;
	active_window_end: string;
	timezone: string;
}

const STATUS_KEY: Record<"ok" | "warn" | "bad", TKey> = {
	ok: "status.ok", warn: "status.warn", bad: "status.bad",
};

export default async function DeviceDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ range?: "24h" | "7d" | "30d" }>;
}) {
	const { customerId } = await requireCustomer();
	const { t, locale } = await getT();
	const { id } = await params;
	const sp = await searchParams;
	const range = sp.range ?? "24h";

	const device = await q1<Device>(
		`SELECT d.id, d.device_id, d.name, d.site_id, s.name AS site_name, d.image_path, d.last_seen,
		        d.last_temp::float8 AS last_temp,
		        d.last_battery_percent, d.last_signal,
		        d.low_temp_threshold::float8 AS low_temp_threshold,
		        d.battery_warning_percent,
		        d.active_window_start::text AS active_window_start,
		        d.active_window_end::text AS active_window_end,
		        d.timezone
		   FROM devices d
		   LEFT JOIN sites s ON s.id = d.site_id
		  WHERE d.device_id = $1 AND d.customer_id = $2`,
		[id, customerId],
	);
	if (!device) notFound();

	const points = await loadChart(device.device_id, range);
	const status = statusFor(device);

	return (
		<div className="px-4 py-5 md:py-6 max-w-5xl">
			<div className="mb-3">
				<Link href={device.site_id ? `/sites/${device.site_id}` : "/dashboard"} className="text-sm text-inkDim hover:text-accent">
					← {device.site_name ?? t("dashboard.title")}
				</Link>
			</div>
			<div className="flex flex-wrap items-start justify-between gap-3 mb-4">
				<div>
					<h1 className="text-xl md:text-2xl font-semibold">{device.name}</h1>
					<p className="text-sm text-inkDim">
						{device.site_name ?? t("device.noSite")} · <span className="font-mono">{device.device_id}</span>
					</p>
				</div>
				<div className="flex items-center gap-2">
					<StatusPill status={status}>{tFor(locale, STATUS_KEY[status])}</StatusPill>
					<Link href={`/devices/${device.device_id}/settings`} className="btn-ghost text-sm">{t("device.settings")}</Link>
				</div>
			</div>

			{/* Hero with optional image + giant temperature */}
			<div className="card overflow-hidden mb-5">
				<div className="grid grid-cols-1 md:grid-cols-2">
					<div className="relative aspect-[16/9] md:aspect-auto md:min-h-[220px] bg-surface2">
						{device.image_path ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={device.image_path} alt={device.name} className="absolute inset-0 h-full w-full object-cover" />
						) : (
							<div className="absolute inset-0 grid place-items-center text-inkMute">
								<svg viewBox="0 0 64 64" className="h-16 w-16 opacity-40" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
									<path d="M8 56h48M12 56V24l20-12 20 12v32M22 56v-16h20v16" />
									<path d="M28 22c2 2 0 4 2 6M34 22c2 2 0 4 2 6" />
								</svg>
							</div>
						)}
					</div>
					<div className="p-5 md:p-6 flex flex-col justify-between">
						<div className="text-2xs uppercase tracking-wider text-inkMute">{t("device.metric.temperature")}</div>
						<div className="flex items-baseline gap-2 mt-1">
							<span className={`text-6xl md:text-7xl font-semibold tabular-nums leading-none ${
								status === "bad" ? "text-bad" : status === "warn" ? "text-warn" : "text-ink"
							}`}>
								{device.last_temp === null ? "—" : Number(device.last_temp).toFixed(1)}
							</span>
							<span className={`text-3xl font-semibold ${
								status === "bad" ? "text-bad" : status === "warn" ? "text-warn" : "text-ink"
							}`}>°C</span>
						</div>
						{device.low_temp_threshold !== null && (
							<div className="text-2xs text-inkMute uppercase tracking-wider mt-1">
								min {device.low_temp_threshold}°
							</div>
						)}
						<div className="grid grid-cols-3 gap-2 mt-5 text-xs">
							<MetricInline label={t("device.metric.battery")} value={formatBatteryPercent(device.last_battery_percent)} />
							<MetricInline label={t("device.metric.signal")} value={device.last_signal !== null ? `${device.last_signal} dBm` : "—"} />
							<MetricInline label={t("device.metric.lastSeen")} value={relativeFromNowI18n(locale, device.last_seen)} />
						</div>
					</div>
				</div>
			</div>

			<div className="card p-3 md:p-4 mb-5">
				<RangeTabs deviceId={device.device_id} current={range} locale={locale} />
				<ChartCard points={points} threshold={device.low_temp_threshold} />
			</div>

			<div className="card p-4 mb-5">
				<h2 className="text-sm font-medium mb-2">{t("sessions.title")}</h2>
				<SessionsTable deviceId={device.device_id} locale={locale} />
			</div>

			<div className="card p-4">
				<div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
					<h2 className="text-sm font-medium">{t("device.recentReadings")}</h2>
					<div className="flex items-center gap-2 text-xs">
						<a href={`/api/devices/${device.device_id}/export.csv?range=24h`} className="btn-ghost text-xs">{t("export.csv24h")}</a>
						<a href={`/api/devices/${device.device_id}/export.csv?range=7d`} className="btn-ghost text-xs">{t("export.csv7d")}</a>
						<a href={`/api/devices/${device.device_id}/export.csv?range=30d`} className="btn-ghost text-xs">{t("export.csv30d")}</a>
					</div>
				</div>
				<RecentTable deviceId={device.device_id} locale={locale} />
			</div>
		</div>
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

async function SessionsTable({ deviceId, locale }: { deviceId: string; locale: Locale }) {
	const sessions = (await recentSessions(deviceId, 30)).slice(-10).reverse();
	if (sessions.length === 0) return <div className="text-sm text-inkDim italic">{tFor(locale, "sessions.empty")}</div>;
	return (
		<div className="overflow-x-auto -mx-4">
			<table className="min-w-full text-sm">
				<thead className="text-inkDim">
					<tr>
						<th className="text-left px-4 py-2 font-medium">{tFor(locale, "sessions.col.started")}</th>
						<th className="text-right px-4 py-2 font-medium">{tFor(locale, "sessions.col.duration")}</th>
						<th className="text-right px-4 py-2 font-medium">{tFor(locale, "sessions.col.peak")}</th>
					</tr>
				</thead>
				<tbody>
					{sessions.map((s) => (
						<tr key={s.started_at.toISOString()} className="border-t border-border">
							<td className="px-4 py-2 whitespace-nowrap">
								{new Date(s.started_at).toLocaleString(locale === "nb" ? "nb-NO" : "en-US", {
									dateStyle: "short", timeStyle: "short",
								})}
							</td>
							<td className="px-4 py-2 text-right tabular-nums">{formatDuration(s.duration_seconds, locale)}</td>
							<td className="px-4 py-2 text-right tabular-nums">{s.peak_c.toFixed(1)} °C</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function RangeTabs({ deviceId, current, locale }: { deviceId: string; current: string; locale: Locale }) {
	const ranges: { k: "24h" | "7d" | "30d"; key: TKey }[] = [
		{ k: "24h", key: "device.range.24h" },
		{ k: "7d",  key: "device.range.7d"  },
		{ k: "30d", key: "device.range.30d" },
	];
	return (
		<div
			className="sticky top-0 z-10 -mx-3 md:-mx-4 px-3 md:px-4 pt-1 pb-2 mb-3
			           bg-surface border-b border-border"
		>
			<div className="inline-flex rounded-lg border border-border p-0.5">
				{ranges.map((r) => (
					<Link
						key={r.k}
						href={`/devices/${deviceId}?range=${r.k}`}
						className={`min-h-touch min-w-touch grid place-items-center px-3 text-sm rounded-md ${
							current === r.k ? "bg-accent text-white" : "text-ink"
						}`}
					>
						{tFor(locale, r.key)}
					</Link>
				))}
			</div>
		</div>
	);
}

async function loadChart(deviceId: string, range: "24h" | "7d" | "30d") {
	if (range === "24h") {
		const rows = await q<{ bucket: Date; v: number }>(
			`SELECT created_at AS bucket, temperature::float8 AS v
			   FROM temperature_readings
			  WHERE device_id = $1 AND created_at > now() - INTERVAL '24 hours'
			  ORDER BY created_at ASC`,
			[deviceId],
		);
		return rows.map((r) => ({ t: new Date(r.bucket).getTime(), v: Number(r.v) }));
	}
	if (range === "7d") {
		const rows = await q<{ bucket: Date; v: number }>(
			`SELECT bucket, temp_avg::float8 AS v
			   FROM readings_5m
			  WHERE device_id = $1 AND bucket > now() - INTERVAL '7 days'
			  ORDER BY bucket ASC`,
			[deviceId],
		);
		return rows.map((r) => ({ t: new Date(r.bucket).getTime(), v: Number(r.v) }));
	}
	const rows = await q<{ bucket: Date; v: number }>(
		`SELECT bucket, temp_avg::float8 AS v
		   FROM readings_1h
		  WHERE device_id = $1 AND bucket > now() - INTERVAL '30 days'
		  ORDER BY bucket ASC`,
		[deviceId],
	);
	return rows.map((r) => ({ t: new Date(r.bucket).getTime(), v: Number(r.v) }));
}

async function RecentTable({ deviceId, locale }: { deviceId: string; locale: Locale }) {
	const rows = await q<{
		created_at: Date;
		temperature: number;
		battery_percent: number | null;
	}>(
		`SELECT created_at,
		        temperature::float8 AS temperature,
		        battery_percent
		   FROM temperature_readings
		  WHERE device_id = $1
		  ORDER BY created_at DESC
		  LIMIT 30`,
		[deviceId],
	);
	if (rows.length === 0) return <div className="text-sm text-inkDim italic">{tFor(locale, "device.noReadings")}</div>;
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
					{rows.map((r) => (
						<tr key={new Date(r.created_at).toISOString()} className="border-t border-border">
							<td className="px-4 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString(locale === "nb" ? "nb-NO" : "en-US")}</td>
							<td className="px-4 py-2 text-right tabular-nums">{Number(r.temperature).toFixed(1)} °C</td>
							<td className="px-4 py-2 text-right tabular-nums">{r.battery_percent !== null ? `${r.battery_percent}%` : "—"}</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}
