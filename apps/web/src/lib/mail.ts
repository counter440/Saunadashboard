interface SendEmail {
	to: string;
	subject: string;
	text: string;
}

const DRY_RUN = process.env.NOTIFIER_DRY_RUN !== "false";

let resendClient: { emails: { send: (args: { from: string; to: string; subject: string; text: string }) => Promise<unknown> } } | null = null;

async function getClient() {
	if (resendClient || !process.env.RESEND_API_KEY) return resendClient;
	const { Resend } = await import("resend");
	resendClient = new Resend(process.env.RESEND_API_KEY) as never;
	return resendClient;
}

/**
 * Send an email via Resend. In dry-run (`NOTIFIER_DRY_RUN != "false"`) the message
 * is logged and the return is `{ dryRun: true }` so admin UI can show the temp
 * password inline during local dev.
 */
export async function sendEmail({ to, subject, text }: SendEmail): Promise<{ dryRun: boolean; ok: boolean; error?: string }> {
	if (DRY_RUN || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
		console.info(`[mail dry-run] to=${to} subject=${subject}\n${text}\n`);
		return { dryRun: true, ok: true };
	}
	const client = await getClient();
	if (!client) return { dryRun: true, ok: true };
	try {
		await client.emails.send({
			from: process.env.RESEND_FROM,
			to,
			subject,
			text,
		});
		return { dryRun: false, ok: true };
	} catch (err) {
		return { dryRun: false, ok: false, error: (err as Error).message };
	}
}
