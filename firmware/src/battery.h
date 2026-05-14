#pragma once
#include <Arduino.h>

namespace battery {
	void begin();

	/** Volts at the pack terminals. Returns 0.0 if the ADC isn't seeing anything. */
	float readVoltage();

	/** Linear map between BAT_EMPTY_VOLTAGE and BAT_FULL_VOLTAGE (0..100, integer). */
	int   percentFromVoltage(float v);
}
