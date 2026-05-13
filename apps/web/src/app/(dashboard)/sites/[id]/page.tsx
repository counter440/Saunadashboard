import Link from "next/link";
import { notFound } from "next/navigation";
import { q, q1 } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { DeviceCard, type DeviceCardData } from "@/components/device-card";
import { tFor } from "@/lib/i18n";

interface Site {
	id: string;
	name: string;
	address: string | null;
	timezone: string;
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
	const { customerId } = await requireCustomer();
	const { t, locale } = await getT();
	const { id } = await params;

	const isUnassigned = id === "unassigned";

	let site: Site | null = null;
	let devices: DeviceCardData[];

	if (isUnassigned) {
		devices = await q<DeviceCardData>(
			`SELECT id, device_id, name, image_path, last_seen,
			        last_temp::float8 AS last_temp,
			        last_battery_percent,
			        low_temp_threshold::float8 AS low_temp_threshold,
			        battery_warning_percent
			   FROM devices WHERE site_id IS NULL AND customer_id = $1
			   ORDER BY name`,
			[customerId],
		);
		if (devices.length === 0) notFound();
	} else {
		site = await q1<Site>(
			`SELECT id, name, address, timezone FROM sites WHERE id = $1 AND customer_id = $2`,
			[id, customerId],
		);
		if (!site) notFound();
		devices = await q<DeviceCardData>(
			`SELECT id, device_id, name, image_path, last_seen,
			        last_temp::float8 AS last_temp,
			        last_battery_percent,
			        low_temp_threshold::float8 AS low_temp_threshold,
			        battery_warning_percent
			   FROM devices WHERE site_id = $1 AND customer_id = $2
			   ORDER BY name`,
			[id, customerId],
		);
	}

	const heading = site?.name ?? tFor(locale, "dashboard.unassigned");

	return (
		<div className="px-4 py-5 md:py-6 max-w-5xl">
			<div className="mb-3">
				<Link href="/dashboard" className="text-sm text-inkDim hover:text-accent">{t("site.allSites")}</Link>
			</div>
			<h1 className="text-xl md:text-2xl font-semibold">{heading}</h1>
			{site?.address && <p className="text-inkDim mt-1">{site.address}</p>}
			{site && <p className="text-xs text-inkDim mt-1">{t("site.timezone")}: {site.timezone}</p>}

			<div className="mt-5">
				{devices.length === 0 ? (
					<div className="card p-6 text-center text-inkDim">{t("site.empty")}</div>
				) : (
					<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{devices.map((d) => (
							<li key={d.id}>
								<DeviceCard device={d} locale={locale} />
							</li>
						))}
					</ul>
				)}
			</div>
		</div>
	);
}
