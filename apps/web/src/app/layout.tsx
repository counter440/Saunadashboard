import "./globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import { getLocale } from "@/lib/i18n.server";
import { getTheme, themeClass } from "@/lib/theme.server";

const sans = DM_Sans({
	subsets: ["latin"],
	variable: "--font-sans",
	weight: ["400", "500", "600", "700"],
	display: "swap",
});

const mono = JetBrains_Mono({
	subsets: ["latin"],
	variable: "--font-mono",
	weight: ["400", "500"],
	display: "swap",
});

export const metadata: Metadata = {
	title: "Ember",
	description: "Monitor sauna temperature and battery, anywhere.",
	manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
	width: "device-width",
	initialScale: 1,
	maximumScale: 1,
	themeColor: [
		{ media: "(prefers-color-scheme: light)", color: "#f4f6f8" },
		{ media: "(prefers-color-scheme: dark)", color: "#182025" },
	],
};

export default async function RootLayout({ children }: { children: ReactNode }) {
	const locale = await getLocale();
	const theme = await getTheme();
	return (
		<html lang={locale === "nb" ? "nb-NO" : "en"} className={`${sans.variable} ${mono.variable} ${themeClass(theme)}`.trim()}>
			<body className="antialiased font-sans">
				{children}
				<script
					dangerouslySetInnerHTML={{
						__html: `if ('serviceWorker' in navigator) { window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {})); }`,
					}}
				/>
			</body>
		</html>
	);
}
