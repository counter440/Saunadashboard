import type { Session } from "next-auth";

export function isSuperAdmin(session: Session | null): boolean {
	return !!session && session.user.role === "super_admin";
}

export function isCustomerOwner(session: Session | null): boolean {
	return !!session && session.user.role === "customer_owner";
}

export function isCustomerMember(session: Session | null): boolean {
	return !!session && session.user.role === "customer_member";
}

export function canManageTeam(session: Session | null): boolean {
	return isCustomerOwner(session);
}
