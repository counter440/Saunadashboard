#pragma once
#include <Arduino.h>

namespace cmd {
	/** Subscribe to `sauna/<device_id>/cmd` (if not already) and pump the MQTT
	 *  loop for up to `ms` milliseconds, dispatching any incoming JSON commands.
	 *  Recognised: {"type":"ota","url":..,"sha256":..,"version":..},
	 *  {"type":"reboot"}, {"type":"snooze","until_epoch":..},
	 *  {"type":"force_publish"} (no-op — we already published this cycle).
	 *  Stops early as soon as one command is processed. */
	void pumpCommandsFor(uint32_t ms);
}
