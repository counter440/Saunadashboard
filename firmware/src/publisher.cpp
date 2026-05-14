#include "publisher.h"
#include "config.h"
#include "net.h"
#include "time_util.h"
#include "../include/secrets.h"

#include <ArduinoJson.h>
#include <PubSubClient.h>

namespace {
	PubSubClient* mqtt = nullptr;
	String topic;
}

namespace publisher {

void begin() {
	mqtt = new PubSubClient(net::client());
	mqtt->setServer(MQTT_HOST, MQTT_PORT);
	mqtt->setBufferSize(512);
	mqtt->setKeepAlive(60);
	topic = String(MQTT_TOPIC_PREFIX) + "/" + DEVICE_ID + "/status";
	log_i("MQTT: broker %s:%d topic %s", MQTT_HOST, MQTT_PORT, topic.c_str());
}

PubSubClient* mqttClient() { return mqtt; }

static bool ensureConnected() {
	if (mqtt->connected()) return true;
	const String clientId = String(DEVICE_ID) + "-" + String(random(0xffff), HEX);
	log_i("MQTT: connecting as %s …", clientId.c_str());
	const bool ok = mqtt->connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD);
	if (!ok) {
		log_e("MQTT: connect failed, state=%d", mqtt->state());
	}
	return ok;
}

bool publish(const Reading& r) {
	if (!net::isConnected()) {
		log_w("publish: link not up, skipping");
		return false;
	}
	if (!ensureConnected()) return false;

	JsonDocument doc;
	doc["device_id"]       = DEVICE_ID;
	if (!isnan(r.temperatureC)) {
		doc["temperature"] = round(r.temperatureC * 100.0f) / 100.0f;
	} else {
		doc["temperature"] = nullptr;
	}
	doc["battery_voltage"] = round(r.batteryVoltage * 100.0f) / 100.0f;
	doc["battery_percent"] = r.batteryPercent;
	doc["signal"]          = r.signalDbm;
	doc["fw"]              = DEVICE_FIRMWARE_VERSION;

	char ts[24];
	time_util::formatIso8601(ts, sizeof(ts));
	doc["timestamp"]       = ts;

	char buf[512];
	const size_t len = serializeJson(doc, buf, sizeof(buf));
	const bool ok = mqtt->publish(topic.c_str(), reinterpret_cast<const uint8_t*>(buf), len, false);
	if (ok) {
		log_i("MQTT → %s (%u bytes)", topic.c_str(), (unsigned)len);
		log_d("payload: %s", buf);
	} else {
		log_e("MQTT publish failed, state=%d", mqtt->state());
	}
	// Pump the loop so the publish actually goes out before we sleep.
	for (int i = 0; i < 5; i++) { mqtt->loop(); delay(50); }
	return ok;
}

} // namespace publisher
