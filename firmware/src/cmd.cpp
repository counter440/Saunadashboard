#include "cmd.h"
#include "config.h"
#include "ota.h"
#include "publisher.h"
#include "sleep.h"
#include "../include/secrets.h"

#include <ArduinoJson.h>
#include <PubSubClient.h>

namespace cmd {

namespace {
	String topic;
	bool   subscribed     = false;
	bool   messageHandled = false;
	char   incomingBuf[512];

	void onMessage(char* t, byte* payload, unsigned int len) {
		if (len >= sizeof(incomingBuf)) {
			log_w("cmd: payload %u too large, dropping", len);
			return;
		}
		memcpy(incomingBuf, payload, len);
		incomingBuf[len] = '\0';
		log_i("cmd ← %s: %s", t, incomingBuf);

		JsonDocument doc;
		auto err = deserializeJson(doc, incomingBuf);
		if (err) {
			log_w("cmd: JSON parse failed (%s)", err.c_str());
			return;
		}
		const char* type = doc["type"] | "";
		if (strcmp(type, "ota") == 0) {
			const char* url = doc["url"]    | "";
			const char* sha = doc["sha256"] | "";
			if (!url[0] || !sha[0] || strlen(sha) != 64) {
				log_w("cmd ota: missing/invalid url or sha256");
			} else {
				log_i("cmd ota: starting fetch %s", url);
				// performHttpsOTA reboots into the new partition on success.
				ota::performHttpsOTA(url, sha);
				log_w("cmd ota: returned without reboot — install failed");
			}
		} else if (strcmp(type, "reboot") == 0) {
			log_i("cmd: reboot requested");
			delay(200);
			ESP.restart();
		} else if (strcmp(type, "force_publish") == 0) {
			log_i("cmd: force_publish (already published this cycle, no-op)");
		} else if (strcmp(type, "snooze") == 0) {
			uint32_t until = doc["until_epoch"] | 0u;
			pwr::setSnoozeUntilEpoch(until);
			log_i("cmd: snooze until epoch %u", (unsigned)until);
		} else {
			log_w("cmd: unknown type '%s'", type);
		}
		messageHandled = true;
	}
}

void pumpCommandsFor(uint32_t ms) {
	PubSubClient* mqtt = publisher::mqttClient();
	if (!mqtt || !mqtt->connected()) {
		log_w("cmd: MQTT not connected, skipping");
		return;
	}
	if (!subscribed) {
		topic = String(MQTT_TOPIC_PREFIX) + "/" + DEVICE_ID + "/cmd";
		mqtt->setCallback(onMessage);
		if (mqtt->subscribe(topic.c_str(), 1)) {
			log_i("cmd: subscribed to %s", topic.c_str());
			subscribed = true;
		} else {
			log_e("cmd: subscribe failed (state=%d)", mqtt->state());
			return;
		}
	}
	messageHandled = false;
	const uint32_t until = millis() + ms;
	while ((int32_t)(until - millis()) > 0) {
		mqtt->loop();
		delay(50);
		if (messageHandled) break;
	}
}

} // namespace cmd
