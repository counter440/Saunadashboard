import Link from "next/link";
import { q } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { plural, tFor, type Locale } from "@/lib/i18n";
import { statusFor } from "@/lib/format";
import { runwaysForCustomer } from "@/lib/battery";
import { AutoRefresh } from "@/components/auto-refresh";

interface SiteRow {
	id: string;
	name: string;
	address: string | null;
	timezone: string;
}

interface DeviceForRollup {
	site_id: string | null;
	last_seen: Date | null;
	last_temp: number | null;
	last_battery_percent: number | null;
	low_temp_threshold: number | null;
	battery_warning_percent: number;
}

export default async function DashboardPage() {
	const { customerId } = await requireCustomer();
	const { t, locale } = await getT();

	const sites = await q<SiteRow>(
		`SELECT id, name, address, timezone FROM sites WHERE customer_id = $1 ORDER BY name`,
		[customerId],
	);
	const devices = await q<DeviceForRollup>(
		`SELECT site_id, last_seen,
		        last_temp::float8 AS last_temp,
		        last_battery_percent,
		        low_temp_threshold::float8 AS low_temp_threshold,
		        battery_warning_percent
		   FROM devices WHERE customer_id = $1`,
		[customerId],
	);

	const rollups = new Map<string | null, { total: number; bad: number; warn: number }>();
	for (const d of devices) {
		const r = rollups.get(d.site_id) ?? { total: 0, bad: 0, warn: 0 };
		r.total += 1;
		const s = statusFor(d);
		if (s === "bad") r.bad += 1;
		else if (s === "warn") r.warn += 1;
		rollups.set(d.site_id, r);
	}
	const unassigned = rollups.get(null);

	if (sites.length === 0 && devices.length === 0) {
		return (
			<div className="px-4 py-5 md:py-6 max-w-5xl">
				<h1 className="text-xl md:text-2xl font-semibold mb-4">{t("dashboard.title")}</h1>
				<div className="card p-6 text-center text-inkDim">
					<p className="mb-1">{t("dashboard.empty.title")}</p>
					<p className="text-sm">{t("dashboard.empty.subtitle")}</p>
				</div>
			</div>
		);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-5xl">
			<AutoRefresh />
			<div className="mb-5">
				<h1 className="text-xl md:text-2xl font-semibold">{t("dashboard.title")}</h1>
				<p className="text-sm text-inkDim mt-1">{t("dashboard.pickLocation")}</p>
			</div>

			<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
				{sites.map((site) => {
					const r = rollups.get(site.id) ?? { total: 0, bad: 0, warn: 0 };
					return (
						<li key={site.id}>
							<SiteCard
								href={`/sites/${site.id}`}
								name={site.name}
								address={site.address}
								rollup={r}
								locale={locale}
							/>
						</li>
					);
				})}

				{unassigned && unassigned.total > 0 && (
					<li>
						<SiteCard
							href={`/sites/unassigned`}
							name={tFor(locale, "dashboard.unassigned")}
							address={null}
							rollup={unassigned}
							locale={locale}
							ghost
						/>
					</li>
				)}
			</ul>
		</div>
	);
}

function SiteCard({
	href, name, address, rollup, locale, ghost = false,
}: {
	href: string;
	name: string;
	address: string | null;
	rollup: { total: number; bad: number; warn: number };
	locale: Locale;
	ghost?: boolean;
}) {
	const overall: "ok" | "warn" | "bad" =
		rollup.bad > 0 ? "bad" : rollup.warn > 0 ? "warn" : "ok";
	const accentBar =
		overall === "bad" ? "bg-bad" : overall === "warn" ? "bg-warn" : "bg-ok";

	return (
		<Link
			href={href}
			className={`card-lift block overflow-hidden relative ${ghost ? "opacity-90" : ""}`}
		>
			{/* Left status stripe */}
			<span className={`absolute left-0 top-0 bottom-0 w-1 ${accentBar}`} aria-hidden />

			<div className="p-5 pl-6">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<h2 className="text-lg font-semibold truncate">{name}</h2>
						{address && <p className="text-xs text-inkDim mt-0.5 truncate">{address}</p>}
					</div>
					<ChevronRight />
				</div>

				{/* Status dots — one per sauna */}
				{rollup.total > 0 && (
					<div className="mt-4 flex items-center gap-1.5 flex-wrap">
						{Array.from({ length: rollup.bad }).map((_, i) => <span key={`b${i}`} className="dot-bad" />)}
						{Array.from({ length: rollup.warn }).map((_, i) => <span key={`w${i}`} className="dot-warn" />)}
						{Array.from({ length: rollup.total - rollup.bad - rollup.warn }).map((_, i) => <span key={`o${i}`} className="dot-ok" />)}
					</div>
				)}

				<div className="mt-4 flex items-center justify-between text-xs">
					<span className="text-inkDim tabular-nums">
						{plural(locale, rollup.total, "dashboard.saunasCount.one", "dashboard.saunasCount.other")}
					</span>
					<span className={
						overall === "bad" ? "text-bad"
						: overall === "warn" ? "text-warn"
						: "text-ok"
					}>
						{overall === "bad"
							? plural(locale, rollup.bad, "dashboard.alertsCount.one", "dashboard.alertsCount.other")
							: overall === "warn"
							? plural(locale, rollup.warn, "dashboard.warningsCount.one", "dashboard.warningsCount.other")
							: tFor(locale, "dashboard.allOk")}
					</span>
				</div>
			</div>
		</Link>
	);
}

function ChevronRight() {
	return (
		<svg viewBox="0 0 24 24" className="h-5 w-5 text-inkMute shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
			<path d="M9 6l6 6-6 6" />
		</svg>
	);
}
