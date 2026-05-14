import type { Logger } from "pino";

export interface DispatchResult {
	channel: "push";
	destination: string;
	status: "sent" | "failed" | "dry_run";
	error?: string;
}

export interface PushSub {
	id: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	user_email: string;
}

export class Dispatcher {
	private webPushReady = false;

	constructor(private readonly log: Logger) {}

	async ready(): Promise<void> {
		if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
			const webpush = (await import("web-push")).default;
			webpush.setVapidDetails(
				process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
				process.env.VAPID_PUBLIC_KEY,
				process.env.VAPID_PRIVATE_KEY,
			);
			this.webPushReady = true;
		} else {
			this.log.warn("VAPID keys missing — push will be skipped");
		}
	}

	async sendPush(sub: PushSub, payload: { title: string; body: string; url?: string; tag?: string }): Promise<DispatchResult> {
		const dest = sub.user_email;
		if (!this.webPushReady) {
			this.log.info({ dest, payload }, "[push] no VAPID keys — skipped");
			return { channel: "push", destination: dest, status: "dry_run" };
		}
		try {
			const webpush = (await import("web-push")).default;
			await webpush.sendNotification(
				{ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
				JSON.stringify(payload),
			);
			return { channel: "push", destination: dest, status: "sent" };
		} catch (err) {
			const e = err as { statusCode?: number; message?: string };
			this.log.warn({ statusCode: e.statusCode, dest }, "push send failed");
			return { channel: "push", destination: dest, status: "failed", error: e.message };
		}
	}

	/** Returns true if the subscription endpoint is gone (HTTP 404/410). Caller should delete it. */
	isExpired(result: DispatchResult): boolean {
		return result.status === "failed" && /410|404|gone/i.test(result.error ?? "");
	}
}
