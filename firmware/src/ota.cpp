#include "ota.h"
#include "config.h"
#include "certs.h"
#include "../include/secrets.h"

#include <Update.h>
#include <HTTPClient.h>
#include <mbedtls/sha256.h>

#if defined(BUILD_WIFI)
  #include <WiFi.h>
  #include <WiFiClientSecure.h>
#endif
#if defined(BUILD_WIFI) && defined(DEBUG_BUILD)
  #include <ArduinoOTA.h>
  #include <ESPmDNS.h>
#endif

namespace ota {

#if defined(BUILD_WIFI) && defined(DEBUG_BUILD)
static bool s_otaReady = false;

void beginArduinoOTA() {
	if (s_otaReady) return;
	const String hostname = String("ember-") + DEVICE_ID;
	ArduinoOTA.setHostname(hostname.c_str());
	// Use the MQTT password as the OTA password — already a strong per-device secret.
	ArduinoOTA.setPassword(MQTT_PASSWORD);
	ArduinoOTA
		.onStart([]() { log_i("ArduinoOTA: start"); })
		.onEnd([]()   { log_i("ArduinoOTA: done"); })
		.onProgress([](unsigned int p, unsigned int t) {
			static unsigned int lastPct = 0;
			unsigned int pct = (p * 100) / t;
			if (pct >= lastPct + 10) { log_i("ArduinoOTA: %u%%", pct); lastPct = pct; }
		})
		.onError([](ota_error_t err) { log_e("ArduinoOTA error: %u", err); });
	ArduinoOTA.begin();
	s_otaReady = true;
	log_i("ArduinoOTA listening as %s.local on %s", hostname.c_str(), WiFi.localIP().toString().c_str());
}

void pumpArduinoOTA() {
	if (s_otaReady) ArduinoOTA.handle();
}
#else
void beginArduinoOTA() {}
void pumpArduinoOTA() {}
#endif

#if defined(BUILD_WIFI)
static bool fetchAndApply(WiFiClientSecure& secure, const char* url, const char* expected_sha256_hex) {
	HTTPClient http;
	http.setTimeout(15000);
	if (!http.begin(secure, url)) {
		log_e("OTA: http.begin failed for %s", url);
		return false;
	}
	const int code = http.GET();
	if (code != HTTP_CODE_OK) {
		log_e("OTA: HTTP %d", code);
		http.end();
		return false;
	}
	const int total = http.getSize();
	if (total <= 0) {
		log_e("OTA: invalid Content-Length %d", total);
		http.end();
		return false;
	}
	log_i("OTA: downloading %d bytes from %s", total, url);

	if (!Update.begin(total)) {
		log_e("OTA: Update.begin: %s", Update.errorString());
		http.end();
		return false;
	}

	mbedtls_sha256_context sha;
	mbedtls_sha256_init(&sha);
	mbedtls_sha256_starts(&sha, 0);

	WiFiClient* stream = http.getStreamPtr();
	uint8_t buf[1024];
	int written = 0;
	int lastPct = 0;
	uint32_t lastByteAt = millis();
	while (written < total) {
		const size_t avail = stream->available();
		if (avail == 0) {
			if (millis() - lastByteAt > 10000) {
				log_e("OTA: stream stalled at %d/%d", written, total);
				break;
			}
			delay(20);
			continue;
		}
		const size_t toRead = avail > sizeof(buf) ? sizeof(buf) : avail;
		const int n = stream->readBytes(buf, toRead);
		if (n <= 0) { delay(10); continue; }
		mbedtls_sha256_update(&sha, buf, n);
		if ((int)Update.write(buf, n) != n) {
			log_e("OTA: Update.write: %s", Update.errorString());
			mbedtls_sha256_free(&sha);
			Update.abort();
			http.end();
			return false;
		}
		written += n;
		lastByteAt = millis();
		const int pct = (written * 100) / total;
		if (pct >= lastPct + 10) { log_i("OTA: %d%% (%d/%d)", pct, written, total); lastPct = pct; }
	}
	http.end();

	uint8_t digest[32];
	mbedtls_sha256_finish(&sha, digest);
	mbedtls_sha256_free(&sha);
	char hex[65];
	for (int i = 0; i < 32; i++) sprintf(hex + i * 2, "%02x", digest[i]);
	hex[64] = '\0';

	if (written != total) {
		log_e("OTA: short read %d/%d", written, total);
		Update.abort();
		return false;
	}
	if (strcasecmp(hex, expected_sha256_hex) != 0) {
		log_e("OTA: sha256 mismatch  expected=%s  got=%s", expected_sha256_hex, hex);
		Update.abort();
		return false;
	}
	if (!Update.end(true)) {
		log_e("OTA: Update.end: %s", Update.errorString());
		return false;
	}
	log_i("OTA: install OK, rebooting into new partition");
	delay(500);
	ESP.restart();
	return true; // unreachable
}
#endif

bool performHttpsOTA(const char* url, const char* expected_sha256_hex) {
#if defined(BUILD_WIFI)
	if (!url || !expected_sha256_hex) return false;
	WiFiClientSecure secure;
	secure.setCACert(LE_ROOT_CA_BUNDLE);
	secure.setTimeout(15);
	return fetchAndApply(secure, url, expected_sha256_hex);
#else
	(void)url; (void)expected_sha256_hex;
	log_w("performHttpsOTA: LTE OTA not implemented yet (Phase C)");
	return false;
#endif
}

} // namespace ota
