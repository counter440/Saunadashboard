#pragma once
#include <Arduino.h>
#include <Client.h>

// SIM7080G driver — used when BUILD_LTE is set. Compile-only validated in
// Phase C; first real-network test happens when the Telenor SIM arrives.
namespace modem {
	/** Power on the SIM7080G, run AT init, force LTE-M, set APN, attach to PDP.
	 *  Returns true on success. Safe to call once per wake. */
	bool begin();

	/** Underlying network client (TLS) for PubSubClient to wrap. */
	Client& client();

	/** Signal strength in dBm (converted from CSQ). 0 if unknown. */
	int signalDbm();

	/** True after a successful begin() and PDP attach. */
	bool isConnected();

	/** Enable PSM with T3412 ≈ 3 h (periodic TAU) and T3324 ≈ 2 s (active timer).
	 *  Call this before sleep so the modem can save state with the network. */
	bool enablePSM();

	/** Power down the modem cleanly (AT+CPOWD=1) before deep sleep. */
	void powerOff();
}
