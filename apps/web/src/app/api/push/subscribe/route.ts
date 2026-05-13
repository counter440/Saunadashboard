import { NextResponse } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { auth } from "@/lib/auth";

const subSchema = z.object({
	endpoint: z.string().url(),
	keys: z.object({
		p256dh: z.string().min(1),
		auth: z.string().min(1),
	}),
});

export async function POST(req: Request) {
	const session = await auth();
	if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
	const json = await req.json().catch(() => null);
	const parsed = subSchema.safeParse(json);
	if (!parsed.success) return new NextResponse("Bad request", { status: 400 });
	await pool.query(
		`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (user_id, endpoint) DO UPDATE
		   SET p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
		[session.user.id, parsed.data.endpoint, parsed.data.keys.p256dh, parsed.data.keys.auth],
	);
	return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
	const session = await auth();
	if (!session?.user?.id) return new NextResponse("Unauthorized", { status: 401 });
	const json = await req.json().catch(() => null);
	const endpoint = json && typeof json.endpoint === "string" ? json.endpoint : null;
	if (!endpoint) {
		await pool.query(`DELETE FROM push_subscriptions WHERE user_id = $1`, [session.user.id]);
	} else {
		await pool.query(
			`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`,
			[session.user.id, endpoint],
		);
	}
	return NextResponse.json({ ok: true });
}
