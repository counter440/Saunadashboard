import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { pool } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { generateMqttPassword } from "@/lib/random";
import { getT } from "@/lib/i18n.server";

export default async function ProvisionDevicePage({
	searchParams,
}: { searchParams: Promise<{ error?: string; device?: string; pw?: string }> }) {
	await requireSuperAdmin();
	const { t } = await getT();
	const sp = await searchParams;

	async function create(form: FormData) {
		"use server";
		await requireSuperAdmin();
		const schema = z.object({
			device_id: z.string().min(1).max(64).regex(/^[A-Za-z0-9_-]+$/),
			name: z.string().min(1).max(100),
		});
		const parsed = schema.safeParse({
			device_id: form.get("device_id"),
			name: form.get("name"),
		});
		if (!parsed.success) redirect("/admin/devices/new?error=invalid");

		const existing = await pool.query<{ id: string }>(`SELECT id FROM devices WHERE device_id = $1`, [parsed.data.device_id]);
		if ((existing.rowCount ?? 0) > 0) redirect("/admin/devices/new?error=exists");

		const mqttPassword = generateMqttPassword();
		await pool.query(
			`INSERT INTO devices (device_id, name, mqtt_username) VALUES ($1, $2, $1)`,
			[parsed.data.device_id, parsed.data.name],
		);
		redirect(`/admin/devices/new?device=${encodeURIComponent(parsed.data.device_id)}&pw=${encodeURIComponent(mqttPassword)}`);
	}

	return (
		<div className="px-4 py-5 md:py-6 max-w-xl">
			<div className="mb-3">
				<Link href="/admin/devices" className="text-sm text-inkDim hover:text-accent">{t("admin.deviceDetail.back")}</Link>
			</div>
			<h1 className="text-xl md:text-2xl font-semibold mb-4">{t("admin.provision.title")}</h1>

			{sp.device && sp.pw ? (
				<div className="card p-4 space-y-3">
					<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30">
						{t("admin.provision.created", { id: sp.device })}
					</div>
					<div>
						<div className="text-xs text-inkDim mb-1">{t("admin.provision.mqttUser")}</div>
						<div className="font-mono break-all">{sp.device}</div>
					</div>
					<div>
						<div className="text-xs text-inkDim mb-1">{t("admin.provision.mqttPass")}</div>
						<div className="font-mono break-all p-2 rounded-md border border-warn/40 bg-warn/5 text-warn">{sp.pw}</div>
					</div>
					<div className="rounded-md bg-surface2 p-3 text-xs">
						<div className="mb-1 font-medium">{t("admin.provision.howToAdd")}</div>
						<pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed">
docker compose -f infra/docker-compose.yml exec mosquitto \
  mosquitto_passwd -b /mosquitto/config/passwd {sp.device} '{sp.pw}'
docker compose -f infra/docker-compose.yml kill -s HUP mosquitto
						</pre>
					</div>
					<div className="flex gap-2">
						<Link href={`/admin/devices/${sp.device}`} className="btn-primary text-sm">{t("admin.provision.openDevice")}</Link>
						<Link href="/admin/devices/new" className="btn-ghost text-sm">{t("admin.provision.another")}</Link>
					</div>
				</div>
			) : (
				<form action={create} className="space-y-4 card p-4">
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.provision.deviceId")}</span>
						<input name="device_id" required pattern="[A-Za-z0-9_-]+" className="input mt-1 font-mono" placeholder="sauna-01" />
					</label>
					<label className="block">
						<span className="text-sm text-inkDim">{t("admin.provision.name")}</span>
						<input name="name" required maxLength={100} className="input mt-1" placeholder={t("admin.provision.namePlaceholder")} />
					</label>
					{sp.error === "exists" && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{t("admin.provision.error.exists")}</div>}
					{sp.error === "invalid" && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{t("admin.provision.error.invalid")}</div>}
					<div className="flex justify-end gap-2">
						<Link href="/admin/devices" className="btn-ghost">{t("common.cancel")}</Link>
						<button type="submit" className="btn-primary">{t("admin.provision.submit")}</button>
					</div>
				</form>
			)}
		</div>
	);
}
