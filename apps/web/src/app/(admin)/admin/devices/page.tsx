import Link from "next/link";
import { q } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { relativeFromNowI18n } from "@/lib/i18n";

interface Row {
	id: string;
	device_id: string;
	name: string;
	customer_id: string | null;
	customer_name: string | null;
	site_id: string | null;
	site_name: string | null;
	last_seen: Date | null;
	fw_version: string | null;
}

export default async function AdminDevicesPage({
	searchParams,
}: { searchParams: Promise<{ filter?: string; customer?: string }> }) {
	await requireSuperAdmin();
	const { t, locale } = await getT();
	const sp = await searchParams;
	const where: string[] = [];
	const params: unknown[] = [];
	if (sp.filter === "unassigned") where.push("d.customer_id IS NULL");
	if (sp.customer) {
		params.push(sp.customer);
		where.push(`d.customer_id = $${params.length}`);
	}
	const sql = `
		SELECT d.id, d.device_id, d.name, d.customer_id, c.name AS customer_name,
		       d.site_id, s.name AS site_name, d.last_seen, d.fw_version
		  FROM devices d
		  LEFT JOIN customers c ON c.id = d.customer_id
		  LEFT JOIN sites s     ON s.id = d.site_id
		 ${where.length ? "WHERE " + where.join(" AND ") : ""}
		 ORDER BY d.created_at DESC
	`;
	const rows = await q<Row>(sql, params);

	return (
		<div className="px-4 py-5 md:py-6 max-w-5xl">
			<div className="flex items-center justify-between mb-3">
				<h1 className="text-xl md:text-2xl font-semibold">{t("admin.devicesList.title")}</h1>
				<Link href="/admin/devices/new" className="btn-primary text-sm">{t("admin.devicesList.provision")}</Link>
			</div>
			<div className="flex gap-2 text-sm mb-4">
				<Link href="/admin/devices" className={`px-3 py-1 rounded-lg border ${!sp.filter ? "bg-accent/10 text-accent border-accent/30" : "border-border"}`}>{t("admin.devicesList.filter.all")}</Link>
				<Link href="/admin/devices?filter=unassigned" className={`px-3 py-1 rounded-lg border ${sp.filter === "unassigned" ? "bg-accent/10 text-accent border-accent/30" : "border-border"}`}>{t("admin.devicesList.filter.unassigned")}</Link>
			</div>

			{rows.length === 0 ? (
				<div className="card p-6 text-center text-inkDim">{t("admin.devicesList.empty")}</div>
			) : (
				<div className="card overflow-x-auto">
					<table className="min-w-full text-sm">
						<thead className="text-inkDim">
							<tr>
								<th className="text-left px-4 py-2 font-medium">{t("admin.devicesList.col.deviceId")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.devicesList.col.name")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.devicesList.col.customer")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.devicesList.col.site")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.devicesList.col.fw")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.devicesList.col.lastSeen")}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((d) => (
								<tr key={d.id} className="border-t border-border">
									<td className="px-4 py-2"><Link href={`/admin/devices/${d.device_id}`} className="font-mono text-xs hover:text-accent">{d.device_id}</Link></td>
									<td className="px-4 py-2">{d.name}</td>
									<td className="px-4 py-2">{d.customer_id ? <Link href={`/admin/customers/${d.customer_id}`} className="hover:text-accent">{d.customer_name}</Link> : <span className="text-inkDim italic">{t("admin.devicesList.unassignedItalic")}</span>}</td>
									<td className="px-4 py-2">{d.site_name ?? <span className="text-inkDim italic">—</span>}</td>
									<td className="px-4 py-2 text-inkDim text-xs">{d.fw_version ?? "—"}</td>
									<td className="px-4 py-2 text-inkDim text-xs">{relativeFromNowI18n(locale, d.last_seen)}</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
