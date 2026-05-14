#include "sleep.h"
#include "config.h"
#include <esp_sleep.h>
#include <time.h>
#if defined(BUILD_LTE)
  #include "modem.h"
#endif

// Persists across deep sleep — RTC slow memory.
RTC_DATA_ATTR static uint32_t s_snoozeUntil = 0;

namespace pwr {

void setSnoozeUntilEpoch(uint32_t epoch) { s_snoozeUntil = epoch; }
uint32_t getSnoozeUntilEpoch() { return s_snoozeUntil; }

static uint64_t computeSleepMicros() {
	const uint32_t now = (uint32_t)::time(nullptr);

	// Snooze override
	if (s_snoozeUntil != 0 && s_snoozeUntil > now) {
		const uint64_t s = (uint64_t)(s_snoozeUntil - now);
		log_i("sleep: snooze active, %llu s until wake", s);
		return s * 1000000ULL;
	} else if (s_snoozeUntil != 0 && s_snoozeUntil <= now) {
		// Snooze elapsed — clear it
		s_snoozeUntil = 0;
	}

	// Need a synced clock for active-window logic. If unsynced (just rebooted,
	// no NTP yet), fall back to fixed-interval sleep.
	if (now < 1700000000) {
		log_w("sleep: clock unsynced, falling back to %d s", PUBLISH_INTERVAL_SEC);
		return (uint64_t)PUBLISH_INTERVAL_SEC * 1000000ULL;
	}

	setenv("TZ", DEVICE_TIMEZONE_POSIX, 1);
	tzset();
	struct tm local;
	time_t t = (time_t)now;
	localtime_r(&t, &local);

	// If we're inside the sleep window [00:00, ACTIVE_HOUR_START), sleep until ACTIVE_HOUR_START.
	if (local.tm_hour < ACTIVE_HOUR_START) {
		struct tm wake = local;
		wake.tm_hour = ACTIVE_HOUR_START;
		wake.tm_min  = 0;
		wake.tm_sec  = 0;
		const time_t wakeT = mktime(&wake);
		const int64_t deltaS = (int64_t)wakeT - (int64_t)now;
		log_i("sleep: night mode, %lld s until %02d:00", (long long)deltaS, ACTIVE_HOUR_START);
		const int64_t capped = (deltaS > 0 && deltaS < 6*3600) ? deltaS : (PUBLISH_INTERVAL_SEC);
		return (uint64_t)capped * 1000000ULL;
	}

	return (uint64_t)PUBLISH_INTERVAL_SEC * 1000000ULL;
}

[[noreturn]] void sleepUntilNextCycle() {
#if DEEP_SLEEP_ENABLED
	const uint64_t us = computeSleepMicros();
	log_i("→ deep sleep for %.1f s", us / 1e6f);
#if defined(BUILD_LTE)
	// Hand the modem off to PSM so it stays attached but quiescent. T3412 ≈ 3 h
	// covers the worst-case 30-min cycle with margin; the network won't make us
	// re-attach unless we exceed that.
	modem::enablePSM();
#endif
	Serial.flush();
	esp_sleep_enable_timer_wakeup(us);
	esp_deep_sleep_start();
	__builtin_unreachable();
#else
	log_i("→ debug delay for %d s (deep sleep disabled)", PUBLISH_INTERVAL_SEC_DEBUG);
	delay(PUBLISH_INTERVAL_SEC_DEBUG * 1000UL);
	ESP.restart();
	__builtin_unreachable();
#endif
}

} // namespace pwr
