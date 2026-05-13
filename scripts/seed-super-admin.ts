/**
 * Bootstrap the first super-admin user. Idempotent — running again with the same
 * email updates the password.
 *
 *   pnpm seed:super-admin --email me@example.com --password '...'
 */
import { config as loadEnv } from "dotenv";
import bcrypt from "bcryptjs";
import pg from "pg";

loadEnv();

const args = parseArgs(process.argv.slice(2));
const email = (args.email as string | undefined)?.toLowerCase();
const password = args.password as string | undefined;

if (!email || !password) {
	console.error("usage: pnpm seed:super-admin --email <email> --password <password>");
	process.exit(1);
}
if (password.length < 8) {
	console.error("password must be at least 8 characters");
	process.exit(1);
}
if (!process.env.DATABASE_URL) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const r = await client.query(
	`INSERT INTO users (customer_id, email, password_hash, role, must_change_password)
	 VALUES (NULL, $1, $2, 'super_admin', false)
	 ON CONFLICT (email) DO UPDATE
	   SET password_hash = EXCLUDED.password_hash,
	       role          = 'super_admin',
	       customer_id   = NULL,
	       must_change_password = false
	 RETURNING id`,
	[email, hash],
);
console.log(`✓ super_admin ${email} ready (user.id=${r.rows[0]!.id})`);
await client.end();

function parseArgs(argv: string[]): Record<string, string | true> {
	const out: Record<string, string | true> = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!;
		if (!a.startsWith("--")) continue;
		const key = a.slice(2);
		const next = argv[i + 1];
		if (next && !next.startsWith("--")) {
			out[key] = next;
			i++;
		} else {
			out[key] = true;
		}
	}
	return out;
}
