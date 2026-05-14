"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode, ReactElement } from "react";
import { tFor, type Locale, type TKey } from "@/lib/i18n";

// ── Tiny inline icons (24px viewBox) ────────────────────────────────────
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const Icon = ({ d, children }: { d?: string; children?: ReactNode }) => (
	<svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" {...stroke}>
		{d ? <path d={d} /> : children}
	</svg>
);
const IconSauna    = () => <Icon><path d="M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6"/></Icon>;
const IconAlerts   = () => <Icon d="M6 8a6 6 0 0 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9zM10 21h4"/>;
const IconTeam     = () => <Icon d="M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0zM2 21a6 6 0 0 1 12 0M14 8a3 3 0 1 1 6 0 3 3 0 0 1-6 0M16 21a6 6 0 0 1 6-6"/>;
const IconAccount  = () => <Icon d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0"/>;
const IconChart    = () => <Icon d="M3 3v18h18M7 14l3-4 3 3 5-7"/>;
const IconBuilding = () => <Icon d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M9 8h2M9 12h2M9 16h2M3 21h18"/>;
const IconRadio    = () => <Icon d="M4 16a8 8 0 0 1 16 0M7 16a5 5 0 0 1 10 0M12 16a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>;
const IconChip     = () => <Icon d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3M6 6h12v12H6z M9 9h6v6H9z"/>;

interface NavItem { href: string; labelKey: TKey; Icon: () => ReactElement; }

const customerItems: NavItem[] = [
	{ href: "/dashboard", labelKey: "nav.saunas",  Icon: IconSauna },
	{ href: "/alerts",    labelKey: "nav.alerts",  Icon: IconAlerts },
	{ href: "/team",      labelKey: "nav.team",    Icon: IconTeam },
	{ href: "/account",   labelKey: "nav.account", Icon: IconAccount },
];

const adminItems: NavItem[] = [
	{ href: "/admin",            labelKey: "nav.overview",  Icon: IconChart },
	{ href: "/admin/customers",  labelKey: "nav.customers", Icon: IconBuilding },
	{ href: "/admin/devices",    labelKey: "nav.devices",   Icon: IconRadio },
	{ href: "/admin/firmware",   labelKey: "nav.firmware",  Icon: IconChip },
];

// ── Brand mark ──────────────────────────────────────────────────────────
function Brand({ kind }: { kind: "customer" | "admin" }) {
	return (
		<Link href={kind === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-2 mb-5 group">
			<span className="grid place-items-center h-7 w-7 rounded-sm bg-accent text-bg font-bold tracking-tight">E</span>
			<div className="leading-tight">
				<div className="font-semibold tracking-tight text-ink">Ember</div>
				{kind === "admin" && <div className="text-2xs uppercase tracking-[0.18em] text-warn font-semibold">Admin</div>}
			</div>
		</Link>
	);
}

// ── Sidebar (desktop) ──────────────────────────────────────────────────
const ACTIVE: Record<"accent" | "warn", { text: string; bg: string; bar: string }> = {
	accent: { text: "text-accent", bg: "bg-accent/10", bar: "bg-accent" },
	warn:   { text: "text-warn",   bg: "bg-warn/10",   bar: "bg-warn"   },
};

/** Pick the single nav item whose href is the LONGEST prefix of pathname.
 *  Prevents `/admin` from staying highlighted on `/admin/customers`. */
function pickActive(items: NavItem[], pathname: string): number {
	let bestIdx = -1;
	let bestLen = -1;
	for (let i = 0; i < items.length; i++) {
		const h = items[i]!.href;
		const matches = pathname === h || pathname.startsWith(h + "/");
		if (matches && h.length > bestLen) {
			bestIdx = i;
			bestLen = h.length;
		}
	}
	return bestIdx;
}

function SidebarBase({ items, accent, locale }: { items: NavItem[]; accent: "accent" | "warn"; locale: Locale }) {
	const pathname = usePathname();
	const a = ACTIVE[accent];
	const activeIdx = pickActive(items, pathname);
	return (
		<aside className="hidden md:flex flex-col w-60 shrink-0 border-r border-border bg-surface px-3 py-4">
			<div className="px-2"><Brand kind={accent === "accent" ? "customer" : "admin"} /></div>
			{accent === "warn" && (
				<form action="/admin/search" className="px-2 mb-3">
					<div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border bg-surface2 focus-within:border-warn/50">
						<svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-inkMute shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
							<circle cx="11" cy="11" r="7" />
							<path d="m21 21-4.3-4.3" />
						</svg>
						<input
							name="q"
							placeholder={tFor(locale, "search.placeholder")}
							className="bg-transparent border-0 outline-none text-xs flex-1 placeholder:text-inkMute"
						/>
					</div>
				</form>
			)}
			<nav className="flex flex-col">
				{items.map((it, i) => {
					const active = i === activeIdx;
					return (
						<Link
							key={it.href}
							href={it.href}
							className={`relative flex items-center gap-3 px-3 py-2 my-0.5 rounded-md text-sm transition-colors
								${active ? `${a.text} ${a.bg}` : "text-inkDim hover:text-ink hover:bg-surface2"}`}
						>
							{active && <span className={`absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full ${a.bar}`} />}
							<it.Icon />
							<span>{tFor(locale, it.labelKey)}</span>
						</Link>
					);
				})}
			</nav>
		</aside>
	);
}

// ── Mobile bottom nav ──────────────────────────────────────────────────
function MobileNavBase({ items, accent, locale }: { items: NavItem[]; accent: "accent" | "warn"; locale: Locale }) {
	const pathname = usePathname();
	const cols = items.length;
	const a = ACTIVE[accent];
	const activeIdx = pickActive(items, pathname);
	return (
		<nav
			className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border bg-surface"
			style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
		>
			<ul className="grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
				{items.map((it, i) => {
					const active = i === activeIdx;
					return (
						<li key={it.href}>
							<Link
								href={it.href}
								className={`flex flex-col items-center justify-center min-h-touch py-2 gap-0.5
									${active ? a.text : "text-inkDim"}`}
							>
								<it.Icon />
								<span className="text-2xs">{tFor(locale, it.labelKey)}</span>
							</Link>
						</li>
					);
				})}
			</ul>
		</nav>
	);
}

export function Sidebar({ locale }: { locale: Locale })        { return <SidebarBase items={customerItems} accent="accent" locale={locale} />; }
export function MobileNav({ locale }: { locale: Locale })      { return <MobileNavBase items={customerItems} accent="accent" locale={locale} />; }
export function AdminSidebar({ locale }: { locale: Locale })   { return <SidebarBase items={adminItems}    accent="warn"   locale={locale} />; }
export function AdminMobileNav({ locale }: { locale: Locale }) { return <MobileNavBase items={adminItems}  accent="warn"   locale={locale} />; }
