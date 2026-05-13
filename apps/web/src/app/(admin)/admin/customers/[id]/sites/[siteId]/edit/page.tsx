import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { pool, q1 } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";

const TIMEZONES = ["Europe/Oslo", "Europe/Stockholm", "Europe/Helsinki", "Europe/Copenhagen", "Europe/London", "UTC"];

interface Site { id: string; name: string; address: string | null; timezone: string; }
interface Customer { id: string; name: string; }

export default async function EditSitePage({
	params,
}: {
	params: Promise<{ id: string; siteId: string }>;
}) {
	await requireSuperAdmin();
	const { t } = await getT();
	const { id, siteId } = await params;

	const customer = await q1<Customer>(`SELECT id, name FROM customers WHERE id = $1`, [id]);
	if (!customer) notFound();
	const site = await q1<Site>(
		`SELECT id, name, address, timezone FROM sites WHERE id = $1 AND customer_id = $2`,
		[siteId, id],
	);
	if (!site) notFound();

	async function save(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const schema = z.object({
			name: z.string().min(1).max(100),
			address: z.string().max(200).optional(),
			timezone: z.string().min(1).max(100),
		});
		const parsed = schema.safeParse({
			name: form.get("name"),
			address: form.get("address") || undefined,
			timezone: form.get("timezone"),
		});
		if (!parsed.success) redirect(`/admin/customers/${id}/sites/${siteId}/edit`);
		await pool.query(
			`UPDATE sites SET name = $1, address = $2, timezone = $3 WHERE id = $4 AND customer_id = $5`,
			[parsed.data.name, parsed.data.address ?? null, parsed.data.timezone, siteId, id],
		);
		redirect(`/admin/customers/${id}?siteSaved=1`);
	}

	async function deleteSite() {
		"use server";
		await requireSuperAdmin();
		// Devices in this site have site_id ON DELETE SET NULL, so they survive.
		await pool.query(`DELETE FROM sites WHERE id = $1 AND customer_id = $2`, [siteId, id]);
		redirect(`/admin/customers/${id}?siteDeleted=1`);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-xl space-y-5">
			<div>
				<Link href={`/admin/customers/${id}`} className="text-sm text-inkDim hover:text-accent">← {customer.name}</Link>
			</div>
			<h1 className="text-xl md:text-2xl font-semibold">{t("admin.editSite.title")}</h1>

			<form action={save} className="card p-4 space-y-4">
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.newSite.name")}</span>
					<input name="name" defaultValue={site.name} required maxLength={100} className="input mt-1" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.newSite.address")}</span>
					<input name="address" defaultValue={site.address ?? ""} maxLength={200} className="input mt-1" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.newSite.timezone")}</span>
					<select name="timezone" defaultValue={site.timezone} className="input">
						{TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
					</select>
					<p className="text-2xs text-inkMute mt-1">{t("admin.editSite.tzNote")}</p>
				</label>
				<div className="flex justify-end gap-2">
					<Link href={`/admin/customers/${id}`} className="btn-ghost">{t("common.cancel")}</Link>
					<button type="submit" className="btn-primary">{t("admin.editSite.save")}</button>
				</div>
			</form>

			<form action={deleteSite} className="card p-4 border-bad/30">
				<h2 className="eyebrow text-bad mb-2">{t("admin.editSite.deleteSection")}</h2>
				<p className="text-xs text-inkDim mb-3">{t("admin.editSite.deleteNote")}</p>
				<button type="submit" className="btn-ghost text-sm text-bad">{t("admin.editSite.delete")}</button>
			</form>
		</div>
	);
}
