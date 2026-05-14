#pragma once
#include <Arduino.h>

class PubSubClient;

namespace publisher {
	void begin();

	/** Underlying MQTT client (valid after begin()). cmd module uses it to
	 *  subscribe to the cmd topic and pump after a publish. */
	PubSubClient* mqttClient();

	struct Reading {
		float temperatureC;   // NAN if read failed
		float batteryVoltage;
		int   batteryPercent;
		int   signalDbm;
	};

	/** Connect (if needed), publish the payload at QoS 1, return true on PUBACK. */
	bool publish(const Reading& r);
}
