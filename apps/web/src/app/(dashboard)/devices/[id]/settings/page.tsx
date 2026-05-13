import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { pool, q, q1 } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { tFor, type Locale, type TKey } from "@/lib/i18n";

interface DeviceSettings {
	id: string;
	device_id: string;
	name: string;
	site_name: string | null;
	low_temp_threshold: number | null;
	battery_warning_percent: number;
	active_window_start: string;
	active_window_end: string;
	active_days: number[];
	timezone: string;
	alert_cooldown_hours: number;
	alert_emails: string[];
	alert_phones: string[];
	snoozed_until: Date | null;
	public_token: string | null;
}

const DAY_KEYS: TKey[] = ["day.sun", "day.mon", "day.tue", "day.wed", "day.thu", "day.fri", "day.sat"];
const TIMEZONES = ["Europe/Oslo", "Europe/Stockholm", "Europe/Helsinki", "Europe/Copenhagen", "Europe/London", "UTC"];

export default async function DeviceSettingsPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ saved?: string; snooze?: string }>;
}) {
	const { customerId } = await requireCustomer();
	const { t, locale } = await getT();
	const { id } = await params;
	const sp = await searchParams;

	const device = await q1<DeviceSettings>(
		`SELECT d.id, d.device_id, d.name, s.name AS site_name,
		        d.low_temp_threshold::float8 AS low_temp_threshold,
		        d.battery_warning_percent,
		        d.active_window_start::text AS active_window_start,
		        d.active_window_end::text AS active_window_end,
		        d.active_days, d.timezone, d.alert_cooldown_hours, d.alert_emails, d.alert_phones,
		        d.snoozed_until, d.public_token
		   FROM devices d
		   LEFT JOIN sites s ON s.id = d.site_id
		  WHERE d.device_id = $1 AND d.customer_id = $2`,
		[id, customerId],
	);
	if (!device) notFound();

	async function setSnooze(form: FormData) {
		"use server";
		const { customerId } = await requireCustomer();
		const preset = String(form.get("preset") ?? "");
		const custom = String(form.get("until") ?? "");
		let until: Date | null = null;
		if (preset === "1h") until = new Date(Date.now() + 1 * 3600_000);
		else if (preset === "8h") until = new Date(Date.now() + 8 * 3600_000);
		else if (preset === "24h") until = new Date(Date.now() + 24 * 3600_000);
		else if (preset === "7d") until = new Date(Date.now() + 7 * 24 * 3600_000);
		else if (preset === "custom" && custom) {
			const d = new Date(custom);
			if (!isNaN(d.getTime()) && d.getTime() > Date.now()) until = d;
		}
		if (!until) redirect(`/devices/${id}/settings?snooze=invalid`);
		await pool.query(
			`UPDATE devices SET snoozed_until = $1 WHERE device_id = $2 AND customer_id = $3`,
			[until, id, customerId],
		);
		redirect(`/devices/${id}/settings?snooze=on`);
	}

	async function enableSharing() {
		"use server";
		const { customerId } = await requireCustomer();
		const { randomBytes } = await import("node:crypto");
		const token = randomBytes(16).toString("base64url");
		await pool.query(
			`UPDATE devices SET public_token = $1 WHERE device_id = $2 AND customer_id = $3`,
			[token, id, customerId],
		);
		redirect(`/devices/${id}/settings?saved=share-on`);
	}

	async function disableSharing() {
		"use server";
		const { customerId } = await requireCustomer();
		await pool.query(
			`UPDATE devices SET public_token = NULL WHERE device_id = $1 AND customer_id = $2`,
			[id, customerId],
		);
		redirect(`/devices/${id}/settings?saved=share-off`);
	}

	async function resumeAlerts() {
		"use server";
		const { customerId } = await requireCustomer();
		await pool.query(
			`UPDATE devices SET snoozed_until = NULL WHERE device_id = $1 AND customer_id = $2`,
			[id, customerId],
		);
		redirect(`/devices/${id}/settings?snooze=off`);
	}

	const teamUsers = await q<{ id: string; email: string; role: "customer_owner" | "customer_member" }>(
		`SELECT id, email, role FROM users WHERE customer_id = $1 ORDER BY role, email`,
		[customerId],
	);
	const teamEmailSet = new Set(teamUsers.map((u) => u.email.toLowerCase()));
	const selectedEmailsLower = new Set(device.alert_emails.map((e) => e.toLowerCase()));
	const externalEmails = device.alert_emails.filter((e) => !teamEmailSet.has(e.toLowerCase()));

	async function save(form: FormData) {
		"use server";
		const { customerId } = await requireCustomer();
		const schema = z.object({
			low_temp_threshold: z.coerce.number().finite().optional(),
			battery_warning_percent: z.coerce.number().int().min(0).max(100),
			active_window_start: z.string().regex(/^\d{2}:\d{2}$/),
			active_window_end: z.string().regex(/^\d{2}:\d{2}$/),
			timezone: z.string().min(1).max(100),
			alert_cooldown_hours: z.coerce.number().int().min(1).max(168),
			other_emails: z.string().max(2000).optional(),
			alert_phones: z.string().max(2000).optional(),
		});
		const data = schema.parse({
			low_temp_threshold: form.get("low_temp_threshold") || undefined,
			battery_warning_percent: form.get("battery_warning_percent"),
			active_window_start: form.get("active_window_start"),
			active_window_end: form.get("active_window_end"),
			timezone: form.get("timezone"),
			alert_cooldown_hours: form.get("alert_cooldown_hours"),
			other_emails: form.get("other_emails") ?? undefined,
			alert_phones: form.get("alert_phones") ?? undefined,
		});

		const days: number[] = [];
		for (let i = 0; i < 7; i++) if (form.get(`day_${i}`) === "on") days.push(i);
		if (days.length === 0) days.push(0, 1, 2, 3, 4, 5, 6);

		// Collect team email checkboxes
		const teamSelected: string[] = [];
		for (const u of teamUsers) {
			if (form.get(`team_${u.id}`) === "on") teamSelected.push(u.email);
		}
		// Plus any free-text "other" emails
		const others = (data.other_emails ?? "")
			.split(/[,\s]+/).map((s) => s.trim())
			.filter((s) => s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
		// Dedupe (case-insensitive)
		const seen = new Set<string>();
		const emails: string[] = [];
		for (const e of [...teamSelected, ...others]) {
			const k = e.toLowerCase();
			if (!seen.has(k)) {
				seen.add(k);
				emails.push(e);
			}
		}
		const phones = (data.alert_phones ?? "").split(/[,\s]+/).map((s) => s.trim()).filter(Boolean);

		await pool.query(
			`UPDATE devices
			    SET low_temp_threshold        = $1,
			        battery_warning_percent   = $2,
			        active_window_start       = $3,
			        active_window_end         = $4,
			        active_days               = $5,
			        timezone                  = $6,
			        alert_cooldown_hours      = $7,
			        alert_emails              = $8,
			        alert_phones              = $9
			  WHERE device_id = $10 AND customer_id = $11`,
			[
				data.low_temp_threshold ?? null,
				data.battery_warning_percent,
				data.active_window_start,
				data.active_window_end,
				days,
				data.timezone,
				data.alert_cooldown_hours,
				emails,
				phones,
				id,
				customerId,
			],
		);
		redirect(`/devices/${id}/settings?saved=1`);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-2xl">
			<div className="mb-3">
				<Link href={`/devices/${device.device_id}`} className="text-sm text-inkDim hover:text-accent">← {t("common.back")}</Link>
			</div>
			<h1 className="text-xl md:text-2xl font-semibold">{t("settings.title")}</h1>
			<p className="text-sm text-inkDim mt-1">
				{device.name}
				{device.site_name && <> · {device.site_name}</>}
			</p>
			<p className="text-xs text-inkDim mt-1 italic">{t("settings.adminOnlyNote")}</p>

			{sp.saved && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm my-4 border border-ok/30">{t("common.saved")}</div>
			)}
			{sp.snooze === "on" && (
				<div className="rounded-md bg-warn/10 text-warn px-3 py-2 text-sm my-4 border border-warn/30">{t("snooze.saved")}</div>
			)}
			{sp.snooze === "off" && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm my-4 border border-ok/30">{t("snooze.resumed")}</div>
			)}
			{sp.snooze === "invalid" && (
				<div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm my-4 border border-bad/30">{t("common.invalid")}</div>
			)}

			{/* Public sharing */}
			<SharingSection
				deviceId={id}
				token={device.public_token}
				enable={enableSharing}
				disable={disableSharing}
				locale={locale}
				t={t}
			/>

			{/* Snooze card — always visible, prominent when active */}
			<section className={`card p-4 mt-4 ${
				device.snoozed_until && new Date(device.snoozed_until).getTime() > Date.now() ? "border-warn/40" : ""
			}`}>
				<h2 className={`eyebrow mb-1 ${
					device.snoozed_until && new Date(device.snoozed_until).getTime() > Date.now() ? "text-warn" : ""
				}`}>{t("snooze.title")}</h2>
				<p className="text-xs text-inkDim mb-3">{t("snooze.note")}</p>

				{device.snoozed_until && new Date(device.snoozed_until).getTime() > Date.now() ? (
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="text-sm text-warn">
							{t("snooze.activeUntil", {
								when: new Date(device.snoozed_until).toLocaleString(locale === "nb" ? "nb-NO" : "en-US"),
							})}
						</div>
						<form action={resumeAlerts}>
							<button type="submit" className="btn-ghost text-sm">{t("snooze.resume")}</button>
						</form>
					</div>
				) : (
					<form action={setSnooze} className="flex flex-wrap gap-2 items-center">
						<span className="text-sm text-inkDim mr-1">{t("snooze.snoozeFor")}</span>
						<SnoozeBtn preset="1h" label={t("snooze.1h")} />
						<SnoozeBtn preset="8h" label={t("snooze.8h")} />
						<SnoozeBtn preset="24h" label={t("snooze.24h")} />
						<SnoozeBtn preset="7d" label={t("snooze.7d")} />
						<div className="flex items-center gap-2 ml-auto">
							<input type="datetime-local" name="until" className="input !min-h-0 !py-1 text-xs w-auto" />
							<button type="submit" name="preset" value="custom" className="btn-ghost text-sm">{t("common.save")}</button>
						</div>
					</form>
				)}
			</section>

			<form action={save} className="space-y-5 mt-4">
				<Section title={t("settings.section.thresholds")}>
					<Field label={t("settings.lowTempThreshold")}>
						<input
							name="low_temp_threshold"
							type="number"
							step="0.1"
							defaultValue={device.low_temp_threshold ?? ""}
							className="input"
							placeholder="55"
						/>
					</Field>
					<Field label={t("settings.batteryWarningPercent")}>
						<input
							name="battery_warning_percent"
							type="number"
							min={0}
							max={100}
							step={1}
							defaultValue={device.battery_warning_percent}
							className="input"
							required
						/>
					</Field>
				</Section>

				<Section title={t("settings.section.activeHours")}>
					<div className="grid grid-cols-2 gap-3">
						<Field label={t("settings.start")}>
							<input
								name="active_window_start"
								type="time"
								defaultValue={device.active_window_start.slice(0, 5)}
								className="input"
								required
							/>
						</Field>
						<Field label={t("settings.end")}>
							<input
								name="active_window_end"
								type="time"
								defaultValue={device.active_window_end.slice(0, 5)}
								className="input"
								required
							/>
						</Field>
					</div>
					<Field label={t("settings.days")}>
						<div className="flex flex-wrap gap-2">
							{DAY_KEYS.map((dk, i) => (
								<label key={i} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border cursor-pointer">
									<input
										type="checkbox"
										name={`day_${i}`}
										defaultChecked={device.active_days.includes(i)}
										className="accent-accent"
									/>
									<span className="text-sm">{tFor(locale, dk)}</span>
								</label>
							))}
						</div>
					</Field>
					<Field label={t("settings.timezone")}>
						<select name="timezone" defaultValue={device.timezone} className="input">
							{TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
						</select>
					</Field>
					<Field label={t("settings.cooldown")}>
						<input
							name="alert_cooldown_hours"
							type="number"
							min={1}
							max={168}
							defaultValue={device.alert_cooldown_hours}
							className="input"
							required
						/>
					</Field>
				</Section>

				<Section title={t("settings.section.notifications")}>
					<div>
						<div className="text-sm text-inkDim">{t("settings.teamRecipients")}</div>
						<p className="text-xs text-inkMute mt-0.5 mb-2">{t("settings.teamRecipientsNote")}</p>
						{teamUsers.length === 0 ? (
							<p className="text-xs text-inkDim italic">{t("settings.teamEmpty")}</p>
						) : (
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
								{teamUsers.map((u) => (
									<label
										key={u.id}
										className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface2/40 cursor-pointer hover:border-accent/40"
									>
										<input
											type="checkbox"
											name={`team_${u.id}`}
											defaultChecked={selectedEmailsLower.has(u.email.toLowerCase())}
											className="accent-accent"
										/>
										<span className="min-w-0 flex-1">
											<span className="block text-sm truncate">{u.email}</span>
											<span className="block text-2xs text-inkDim">
												{u.role === "customer_owner" ? t("account.role.owner") : t("account.role.member")}
											</span>
										</span>
									</label>
								))}
							</div>
						)}
					</div>
					<Field label={t("settings.otherEmails")}>
						<input
							name="other_emails"
							defaultValue={externalEmails.join(", ")}
							className="input"
							placeholder="alice@external.com, bob@external.com"
						/>
						<p className="text-xs text-inkMute mt-1">{t("settings.otherEmailsNote")}</p>
					</Field>
					<Field label={t("settings.alertPhones")}>
						<input
							name="alert_phones"
							defaultValue={device.alert_phones.join(", ")}
							className="input"
							placeholder="+4790000000, +4790000001"
						/>
					</Field>
				</Section>

				<div className="flex items-center justify-end gap-2">
					<Link href={`/devices/${device.device_id}`} className="btn-ghost">{t("common.cancel")}</Link>
					<button type="submit" className="btn-primary">{t("common.save")}</button>
				</div>
			</form>
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="card p-4 space-y-3">
			<h2 className="text-sm font-semibold text-inkDim uppercase tracking-wide">{title}</h2>
			{children}
		</div>
	);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<label className="block">
			<span className="text-sm text-inkDim">{label}</span>
			<div className="mt-1">{children}</div>
		</label>
	);
}

