#pragma once
#include <Arduino.h>

namespace sensor {
	/** Initialize MAX31865 in 3-wire mode with the configured pins. */
	void begin();

	/** Read RTD and convert to °C. Returns NAN on read failure. */
	float readTemperatureC();
}
