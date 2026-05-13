import type { Logger } from "pino";
import type { DeviceRow, NotificationKind } from "@sauna/shared";

export interface DispatchInput {
	device: DeviceRow;
	kind: NotificationKind;
	subject: string;
	body: string;
}

export interface DispatchResult {
	channel: "email" | "sms";
	destination: string;
	status: "sent" | "failed" | "dry_run";
	error?: string;
}

export class Dispatcher {
	private resendClient: { emails: { send: (args: { from: string; to: string; subject: string; text: string }) => Promise<unknown> } } | null = null;
	private twilioClient: { messages: { create: (args: { from: string; to: string; body: string }) => Promise<unknown> } } | null = null;

	constructor(private readonly log: Logger, private readonly dryRun: boolean) {}

	async ready(): Promise<void> {
		if (this.dryRun) {
			this.log.warn("notifier dry-run mode — no real emails/sms will be sent");
			return;
		}
		if (process.env.RESEND_API_KEY) {
			const { Resend } = await import("resend");
			this.resendClient = new Resend(process.env.RESEND_API_KEY) as never;
		}
		if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
			const twilio = (await import("twilio")).default;
			this.twilioClient = twilio(
				process.env.TWILIO_ACCOUNT_SID,
				process.env.TWILIO_AUTH_TOKEN,
			) as never;
		}
	}

	async dispatchAll({ device, kind, subject, body }: DispatchInput): Promise<DispatchResult[]> {
		const results: DispatchResult[] = [];
		for (const email of device.alert_emails ?? []) {
			results.push(await this.sendEmail(email, subject, body));
		}
		for (const phone of device.alert_phones ?? []) {
			results.push(await this.sendSms(phone, `${subject}: ${body}`));
		}
		if (results.length === 0) {
			this.log.warn({ device_id: device.device_id, kind }, "no recipients configured for device");
		}
		return results;
	}

	private async sendEmail(to: string, subject: string, text: string): Promise<DispatchResult> {
		if (this.dryRun || !this.resendClient || !process.env.RESEND_FROM) {
			this.log.info({ to, subject }, "[dry-run] email");
			return { channel: "email", destination: to, status: "dry_run" };
		}
		try {
			await this.resendClient.emails.send({
				from: process.env.RESEND_FROM,
				to,
				subject,
				text,
			});
			return { channel: "email", destination: to, status: "sent" };
		} catch (err) {
			this.log.error({ err, to }, "email send failed");
			return { channel: "email", destination: to, status: "failed", error: (err as Error).message };
		}
	}

	private async sendSms(to: string, body: string): Promise<DispatchResult> {
		if (this.dryRun || !this.twilioClient || !process.env.TWILIO_FROM) {
			this.log.info({ to, body }, "[dry-run] sms");
			return { channel: "sms", destination: to, status: "dry_run" };
		}
		try {
			await this.twilioClient.messages.create({
				from: process.env.TWILIO_FROM,
				to,
				body,
			});
			return { channel: "sms", destination: to, status: "sent" };
		} catch (err) {
			this.log.error({ err, to }, "sms send failed");
			return { channel: "sms", destination: to, status: "failed", error: (err as Error).message };
		}
	}
}
