#pragma once
#include <Arduino.h>

namespace time_util {
	/** Sync time. Wi-Fi: NTP. LTE-M: modem-provided time. */
	bool sync();

	/** Format current UTC time as "YYYY-MM-DDTHH:MM:SSZ". Writes up to 21 chars + NUL. */
	void formatIso8601(char* out, size_t outSize);

	/** True if time has been successfully synced. */
	bool isSynced();
}
