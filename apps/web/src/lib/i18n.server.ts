import "server-only";
import { cookies } from "next/headers";
import { tFor, isLocale, type Locale, type TKey, DEFAULT_LOCALE } from "./i18n";

export const LANG_COOKIE = "lang";

export async function getLocale(): Promise<Locale> {
	const c = await cookies();
	const v = c.get(LANG_COOKIE)?.value;
	return isLocale(v) ? v : DEFAULT_LOCALE;
}

export async function getT() {
	const locale = await getLocale();
	const t = (key: TKey, vars?: Record<string, string | number>) => tFor(locale, key, vars);
	return { t, locale };
}
