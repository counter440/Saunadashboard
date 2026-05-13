import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, q, q1 } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { sendEmail } from "@/lib/mail";
import { generateTempPassword } from "@/lib/random";
import { getT } from "@/lib/i18n.server";
import { tFor, type Locale } from "@/lib/i18n";

interface Customer { id: string; name: string; }
interface User {
	id: string;
	email: string;
	role: "customer_owner" | "customer_member";
	must_change_password: boolean;
	created_at: Date;
}

export default async function CustomerUsersPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ created?: string; reset?: string; temp?: string; error?: string; deleted?: string; promoted?: string }>;
}) {
	await requireSuperAdmin();
	const { t, locale } = await getT();
	const { id } = await params;
	const sp = await searchParams;

	const customer = await q1<Customer>(`SELECT id, name FROM customers WHERE id = $1`, [id]);
	if (!customer) notFound();

	const users = await q<User>(
		`SELECT id, email, role, must_change_password, created_at
		   FROM users WHERE customer_id = $1
		   ORDER BY role, email`,
		[id],
	);

	async function add(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const schema = z.object({
			email: z.string().email(),
			role: z.enum(["customer_owner", "customer_member"]),
		});
		const parsed = schema.safeParse({
			email: form.get("email"),
			role: form.get("role"),
		});
		if (!parsed.success) redirect(`/admin/customers/${id}/users?error=invalid`);
		const email = parsed.data.email.toLowerCase();

		const existing = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
		if ((existing.rowCount ?? 0) > 0) redirect(`/admin/customers/${id}/users?error=email-exists`);

		const tempPassword = generateTempPassword();
		const hash = await bcrypt.hash(tempPassword, 12);
		await pool.query(
			`INSERT INTO users (customer_id, email, password_hash, role, must_change_password)
			 VALUES ($1, $2, $3, $4, true)`,
			[id, email, hash, parsed.data.role],
		);
		await sendEmail({
			to: email,
			subject: "Velkommen til Ember",
			text: `Din Ember-konto er opprettet.\n\nLogg inn: ${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login\nE-post: ${email}\nMidlertidig passord: ${tempPassword}\n\nDu blir bedt om å sette et nytt passord ved første pålogging.\n`,
		});
		redirect(`/admin/customers/${id}/users?created=${encodeURIComponent(email)}&temp=${encodeURIComponent(tempPassword)}`);
	}

	async function resetPassword(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const userId = String(form.get("user_id") ?? "");
		if (!userId) redirect(`/admin/customers/${id}/users?error=invalid`);
		const target = await pool.query<{ email: string }>(
			`SELECT email FROM users WHERE id = $1 AND customer_id = $2`,
			[userId, id],
		);
		const row = target.rows[0];
		if (!row) redirect(`/admin/customers/${id}/users?error=not-found`);

		const tempPassword = generateTempPassword();
		const hash = await bcrypt.hash(tempPassword, 12);
		await pool.query(
			`UPDATE users SET password_hash = $1, must_change_password = true WHERE id = $2`,
			[hash, userId],
		);
		await sendEmail({
			to: row!.email,
			subject: "Ember-passordet ditt er tilbakestilt",
			text: `En administrator har tilbakestilt Ember-passordet ditt.\n\nLogg inn: ${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login\nE-post: ${row!.email}\nNytt midlertidig passord: ${tempPassword}\n\nDu blir bedt om å sette et nytt passord ved neste pålogging.\n`,
		});
		redirect(`/admin/customers/${id}/users?reset=${encodeURIComponent(row!.email)}&temp=${encodeURIComponent(tempPassword)}`);
	}

	async function promote(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const userId = String(form.get("user_id") ?? "");
		const next = String(form.get("role") ?? "");
		if (!userId || (next !== "customer_owner" && next !== "customer_member"))
			redirect(`/admin/customers/${id}/users?error=invalid`);

		if (next === "customer_member") {
			const owners = await pool.query<{ c: number }>(
				`SELECT count(*)::int AS c FROM users WHERE customer_id = $1 AND role = 'customer_owner'`,
				[id],
			);
			if ((owners.rows[0]?.c ?? 0) <= 1) {
				redirect(`/admin/customers/${id}/users?error=last-owner`);
			}
		}
		await pool.query(
			`UPDATE users SET role = $1 WHERE id = $2 AND customer_id = $3`,
			[next, userId, id],
		);
		redirect(`/admin/customers/${id}/users?promoted=1`);
	}

	async function remove(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const userId = String(form.get("user_id") ?? "");
		if (!userId) redirect(`/admin/customers/${id}/users?error=invalid`);

		const target = await pool.query<{ role: string }>(
			`SELECT role FROM users WHERE id = $1 AND customer_id = $2`,
			[userId, id],
		);
		const row = target.rows[0];
		if (!row) redirect(`/admin/customers/${id}/users?error=not-found`);

		if (row!.role === "customer_owner") {
			const owners = await pool.query<{ c: number }>(
				`SELECT count(*)::int AS c FROM users WHERE customer_id = $1 AND role = 'customer_owner'`,
				[id],
			);
			if ((owners.rows[0]?.c ?? 0) <= 1) {
				redirect(`/admin/customers/${id}/users?error=last-owner`);
			}
		}
		await pool.query(`DELETE FROM users WHERE id = $1 AND customer_id = $2`, [userId, id]);
		redirect(`/admin/customers/${id}/users?deleted=1`);
	}

	const errMsg =
		sp.error === "email-exists" ? t("admin.users.error.emailExists")
		: sp.error === "last-owner" ? t("admin.users.error.lastOwner")
		: sp.error === "not-found" ? t("admin.users.error.notFound")
		: sp.error === "invalid" ? t("common.invalid")
		: null;

	return (
		<div className="px-4 py-5 md:py-6 max-w-4xl space-y-5">
			<div>
				<Link href={`/admin/customers/${id}`} className="text-sm text-inkDim hover:text-accent">← {customer.name}</Link>
			</div>
			<header>
				<h1 className="text-xl md:text-2xl font-semibold">{t("admin.users.title")}</h1>
				<p className="text-sm text-inkDim mt-1">{t("admin.users.subtitle", { customer: customer.name })}</p>
			</header>

			{errMsg && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{errMsg}</div>}
			{sp.deleted   && <Banner>{t("admin.users.removed")}</Banner>}
			{sp.promoted  && <Banner>{t("admin.users.promoted")}</Banner>}

			{(sp.created || sp.reset) && sp.temp && (
				<TempPasswordBanner
					email={sp.created ?? sp.reset!}
					temp={sp.temp}
					action={sp.created ? "created" : "reset"}
					locale={locale}
				/>
			)}

			<section className="card overflow-hidden">
				<div className="px-4 py-3 border-b border-border eyebrow">{t("admin.users.members", { n: users.length })}</div>
				{users.length === 0 ? (
					<div className="p-6 text-center text-inkDim text-sm">{t("admin.users.empty")}</div>
				) : (
					<ul className="divide-y divide-border">
						{users.map((u) => (
							<li key={u.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
								<div className="min-w-0 flex-1">
									<div className="font-medium truncate">{u.email}</div>
									<div className="text-2xs text-inkDim mt-0.5 flex items-center gap-2">
										<span className={u.role === "customer_owner" ? "pill-warn" : "pill-mute"}>
											{u.role === "customer_owner" ? t("admin.users.roleOwner") : t("admin.users.roleMember")}
										</span>
										{u.must_change_password && <span className="text-warn">{t("admin.customer.passwordPending")}</span>}
										<span>· {t("admin.users.joined")} {new Date(u.created_at).toLocaleDateString(locale === "nb" ? "nb-NO" : "en-US")}</span>
									</div>
								</div>
								<form action={resetPassword}>
									<input type="hidden" name="user_id" value={u.id} />
									<button className="btn-ghost text-xs" type="submit">{t("admin.users.resetPassword")}</button>
								</form>
								<form action={promote}>
									<input type="hidden" name="user_id" value={u.id} />
									<input type="hidden" name="role" value={u.role === "customer_owner" ? "customer_member" : "customer_owner"} />
									<button className="btn-ghost text-xs" type="submit">
										{u.role === "customer_owner" ? t("admin.users.demoteToMember") : t("admin.users.promoteToOwner")}
									</button>
								</form>
								<form action={remove}>
									<input type="hidden" name="user_id" value={u.id} />
									<button className="btn-ghost text-xs text-bad" type="submit">{t("admin.users.delete")}</button>
								</form>
							</li>
						))}
					</ul>
				)}
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-3">{t("admin.users.add")}</h2>
				<form action={add} className="grid gap-3 md:grid-cols-[1fr_180px_auto] md:items-end">
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.users.email")}</span>
						<input name="email" type="email" required className="input mt-1" placeholder="employee@example.com" />
					</label>
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.users.role")}</span>
						<select name="role" defaultValue="customer_member" className="input mt-1">
							<option value="customer_member">{t("admin.users.roleMember")}</option>
							<option value="customer_owner">{t("admin.users.roleOwner")}</option>
						</select>
					</label>
					<button className="btn-primary" type="submit">{t("admin.users.create")}</button>
				</form>
				<p className="text-2xs text-inkMute mt-3">{t("admin.users.note")}</p>
			</section>
		</div>
	);
}

function Banner({ children }: { children: React.ReactNode }) {
	return <div className="rounded-md bg-ok/10 text-ok border border-ok/30 px-3 py-2 text-sm">{children}</div>;
}

function TempPasswordBanner({
	email, temp, action, locale,
}: { email: string; temp: string; action: "created" | "reset"; locale: Locale }) {
	const dryRun = process.env.NOTIFIER_DRY_RUN !== "false";
	return (
		<div className="card p-4 border-warn/40">
			<div className="flex items-baseline justify-between gap-3">
				<div>
					<div className="eyebrow text-warn">{tFor(locale, "admin.users.tempBanner.titleCreated")}</div>
					<p className="text-sm mt-1">
						{action === "created" ? tFor(locale, "admin.users.tempBanner.created") : tFor(locale, "admin.users.tempBanner.reset")}{" "}
						<span className="font-mono">{email}</span>
					</p>
				</div>
				<span className="text-2xs text-inkMute">{tFor(locale, "admin.users.tempBanner.notShownAgain")}</span>
			</div>
			<div className="mt-3 flex items-center gap-2">
				<code className="flex-1 font-mono text-sm px-3 py-2 rounded-md bg-surface2 border border-warn/30 break-all">
					{temp}
				</code>
			</div>
			<p className="text-2xs text-inkMute mt-2">
				{dryRun ? tFor(locale, "admin.users.tempBanner.alsoEmailedDryRun") : tFor(locale, "admin.users.tempBanner.alsoEmailed")}
			</p>
		</div>
	);
}
