import { randomBytes } from "node:crypto";

/**
 * Returns a base64url string with ~14 characters of entropy.
 * Safe to copy/paste from email. Distinct from session tokens.
 */
export function generateTempPassword(): string {
	return randomBytes(12).toString("base64url");
}

/**
 * Mosquitto password — slightly longer, no padding, alphanumeric-friendly.
 */
export function generateMqttPassword(): string {
	return randomBytes(18).toString("base64url");
}
