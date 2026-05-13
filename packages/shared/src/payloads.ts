import { z } from "zod";

/**
 * MQTT topic published by every device:
 *   sauna/<device_id>/status
 */
export const STATUS_TOPIC_PATTERN = /^sauna\/([A-Za-z0-9_-]+)\/status$/;

export function deviceIdFromTopic(topic: string): string | null {
	const m = STATUS_TOPIC_PATTERN.exec(topic);
	return m?.[1] ?? null;
}

export const statusPayloadSchema = z.object({
	device_id: z.string().min(1).max(64),
	temperature: z.number().finite(),
	battery_voltage: z.number().finite().nullish(),
	battery_percent: z.number().int().min(0).max(100).nullish(),
	signal: z.number().int().nullish(),
	timestamp: z
		.string()
		.datetime({ offset: true })
		.transform((s) => new Date(s)),
});

export type StatusPayload = z.infer<typeof statusPayloadSchema>;

export function parseStatus(buffer: Buffer | string): {
	ok: true;
	value: StatusPayload;
} | {
	ok: false;
	error: string;
} {
	let json: unknown;
	try {
		json = JSON.parse(typeof buffer === "string" ? buffer : buffer.toString("utf8"));
	} catch (err) {
		return { ok: false, error: `invalid json: ${(err as Error).message}` };
	}
	const parsed = statusPayloadSchema.safeParse(json);
	if (!parsed.success) {
		return { ok: false, error: parsed.error.issues.map((i) => i.message).join(", ") };
	}
	return { ok: true, value: parsed.data };
}
