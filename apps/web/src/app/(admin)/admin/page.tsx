import Link from "next/link";
import { q1 } from "@/lib/db";
import { signOut } from "@/lib/auth";
import { getT } from "@/lib/i18n.server";

interface Summary {
	customer_count: number;
	site_count: number;
	device_count: number;
	device_assigned: number;
	device_unassigned: number;
	online: number;
	stale: number;
}

export default async function AdminOverviewPage() {
	const { t } = await getT();
	const s = await q1<Summary>(
		`SELECT
		   (SELECT count(*) FROM customers)                                                     AS customer_count,
		   (SELECT count(*) FROM sites)                                                         AS site_count,
		   (SELECT count(*) FROM devices)                                                       AS device_count,
		   (SELECT count(*) FROM devices WHERE customer_id IS NOT NULL)                         AS device_assigned,
		   (SELECT count(*) FROM devices WHERE customer_id IS NULL)                             AS device_unassigned,
		   (SELECT count(*) FROM devices WHERE last_seen > now() - INTERVAL '90 minutes')       AS online,
		   (SELECT count(*) FROM devices WHERE last_seen IS NULL OR last_seen < now() - INTERVAL '90 minutes') AS stale`,
	);

	async function doSignOut() {
		"use server";
		await signOut({ redirectTo: "/login" });
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-4xl">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-xl md:text-2xl font-semibold">{t("admin.title")}</h1>
				<form action={doSignOut}>
					<button className="btn-ghost text-sm" type="submit">{t("common.signOut")}</button>
				</form>
			</div>

			<div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
				<Stat label={t("admin.stat.customers")} value={s?.customer_count ?? 0} href="/admin/customers" />
				<Stat label={t("admin.stat.sites")} value={s?.site_count ?? 0} />
				<Stat label={t("admin.stat.devices")} value={s?.device_count ?? 0} href="/admin/devices" />
				<Stat label={t("admin.stat.unassigned")} value={s?.device_unassigned ?? 0} href="/admin/devices?filter=unassigned" />
				<Stat label={t("admin.stat.online")} value={s?.online ?? 0} ok />
				<Stat label={t("admin.stat.stale")} value={s?.stale ?? 0} bad />
			</div>

			<div className="card p-4">
				<h2 className="eyebrow mb-2">{t("admin.quickActions")}</h2>
				<div className="flex flex-wrap gap-2">
					<Link href="/admin/customers/new" className="btn-primary text-sm">{t("admin.action.newCustomer")}</Link>
					<Link href="/admin/devices/new" className="btn-ghost text-sm">{t("admin.action.provisionDevice")}</Link>
				</div>
			</div>
		</div>
	);
}

function Stat({
	label, value, href, ok = false, bad = false,
}: { label: string; value: number; href?: string; ok?: boolean; bad?: boolean }) {
	const content = (
		<div className="card p-3">
			<div className="text-xs text-inkDim">{label}</div>
			<div className={`text-2xl font-semibold tabular-nums mt-1 ${ok ? "text-ok" : bad ? "text-bad" : ""}`}>{value}</div>
		</div>
	);
	return href ? <Link href={href} className="hover:opacity-90">{content}</Link> : content;
}
