import { NextResponse } from "next/server";
import { q, q1 } from "@/lib/db";
import { requireCustomer } from "@/lib/session";

interface DeviceSnapshot {
	last_temp: number | null;
	last_seen: Date | null;
	last_battery_percent: number | null;
	last_signal: number | null;
}
interface RecentRow {
	created_at: Date;
	temperature: number;
	battery_percent: number | null;
}

export async function GET(
	_req: Request,
	{ params }: { params: Promise<{ id: string }> },
) {
	const { customerId } = await requireCustomer();
	const { id } = await params;

	const device = await q1<DeviceSnapshot>(
		`SELECT last_temp::float8       AS last_temp,
		        last_seen,
		        last_battery_percent,
		        last_signal
		   FROM devices
		  WHERE device_id = $1 AND customer_id = $2`,
		[id, customerId],
	);
	if (!device) return NextResponse.json({ error: "not found" }, { status: 404 });

	const recent = await q<RecentRow>(
		`SELECT created_at,
		        temperature::float8 AS temperature,
		        battery_percent
		   FROM temperature_readings
		  WHERE device_id = $1
		  ORDER BY created_at DESC
		  LIMIT 30`,
		[id],
	);

	return NextResponse.json({
		last_temp: device.last_temp,
		last_seen: device.last_seen,
		last_battery_percent: device.last_battery_percent,
		last_signal: device.last_signal,
		recent,
	}, {
		headers: { "Cache-Control": "no-store" },
	});
}
