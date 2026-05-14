#pragma once
#include <Arduino.h>

namespace pwr {
	/** Sleep until the next scheduled wake. Never returns when DEEP_SLEEP_ENABLED;
	 *  in DEBUG_BUILD it delays then resets so the one-shot lifecycle still loops. */
	[[noreturn]] void sleepUntilNextCycle();

	/** Override the next wake time (used by snooze command). Pass an absolute
	 *  Unix epoch in seconds, or 0 to clear. Stored in RTC slow memory so it
	 *  survives deep sleep. */
	void setSnoozeUntilEpoch(uint32_t epoch);
	uint32_t getSnoozeUntilEpoch();
}
