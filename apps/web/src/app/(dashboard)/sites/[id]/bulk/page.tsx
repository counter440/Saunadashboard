import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { pool, q, q1 } from "@/lib/db";
import { requireCustomer } from "@/lib/session";
import { getT } from "@/lib/i18n.server";
import { tFor, type TKey } from "@/lib/i18n";

interface Site { id: string; name: string; }
interface Device { id: string; device_id: string; name: string; }

const DAY_KEYS: TKey[] = ["day.sun", "day.mon", "day.tue", "day.wed", "day.thu", "day.fri", "day.sat"];
const TIMEZONES = ["Europe/Oslo", "Europe/Stockholm", "Europe/Helsinki", "Europe/Copenhagen", "Europe/London", "UTC"];

export default async function BulkEditPage({
	params,
	searchParams,
}: {
	params: Promise<{ id: string }>;
	searchParams: Promise<{ saved?: string; n?: string }>;
}) {
	const { customerId } = await requireCustomer();
	const { t, locale } = await getT();
	const { id } = await params;
	const sp = await searchParams;

	const isUnassigned = id === "unassigned";
	let site: Site | null = null;
	let devices: Device[];

	if (isUnassigned) {
		devices = await q<Device>(
			`SELECT id, device_id, name FROM devices WHERE site_id IS NULL AND customer_id = $1 ORDER BY name`,
			[customerId],
		);
	} else {
		site = await q1<Site>(`SELECT id, name FROM sites WHERE id = $1 AND customer_id = $2`, [id, customerId]);
		if (!site) notFound();
		devices = await q<Device>(
			`SELECT id, device_id, name FROM devices WHERE site_id = $1 AND customer_id = $2 ORDER BY name`,
			[id, customerId],
		);
	}
	if (devices.length === 0) notFound();

	async function bulkUpdate(form: FormData) {
		"use server";
		const { customerId } = await requireCustomer();
		const selectedIds = devices.filter((d) => form.get(`pick_${d.id}`) === "on").map((d) => d.device_id);
		if (selectedIds.length === 0) redirect(`/sites/${id}/bulk?saved=none`);

		const sets: string[] = [];
		const args: unknown[] = [];

		const include = (field: string) => form.get(`apply_${field}`) === "on";
		const num = (k: string) => Number(form.get(k));
		const str = (k: string) => String(form.get(k) ?? "");

		if (include("low_temp")) {
			const v = num("low_temp_threshold");
			args.push(isFinite(v) ? v : null);
			sets.push(`low_temp_threshold = $${args.length}`);
		}
		if (include("battery_pct")) {
			const p = z.coerce.number().int().min(0).max(100).safeParse(form.get("battery_warning_percent"));
			if (p.success) { args.push(p.data); sets.push(`battery_warning_percent = $${args.length}`); }
		}
		if (include("active_hours")) {
			const start = str("active_window_start");
			const end = str("active_window_end");
			if (/^\d{2}:\d{2}$/.test(start) && /^\d{2}:\d{2}$/.test(end)) {
				args.push(start); sets.push(`active_window_start = $${args.length}`);
				args.push(end);   sets.push(`active_window_end   = $${args.length}`);
				const days: number[] = [];
				for (let i = 0; i < 7; i++) if (form.get(`day_${i}`) === "on") days.push(i);
				args.push(days.length > 0 ? days : [0, 1, 2, 3, 4, 5, 6]);
				sets.push(`active_days = $${args.length}`);
			}
		}
		if (include("timezone")) {
			args.push(str("timezone")); sets.push(`timezone = $${args.length}`);
		}
		if (sets.length === 0) redirect(`/sites/${id}/bulk?saved=nofields`);

		args.push(selectedIds);
		args.push(customerId);
		const sql = `UPDATE devices SET ${sets.join(", ")}
		             WHERE device_id = ANY($${args.length - 1}) AND customer_id = $${args.length}`;
		const r = await pool.query(sql, args);
		redirect(`/sites/${id}/bulk?saved=ok&n=${r.rowCount ?? 0}`);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-3xl space-y-5">
			<div>
				<Link href={`/sites/${id}`} className="text-sm text-inkDim hover:text-accent">← {site?.name ?? t("dashboard.unassigned")}</Link>
			</div>
			<header>
				<h1 className="text-xl md:text-2xl font-semibold">{t("bulk.title")}</h1>
				<p className="text-sm text-inkDim mt-1">{t("bulk.note")}</p>
			</header>

			{sp.saved === "ok" && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">
					{t("bulk.success", { n: sp.n ?? "0" })}
				</div>
			)}
			{sp.saved === "none" && (
				<div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{t("bulk.noneSelected")}</div>
			)}
			{sp.saved === "nofields" && (
				<div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{t("bulk.noFields")}</div>
			)}

			<form action={bulkUpdate} className="space-y-5">
				<section className="card p-4">
					<h2 className="eyebrow mb-2">{t("bulk.selectSaunas")} ({devices.length})</h2>
					<ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
						{devices.map((d) => (
							<li key={d.id}>
								<label className="flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-surface2/40 cursor-pointer hover:border-accent/40">
									<input type="checkbox" name={`pick_${d.id}`} defaultChecked className="accent-accent" />
									<span className="text-sm truncate">{d.name}</span>
									<span className="ml-auto text-2xs text-inkMute font-mono shrink-0">{d.device_id}</span>
								</label>
							</li>
						))}
					</ul>
				</section>

				<BulkField name="low_temp" label={t("settings.lowTempThreshold")}>
					<input name="low_temp_threshold" type="number" step="0.1" className="input" placeholder="55" />
				</BulkField>

				<BulkField name="battery_pct" label={t("settings.batteryWarningPercent")}>
					<input name="battery_warning_percent" type="number" min={0} max={100} step={1} className="input" placeholder="10" />
				</BulkField>

				<BulkField name="active_hours" label={t("settings.section.activeHours")}>
					<div className="grid grid-cols-2 gap-3">
						<label className="block">
							<span className="text-sm text-inkDim">{t("settings.start")}</span>
							<input name="active_window_start" type="time" defaultValue="00:00" className="input mt-1" />
						</label>
						<label className="block">
							<span className="text-sm text-inkDim">{t("settings.end")}</span>
							<input name="active_window_end" type="time" defaultValue="23:59" className="input mt-1" />
						</label>
					</div>
					<div className="mt-2 flex flex-wrap gap-2">
						{DAY_KEYS.map((dk, i) => (
							<label key={i} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border cursor-pointer">
								<input type="checkbox" name={`day_${i}`} defaultChecked className="accent-accent" />
								<span className="text-sm">{tFor(locale, dk)}</span>
							</label>
						))}
					</div>
				</BulkField>

				<BulkField name="timezone" label={t("settings.timezone")}>
					<select name="timezone" defaultValue="Europe/Oslo" className="input">
						{TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
					</select>
				</BulkField>

				<div className="flex items-center justify-end gap-2">
					<Link href={`/sites/${id}`} className="btn-ghost">{t("common.cancel")}</Link>
					<button type="submit" className="btn-primary">{t("bulk.applyButton", { n: devices.length })}</button>
				</div>
			</form>
		</div>
	);
}

function BulkField({ name, label, children }: { name: string; label: string; children: React.ReactNode }) {
	return (
		<section className="card p-4">
			<label className="flex items-center gap-2 mb-3 cursor-pointer">
				<input type="checkbox" name={`apply_${name}`} className="accent-accent" />
				<span className="eyebrow">{label}</span>
			</label>
			<div className="opacity-75">{children}</div>
		</section>
	);
}
