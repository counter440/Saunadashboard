/**
 * Synthetic sauna device — publishes realistic readings to Mosquitto for dev.
 *
 * Usage:
 *   pnpm fake-device --device sauna-dev-01 --interval 5
 *   pnpm fake-device --device sauna-dev-01 --interval 5 --temp 65 --drop  // simulate a freeze
 */
import { config as loadEnv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import mqtt from "mqtt";

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") });

const args = parseArgs(process.argv.slice(2));
const deviceId = args.device ?? "sauna-dev-01";
const intervalSec = Number(args.interval ?? "30");
const baseTemp = Number(args.temp ?? "72");
const drop = "drop" in args;

const url = `mqtt://${process.env.MQTT_HOST ?? "localhost"}:${process.env.MQTT_PORT ?? "1883"}`;
const username = (args["mqtt-user"] as string | undefined) ?? "fake-device";
const password = (args["mqtt-pass"] as string | undefined) ?? process.env.FAKE_DEVICE_PASS ?? "";

const client = mqtt.connect(url, {
	username,
	password,
	clientId: `fake-${deviceId}-${Math.random().toString(36).slice(2, 6)}`,
	clean: true,
});

client.on("connect", () => {
	console.log(`[fake-device] connected to ${url} as ${deviceId}, every ${intervalSec}s`);
	publishOnce();
	setInterval(publishOnce, intervalSec * 1000);
});

client.on("error", (err) => {
	console.error("[fake-device] mqtt error:", err.message);
});

let battery = 4.05;

function publishOnce() {
	battery = Math.max(2.9, battery - 0.0005); // slow drain
	const noise = (Math.random() - 0.5) * 1.5;
	const slowDrop = drop ? Math.max(-25, -((Date.now() % 600_000) / 600_000) * 25) : 0;
	const temperature = +(baseTemp + noise + slowDrop).toFixed(2);
	const battery_voltage = +battery.toFixed(2);
	const battery_percent = Math.max(0, Math.min(100, Math.round(((battery - 3.0) / 1.2) * 100)));
	const signal = -70 - Math.floor(Math.random() * 30);

	const payload = {
		device_id: deviceId,
		temperature,
		battery_voltage,
		battery_percent,
		signal,
		timestamp: new Date().toISOString(),
	};
	const topic = `sauna/${deviceId}/status`;
	client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) => {
		if (err) console.error("[fake-device] publish failed:", err.message);
		else console.log(`[fake-device] → ${topic}`, payload);
	});
}

function parseArgs(argv: string[]): Record<string, string | true> {
	const out: Record<string, string | true> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (!a.startsWith("--")) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next && !next.startsWith("--")) {
			out[key] = next;
			i++;
		} else {
			out[key] = true;
		}
	}
	return out;
}
