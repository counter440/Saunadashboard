import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { pool, q, q1 } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { saveDeviceImage, removeDeviceImage } from "@/lib/uploads";
import { publishOnce } from "@/lib/mqtt-publisher";

interface FirmwareOption {
	id: string;
	version: string;
	channel: string;
	filename: string;
	sha256: string;
	created_at: Date;
}

interface Device {
	id: string;
	device_id: string;
	name: string;
	customer_id: string | null;
	customer_name: string | null;
	site_id: string | null;
	site_name: string | null;
	mqtt_username: string | null;
	fw_version: string | null;
	notes: string | null;
	image_path: string | null;
	last_seen: Date | null;
	last_temp: number | null;
	last_battery_voltage: number | null;
	timezone: string;
}

interface Customer { id: string; name: string; }
interface Site { id: string; name: string; customer_id: string; timezone: string; }

/** Generate a realistic-looking sauna temperature curve: cold baseline with a few "firing" peaks. */
function simulateReadings(deviceId: string, hours: number, intervalMin: number): Array<{
	device_id: string; created_at: Date; temperature: number; battery_voltage: number; battery_percent: number; signal_strength: number;
}> {
	const out: ReturnType<typeof simulateReadings> = [];
	const now = Date.now();
	const stepMs = intervalMin * 60_000;
	const total = Math.floor((hours * 60) / intervalMin);
	// Pick 1-3 random "firing" windows during the period
	const firings: { start: number; end: number; peak: number }[] = [];
	const fireCount = Math.max(1, Math.floor(hours / 12));
	for (let i = 0; i < fireCount; i++) {
		const start = Math.floor(Math.random() * total);
		const dur = 4 + Math.floor(Math.random() * 6); // 2-5 hours of firing
		firings.push({ start, end: start + dur, peak: 78 + Math.random() * 18 });
	}
	let battery = 4.05;
	for (let i = 0; i < total; i++) {
		const idx = total - i - 1; // newest first when reversed
		const ts = new Date(now - i * stepMs);
		// Baseline cold ~ 18°C, slowly drifting
		let temp = 18 + Math.sin(idx / 8) * 2 + (Math.random() - 0.5) * 1.5;
		// Add firing windows
		for (const f of firings) {
			if (idx >= f.start && idx <= f.end) {
				const pos = (idx - f.start) / (f.end - f.start); // 0..1 across the firing
				const bell = Math.sin(pos * Math.PI); // ramps up then down
				temp = Math.max(temp, 18 + (f.peak - 18) * bell + (Math.random() - 0.5) * 2);
			}
		}
		battery = Math.max(3.30, battery - 0.0008);
		const battery_percent = Math.max(0, Math.min(100, Math.round(((battery - 3.0) / 1.2) * 100)));
		out.push({
			device_id: deviceId,
			created_at: ts,
			temperature: +temp.toFixed(2),
			battery_voltage: +battery.toFixed(2),
			battery_percent,
			signal_strength: -75 - Math.floor(Math.random() * 25),
		});
	}
	return out.reverse(); // chronological
}

