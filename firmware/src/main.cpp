// Ember sauna firmware — Phase B
//
// PRODUCTION (DEEP_SLEEP_ENABLED): one-shot lifecycle in setup() then deep sleep.
// DEBUG_BUILD: setup() inits + first publish, loop() repeats forever (no resets,
//   USB-CDC + ArduinoOTA stay reachable continuously).

#include <Arduino.h>
#if defined(BUILD_WIFI)
#include <WiFi.h>
#endif
#include <esp_sleep.h>
#include <esp_ota_ops.h>

#include "config.h"
#include "../include/secrets.h"
#include "sensor.h"
#include "battery.h"
#include "net.h"
#include "publisher.h"
#include "time_util.h"
#include "ota.h"
#include "cmd.h"
#include "sleep.h"

static bool s_publisherReady = false;

static const char* wakeCauseStr(esp_sleep_wakeup_cause_t c) {
	switch (c) {
		case ESP_SLEEP_WAKEUP_TIMER:    return "timer";
		case ESP_SLEEP_WAKEUP_EXT0:     return "ext0";
		case ESP_SLEEP_WAKEUP_EXT1:     return "ext1";
		case ESP_SLEEP_WAKEUP_TOUCHPAD: return "touch";
		case ESP_SLEEP_WAKEUP_ULP:      return "ulp";
		default:                        return "power-on";
	}
}

static bool ensureNetReady() {
	if (net::isConnected() && s_publisherReady) return true;
	if (!net::begin()) return false;
	if (!time_util::isSynced()) time_util::sync();
	if (!s_publisherReady) {
		publisher::begin();
		s_publisherReady = true;
#if defined(BUILD_WIFI) && defined(DEBUG_BUILD)
		ota::beginArduinoOTA();
#endif
	}
	return true;
}

static void doOneCycle() {
	publisher::Reading r;
	r.temperatureC   = sensor::readTemperatureC();
	r.batteryVoltage = battery::readVoltage();
	r.batteryPercent = battery::percentFromVoltage(r.batteryVoltage);
	r.signalDbm      = net::signalDbm();
	log_i("→ temp=%.2f °C  batt=%d%%  rssi=%d dBm",
		r.temperatureC, r.batteryPercent, r.signalDbm);
	publisher::publish(r);

	cmd::pumpCommandsFor(CMD_LISTEN_MS);
#if defined(BUILD_WIFI) && defined(DEBUG_BUILD)
	// Give ArduinoOTA a brief look-in too (cmd path + ArduinoOTA both stay reachable).
	const uint32_t until = millis() + 500;
	while (millis() < until) { ota::pumpArduinoOTA(); delay(20); }
#endif

	const esp_partition_t* running = esp_ota_get_running_partition();
	esp_ota_img_states_t state;
	if (running && esp_ota_get_state_partition(running, &state) == ESP_OK) {
		if (state == ESP_OTA_IMG_PENDING_VERIFY) {
			esp_ota_mark_app_valid_cancel_rollback();
			log_i("OTA: marked image valid (rollback cancelled)");
		}
	}
}

void setup() {
	Serial.begin(115200);
	Serial.setTxTimeoutMs(0); // don't block if USB-CDC host isn't reading
	delay(500);
	const auto wakeCause = esp_sleep_get_wakeup_cause();
	log_i("---- Ember %s wake (%s) ----", DEVICE_FIRMWARE_VERSION, wakeCauseStr(wakeCause));
	Serial.flush();

	sensor::begin();
	battery::begin();

#if DEEP_SLEEP_ENABLED
	// Production: do everything in setup(), then deep sleep.
	if (!ensureNetReady()) {
		log_e("net::begin failed — sleeping until next cycle");
		pwr::sleepUntilNextCycle();
	}
	doOneCycle();
	pwr::sleepUntilNextCycle();
#endif
	// DEBUG_BUILD falls through to loop() — no deep sleep, USB stays alive.
}

void loop() {
#if !DEEP_SLEEP_ENABLED
	if (!ensureNetReady()) {
		log_e("net not ready, retry in 30 s");
		delay(30000);
		return;
	}
	doOneCycle();
	// Wait for next debug cycle while pumping OTA
	const uint32_t cycleEnd = millis() + (uint32_t)PUBLISH_INTERVAL_SEC_DEBUG * 1000UL;
	while (millis() < cycleEnd) {
#if defined(BUILD_WIFI) && defined(DEBUG_BUILD)
		ota::pumpArduinoOTA();
#endif
		delay(50);
	}
#endif
}
