/** Row in the `devices` table (subset used outside the DB layer). */
export interface DeviceRow {
	id: string;
	device_id: string;
	name: string;
	customer_id: string | null;
	site_id: string | null;
	site_name: string | null; // joined from sites for display in alert bodies
	low_temp_threshold: number | null;
	battery_warning_threshold: number;
	battery_warning_percent: number;
	last_seen: Date | null;
	last_temp: number | null;
	last_battery_voltage: number | null;
	last_battery_percent: number | null;
	last_signal: number | null;
	active_window_start: string; // 'HH:MM:SS'
	active_window_end: string;
	active_days: number[]; // 0=Sun..6=Sat
	timezone: string; // IANA tz, e.g. "Europe/Oslo"
	alert_cooldown_hours: number;
	alert_emails: string[];
	alert_phones: string[];
	snoozed_until: Date | null;
}

export interface ReadingRow {
	device_id: string;
	created_at: Date;
	temperature: number;
	battery_voltage: number | null;
	battery_percent: number | null;
	signal_strength: number | null;
}

export type NotificationKind = "low_temp" | "low_battery" | "offline";
export type NotificationChannel = "email" | "sms";
export type NotificationStatus = "sent" | "failed" | "dry_run";

export interface NotificationEventRow {
	id: string;
	device_id: string;
	kind: NotificationKind;
	fired_at: Date;
	reading_at: Date | null;
	temperature: number | null;
	battery_voltage: number | null;
	channel: NotificationChannel;
	destination: string;
	status: NotificationStatus;
	error: string | null;
}
