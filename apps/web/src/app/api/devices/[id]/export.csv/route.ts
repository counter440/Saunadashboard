import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { requireCustomer } from "@/lib/session";

const RANGES: Record<string, string> = {
	"24h": "1 day",
	"7d":  "7 days",
	"30d": "30 days",
	"90d": "90 days",
	all:   "100 years",
};

export async function GET(
	req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { customerId } = await requireCustomer();
	const { id } = await params;
	const url = new URL(req.url);
	const rangeKey = url.searchParams.get("range") ?? "30d";
	const interval = RANGES[rangeKey] ?? RANGES["30d"]!;

	// Verify the device belongs to this customer (avoid cross-tenant leakage)
	const device = await q1<{ name: string }>(
		`SELECT name FROM devices WHERE device_id = $1 AND customer_id = $2`,
		[id, customerId],
	);
	if (!device) return new NextResponse("Not found", { status: 404 });

	const rows = await q<{
		created_at: Date;
		temperature: number;
		battery_percent: number | null;
		battery_voltage: number | null;
		signal_strength: number | null;
	}>(
		`SELECT created_at,
		        temperature::float8 AS temperature,
		        battery_percent,
		        battery_voltage::float8 AS battery_voltage,
		        signal_strength
		   FROM temperature_readings
		  WHERE device_id = $1 AND created_at > now() - $2::interval
		  ORDER BY created_at ASC`,
		[id, interval],
	);

	const header = "timestamp,temperature_c,battery_percent,battery_voltage,signal_dbm\n";
	const lines = rows
		.map((r) => [
			new Date(r.created_at).toISOString(),
			Number(r.temperature).toFixed(2),
			r.battery_percent ?? "",
			r.battery_voltage !== null ? Number(r.battery_voltage).toFixed(2) : "",
			r.signal_strength ?? "",
		].join(","))
		.join("\n");

	const filename = `${id}-${rangeKey}-${new Date().toISOString().slice(0, 10)}.csv`;
	return new NextResponse(header + lines + "\n", {
		headers: {
			"Content-Type": "text/csv; charset=utf-8",
			"Content-Disposition": `attachment; filename="${filename}"`,
			"Cache-Control": "no-store",
		},
	});
}
