#include "modem.h"

#if defined(BUILD_LTE)

#include "config.h"
#include "../include/secrets.h"

// TinyGSM types are selected by TINY_GSM_MODEM_SIM7080 (set in platformio.ini).
#include <TinyGsmClient.h>

namespace {
	// HardwareSerial #1 — pins from config.h. SIM7080G defaults to 115200 8N1.
	HardwareSerial   modemSerial(1);
	TinyGsm          gsm(modemSerial);
	TinyGsmClientSecure tlsClient(gsm);
	bool             s_attached = false;

	void powerOnPulse() {
		pinMode(MODEM_PWRKEY_PIN, OUTPUT);
		// SIM7080G: pull PWRKEY low ≥ 1 s to start; release; wait for boot.
		digitalWrite(MODEM_PWRKEY_PIN, HIGH);
		delay(100);
		digitalWrite(MODEM_PWRKEY_PIN, LOW);
		delay(1100);
		digitalWrite(MODEM_PWRKEY_PIN, HIGH);
		// SIM7080G boots in ~3 s; AT becomes responsive shortly after.
		delay(3000);
	}
}

namespace modem {

bool begin() {
	if (s_attached) return true;

	// DTR low keeps the modem from sleeping while we talk to it. Drive low here;
	// enablePSM() will release it (DTR high) at the end of the wake.
	pinMode(MODEM_DTR_PIN, OUTPUT);
	digitalWrite(MODEM_DTR_PIN, LOW);

	modemSerial.begin(115200, SERIAL_8N1, MODEM_RX_PIN, MODEM_TX_PIN);
	delay(100);

	powerOnPulse();

	log_i("modem: AT init …");
	if (!gsm.init()) {
		log_e("modem: init() failed");
		return false;
	}
	log_i("modem: %s", gsm.getModemInfo().c_str());

	// Force LTE-M only (CAT-M1). 38 = LTE only; CMNB=1 = CAT-M.
	gsm.sendAT(GF("+CNMP=38"));
	gsm.waitResponse();
	gsm.sendAT(GF("+CMNB=1"));
	gsm.waitResponse();

	// APN + PDP context.
	gsm.sendAT(GF("+CGDCONT=1,\"IP\",\""), CELLULAR_APN, GF("\""));
	gsm.waitResponse();

	log_i("modem: waiting for network …");
	if (!gsm.waitForNetwork(60000L)) {
		log_e("modem: no network after 60 s");
		return false;
	}
	log_i("modem: registered (operator=%s)", gsm.getOperator().c_str());

	if (!gsm.gprsConnect(CELLULAR_APN, CELLULAR_USER, CELLULAR_PASS)) {
		log_e("modem: gprsConnect failed");
		return false;
	}
	log_i("modem: GPRS attached, ip=%s", gsm.getLocalIP().c_str());

	s_attached = true;
	return true;
}

Client& client() { return tlsClient; }

int signalDbm() {
	const int csq = gsm.getSignalQuality();      // 0..31, 99 = unknown
	if (csq == 99 || csq < 0) return 0;
	return -113 + 2 * csq;                       // standard CSQ → dBm map
}

bool isConnected() { return s_attached && gsm.isGprsConnected(); }

bool enablePSM() {
	// T3412 (periodic TAU) ≈ 3 h, T3324 (active timer) ≈ 2 s.
	// Encoded per 3GPP TS 24.008 timer 3 / timer 2 octets:
	//   T3412 "01000011" = 3h (3 × 1h base), T3324 "00000001" = 2 s.
	gsm.sendAT(GF("+CPSMS=1,,,\"01000011\",\"00000001\""));
	const bool ok = gsm.waitResponse(2000L) == 1;
	if (ok) {
		log_i("modem: PSM enabled (T3412≈3h, T3324≈2s)");
		// Release DTR so the modem can drop to PSM after the active timer.
		digitalWrite(MODEM_DTR_PIN, HIGH);
	} else {
		log_w("modem: CPSMS rejected by network");
	}
	return ok;
}

void powerOff() {
	gsm.sendAT(GF("+CPOWD=1"));
	gsm.waitResponse(10000L, GF("NORMAL POWER DOWN"));
	s_attached = false;
}

} // namespace modem

#endif // BUILD_LTE
