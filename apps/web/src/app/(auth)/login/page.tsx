import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/lib/auth";
import { getT } from "@/lib/i18n.server";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; "password-changed"?: string }> }) {
	const { t } = await getT();
	async function action(form: FormData) {
		"use server";
		const email = String(form.get("email") ?? "");
		const password = String(form.get("password") ?? "");
		try {
			await signIn("credentials", { email, password, redirectTo: "/dashboard" });
		} catch (err) {
			if (err instanceof AuthError) {
				redirect("/login?error=1");
			}
			throw err;
		}
	}
	const sp = await searchParams;
	return (
		<>
			<h1 className="text-2xl font-semibold mb-6">{t("login.title")}</h1>
			{sp["password-changed"] && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm mb-4 border border-ok/30">
					{t("login.passwordChanged")}
				</div>
			)}
			<form action={action} className="space-y-4">
				<label className="block">
					<span className="text-sm text-inkDim">{t("common.email")}</span>
					<input name="email" type="email" required className="input mt-1" autoComplete="email" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("common.password")}</span>
					<input name="password" type="password" required minLength={8} className="input mt-1" autoComplete="current-password" />
				</label>
				{sp.error && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{t("login.invalid")}</div>}
				<button type="submit" className="btn-primary w-full">{t("common.signIn")}</button>
			</form>
		</>
	);
}
