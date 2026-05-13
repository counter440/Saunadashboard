import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

const { auth } = NextAuth(authConfig);

export default auth((req) => {
	const { nextUrl } = req;
	const session = req.auth;
	const user = session?.user;
	const path = nextUrl.pathname;

	const isPublic =
		path === "/login" ||
		path.startsWith("/api/auth") ||
		path === "/" ||
		path.startsWith("/icon-") ||
		path === "/favicon.ico" ||
		path === "/manifest.webmanifest" ||
		path === "/sw.js";
	if (isPublic && !user) return NextResponse.next();

	if (!user) {
		const url = nextUrl.clone();
		url.pathname = "/login";
		return NextResponse.redirect(url);
	}

	const role = user.role;
	const mustChange = user.must_change_password;

	// First-login forced password change — block everything else until done.
	if (mustChange && path !== "/account/change-password" && !path.startsWith("/api/auth")) {
		const url = nextUrl.clone();
		url.pathname = "/account/change-password";
		return NextResponse.redirect(url);
	}

	if (path.startsWith("/admin")) {
		if (role !== "super_admin") {
			const url = nextUrl.clone();
			url.pathname = "/dashboard";
			return NextResponse.redirect(url);
		}
		return NextResponse.next();
	}

	// Super admins land on /admin, not the customer portal.
	if (role === "super_admin" && (path === "/" || path === "/login" || path === "/dashboard")) {
		const url = nextUrl.clone();
		url.pathname = "/admin";
		return NextResponse.redirect(url);
	}

	return NextResponse.next();
});

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-.*|manifest\\.webmanifest|sw\\.js).*)"],
};
