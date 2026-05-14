#include "net.h"
#include "config.h"
#include "../include/secrets.h"

#if defined(BUILD_WIFI)

#include <WiFi.h>
#if defined(MQTT_USE_TLS) && MQTT_USE_TLS
  #include <WiFiClientSecure.h>
  #include "certs.h"
#endif
#include "time_util.h"

namespace {
#if defined(MQTT_USE_TLS) && MQTT_USE_TLS
	WiFiClientSecure tlsClient;
#else
	WiFiClient plainClient;
#endif
}

namespace net {

bool begin() {
	WiFi.mode(WIFI_STA);
	WiFi.setSleep(WIFI_PS_MIN_MODEM); // light sleep between beacons
	WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
	const uint32_t start = millis();
	log_i("Wi-Fi: connecting to %s …", WIFI_SSID);
	while (WiFi.status() != WL_CONNECTED) {
		if (millis() - start > 20000) {
			log_e("Wi-Fi: timeout");
			return false;
		}
		delay(200);
	}
	log_i("Wi-Fi: connected, ip=%s rssi=%d dBm", WiFi.localIP().toString().c_str(), WiFi.RSSI());

#if defined(MQTT_USE_TLS) && MQTT_USE_TLS
	// Sync NTP before configuring TLS — mbedTLS rejects cert validity windows
	// against the default 1970 system clock.
	if (!time_util::isSynced()) {
		time_util::sync();
	}
	tlsClient.setCACert(LE_ROOT_CA_BUNDLE);
	tlsClient.setHandshakeTimeout(20);
	log_i("MQTT: TLS enabled, CA pinned to ISRG Root X1+X2");
#endif
	return true;
}

Client& client() {
#if defined(MQTT_USE_TLS) && MQTT_USE_TLS
	return tlsClient;
#else
	return plainClient;
#endif
}

int    signalDbm()    { return WiFi.RSSI(); }
bool   isConnected()  { return WiFi.status() == WL_CONNECTED; }

} // namespace net

#elif defined(BUILD_LTE)

#include "modem.h"
#include "time_util.h"

namespace net {

bool begin() {
	if (!modem::begin()) return false;
	// Once on cellular, NTP via UDP works the same way over the modem's PPP link.
	if (!time_util::isSynced()) time_util::sync();
	return true;
}

Client& client()      { return modem::client(); }
int     signalDbm()   { return modem::signalDbm(); }
bool    isConnected() { return modem::isConnected(); }

} // namespace net

#else
#error "Define BUILD_WIFI or BUILD_LTE in platformio.ini"
#endif
