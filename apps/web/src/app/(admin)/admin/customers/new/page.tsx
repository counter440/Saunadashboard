import Link from "next/link";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { sendEmail } from "@/lib/mail";
import { generateTempPassword } from "@/lib/random";
import { getT } from "@/lib/i18n.server";

export default async function NewCustomerPage({
	searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
	await requireSuperAdmin();
	const { t } = await getT();
	const sp = await searchParams;

	async function create(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const schema = z.object({
			name: z.string().min(1).max(100),
			owner_email: z.string().email(),
			notes: z.string().max(2000).optional(),
		});
		const parsed = schema.safeParse({
			name: form.get("name"),
			owner_email: form.get("owner_email"),
			notes: form.get("notes") || undefined,
		});
		if (!parsed.success) redirect("/admin/customers/new?error=invalid");
		const ownerEmail = parsed.data.owner_email.toLowerCase();

		const existing = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [ownerEmail]);
		if ((existing.rowCount ?? 0) > 0) redirect("/admin/customers/new?error=email-exists");

		const tempPassword = generateTempPassword();
		const hash = await bcrypt.hash(tempPassword, 12);

		const conn = await pool.connect();
		let customerId: string;
		try {
			await conn.query("BEGIN");
			const c = await conn.query<{ id: string }>(
				`INSERT INTO customers (name, billing_email, notes) VALUES ($1, $2, $3) RETURNING id`,
				[parsed.data.name, ownerEmail, parsed.data.notes ?? null],
			);
			customerId = c.rows[0]!.id;
			await conn.query(
				`INSERT INTO users (customer_id, email, password_hash, role, must_change_password)
				 VALUES ($1, $2, $3, 'customer_owner', true)`,
				[customerId, ownerEmail, hash],
			);
			await conn.query("COMMIT");
		} catch (err) {
			await conn.query("ROLLBACK");
			throw err;
		} finally {
			conn.release();
		}

		await sendEmail({
			to: ownerEmail,
			subject: "Velkommen til Ember",
			text: `Din Ember-konto er opprettet.\n\nLogg inn: ${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login\nE-post: ${ownerEmail}\nMidlertidig passord: ${tempPassword}\n\nDu blir bedt om å sette et nytt passord ved første pålogging.\n`,
		});

		redirect(`/admin/customers/${customerId}/users?created=${encodeURIComponent(ownerEmail)}&temp=${encodeURIComponent(tempPassword)}`);
	}

	const errMsg =
		sp.error === "email-exists" ? t("admin.customersNew.error.exists")
		: sp.error === "invalid" ? t("admin.customersNew.error.invalid")
		: null;

	return (
		<div className="px-4 py-5 md:py-6 max-w-xl">
			<div className="mb-3">
				<Link href="/admin/customers" className="text-sm text-inkDim hover:text-accent">{t("admin.customer.back")}</Link>
			</div>
			<h1 className="text-xl md:text-2xl font-semibold mb-4">{t("admin.customersNew.title")}</h1>
			<form action={create} className="space-y-4 card p-4">
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.customersNew.companyName")}</span>
					<input name="name" required maxLength={100} className="input mt-1" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.customersNew.ownerEmail")}</span>
					<input name="owner_email" type="email" required className="input mt-1" placeholder="owner@example.com" />
					<span className="text-xs text-inkDim mt-1 block">{t("admin.customersNew.ownerEmailNote")}</span>
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.customersNew.notes")}</span>
					<textarea name="notes" rows={3} className="input py-2" />
				</label>
				{errMsg && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{errMsg}</div>}
				<div className="flex justify-end gap-2">
					<Link href="/admin/customers" className="btn-ghost">{t("common.cancel")}</Link>
					<button type="submit" className="btn-primary">{t("admin.customersNew.submit")}</button>
				</div>
			</form>
		</div>
	);
}
