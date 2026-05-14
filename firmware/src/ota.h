#pragma once
#include <Arduino.h>

namespace ota {
	/** Configure ArduinoOTA (mDNS-based push from PIO over LAN). DEBUG_BUILD only. */
	void beginArduinoOTA();

	/** Pump pending OTA traffic. Call inside any DEBUG_BUILD wait loop. */
	void pumpArduinoOTA();

	/** Phase B2: download an image over HTTPS, verify sha256, swap, reboot.
	 *  Returns false on any failure (download, hash, partition write); never
	 *  returns on success (device reboots into the new partition). */
	bool performHttpsOTA(const char* url, const char* expected_sha256_hex);
}
