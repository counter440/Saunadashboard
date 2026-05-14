#include "battery.h"
#include "config.h"

namespace battery {

void begin() {
	analogReadResolution(12);
	analogSetAttenuation(ADC_11db); // 0..~3.3 V range
}

float readVoltage() {
	// 8-sample average — cheap noise reduction.
	uint32_t accum = 0;
	for (int i = 0; i < 8; i++) {
		accum += analogReadMilliVolts(BAT_ADC_PIN);
	}
	const float mv = accum / 8.0f;
	return (mv / 1000.0f) * BAT_ADC_DIVIDER;
}

int percentFromVoltage(float v) {
	if (v <= 0.05f) return 0; // nothing on the line
	const float span = BAT_FULL_VOLTAGE - BAT_EMPTY_VOLTAGE;
	const float frac = (v - BAT_EMPTY_VOLTAGE) / span;
	const int pct = (int)(frac * 100.0f + 0.5f);
	if (pct < 0) return 0;
	if (pct > 100) return 100;
	return pct;
}

} // namespace battery
