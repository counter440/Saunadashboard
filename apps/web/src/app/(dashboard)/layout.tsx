import type { ReactNode } from "react";
import { requireCustomer } from "@/lib/session";
import { MobileNav, Sidebar } from "@/components/nav";
import { getLocale } from "@/lib/i18n.server";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
	await requireCustomer();
	const locale = await getLocale();
	return (
		<div className="min-h-screen md:flex bg-bg">
			<Sidebar locale={locale} />
			<div className="flex-1 pb-16 md:pb-0">
				<header className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-border bg-surface">
					<span className="grid place-items-center h-7 w-7 rounded-sm bg-accent text-bg font-bold tracking-tight text-sm">E</span>
					<span className="font-semibold tracking-tight">Ember</span>
				</header>
				{children}
			</div>
			<MobileNav locale={locale} />
		</div>
	);
}
