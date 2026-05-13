import "server-only";
import { cookies } from "next/headers";

export type Theme = "system" | "light" | "dark";
export const THEME_COOKIE = "theme";

export async function getTheme(): Promise<Theme> {
	const c = await cookies();
	const v = c.get(THEME_COOKIE)?.value;
	return v === "light" || v === "dark" || v === "system" ? v : "dark";
}

/** Returns the className to set on <html> based on theme choice. */
export function themeClass(theme: Theme): string {
	if (theme === "light") return "theme-light";
	if (theme === "dark") return "theme-dark";
	return ""; // system — let prefers-color-scheme decide
}
