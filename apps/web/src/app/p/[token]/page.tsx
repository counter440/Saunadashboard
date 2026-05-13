import { notFound } from "next/navigation";
import { q1 } from "@/lib/db";
import { getT } from "@/lib/i18n.server";
import { relativeFromNowI18n } from "@/lib/i18n";

interface PublicDevice {
	name: string;
	image_path: string | null;
	site_name: string | null;
	last_temp: number | null;
	last_seen: Date | null;
	low_temp_threshold: number | null;
}

export const dynamic = "force-dynamic";

export default async function PublicStatusPage({ params }: { params: Promise<{ token: string }> }) {
	const { t, locale } = await getT();
	const { token } = await params;

	const device = await q1<PublicDevice>(
		`SELECT d.name, d.image_path, s.name AS site_name,
		        d.last_temp::float8 AS last_temp,
		        d.last_seen,
		        d.low_temp_threshold::float8 AS low_temp_threshold
		   FROM devices d
		   LEFT JOIN sites s ON s.id = d.site_id
		  WHERE d.public_token = $1`,
		[token],
	);
	if (!device) notFound();

	const temp = device.last_temp;
	const inRange =
		temp !== null &&
		device.low_temp_threshold !== null &&
		Number(temp) >= device.low_temp_threshold;
	const tempColor =
		temp === null ? "text-inkDim"
		: device.low_temp_threshold !== null && Number(temp) < device.low_temp_threshold ? "text-bad"
		: "text-ok";

	return (
		<div className="min-h-screen bg-bg grid place-items-center p-4">
			<div className="w-full max-w-md">
				<div className="card overflow-hidden shadow-lift">
					{/* Hero image */}
					<div className="relative aspect-[16/9] bg-surface2">
						{device.image_path ? (
							// eslint-disable-next-line @next/next/no-img-element
							<img src={device.image_path} alt={device.name} className="absolute inset-0 h-full w-full object-cover" />
						) : (
							<div className="absolute inset-0 grid place-items-center text-inkMute">
								<svg viewBox="0 0 64 64" className="h-16 w-16 opacity-40" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
									<path d="M8 56h48M12 56V24l20-12 20 12v32M22 56v-16h20v16" />
									<path d="M28 22c2 2 0 4 2 6M34 22c2 2 0 4 2 6" />
								</svg>
							</div>
						)}
					</div>

					<div className="p-6 text-center">
						<div className="eyebrow">{t("share.publicSubtitle")}</div>
						<h1 className="text-xl font-semibold mt-1">{device.name}</h1>
						{device.site_name && <p className="text-sm text-inkDim mt-0.5">{device.site_name}</p>}

						<div className={`mt-6 ${tempColor}`}>
							<span className="text-7xl font-semibold tabular-nums leading-none">
								{temp === null ? "—" : Number(temp).toFixed(1)}
							</span>
							<span className="text-4xl font-semibold ml-1">°C</span>
						</div>

						<div className="mt-3 text-xs text-inkDim">
							{t("status.lastSeen")}: {relativeFromNowI18n(locale, device.last_seen)}
						</div>
					</div>
				</div>
				<p className="text-center text-2xs text-inkMute uppercase tracking-[0.18em] mt-6">Ember</p>
			</div>
		</div>
	);
}
