#include "time_util.h"
#include <time.h>

namespace {
	bool synced = false;
}

namespace time_util {

bool sync() {
#if defined(BUILD_WIFI)
	configTime(0, 0, "pool.ntp.org", "time.google.com");
	const uint32_t start = millis();
	struct tm timeinfo;
	while (!getLocalTime(&timeinfo, 1000)) {
		if (millis() - start > 15000) {
			log_w("NTP: timeout");
			return false;
		}
		delay(200);
	}
	log_i("NTP: synced (%s)", asctime(&timeinfo));
	synced = true;
	return true;
#else
	// LTE-M path: filled in Phase C
	return false;
#endif
}

bool isSynced() { return synced; }

void formatIso8601(char* out, size_t outSize) {
	if (!synced) {
		snprintf(out, outSize, "1970-01-01T00:00:00Z");
		return;
	}
	time_t now = ::time(nullptr);
	struct tm t;
	gmtime_r(&now, &t);
	snprintf(out, outSize, "%04d-%02d-%02dT%02d:%02d:%02dZ",
		t.tm_year + 1900, t.tm_mon + 1, t.tm_mday,
		t.tm_hour, t.tm_min, t.tm_sec);
}

} // namespace time_util
