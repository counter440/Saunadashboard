"use client";

import { useEffect, useState } from "react";

interface Props {
	publicKey: string;
	labels: {
		enable: string;
		enabling: string;
		enabled: string;
		disable: string;
		unsupported: string;
		denied: string;
	};
}

export function PushToggle({ publicKey, labels }: Props) {
	const [state, setState] = useState<"loading" | "unsupported" | "denied" | "off" | "on" | "busy">("loading");

	useEffect(() => {
		if (typeof window === "undefined") return;
		const supported = "serviceWorker" in navigator && "PushManager" in window;
		if (!supported) { setState("unsupported"); return; }
		if (Notification.permission === "denied") { setState("denied"); return; }

		(async () => {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			setState(sub ? "on" : "off");
		})().catch(() => setState("off"));
	}, []);

	async function enable() {
		setState("busy");
		try {
			const reg = await navigator.serviceWorker.ready;
			const perm = await Notification.requestPermission();
			if (perm !== "granted") { setState("denied"); return; }
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as BufferSource,
			});
			const body = JSON.parse(JSON.stringify(sub));
			const res = await fetch("/api/push/subscribe", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(body),
			});
			if (!res.ok) throw new Error("subscribe failed");
			setState("on");
		} catch (err) {
			console.error(err);
			setState("off");
		}
	}

	async function disable() {
		setState("busy");
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				await fetch("/api/push/subscribe", {
					method: "DELETE",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ endpoint: sub.endpoint }),
				});
				await sub.unsubscribe();
			}
			setState("off");
		} catch (err) {
			console.error(err);
		}
	}

	if (state === "loading" || state === "busy") {
		return <button disabled className="btn-ghost text-sm opacity-50">…</button>;
	}
	if (state === "unsupported") {
		return <span className="text-xs text-inkMute">{labels.unsupported}</span>;
	}
	if (state === "denied") {
		return <span className="text-xs text-bad">{labels.denied}</span>;
	}
	if (state === "on") {
		return (
			<div className="flex items-center gap-2">
				<span className="text-xs text-ok">{labels.enabled}</span>
				<button onClick={disable} className="btn-ghost text-sm">{labels.disable}</button>
			</div>
		);
	}
	return <button onClick={enable} className="btn-primary text-sm">{labels.enable}</button>;
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
	const padding = "=".repeat((4 - (b64.length % 4)) % 4);
	const base64 = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
	const raw = atob(base64);
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}
