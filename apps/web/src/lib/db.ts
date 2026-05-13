import pg from "pg";

declare global {
	// eslint-disable-next-line no-var
	var __saunaPool: pg.Pool | undefined;
}

function getPool(): pg.Pool {
	if (global.__saunaPool) return global.__saunaPool;
	const url = process.env.DATABASE_URL;
	if (!url) throw new Error("DATABASE_URL is required");
	const pool = new pg.Pool({ connectionString: url, max: 10 });
	global.__saunaPool = pool;
	return pool;
}

/** Lazy-initialized pool. Safe to import at build time without env. */
export const pool: pg.Pool = new Proxy({} as pg.Pool, {
	get(_, prop) {
		const real = getPool() as unknown as Record<string | symbol, unknown>;
		const value = real[prop];
		return typeof value === "function" ? (value as Function).bind(real) : value;
	},
});

export async function q<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
	const r = await getPool().query(sql, params);
	return r.rows as T[];
}

export async function q1<T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> {
	const r = await getPool().query(sql, params);
	return (r.rows[0] as T) ?? null;
}
