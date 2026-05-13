import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool, q } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { sendEmail } from "@/lib/mail";
import { generateTempPassword } from "@/lib/random";
import { getT } from "@/lib/i18n.server";

interface Member { id: string; email: string; role: "customer_owner" | "customer_member"; created_at: Date; }

export default async function TeamPage({
	searchParams,
}: { searchParams: Promise<{ invited?: string; error?: string; removed?: string }> }) {
	const { customerId, session } = await requireCustomer();
	const { t } = await getT();
	const sp = await searchParams;
	const isOwner = session.user.role === "customer_owner";

	const members = await q<Member>(
		`SELECT id, email, role, created_at FROM users WHERE customer_id = $1 ORDER BY role, email`,
		[customerId],
	);

	async function invite(form: FormData) {
		"use server";
		const { customerId, session } = await requireCustomer();
		if (session.user.role !== "customer_owner") redirect("/team?error=forbidden");
		const schema = z.object({ email: z.string().email() });
		const parsed = schema.safeParse({ email: form.get("email") });
		if (!parsed.success) redirect("/team?error=invalid-email");
		const email = parsed.data.email.toLowerCase();

		const existing = await pool.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [email]);
		if ((existing.rowCount ?? 0) > 0) redirect("/team?error=exists");

		const tempPassword = generateTempPassword();
		const hash = await bcrypt.hash(tempPassword, 12);
		await pool.query(
			`INSERT INTO users (customer_id, email, password_hash, role, must_change_password)
			 VALUES ($1, $2, $3, 'customer_member', true)`,
			[customerId, email, hash],
		);
		await sendEmail({
			to: email,
			subject: "Invitasjon til Ember",
			text: `Du er lagt til på ${session.user.email}s sauna-overvåkningskonto.\n\nMidlertidig passord: ${tempPassword}\n\nLogg inn på ${process.env.NEXTAUTH_URL ?? "http://localhost:3000"}/login — du blir bedt om å sette et nytt passord.\n`,
		});
		redirect(`/team?invited=${encodeURIComponent(email)}`);
	}

	async function remove(form: FormData) {
		"use server";
		const { customerId, session } = await requireCustomer();
		if (session.user.role !== "customer_owner") redirect("/team?error=forbidden");
		const targetId = String(form.get("id") ?? "");
		if (!targetId) redirect("/team?error=invalid");
		if (targetId === session.user.id) redirect("/team?error=self");
		await pool.query(
			`DELETE FROM users WHERE id = $1 AND customer_id = $2 AND role <> 'customer_owner'`,
			[targetId, customerId],
		);
		redirect("/team?removed=1");
	}

	const errMsg =
		sp.error === "exists" ? t("team.error.exists")
		: sp.error === "invalid-email" ? t("team.error.invalidEmail")
		: sp.error === "forbidden" ? t("team.error.forbidden")
		: sp.error === "self" ? t("team.error.self")
		: sp.error ? t("common.somethingWrong")
		: null;

	return (
		<div className="px-4 py-5 md:py-6 max-w-2xl space-y-5">
			<h1 className="text-xl md:text-2xl font-semibold">{t("team.title")}</h1>
			<p className="text-sm text-inkDim">
				{isOwner ? t("team.subtitleOwner") : t("team.subtitleMember")}
			</p>

			{sp.invited && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">
					{t("team.invitedBanner", { email: sp.invited })}
				</div>
			)}
			{sp.removed && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("team.removedBanner")}</div>
			)}
			{errMsg && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{errMsg}</div>}

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("team.members")}</h2>
				<ul className="divide-y divide-border">
					{members.map((m) => (
						<li key={m.id} className="py-2 flex items-center justify-between gap-2">
							<div className="min-w-0">
								<div className="truncate">{m.email}</div>
								<div className="text-xs text-inkDim">{m.role === "customer_owner" ? t("account.role.owner") : t("account.role.member")}</div>
							</div>
							{isOwner && m.role !== "customer_owner" && m.id !== session.user.id && (
								<form action={remove}>
									<input type="hidden" name="id" value={m.id} />
									<button className="btn-ghost text-xs text-bad" type="submit">{t("common.remove")}</button>
								</form>
							)}
						</li>
					))}
				</ul>
			</section>

			{isOwner && (
				<section className="card p-4">
					<h2 className="eyebrow mb-2">{t("team.invite")}</h2>
					<form action={invite} className="space-y-3">
						<label className="block">
							<span className="text-sm text-inkDim">{t("common.email")}</span>
							<input name="email" type="email" required className="input mt-1" placeholder="employee@example.com" />
						</label>
						<button type="submit" className="btn-primary">{t("team.inviteSubmit")}</button>
					</form>
				</section>
			)}
		</div>
	);
}
