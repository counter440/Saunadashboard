import type { ReactNode } from "react";

// Standalone layout — no nav, no auth. Just the public status card.
export default function PublicLayout({ children }: { children: ReactNode }) {
	return <>{children}</>;
}
