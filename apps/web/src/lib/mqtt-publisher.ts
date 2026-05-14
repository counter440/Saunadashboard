import "server-only";
import mqtt from "mqtt";

/**
 * Publish a single MQTT message and disconnect. Used by the admin UI to push
 * commands like OTA triggers to `sauna/<id>/cmd`.
 *
 * Envs:
 *   MQTT_HOST            — broker hostname (default: "mosquitto")
 *   MQTT_PORT            — port (default: 8883 if MQTT_TLS, else 1883)
 *   MQTT_TLS             — "true" to use mqtts:// (auto-on if port is 8883)
 *   MQTT_INGEST_USER/PASS — credentials
 *
 * Inside the docker network the web container reaches Mosquitto at
 * mqtt://mosquitto:1883 (plaintext). From a dev laptop, set MQTT_HOST to the
 * VPS hostname and MQTT_TLS=true to use the public 8883 listener.
 */
export async function publishOnce(topic: string, payload: object | string, opts?: {
	qos?: 0 | 1 | 2;
	retain?: boolean;
}): Promise<void> {
	const host = process.env.MQTT_HOST ?? "mosquitto";
	const useTls = process.env.MQTT_TLS === "true" || process.env.MQTT_PORT === "8883";
	const port = Number(process.env.MQTT_PORT ?? (useTls ? 8883 : 1883));
	const username = process.env.MQTT_INGEST_USER;
	const password = process.env.MQTT_INGEST_PASS;
	if (!username || !password) {
		throw new Error("MQTT_INGEST_USER / MQTT_INGEST_PASS not set");
	}
	const url = `${useTls ? "mqtts" : "mqtt"}://${host}:${port}`;
	const client = mqtt.connect(url, {
		username,
		password,
		clientId: `web-publisher-${Math.random().toString(36).slice(2, 8)}`,
		clean: true,
		reconnectPeriod: 0,
		connectTimeout: 5000,
	});
	const body = typeof payload === "string" ? payload : JSON.stringify(payload);
	await new Promise<void>((resolve, reject) => {
		const cleanup = () => {
			try { client.end(true); } catch { /* */ }
		};
		client.on("connect", () => {
			client.publish(topic, body, { qos: opts?.qos ?? 1, retain: opts?.retain ?? false }, (err) => {
				cleanup();
				if (err) reject(err);
				else resolve();
			});
		});
		client.on("error", (err) => { cleanup(); reject(err); });
		setTimeout(() => { cleanup(); reject(new Error("publishOnce timeout")); }, 8000);
	});
}
