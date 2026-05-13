import type { ReactNode } from "react";
import { requireSuperAdmin } from "@/lib/session";
import { AdminMobileNav, AdminSidebar } from "@/components/nav";
import { getLocale } from "@/lib/i18n.server";

export default async function AdminLayout({ children }: { children: ReactNode }) {
	await requireSuperAdmin();
	const locale = await getLocale();
	return (
		<div className="min-h-screen md:flex">
			<AdminSidebar locale={locale} />
			<div className="flex-1 pb-16 md:pb-0">
				<header className="md:hidden px-4 py-3 border-b border-border flex items-baseline justify-between">
					<span className="font-semibold">Ember</span>
					<span className="text-xs uppercase tracking-wide text-warn">Admin</span>
				</header>
				{children}
			</div>
			<AdminMobileNav locale={locale} />
		</div>
	);
}
