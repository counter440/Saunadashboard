import type { ReactNode } from "react";
import Link from "next/link";
import { getT } from "@/lib/i18n.server";

export default async function AuthLayout({ children }: { children: ReactNode }) {
	const { t } = await getT();
	return (
		<div className="min-h-screen grid place-items-center px-4 py-10 bg-bg">
			<div className="w-full max-w-sm">
				<Link href="/" className="flex items-center gap-2 mb-8 justify-center">
					<span className="grid place-items-center h-8 w-8 rounded-sm bg-accent text-bg font-bold tracking-tight">E</span>
					<span className="font-semibold text-lg tracking-tight">Ember</span>
				</Link>
				<div className="card p-6 shadow-lift">
					{children}
				</div>
				<p className="mt-6 text-center text-2xs text-inkMute uppercase tracking-[0.18em]">
					{t("brand.tagline")}
				</p>
			</div>
		</div>
	);
}
