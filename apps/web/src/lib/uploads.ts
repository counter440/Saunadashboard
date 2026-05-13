import "server-only";
import { mkdir, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const UPLOAD_ROOT = join(process.cwd(), "public", "uploads", "devices");
const MAX_BYTES = 3 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
	"image/jpeg": "jpg",
	"image/png": "png",
	"image/webp": "webp",
};

export type UploadResult =
	| { ok: true; publicPath: string }
	| { ok: false; reason: "too-large" | "invalid-type" | "empty" };

/**
 * Save an uploaded image to /public/uploads/devices/<deviceId>.<ext>.
 * Removes any prior file with the same deviceId base before writing the new one.
 * Returns the public URL path on success.
 */
export async function saveDeviceImage(deviceId: string, file: File): Promise<UploadResult> {
	if (!file || file.size === 0) return { ok: false, reason: "empty" };
	if (file.size > MAX_BYTES) return { ok: false, reason: "too-large" };
	const ext = MIME_EXT[file.type];
	if (!ext) return { ok: false, reason: "invalid-type" };

	await mkdir(UPLOAD_ROOT, { recursive: true });
	await removeExistingFor(deviceId);

	const filename = `${deviceId}.${ext}`;
	const buf = Buffer.from(await file.arrayBuffer());
	await writeFile(join(UPLOAD_ROOT, filename), buf);
	// Add a cache-busting query string (the path itself stays stable)
	return { ok: true, publicPath: `/uploads/devices/${filename}?v=${Date.now()}` };
}

export async function removeDeviceImage(deviceId: string): Promise<void> {
	await removeExistingFor(deviceId);
}

async function removeExistingFor(deviceId: string) {
	try {
		const files = await readdir(UPLOAD_ROOT);
		await Promise.all(
			files
				.filter((f) => f.startsWith(`${deviceId}.`))
				.map((f) => unlink(join(UPLOAD_ROOT, f)).catch(() => {})),
		);
	} catch {
		// directory may not exist yet
	}
}
