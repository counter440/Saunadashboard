import Link from "next/link";
import { q } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { tFor, type Locale, type TKey } from "@/lib/i18n";

interface AlertRow {
	id: string;
	device_id: string;
	device_name: string;
	kind: "low_temp" | "low_battery" | "offline";
	fired_at: Date;
	temperature: number | null;
	battery_voltage: number | null;
	channel: "push";
	destination: string;
	status: "sent" | "failed" | "dry_run";
}

const KIND_KEY: Record<AlertRow["kind"], TKey> = {
	low_temp: "alerts.kind.lowTemp",
	low_battery: "alerts.kind.lowBattery",
	offline: "alerts.kind.offline",
};

export default async function AlertsPage() {
	const { customerId } = await requireCustomer();
	const { t, locale } = await getT();
	const rows = await q<AlertRow>(
		`SELECT ne.id, ne.device_id, d.name AS device_name, ne.kind, ne.fired_at,
		        ne.temperature::float8 AS temperature,
		        ne.battery_voltage::float8 AS battery_voltage,
		        ne.channel, ne.destination, ne.status
		   FROM notification_events ne
		   JOIN devices d ON d.device_id = ne.device_id
		  WHERE d.customer_id = $1
		  ORDER BY ne.fired_at DESC
		  LIMIT 200`,
		[customerId],
	);

	return (
		<div className="px-4 py-5 md:py-6 max-w-4xl">
			<h1 className="text-xl md:text-2xl font-semibold mb-4">{t("alerts.title")}</h1>
			{rows.length === 0 ? (
				<div className="card p-6 text-center text-inkDim">{t("alerts.empty")}</div>
			) : (
				<ul className="space-y-2">
					{rows.map((r) => (
						<li key={r.id} className="card p-3 flex items-start gap-3">
							<KindBadge kind={r.kind} locale={locale} />
							<div className="flex-1 min-w-0">
								<div className="flex items-center justify-between gap-2">
									<Link href={`/devices/${r.device_id}`} className="font-medium truncate hover:text-accent">
										{r.device_name}
									</Link>
									<time className="text-xs text-inkDim shrink-0">
										{new Date(r.fired_at).toLocaleString(locale === "nb" ? "nb-NO" : "en-US")}
									</time>
								</div>
								<div className="text-sm text-inkDim mt-0.5">
									{r.kind === "low_temp" && r.temperature !== null && `${Number(r.temperature).toFixed(1)} °C · `}
									{r.kind === "low_battery" && r.battery_voltage !== null && `${Number(r.battery_voltage).toFixed(2)} V · `}
									{r.channel.toUpperCase()} → {r.destination}
								</div>
							</div>
							<StatusBadge status={r.status} locale={locale} />
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

function KindBadge({ kind, locale }: { kind: AlertRow["kind"]; locale: Locale }) {
	const cls = kind === "low_temp" ? "bg-bad/15 text-bad"
		: kind === "low_battery" ? "bg-warn/15 text-warn"
		: "bg-inkDim/15 text-inkDim";
	return <span className={`text-xs font-medium rounded px-2 py-1 shrink-0 ${cls}`}>{tFor(locale, KIND_KEY[kind])}</span>;
}

function StatusBadge({ status, locale }: { status: AlertRow["status"]; locale: Locale }) {
	if (status === "sent") return <span className="text-xs text-ok shrink-0">{tFor(locale, "alerts.status.sent")}</span>;
	if (status === "dry_run") return <span className="text-xs text-inkDim shrink-0">{tFor(locale, "alerts.status.dryRun")}</span>;
	return <span className="text-xs text-bad shrink-0">{tFor(locale, "alerts.status.failed")}</span>;
}
