import { redirect } from "next/navigation";
import { auth } from "./auth";

export async function requireSession() {
	const session = await auth();
	if (!session?.user) redirect("/login");
	return session;
}

export async function requireCustomer() {
	const session = await requireSession();
	if (session.user.role === "super_admin") redirect("/admin");
	const customerId = session.user.customer_id;
	if (!customerId) redirect("/login");
	return { session, customerId };
}

export async function requireSuperAdmin() {
	const session = await requireSession();
	if (session.user.role !== "super_admin") redirect("/dashboard");
	return { session };
}

export async function requireCustomerOwner() {
	const { session, customerId } = await requireCustomer();
	if (session.user.role !== "customer_owner") redirect("/team");
	return { session, customerId };
}
