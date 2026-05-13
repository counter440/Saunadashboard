import Link from "next/link";
import { q } from "@/lib/db";
import { getT } from "@/lib/i18n.server";

interface CustomerRow {
	id: string;
	name: string;
	billing_email: string;
	status: "active" | "suspended";
	site_count: number;
	device_count: number;
	user_count: number;
	created_at: Date;
}

export default async function AdminCustomersPage() {
	const { t } = await getT();
	const rows = await q<CustomerRow>(
		`SELECT c.id, c.name, c.billing_email, c.status, c.created_at,
		        (SELECT count(*) FROM sites    s WHERE s.customer_id = c.id) AS site_count,
		        (SELECT count(*) FROM devices  d WHERE d.customer_id = c.id) AS device_count,
		        (SELECT count(*) FROM users    u WHERE u.customer_id = c.id) AS user_count
		   FROM customers c
		   ORDER BY c.created_at DESC`,
	);

	return (
		<div className="px-4 py-5 md:py-6 max-w-5xl">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-xl md:text-2xl font-semibold">{t("admin.customers.title")}</h1>
				<Link href="/admin/customers/new" className="btn-primary text-sm">{t("admin.customers.new")}</Link>
			</div>
			{rows.length === 0 ? (
				<div className="card p-6 text-center text-inkDim">{t("admin.customers.empty")}</div>
			) : (
				<div className="card overflow-x-auto">
					<table className="min-w-full text-sm">
						<thead className="text-inkDim">
							<tr>
								<th className="text-left px-4 py-2 font-medium">{t("admin.customers.col.name")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.customers.col.email")}</th>
								<th className="text-right px-4 py-2 font-medium">{t("admin.customers.col.sites")}</th>
								<th className="text-right px-4 py-2 font-medium">{t("admin.customers.col.devices")}</th>
								<th className="text-right px-4 py-2 font-medium">{t("admin.customers.col.users")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.customers.col.status")}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((c) => (
								<tr key={c.id} className="border-t border-border hover:bg-black/[0.02]">
									<td className="px-4 py-2"><Link href={`/admin/customers/${c.id}`} className="font-medium hover:text-accent">{c.name}</Link></td>
									<td className="px-4 py-2 text-inkDim">{c.billing_email}</td>
									<td className="px-4 py-2 text-right tabular-nums">{c.site_count}</td>
									<td className="px-4 py-2 text-right tabular-nums">{c.device_count}</td>
									<td className="px-4 py-2 text-right tabular-nums">{c.user_count}</td>
									<td className="px-4 py-2">
										<span className={c.status === "active" ? "text-ok text-xs" : "text-bad text-xs"}>
											{c.status === "active" ? t("admin.customers.status.active") : t("admin.customers.status.suspended")}
										</span>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
