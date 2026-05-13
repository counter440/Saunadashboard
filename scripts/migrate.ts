import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import pg from "pg";

loadEnv();

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "..", "infra", "db", "migrations");

const url = process.env.DATABASE_URL;
if (!url) {
	console.error("DATABASE_URL not set");
	process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

await client.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  );
`);

const applied = new Set<string>(
	(await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(
		(r) => r.name,
	),
);

const files = readdirSync(MIGRATIONS_DIR)
	.filter((f) => f.endsWith(".sql"))
	.sort();

for (const file of files) {
	if (applied.has(file)) {
		console.log(`✓ ${file} (already applied)`);
		continue;
	}
	const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
	console.log(`→ applying ${file}`);
	await client.query("BEGIN");
	try {
		await client.query(sql);
		await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
		await client.query("COMMIT");
		console.log(`✓ ${file}`);
	} catch (err) {
		await client.query("ROLLBACK");
		console.error(`✗ ${file} failed`, err);
		process.exit(1);
	}
}

await client.end();
console.log("migrations complete");