function SnoozeBtn({ preset, label }: { preset: string; label: string }) {
	return (
		<button type="submit" name="preset" value={preset} className="btn-ghost text-xs">
			{label}
		</button>
	);
}

async function SharingSection({
	deviceId, token, enable, disable, locale, t,
}: {
	deviceId: string;
	token: string | null;
	enable: () => Promise<void>;
	disable: () => Promise<void>;
	locale: Locale;
	t: (k: TKey, vars?: Record<string, string | number>) => string;
}) {
	const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
	const url = token ? `${base}/p/${token}` : null;
	let qrSvg: string | null = null;
	if (url) {
		try {
			const QRCode = (await import("qrcode")).default;
			qrSvg = await QRCode.toString(url, {
				type: "svg",
				margin: 1,
				color: { dark: "#0e1116", light: "#ffffff" },
				width: 240,
			});
		} catch {
			qrSvg = null;
		}
	}
	return (
		<section className="card p-4 mt-4">
			<h2 className="eyebrow mb-1">{t("share.title")}</h2>
			<p className="text-xs text-inkDim mb-3">{t("share.note")}</p>
			{token && url ? (
				<div className="space-y-3">
					<div>
						<div className="text-xs text-inkDim mb-1">{t("share.url")}</div>
						<div className="font-mono text-xs break-all bg-surface2 border border-border rounded-md px-3 py-2">
							{url}
						</div>
					</div>
					{qrSvg && (
						<div>
							<div className="text-xs text-inkDim mb-2">{t("share.qr")}</div>
							<div
								className="inline-block bg-white p-2 rounded-md"
								dangerouslySetInnerHTML={{ __html: qrSvg }}
							/>
						</div>
					)}
					<div className="flex flex-wrap gap-2">
						<a href={url} target="_blank" rel="noopener noreferrer" className="btn-ghost text-sm">
							{t("share.viewLink")}
						</a>
						<form action={disable}>
							<button type="submit" className="btn-ghost text-sm text-bad">{t("share.disable")}</button>
						</form>
					</div>
				</div>
			) : (
				<form action={enable}>
					<button type="submit" className="btn-primary text-sm">{t("share.enable")}</button>
				</form>
			)}
		</section>
	);
}
