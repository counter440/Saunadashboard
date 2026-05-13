import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { pool, q1 } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";

const TIMEZONES = ["Europe/Oslo", "Europe/Stockholm", "Europe/Helsinki", "Europe/Copenhagen", "Europe/London", "UTC"];

export default async function NewSitePage({ params }: { params: Promise<{ id: string }> }) {
	await requireSuperAdmin();
	const { t } = await getT();
	const { id } = await params;
	const customer = await q1<{ id: string; name: string }>(
		`SELECT id, name FROM customers WHERE id = $1`,
		[id],
	);
	if (!customer) notFound();

	async function create(form: FormData) {
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
		if (!parsed.success) redirect(`/admin/customers/${id}/sites/new`);
		await pool.query(
			`INSERT INTO sites (customer_id, name, address, timezone) VALUES ($1, $2, $3, $4)`,
			[id, parsed.data.name, parsed.data.address ?? null, parsed.data.timezone],
		);
		redirect(`/admin/customers/${id}?siteCreated=1`);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-xl">
			<div className="mb-3">
				<Link href={`/admin/customers/${id}`} className="text-sm text-inkDim hover:text-accent">← {customer.name}</Link>
			</div>
			<h1 className="text-xl md:text-2xl font-semibold mb-4">{t("admin.newSite.title")}</h1>
			<form action={create} className="space-y-4 card p-4">
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.newSite.name")}</span>
					<input name="name" required className="input mt-1" placeholder="Hemsedal" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.newSite.address")}</span>
					<input name="address" className="input mt-1" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.newSite.timezone")}</span>
					<select name="timezone" defaultValue="Europe/Oslo" className="input">
						{TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
					</select>
				</label>
				<div className="flex justify-end gap-2">
					<Link href={`/admin/customers/${id}`} className="btn-ghost">{t("common.cancel")}</Link>
					<button type="submit" className="btn-primary">{t("admin.newSite.submit")}</button>
				</div>
			</form>
		</div>
	);
}
