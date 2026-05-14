import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pool } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";

const MAX_FW_BYTES = 4 * 1024 * 1024; // 4 MB

export default async function NewFirmwarePage({
	searchParams,
}: { searchParams: Promise<{ error?: string }> }) {
	const { session } = await requireSuperAdmin();
	const { t } = await getT();
	const sp = await searchParams;

	async function upload(form: FormData) {
		"use server";
		const { session } = await requireSuperAdmin();
		const schema = z.object({
			version: z.string().min(1).max(40).regex(/^[A-Za-z0-9._+-]+$/),
			channel: z.enum(["stable", "beta"]),
			notes:   z.string().max(2000).optional(),
		});
		const parsed = schema.safeParse({
			version: form.get("version"),
			channel: form.get("channel"),
			notes:   form.get("notes") || undefined,
		});
		if (!parsed.success) redirect("/admin/firmware/new?error=invalid");

		const file = form.get("file");
		if (!(file instanceof File) || file.size === 0) redirect("/admin/firmware/new?error=invalid");
		const f = file as File;
		if (!f.name.toLowerCase().endsWith(".bin")) redirect("/admin/firmware/new?error=fileType");
		if (f.size > MAX_FW_BYTES) redirect("/admin/firmware/new?error=tooLarge");

		// Save to public/fw so Next.js (and Caddy in front of it) can serve directly.
		const dir = join(process.cwd(), "public", "fw");
		await mkdir(dir, { recursive: true });
		const filename = `ember-${parsed.data.version}-${parsed.data.channel}.bin`;
		const buf = Buffer.from(await f.arrayBuffer());
		const sha = createHash("sha256").update(buf).digest("hex");
		await writeFile(join(dir, filename), buf);

		try {
			await pool.query(
				`INSERT INTO firmware_releases (version, channel, filename, size_bytes, sha256, release_notes, uploaded_by)
				 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
				[parsed.data.version, parsed.data.channel, filename, buf.length, sha, parsed.data.notes ?? null, session.user.id],
			);
		} catch (err) {
			const msg = (err as Error).message;
			if (msg.includes("firmware_releases_version_channel_key")) {
				redirect("/admin/firmware/new?error=versionExists");
			}
			throw err;
		}
		redirect("/admin/firmware?saved=1");
	}

	const errMsg =
		sp.error === "fileType" ? t("admin.firmware.new.error.fileType")
		: sp.error === "tooLarge" ? t("admin.firmware.new.error.tooLarge")
		: sp.error === "versionExists" ? t("admin.firmware.new.error.versionExists")
		: sp.error ? t("admin.firmware.new.error.invalid")
		: null;

	return (
		<div className="px-4 py-5 md:py-6 max-w-xl">
			<div className="mb-3">
				<Link href="/admin/firmware" className="text-sm text-inkDim hover:text-accent">← {t("admin.firmware.title")}</Link>
			</div>
			<h1 className="text-xl md:text-2xl font-semibold mb-4">{t("admin.firmware.new.title")}</h1>
			<form action={upload} className="space-y-4 card p-4">
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.firmware.new.version")}</span>
					<input name="version" required pattern="[A-Za-z0-9._+\-]+" maxLength={40} className="input mt-1 font-mono" placeholder="0.2.1" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.firmware.new.channel")}</span>
					<select name="channel" defaultValue="stable" className="input mt-1">
						<option value="stable">{t("admin.firmware.new.channel.stable")}</option>
						<option value="beta">{t("admin.firmware.new.channel.beta")}</option>
					</select>
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.firmware.new.notes")}</span>
					<textarea name="notes" rows={3} className="input py-2" />
				</label>
				<label className="block">
					<span className="text-sm text-inkDim">{t("admin.firmware.new.file")}</span>
					<input
						type="file"
						name="file"
						accept=".bin,application/octet-stream"
						required
						className="block text-sm text-inkDim mt-1 file:mr-3 file:btn-ghost file:text-xs file:cursor-pointer"
					/>
					<span className="text-2xs text-inkMute mt-1 block">SHA-256 is computed automatically.</span>
				</label>
				{errMsg && <div className="rounded-md bg-bad/10 text-bad px-3 py-2 text-sm border border-bad/30">{errMsg}</div>}
				<div className="flex justify-end gap-2">
					<Link href="/admin/firmware" className="btn-ghost">{t("common.cancel")}</Link>
					<button type="submit" className="btn-primary">{t("admin.firmware.new.submit")}</button>
				</div>
			</form>
		</div>
	);
}
