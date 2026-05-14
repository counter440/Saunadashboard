import Link from "next/link";
import { q } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { getT } from "@/lib/i18n.server";

interface Row {
	id: string;
	version: string;
	channel: string;
	filename: string;
	size_bytes: number;
	sha256: string;
	release_notes: string | null;
	uploader_email: string | null;
	created_at: Date;
}

export default async function FirmwareListPage({
	searchParams,
}: { searchParams: Promise<{ saved?: string }> }) {
	await requireSuperAdmin();
	const { t, locale } = await getT();
	const sp = await searchParams;
	const rows = await q<Row>(
		`SELECT f.id, f.version, f.channel, f.filename, f.size_bytes, f.sha256,
		        f.release_notes, u.email AS uploader_email, f.created_at
		   FROM firmware_releases f
		   LEFT JOIN users u ON u.id = f.uploaded_by
		   ORDER BY f.created_at DESC`,
	);
	return (
		<div className="px-4 py-5 md:py-6 max-w-5xl">
			<div className="flex items-center justify-between mb-4">
				<h1 className="text-xl md:text-2xl font-semibold">{t("admin.firmware.title")}</h1>
				<Link href="/admin/firmware/new" className="btn-primary text-sm">{t("admin.firmware.upload")}</Link>
			</div>

			{sp.saved && (
				<div className="rounded-md bg-ok/10 text-ok px-3 py-2 text-sm border border-ok/30 mb-4">{t("admin.firmware.uploaded")}</div>
			)}

			{rows.length === 0 ? (
				<div className="card p-6 text-center text-inkDim">{t("admin.firmware.empty")}</div>
			) : (
				<div className="card overflow-x-auto">
					<table className="min-w-full text-sm">
						<thead className="text-inkDim">
							<tr>
								<th className="text-left px-4 py-2 font-medium">{t("admin.firmware.col.version")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.firmware.col.channel")}</th>
								<th className="text-right px-4 py-2 font-medium">{t("admin.firmware.col.size")}</th>
								<th className="text-left px-4 py-2 font-medium">SHA-256</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.firmware.col.notes")}</th>
								<th className="text-left px-4 py-2 font-medium">{t("admin.firmware.col.uploaded")}</th>
							</tr>
						</thead>
						<tbody>
							{rows.map((f) => (
								<tr key={f.id} className="border-t border-border">
									<td className="px-4 py-2 font-mono">{f.version}</td>
									<td className="px-4 py-2">
										<span className={f.channel === "beta" ? "pill-warn" : "pill-ok"}>{f.channel}</span>
									</td>
									<td className="px-4 py-2 text-right tabular-nums">{(f.size_bytes / 1024).toFixed(0)} KB</td>
									<td className="px-4 py-2 font-mono text-2xs text-inkDim truncate max-w-[180px]" title={f.sha256}>{f.sha256.slice(0, 12)}…</td>
									<td className="px-4 py-2 text-inkDim text-xs truncate max-w-[200px]" title={f.release_notes ?? ""}>{f.release_notes ?? "—"}</td>
									<td className="px-4 py-2 text-xs text-inkDim">
										{new Date(f.created_at).toLocaleString(locale === "nb" ? "nb-NO" : "en-US")}
										{f.uploader_email && <> · {f.uploader_email}</>}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
