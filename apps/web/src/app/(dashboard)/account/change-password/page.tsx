import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireSession } from "@/lib/session";
import { getT } from "@/lib/i18n.server";

export default async function ChangePasswordPage({
	searchParams,
}: { searchParams: Promise<{ error?: string; saved?: string }> }) {
	const session = await requireSession();
	const { t } = await getT();
	const sp = await searchParams;

	async function save(form: FormData) {
		"use server";
		const session = await requireSession();
		const schema = z.object({
			current: z.string().min(8),
			next: z.string().min(8).max(200),
			confirm: z.string().min(8).max(200),
		});
		const parsed = schema.safeParse({
			current: form.get("current"),
			next: form.get("next"),
			confirm: form.get("confirm"),
		});
		if (!parsed.success) redirect("/account/change-password?error=invalid");
		if (parsed.data.next !== parsed.data.confirm) redirect("/account/change-password?error=mismatch");

		const conn = await pool.connect();
		try {
			const r = await conn.query<{ password_hash: string }>(
				`SELECT password_hash FROM users WHERE id = $1`,
				[session.user.id],
			);
			const row = r.rows[0];
			if (!row) redirect("/login");
			const ok = await bcrypt.compare(parsed.data.current, row!.password_hash);
			if (!ok) redirect("/account/change-password?error=wrong-current");
			const hash = await bcrypt.hash(parsed.data.next, 12);
			await conn.query(
				`UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2`,
				[hash, session.user.id],
			);
		} finally {
			conn.release();
		}

		const { signOut } = await import("@/lib/auth");
		await signOut({ redirectTo: "/login?password-changed=1" });
	}

	const errMsg =
		sp.error === "mismatch" ? t("changepw.mismatch")
		: sp.error === "wrong-current" ? t("changepw.wrongCurrent")
		: sp.error ? t("common.invalid")
		: null;

	return (
		<div className="px-4 py-5 md:py-6 max-w-md">
			<h1 className="text-xl md:text-2xl font-semibold">
				{session.user.must_change_password ? t("changepw.titleFirst") : t("changepw.titleNormal")}
			</h1>
			{session.user.must_change_password && (
				<p className="text-sm text-inkDim mt-1">{t("changepw.firstLoginNote")}</p>
			)}
			<form action={save} className="space-y-4 mt-5">
				<label className="block">
					<span className="text-sm text-inkDim">{t("changepw.current")}</span>
					<input name="current" type="password" required minLength={8} className="input mt-1" autoComplete="current-password" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("changepw.next")}</span>
					<input name="next" type="password" required minLength={8} className="input mt-1" autoComplete="new-password" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("changepw.confirm")}</span>
					<input name="confirm" type="password" required minLength={8} className="input mt-1" autoComplete="new-password" />
				</label>
				{errMsg && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{errMsg}</div>}
				<button type="submit" className="btn-primary w-full">{t("changepw.submit")}</button>
			</form>
		</div>
	);
}
