import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { q1 } from "./db";
import { authConfig } from "./auth.config";

const credentialsSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
	...authConfig,
	providers: [
		Credentials({
			credentials: { email: {}, password: {} },
			authorize: async (raw) => {
				const parsed = credentialsSchema.safeParse(raw);
				if (!parsed.success) return null;
				const user = await q1<{
					id: string;
					customer_id: string | null;
					email: string;
					password_hash: string;
					role: "super_admin" | "customer_owner" | "customer_member";
					must_change_password: boolean;
				}>(
					`SELECT u.id, u.customer_id, u.email, u.password_hash, u.role, u.must_change_password
					   FROM users u
					   LEFT JOIN customers c ON c.id = u.customer_id
					  WHERE u.email = $1
					    AND (u.role = 'super_admin' OR c.status = 'active')`,
					[parsed.data.email],
				);
				if (!user) return null;
				const ok = await bcrypt.compare(parsed.data.password, user.password_hash);
				if (!ok) return null;
				return {
					id: user.id,
					email: user.email,
					customer_id: user.customer_id,
					role: user.role,
					must_change_password: user.must_change_password,
				} as never;
			},
		}),
	],
});
