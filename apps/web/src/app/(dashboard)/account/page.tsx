import { q1 } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { signOut } from "@/lib/auth";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getT, LANG_COOKIE } from "@/lib/i18n.server";
import { isLocale } from "@/lib/i18n";
import { getTheme, THEME_COOKIE, type Theme } from "@/lib/theme.server";

interface CustomerRow { id: string; name: string; billing_email: string; }

export default async function AccountPage() {
	const { customerId, session } = await requireCustomer();
	const { t, locale } = await getT();
	const theme = await getTheme();
	const customer = await q1<CustomerRow>(
		`SELECT id, name, billing_email FROM customers WHERE id = $1`,
		[customerId],
	);

	async function doSignOut() {
		"use server";
		await signOut({ redirectTo: "/login" });
	}

	async function setLanguage(form: FormData) {
		"use server";
		const v = String(form.get("lang") ?? "");
		if (!isLocale(v)) redirect("/account");
		const c = await cookies();
		c.set(LANG_COOKIE, v, {
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
		});
		redirect("/account");
	}

	async function setThemePref(form: FormData) {
		"use server";
		const v = String(form.get("theme") ?? "") as Theme;
		if (v !== "system" && v !== "light" && v !== "dark") redirect("/account");
		const c = await cookies();
		c.set(THEME_COOKIE, v, {
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
		});
		redirect("/account");
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-2xl space-y-5">
			<h1 className="text-xl md:text-2xl font-semibold">{t("account.title")}</h1>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("account.customer")}</h2>
				<p><span className="text-inkDim text-sm">{t("account.name")}: </span>{customer?.name}</p>
				<p><span className="text-inkDim text-sm">{t("account.billingEmail")}: </span>{customer?.billing_email}</p>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("account.you")}</h2>
				<p><span className="text-inkDim text-sm">{t("common.email")}: </span><span className="font-mono">{session.user.email}</span></p>
				<p>
					<span className="text-inkDim text-sm">{t("common.role")}: </span>
					{session.user.role === "customer_owner" ? t("account.role.owner") : t("account.role.member")}
				</p>
				<div className="flex flex-wrap gap-2 mt-3">
					<Link href="/account/change-password" className="btn-ghost text-sm">{t("account.changePassword")}</Link>
					<form action={doSignOut}>
						<button className="btn-ghost text-sm" type="submit">{t("common.signOut")}</button>
					</form>
				</div>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("account.language.title")}</h2>
				<form action={setLanguage} className="flex flex-wrap items-center gap-3">
					<label className="inline-flex items-center gap-2 text-sm cursor-pointer">
						<input type="radio" name="lang" value="nb" defaultChecked={locale === "nb"} className="accent-accent" />
						{t("account.language.nb")}
					</label>
					<label className="inline-flex items-center gap-2 text-sm cursor-pointer">
						<input type="radio" name="lang" value="en" defaultChecked={locale === "en"} className="accent-accent" />
						{t("account.language.en")}
					</label>
					<button type="submit" className="btn-ghost text-sm ml-auto">{t("common.save")}</button>
				</form>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("account.theme.title")}</h2>
				<form action={setThemePref} className="flex flex-wrap items-center gap-3">
					<label className="inline-flex items-center gap-2 text-sm cursor-pointer">
						<input type="radio" name="theme" value="system" defaultChecked={theme === "system"} className="accent-accent" />
						{t("account.theme.system")}
					</label>
					<label className="inline-flex items-center gap-2 text-sm cursor-pointer">
						<input type="radio" name="theme" value="light" defaultChecked={theme === "light"} className="accent-accent" />
						{t("account.theme.light")}
					</label>
					<label className="inline-flex items-center gap-2 text-sm cursor-pointer">
						<input type="radio" name="theme" value="dark" defaultChecked={theme === "dark"} className="accent-accent" />
						{t("account.theme.dark")}
					</label>
					<button type="submit" className="btn-ghost text-sm ml-auto">{t("common.save")}</button>
				</form>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("account.team.title")}</h2>
				<p className="text-sm text-inkDim">
					{session.user.role === "customer_owner" ? t("account.team.openOwner") : t("account.team.openMember")}
				</p>
				<Link href="/team" className="btn-ghost text-sm mt-2 inline-flex">{t("account.team.open")}</Link>
			</section>
		</div>
	);
}
