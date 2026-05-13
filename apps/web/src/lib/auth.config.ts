import type { NextAuthConfig, DefaultSession } from "next-auth";

declare module "next-auth" {
	interface Session {
		user: DefaultSession["user"] & {
			id: string;
			customer_id: string | null;
			role: "super_admin" | "customer_owner" | "customer_member";
			must_change_password: boolean;
		};
	}
}

// JWT extensions are accessed via index keys in the callbacks below — keeps us
// independent of next-auth's internal JWT module path which differs across betas.

/**
 * Edge-safe NextAuth config — used in middleware. Does NOT include the
 * Credentials provider (which needs bcrypt + DB). The full config in `auth.ts`
 * imports this and adds providers.
 */
export const authConfig = {
	secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
	session: { strategy: "jwt" },
	pages: { signIn: "/login" },
	trustHost: true,
	providers: [],
	callbacks: {
		jwt: async ({ token, user }) => {
			if (user) {
				const u = user as {
					id: string;
					customer_id: string | null;
					role: "super_admin" | "customer_owner" | "customer_member";
					must_change_password: boolean;
				};
				token.id = u.id;
				token.customer_id = u.customer_id;
				token.role = u.role;
				token.must_change_password = u.must_change_password;
			}
			return token;
		},
		session: async ({ session, token }) => {
			session.user.id = (token.id ?? "") as string;
			session.user.customer_id = (token.customer_id ?? null) as string | null;
			session.user.role = (token.role ?? "customer_member") as Session["user"]["role"];
			session.user.must_change_password = Boolean(token.must_change_password);
			return session;
		},
	},
} satisfies NextAuthConfig;

type Session = import("next-auth").Session;
