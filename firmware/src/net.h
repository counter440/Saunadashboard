#pragma once
#include <Arduino.h>
#include <Client.h>

namespace net {
	/** Bring up Wi-Fi (Phase A/B) or LTE-M (Phase C+) depending on build flag. */
	bool begin();

	/** Underlying network client for PubSubClient to wrap. */
	Client& client();

	/** RSSI in dBm. */
	int signalDbm();

	/** True if the data link is up. */
	bool isConnected();
}
