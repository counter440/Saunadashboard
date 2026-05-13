export function StatusPill({ status, children }: { status: "ok" | "warn" | "bad"; children: React.ReactNode }) {
	const cls = status === "ok" ? "pill-ok" : status === "warn" ? "pill-warn" : "pill-bad";
	const dotCls = status === "ok" ? "dot-ok" : status === "warn" ? "dot-warn" : "dot-bad";
	return (
		<span className={cls}>
			<span className={dotCls} />
			{children}
		</span>
	);
}
