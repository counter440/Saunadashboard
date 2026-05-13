import { q } from "@/lib/db";
import { SparklineClient } from "./sparkline-client";

export async function Sparkline({ deviceId }: { deviceId: string }) {
	const rows = await q<{ created_at: Date; temperature: number }>(
		`SELECT created_at, temperature::float8 AS temperature
		   FROM temperature_readings
		  WHERE device_id = $1 AND created_at > now() - INTERVAL '24 hours'
		  ORDER BY created_at ASC`,
		[deviceId],
	);
	if (rows.length === 0) {
		return <div className="text-xs text-inkDim italic h-full grid place-items-center">no data yet</div>;
	}
	const points = rows.map((r) => ({ t: new Date(r.created_at).getTime(), v: Number(r.temperature) }));
	return <SparklineClient points={points} />;
}
