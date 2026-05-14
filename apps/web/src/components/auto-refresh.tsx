"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const IDLE_GUARD_MS = 1500;

export function AutoRefresh({ intervalMs = 10000 }: { intervalMs?: number }) {
	const router = useRouter();
	useEffect(() => {
		let stopped = false;
		let lastInteraction = 0;
		const markInteraction = () => {
			lastInteraction = Date.now();
		};

		const refresh = () => {
			if (stopped) return;
			if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
			if (Date.now() - lastInteraction < IDLE_GUARD_MS) return;

			// iOS Safari sometimes resets scroll to 0 during the RSC patch that
			// router.refresh() triggers. Snapshot scrollY and re-assert it for a
			// few frames after the refresh so the user stays where they were.
			const y = window.scrollY;
			router.refresh();
			let frames = 0;
			const restoreUntilStable = () => {
				if (stopped) return;
				const cur = window.scrollY;
				// Heuristic: a >200px delta means the user actively scrolled, leave them alone.
				if (Math.abs(cur - y) > 200) return;
				if (Math.abs(cur - y) > 2) window.scrollTo(0, y);
				if (frames++ < 30) requestAnimationFrame(restoreUntilStable);
			};
			requestAnimationFrame(restoreUntilStable);
		};

		window.addEventListener("scroll", markInteraction, { passive: true });
		window.addEventListener("touchstart", markInteraction, { passive: true });
		window.addEventListener("touchmove", markInteraction, { passive: true });
		window.addEventListener("wheel", markInteraction, { passive: true });

		const kickoff = window.setTimeout(refresh, 800);
		const id = window.setInterval(refresh, intervalMs);
		return () => {
			stopped = true;
			window.clearTimeout(kickoff);
			window.clearInterval(id);
			window.removeEventListener("scroll", markInteraction);
			window.removeEventListener("touchstart", markInteraction);
			window.removeEventListener("touchmove", markInteraction);
			window.removeEventListener("wheel", markInteraction);
		};
	}, [router, intervalMs]);
	return null;
}