export default async function AdminDeviceDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ saved?: string; n?: string; msg?: string }>;
}) {
	await requireSuperAdmin();
	const { t, locale } = await getT();
	const { id } = await params;
	const sp = await searchParams;

	const device = await q1<Device>(
		`SELECT d.id, d.device_id, d.name, d.customer_id, c.name AS customer_name,
		        d.site_id, s.name AS site_name, d.mqtt_username, d.fw_version, d.notes,
		        d.image_path,
		        d.last_seen, d.last_temp::float8 AS last_temp, d.last_battery_voltage::float8 AS last_battery_voltage,
		        d.timezone
		   FROM devices d
		   LEFT JOIN customers c ON c.id = d.customer_id
		   LEFT JOIN sites s     ON s.id = d.site_id
		  WHERE d.device_id = $1`,
		[id],
	);
	if (!device) notFound();

	const customers = await q<Customer>(`SELECT id, name FROM customers ORDER BY name`);
	const sites = await q<Site>(`SELECT id, name, customer_id, timezone FROM sites ORDER BY name`);
	const firmwares = await q<FirmwareOption>(
		`SELECT id, version, channel, filename, sha256, created_at
		   FROM firmware_releases
		   WHERE channel = 'stable'
		   ORDER BY created_at DESC
		   LIMIT 10`,
	);

	async function saveAdminFields(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const schema = z.object({
			name: z.string().min(1).max(100),
			fw_version: z.string().max(40).optional(),
			notes: z.string().max(2000).optional(),
		});
		const parsed = schema.parse({
			name: form.get("name"),
			fw_version: form.get("fw_version") || undefined,
			notes: form.get("notes") || undefined,
		});
		await pool.query(
			`UPDATE devices SET name = $1, fw_version = $2, notes = $3 WHERE device_id = $4`,
			[parsed.name, parsed.fw_version ?? null, parsed.notes ?? null, id],
		);
		redirect(`/admin/devices/${id}?saved=name`);
	}

	async function uploadImage(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const file = form.get("image");
		if (!(file instanceof File)) redirect(`/admin/devices/${id}?saved=img-empty`);
		const result = await saveDeviceImage(id, file as File);
		if (!result.ok) redirect(`/admin/devices/${id}?saved=img-${result.reason}`);
		await pool.query(`UPDATE devices SET image_path = $1 WHERE device_id = $2`, [result.publicPath, id]);
		redirect(`/admin/devices/${id}?saved=img-ok`);
	}

	async function clearImage() {
		"use server";
		await requireSuperAdmin();
		await removeDeviceImage(id);
		await pool.query(`UPDATE devices SET image_path = NULL WHERE device_id = $1`, [id]);
		redirect(`/admin/devices/${id}?saved=img-removed`);
	}

	async function simulate(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const hours = Number(form.get("hours") ?? "24");
		const intervalMin = hours <= 24 ? 30 : 60;
		const readings = simulateReadings(id, hours, intervalMin);
		// Bulk insert via UNNEST
		await pool.query(
			`INSERT INTO temperature_readings
			   (device_id, created_at, temperature, battery_voltage, battery_percent, signal_strength)
			 SELECT * FROM unnest(
			   $1::text[], $2::timestamptz[], $3::numeric[], $4::numeric[], $5::int[], $6::int[]
			 )
			 ON CONFLICT (device_id, created_at) DO NOTHING`,
			[
				readings.map((r) => r.device_id),
				readings.map((r) => r.created_at),
				readings.map((r) => r.temperature),
				readings.map((r) => r.battery_voltage),
				readings.map((r) => r.battery_percent),
				readings.map((r) => r.signal_strength),
			],
		);
		const last = readings[readings.length - 1]!;
		await pool.query(
			`UPDATE devices SET last_seen = $1, last_temp = $2, last_battery_voltage = $3,
			                    last_battery_percent = $4, last_signal = $5
			  WHERE device_id = $6`,
			[last.created_at, last.temperature, last.battery_voltage, last.battery_percent, last.signal_strength, id],
		);
		await pool.query("SELECT pg_notify('reading_inserted', $1)", [id]);
		redirect(`/admin/devices/${id}?saved=sim&n=${readings.length}`);
	}

	async function clearReadings() {
		"use server";
		await requireSuperAdmin();
		await pool.query(`DELETE FROM temperature_readings WHERE device_id = $1`, [id]);
		await pool.query(
			`UPDATE devices SET last_seen = NULL, last_temp = NULL, last_battery_voltage = NULL,
			                    last_battery_percent = NULL, last_signal = NULL
			  WHERE device_id = $1`,
			[id],
		);
		redirect(`/admin/devices/${id}?saved=cleared`);
	}

	async function pushFirmware(form: FormData) {
		"use server";
		const { session } = await requireSuperAdmin();
		const fwId = String(form.get("firmware_id") ?? "");
		const fw = await q1<FirmwareOption>(
			`SELECT id, version, channel, filename, sha256, created_at
			   FROM firmware_releases WHERE id = $1`, [fwId],
		);
		if (!fw) redirect(`/admin/devices/${id}?saved=fw-err&msg=missing`);
		const host = process.env.APP_HOSTNAME ?? "saunatemp.dyndns.org";
		const url = `https://${host}/fw/${fw!.filename}`;
		const payload = { type: "ota", url, sha256: fw!.sha256, version: fw!.version };
		const cmd = await pool.query<{ id: string }>(
			`INSERT INTO device_pending_commands (device_id, kind, payload, created_by)
			 VALUES ($1, 'ota', $2, $3) RETURNING id`,
			[id, payload, session.user.id],
		);
		try {
			await publishOnce(`sauna/${id}/cmd`, payload, { qos: 1, retain: false });
			await pool.query(
				`UPDATE device_pending_commands SET delivered_at = now() WHERE id = $1`,
				[cmd.rows[0]!.id],
			);
		} catch (err) {
			redirect(`/admin/devices/${id}?saved=fw-err&msg=${encodeURIComponent((err as Error).message).slice(0, 120)}`);
		}
		redirect(`/admin/devices/${id}?saved=fw-pushed`);
	}

	async function assign(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const siteIdRaw = String(form.get("site_id") ?? "");
		const customerIdRaw = String(form.get("customer_id") ?? "");

		if (siteIdRaw && siteIdRaw !== "none") {
			const r = await pool.query<{ customer_id: string; timezone: string }>(
				`SELECT customer_id, timezone FROM sites WHERE id = $1`, [siteIdRaw],
			);
			const row = r.rows[0];
			if (!row) redirect(`/admin/devices/${id}?saved=err`);
			await pool.query(
				`UPDATE devices SET customer_id = $1, site_id = $2, timezone = $3 WHERE device_id = $4`,
				[row!.customer_id, siteIdRaw, row!.timezone, id],
			);
		} else if (customerIdRaw && customerIdRaw !== "none") {
			await pool.query(
				`UPDATE devices SET customer_id = $1, site_id = NULL WHERE device_id = $2`,
				[customerIdRaw, id],
			);
		} else {
			await pool.query(
				`UPDATE devices SET customer_id = NULL, site_id = NULL WHERE device_id = $1`,
				[id],
			);
		}
		redirect(`/admin/devices/${id}?saved=assignment`);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-3xl space-y-5">
			<div>
				<Link href="/admin/devices" className="text-sm text-inkDim hover:text-accent">{t("admin.deviceDetail.back")}</Link>
			</div>

			{sp.saved && !["sim", "cleared", "img-ok", "img-removed", "img-too-large", "img-invalid-type", "img-empty"].includes(sp.saved) && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("common.saved")}</div>
			)}
			{sp.saved === "sim" && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">
					{t("admin.simulate.done", { n: sp.n ?? "0" })}
				</div>
			)}
			{sp.saved === "cleared" && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.simulate.cleared")}</div>
			)}
			{sp.saved === "img-ok" && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.image.uploaded")}</div>
			)}
			{sp.saved === "img-removed" && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.image.removed")}</div>
			)}
			{sp.saved === "img-too-large" && (
				<div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{t("admin.image.tooLarge")}</div>
			)}
			{sp.saved === "img-invalid-type" && (
				<div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{t("admin.image.invalidType")}</div>
			)}
			{sp.saved === "fw-pushed" && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">{t("admin.device.fw.pushed")}</div>
			)}
			{sp.saved === "fw-err" && (
				<div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">
					{t("admin.device.fw.error", { err: sp.msg ?? "unknown" })}
				</div>
			)}

			<header>
				<h1 className="text-xl md:text-2xl font-semibold">{device.name}</h1>
				<p className="text-sm text-inkDim font-mono">{device.device_id}</p>
			</header>

			<section className="card p-4">
				<h2 className="eyebrow mb-3">{t("admin.deviceDetail.assignment")}</h2>
				<form action={assign} className="space-y-3">
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.deviceDetail.site")}</span>
						<select name="site_id" defaultValue={device.site_id ?? "none"} className="input">
							<option value="none">{t("admin.deviceDetail.unassigned")}</option>
							{sites.map((s) => (
								<option key={s.id} value={s.id}>
									{s.name} ({customers.find((c) => c.id === s.customer_id)?.name})
								</option>
							))}
						</select>
					</label>
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.deviceDetail.orCustomer")}</span>
						<select name="customer_id" defaultValue={device.site_id ? "none" : (device.customer_id ?? "none")} className="input">
							<option value="none">{t("admin.deviceDetail.none")}</option>
							{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
						</select>
					</label>
					<div className="flex justify-end">
						<button className="btn-primary text-sm" type="submit">{t("admin.deviceDetail.saveAssignment")}</button>
					</div>
				</form>
				<div className="text-xs text-inkDim mt-3">
					{t("admin.deviceDetail.currently")} {device.customer_name ? device.customer_name : <span className="italic">{t("admin.deviceDetail.noCustomer")}</span>}
					{device.site_name && <> · {device.site_name}</>} · {t("settings.timezone").toLowerCase()} {device.timezone}
				</div>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-3">{t("admin.deviceDetail.adminFields")}</h2>
				<form action={saveAdminFields} className="space-y-3">
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.deviceDetail.deviceName")}</span>
						<input name="name" defaultValue={device.name} required maxLength={100} className="input mt-1" />
					</label>
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.deviceDetail.fw")}</span>
						<input name="fw_version" defaultValue={device.fw_version ?? ""} maxLength={40} className="input mt-1 font-mono" placeholder="0.3.1" />
					</label>
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.deviceDetail.notes")}</span>
						<textarea name="notes" defaultValue={device.notes ?? ""} rows={3} className="input py-2" />
					</label>
					<div className="flex justify-end">
						<button className="btn-primary text-sm" type="submit">{t("common.save")}</button>
					</div>
				</form>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("admin.deviceDetail.brokerCreds")}</h2>
				<p className="text-sm">
					{t("admin.deviceDetail.mqttUsername")} <span className="font-mono">{device.mqtt_username ?? "—"}</span>
				</p>
				<p className="text-xs text-inkDim mt-2">{t("admin.deviceDetail.mqttRotateNote")}</p>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("admin.image.title")}</h2>
				<p className="text-xs text-inkDim mb-3">{t("admin.image.note")}</p>
				<div className="flex flex-wrap items-start gap-4">
					{device.image_path ? (
						// eslint-disable-next-line @next/next/no-img-element
						<img
							src={device.image_path}
							alt={device.name}
							className="h-32 w-48 object-cover rounded-md border border-border bg-surface2"
						/>
					) : (
						<div className="h-32 w-48 grid place-items-center rounded-md border border-dashed border-border bg-surface2 text-2xs text-inkMute uppercase tracking-wider">
							no image
						</div>
					)}
					<div className="flex flex-col gap-2 min-w-[220px]">
						<form action={uploadImage} className="space-y-2">
							<input
								type="file"
								name="image"
								accept="image/jpeg,image/png,image/webp"
								required
								className="block text-sm text-inkDim file:mr-3 file:btn-ghost file:text-xs file:cursor-pointer"
							/>
							<button className="btn-primary text-sm w-full" type="submit">
								{device.image_path ? t("admin.image.replace") : t("admin.image.upload")}
							</button>
						</form>
						{device.image_path && (
							<form action={clearImage}>
								<button className="btn-ghost text-sm text-bad w-full" type="submit">{t("admin.image.remove")}</button>
							</form>
						)}
					</div>
				</div>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("admin.device.fw.title")}</h2>
				<p className="text-xs text-inkDim mb-3">
					{t("admin.device.fw.current", { v: device.fw_version ?? t("admin.device.fw.unknown") })}
				</p>
				{firmwares.length === 0 ? (
					<div className="text-sm text-inkDim">
						{t("admin.device.fw.noNewer")}{" "}
						<Link href="/admin/firmware/new" className="text-accent hover:underline">{t("admin.firmware.upload")}</Link>
					</div>
				) : (
					<form action={pushFirmware} className="flex flex-wrap items-end gap-2">
						<label className="block flex-1 min-w-[200px]">
							<span className="text-sm text-inkDim">{t("admin.device.fw.choose")}</span>
							<select name="firmware_id" className="input mt-1 font-mono" required>
								{firmwares
									.filter((f) => f.version !== device.fw_version)
									.map((f) => (
										<option key={f.id} value={f.id}>
											{f.version} ({f.channel})
										</option>
									))}
							</select>
						</label>
						<button className="btn-primary text-sm" type="submit">{t("admin.device.fw.push")}</button>
					</form>
				)}
			</section>

			<section className="card p-4 border-warn/30">
				<h2 className="eyebrow text-warn mb-2">{t("admin.simulate.title")}</h2>
				<p className="text-xs text-inkDim mb-3">{t("admin.simulate.note")}</p>
				<div className="flex flex-wrap gap-2">
					<form action={simulate}>
						<input type="hidden" name="hours" value="24" />
						<button className="btn-ghost text-sm" type="submit">{t("admin.simulate.button24h")}</button>
					</form>
					<form action={simulate}>
						<input type="hidden" name="hours" value="168" />
						<button className="btn-ghost text-sm" type="submit">{t("admin.simulate.button7d")}</button>
					</form>
					<form action={clearReadings} className="ml-auto">
						<button className="btn-ghost text-sm text-bad" type="submit">{t("admin.simulate.clear")}</button>
					</form>
				</div>
			</section>

			<section className="card p-4">
				<h2 className="eyebrow mb-2">{t("admin.deviceDetail.runtime")}</h2>
				<dl className="grid grid-cols-2 text-sm gap-y-1">
					<dt className="text-inkDim">{t("status.lastSeen")}</dt>
					<dd className="tabular-nums">{device.last_seen ? new Date(device.last_seen).toLocaleString(locale === "nb" ? "nb-NO" : "en-US") : t("common.never")}</dd>
					<dt className="text-inkDim">{t("admin.deviceDetail.lastTemp")}</dt>
					<dd className="tabular-nums">{device.last_temp !== null ? `${Number(device.last_temp).toFixed(1)} °C` : "—"}</dd>
					<dt className="text-inkDim">{t("admin.deviceDetail.lastBattery")}</dt>
					<dd className="tabular-nums">{device.last_battery_voltage !== null ? `${Number(device.last_battery_voltage).toFixed(2)} V` : "—"}</dd>
				</dl>
			</section>
		</div>
	);
}
