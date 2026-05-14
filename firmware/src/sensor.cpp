#include "sensor.h"
#include <SPI.h>
#include <Adafruit_MAX31865.h>
#include "config.h"

namespace {
	// Hardware SPI: just pass CS. The bus pins are configured by SPI.begin().
	Adafruit_MAX31865 rtd(MAX_CS_PIN);
}

namespace sensor {

void begin() {
	// SPI.begin(SCK, MISO, MOSI [, SS]) — claims the pins for the FSPI peripheral.
	SPI.begin(MAX_SCK_PIN, MAX_MISO_PIN, MAX_MOSI_PIN, MAX_CS_PIN);
	// 2-wire mode: most permissive. Cheap GY-MAX31865 clones don't always
	// implement the 3-wire internal trace switching the same way as Adafruit's
	// breakout, so 2-wire is the safe default. We lose a degree or so of
	// lead-resistance comp; irrelevant for sauna monitoring.
	rtd.begin(MAX31865_2WIRE);
	log_i("MAX31865 init  (2-wire, ref=%.1f, nominal=%.1f, hardware SPI)", PT_RREF, PT_NOMINAL);
}

float readTemperatureC() {
	const uint16_t raw = rtd.readRTD();
	const float ratio = raw / 32768.0f;
	const float resistance = ratio * PT_RREF;
	log_d("MAX31865 RTD raw=0x%04X (%.3f * %.0f = %.2f Ω)", raw, ratio, PT_RREF, resistance);

	const uint8_t fault = rtd.readFault();
	if (fault) {
		log_w("MAX31865 fault: 0x%02X (raw=0x%04X, R=%.2f Ω)", fault, raw, resistance);
		rtd.clearFault();
	}

	const float t = rtd.temperature(PT_NOMINAL, PT_RREF);
	if (t < -100.0f || t > 600.0f) {
		log_w("MAX31865 implausible reading: %.2f °C (raw=0x%04X, R=%.2f Ω)", t, raw, resistance);
		return NAN;
	}
	return t;
}

} // namespace sensor
