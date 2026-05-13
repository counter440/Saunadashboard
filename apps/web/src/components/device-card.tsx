import Link from "next/link";
import { StatusPill } from "@/components/status-pill";
import { Sparkline } from "@/components/sparkline";
import { statusFor } from "@/lib/format";
import { tFor, relativeFromNowI18n, type Locale, type TKey } from "@/lib/i18n";

const STATUS_KEY: Record<"ok" | "warn" | "bad", TKey> = {
	ok: "status.ok", warn: "status.warn", bad: "status.bad",
};

const TEMP_TEXT: Record<"ok" | "warn" | "bad", string> = {
	ok: "text-ink", warn: "text-warn", bad: "text-bad",
};

export interface DeviceCardData {
	id: string;
	device_id: string;
	name: string;
	image_path: string | null;
	last_seen: Date | null;
	last_temp: number | null;
	last_battery_percent: number | null;
	low_temp_threshold: number | null;
	battery_warning_percent: number;
	snoozed_until?: Date | null;
}

export function DeviceCard({
	device, locale, runwayDays,
}: {
	device: DeviceCardData;
	locale: Locale;
	runwayDays?: number | null;
}) {
	const status = statusFor(device);
	const tempText = TEMP_TEXT[status];
	const t = device.last_temp;
	const battPct = device.last_battery_percent;
	const snoozed = device.snoozed_until && new Date(device.snoozed_until).getTime() > Date.now();

	return (
		<Link
			href={`/devices/${device.device_id}`}
			className="card-lift block overflow-hidden group"
		>
			{/* Image hero (or muted fallback) */}
			<div className="relative aspect-[16/9] bg-surface2 overflow-hidden">
				{device.image_path ? (
					// eslint-disable-next-line @next/next/no-img-element
					<img
						src={device.image_path}
						alt={device.name}
						className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
					/>
				) : (
					<div className="absolute inset-0 flex items-center justify-center text-inkMute">
						<SaunaGlyph />
					</div>
				)}
				{/* Status pill in top-right corner */}
				<div className="absolute top-2 right-2 flex flex-col items-end gap-1">
					<StatusPill status={status}>{tFor(locale, STATUS_KEY[status])}</StatusPill>
					{snoozed && (
						<span className="pill-warn">
							<svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
								<path d="M12 6v6l4 2" />
								<circle cx="12" cy="12" r="9" />
							</svg>
							{tFor(locale, "snooze.title")}
						</span>
					)}
				</div>
			</div>

			{/* Body */}
			<div className="p-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="font-semibold truncate text-ink">{device.name}</div>
						<div className="text-2xs text-inkMute mt-0.5 font-mono uppercase tracking-wider">{device.device_id}</div>
					</div>
				</div>

				{/* BIG temperature */}
				<div className="mt-3 flex items-baseline gap-2">
					<span className={`text-4xl md:text-5xl font-semibold tabular-nums leading-none ${tempText}`}>
						{t === null ? "—" : Number(t).toFixed(1)}
					</span>
					<span className={`text-xl font-semibold ${tempText}`}>°C</span>
					{device.low_temp_threshold !== null && (
						<span className="ml-auto text-2xs text-inkMute uppercase tracking-wider">
							min {device.low_temp_threshold}°
						</span>
					)}
				</div>

				{/* Meta row */}
				<div className="mt-3 grid grid-cols-2 gap-2 text-xs text-inkDim">
					<div className="flex items-center gap-1.5 min-w-0">
						<BatteryGlyph pct={battPct ?? 0} />
						<span className="tabular-nums">{battPct !== null ? `${battPct}%` : "—"}</span>
						{typeof runwayDays === "number" && runwayDays < 60 && (
							<span className={`tabular-nums truncate ${runwayDays < 7 ? "text-bad" : runwayDays < 30 ? "text-warn" : "text-inkMute"}`}>
								· {tFor(locale, "battery.runwayShort", { n: runwayDays })}
							</span>
						)}
					</div>
					<div className="text-right tabular-nums">{relativeFromNowI18n(locale, device.last_seen)}</div>
				</div>

				{/* Sparkline */}
				<div className="mt-3 h-12 -mx-1">
					<Sparkline deviceId={device.device_id} />
				</div>
			</div>
		</Link>
	);
}

function SaunaGlyph() {
	return (
		<svg viewBox="0 0 64 64" className="h-12 w-12 opacity-40" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
			<path d="M8 56h48M12 56V24l20-12 20 12v32M22 56v-16h20v16" />
			<path d="M28 22c2 2 0 4 2 6M34 22c2 2 0 4 2 6" />
		</svg>
	);
}

function BatteryGlyph({ pct }: { pct: number }) {
	const fillW = Math.max(0, Math.min(1, pct / 100)) * 14;
	const colorCls = pct < 20 ? "text-bad" : pct < 40 ? "text-warn" : "text-ok";
	return (
		<svg viewBox="0 0 24 12" className={`h-3 w-6 ${colorCls}`} fill="currentColor">
			<rect x="0.5" y="1.5" width="20" height="9" rx="1.5" stroke="currentColor" strokeWidth="1" fill="none" />
			<rect x="21.5" y="4" width="2" height="4" rx="0.5" />
			<rect x="2.5" y="3.5" width={fillW} height="5" rx="0.5" />
		</svg>
	);
}
