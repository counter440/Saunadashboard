import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pool, q, q1 } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { plural, type Locale } from "@/lib/i18n";

interface Customer { id: string; name: string; billing_email: string; status: "active" | "suspended"; notes: string | null; created_at: Date; }
interface Site { id: string; name: string; address: string | null; timezone: string; device_count: number; }
interface Device { id: string; device_id: string; name: string; site_id: string | null; site_name: string | null; last_seen: Date | null; }
interface User { id: string; email: string; role: string; must_change_password: boolean; created_at: Date; }

export default async function CustomerDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ created?: string; saved?: string; siteCreated?: string; siteSaved?: string; siteDeleted?: string }>;
}) {
	await requireSuperAdmin();
	const { t, locale } = await getT();
	const { id } = await params;
	const sp = await searchParams;
	const customer = await q1<Customer>(
		`SELECT id, name, billing_email, status, notes, created_at FROM customers WHERE id = $1`,
		[id],
	);
	if (!customer) notFound();
	const sites = await q<Site>(
		`SELECT s.id, s.name, s.address, s.timezone,
		        (SELECT count(*) FROM devices d WHERE d.site_id = s.id) AS device_count
		   FROM sites s
		  WHERE s.customer_id = $1
		  ORDER BY s.name`,
		[id],
	);
	const devices = await q<Device>(
		`SELECT d.id, d.device_id, d.name, d.site_id, s.name AS site_name, d.last_seen
		   FROM devices d
		   LEFT JOIN sites s ON s.id = d.site_id
		  WHERE d.customer_id = $1
		  ORDER BY d.name`,
		[id],
	);
	const users = await q<User>(
		`SELECT id, email, role, must_change_password, created_at
		   FROM users WHERE customer_id = $1
		   ORDER BY role, email`,
		[id],
	);

	async function toggleStatus() {
		"use server";
		await requireSuperAdmin();
		await pool.query(
			`UPDATE customers SET status = CASE WHEN status = 'active' THEN 'suspended' ELSE 'active' END WHERE id = $1`,
			[id],
		);
		redirect(`/admin/customers/${id}`);
	}
	async function saveNotes(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const notes = String(form.get("notes") ?? "").slice(0, 2000) || null;
		await pool.query(`UPDATE customers SET notes = $1 WHERE id = $2`, [notes, id]);
		redirect(`/admin/customers/${id}?saved=1`);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-5xl space-y-5">
			<div>
				<Link href="/admin/customers" className="text-sm text-inkDim hover:text-accent">{t("admin.customer.back")}</Link>
			</div>

			{sp.created && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.customer.created")}</div>
			)}
			{sp.saved && <div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("common.saved")}</div>}
			{sp.siteCreated && <div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.customer.siteCreated")}</div>}
			{sp.siteSaved && <div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.editSite.updated")}</div>}
			{sp.siteDeleted && <div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.editSite.deleted")}</div>}

			<header className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<h1 className="text-xl md:text-2xl font-semibold">{customer.name}</h1>
					<p className="text-sm text-inkDim">{customer.billing_email}</p>
				</div>
				<form action={toggleStatus}>
					<button className={customer.status === "active" ? "btn-ghost text-sm" : "btn-primary text-sm"} type="submit">
						{customer.status === "active" ? t("admin.customer.suspend") : t("admin.customer.reactivate")}
					</button>
				</form>
			</header>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("admin.customer.sites")} ({sites.length})</h2>
				{sites.length === 0 ? (
					<p className="text-sm text-inkDim mb-2">{t("admin.customer.noSites")}</p>
				) : (
					<ul className="divide-y divide-border mb-3">
						{sites.map((s) => (
							<li key={s.id} className="py-2 flex items-center justify-between gap-3">
								<div className="min-w-0">
									<div className="font-medium truncate">{s.name}</div>
									<div className="text-xs text-inkDim truncate">{s.address ?? "—"} · {s.timezone}</div>
								</div>
								<div className="flex items-center gap-3 shrink-0">
									<span className="text-xs text-inkDim tabular-nums">
										{plural(locale, s.device_count, "admin.customer.deviceCount.one", "admin.customer.deviceCount.other")}
									</span>
									<Link
										href={`/admin/customers/${id}/sites/${s.id}/edit`}
										className="btn-ghost text-xs inline-flex items-center gap-1.5"
									>
										<svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
											<path d="M12 20h9" />
											<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
										</svg>
										{t("admin.editSite.edit")}
									</Link>
								</div>
							</li>
						))}
					</ul>
				)}
				<Link href={`/admin/customers/${id}/sites/new`} className="btn-ghost text-sm">{t("admin.customer.addSite")}</Link>
			</section>

			<section className="card p-4">
				<div className="flex items-center justify-between mb-2">
					<h2 className="eyebrow">{t("admin.customer.devices")} ({devices.length})</h2>
					<Link href={`/admin/devices?customer=${id}`} className="text-xs text-accent">{t("admin.customer.manageDevices")}</Link>
				</div>
				{devices.length === 0 ? (
					<p className="text-sm text-inkDim">{t("admin.customer.noDevices")}</p>
				) : (
					<ul className="divide-y divide-border">
						{devices.map((d) => (
							<li key={d.id} className="py-2 flex items-center justify-between gap-2">
								<div className="min-w-0">
									<Link href={`/admin/devices/${d.device_id}`} className="font-medium truncate hover:text-accent">{d.name}</Link>
									<div className="text-xs text-inkDim">
										<span className="font-mono">{d.device_id}</span>
										{d.site_name && <> · {d.site_name}</>}
									</div>
								</div>
								<div className="text-xs text-inkDim shrink-0">
									{d.last_seen ? `${t("status.lastSeen")} ${new Date(d.last_seen).toLocaleString(locale === "nb" ? "nb-NO" : "en-US")}` : t("common.never")}
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="card p-4">
				<div className="flex items-center justify-between mb-2">
					<h2 className="eyebrow">{t("admin.customer.users")} ({users.length})</h2>
					<Link href={`/admin/customers/${id}/users`} className="text-xs text-accent">{t("admin.customer.manageUsers")}</Link>
				</div>
				<ul className="divide-y divide-border">
					{users.map((u) => (
						<li key={u.id} className="py-2 flex items-center justify-between gap-2">
							<div>
								<div className="font-medium">{u.email}</div>
								<div className="text-xs text-inkDim">
									{u.role === "customer_owner" ? t("admin.customer.userOwner") : t("admin.customer.userMember")}
									{u.must_change_password && ` · ${t("admin.customer.passwordPending")}`}
								</div>
							</div>
							<div className="text-xs text-inkDim">{new Date(u.created_at).toLocaleDateString(locale === "nb" ? "nb-NO" : "en-US")}</div>
						</li>
					))}
				</ul>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("admin.customer.notes")}</h2>
				<form action={saveNotes} className="space-y-2">
					<textarea
						name="notes"
						rows={4}
						className="input py-2"
						defaultValue={customer.notes ?? ""}
						placeholder={t("admin.customer.notesPlaceholder")}
					/>
					<div className="flex justify-end">
						<button className="btn-primary text-sm" type="submit">{t("admin.customer.saveNotes")}</button>
					</div>
				</form>
			</section>
		</div>
	);
}
