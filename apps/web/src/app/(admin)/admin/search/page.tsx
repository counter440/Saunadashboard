import Link from "next/link";
import { q } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { relativeFromNowI18n } from "@/lib/i18n";

interface CustomerHit { id: string; name: string; billing_email: string; status: string; }
interface DeviceHit {
	id: string;
	device_id: string;
	name: string;
	customer_id: string | null;
	customer_name: string | null;
	site_name: string | null;
	last_seen: Date | null;
}

export default async function AdminSearchPage({
	searchParams,
}: { searchParams: Promise<{ q?: string }> }) {
	await requireSuperAdmin();
	const { t, locale } = await getT();
	const sp = await searchParams;
	const q_raw = (sp.q ?? "").trim();

	let customers: CustomerHit[] = [];
	let devices: DeviceHit[] = [];
	const tooShort = q_raw.length > 0 && q_raw.length < 2;
	if (q_raw.length >= 2) {
		const pat = `%${q_raw}%`;
		customers = await q<CustomerHit>(
			`SELECT id, name, billing_email, status
			   FROM customers
			  WHERE name ILIKE $1 OR billing_email ILIKE $1
			  ORDER BY name
			  LIMIT 20`,
			[pat],
		);
		devices = await q<DeviceHit>(
			`SELECT d.id, d.device_id, d.name, d.customer_id, c.name AS customer_name,
			        s.name AS site_name, d.last_seen
			   FROM devices d
			   LEFT JOIN customers c ON c.id = d.customer_id
			   LEFT JOIN sites s     ON s.id = d.site_id
			  WHERE d.device_id ILIKE $1 OR d.name ILIKE $1
			  ORDER BY d.name
			  LIMIT 30`,
			[pat],
		);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-4xl">
			<h1 className="text-xl md:text-2xl font-semibold mb-4">{t("search.title")}</h1>

			<form className="card p-3 mb-5">
				<div className="flex items-center gap-2">
					<svg viewBox="0 0 24 24" className="h-4 w-4 text-inkDim shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
						<circle cx="11" cy="11" r="7" />
						<path d="m21 21-4.3-4.3" />
					</svg>
					<input
						name="q"
						defaultValue={q_raw}
						placeholder={t("search.placeholder")}
						className="input !border-0 !shadow-none !min-h-0 !py-1 !px-0 flex-1"
						autoFocus
					/>
				</div>
			</form>

			{tooShort ? (
				<div className="card p-6 text-center text-inkDim text-sm">{t("search.tooShort")}</div>
			) : q_raw.length === 0 ? null : customers.length === 0 && devices.length === 0 ? (
				<div className="card p-6 text-center text-inkDim text-sm">{t("search.empty")}</div>
			) : (
				<div className="space-y-5">
					{customers.length > 0 && (
						<section className="card p-4">
							<h2 className="eyebrow mb-2">{t("search.customers")} ({customers.length})</h2>
							<ul className="divide-y divide-border">
								{customers.map((c) => (
									<li key={c.id} className="py-2 flex items-center justify-between">
										<Link href={`/admin/customers/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link>
										<span className="text-xs text-inkDim">{c.billing_email}</span>
									</li>
								))}
							</ul>
						</section>
					)}
					{devices.length > 0 && (
						<section className="card p-4">
							<h2 className="eyebrow mb-2">{t("search.devices")} ({devices.length})</h2>
							<ul className="divide-y divide-border">
								{devices.map((d) => (
									<li key={d.id} className="py-2 flex items-center justify-between gap-2">
										<div className="min-w-0">
											<Link href={`/admin/devices/${d.device_id}`} className="font-medium hover:text-accent">{d.name}</Link>
											<div className="text-xs text-inkDim">
												<span className="font-mono">{d.device_id}</span>
												{d.customer_name && <> · {d.customer_name}</>}
												{d.site_name && <> · {d.site_name}</>}
											</div>
										</div>
										<span className="text-xs text-inkDim shrink-0">{relativeFromNowI18n(locale, d.last_seen)}</span>
									</li>
								))}
							</ul>
						</section>
					)}
				</div>
			)}
		</div>
	);
}
