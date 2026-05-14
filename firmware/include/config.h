#pragma once
// ─── Pin map — LILYGO T-SIM7080G-S3 v1.0 ─────────────────────────────────
// Cross-reference with the silkscreen on your specific board.

// SIM7080G modem (used in Phase C+, declared here for completeness)
#define MODEM_RX_PIN          4    // SIM7080G TX → ESP32 RX
#define MODEM_TX_PIN          5    // SIM7080G RX ← ESP32 TX
#define MODEM_PWRKEY_PIN     41    // pulse ≥1 s to power up modem
#define MODEM_DTR_PIN        42    // drive low to wake modem from PSM
#define MODEM_RI_PIN          3    // ring indicator (wake source)
#define MODEM_POWERON_PIN    41    // same line as PWRKEY on v1.0

// Battery ADC (100k/100k divider → reads VBAT/2)
#define BAT_ADC_PIN           2
#define BAT_ADC_DIVIDER       2.0f
#define BAT_FULL_VOLTAGE      4.20f
#define BAT_EMPTY_VOLTAGE     3.00f

// MAX31865 SPI — contiguous block on the v1.0 user breakout
#define MAX_SCK_PIN           9    // Adafruit CLK
#define MAX_MISO_PIN         10    // Adafruit SDO
#define MAX_MOSI_PIN         11    // Adafruit SDI
#define MAX_CS_PIN           12
#define MAX_DRDY_PIN         13    // optional; -1 to disable polling fallback

// PT100 + Adafruit MAX31865 reference resistor
#define PT_RREF             430.0f
#define PT_NOMINAL          100.0f

// ─── Behaviour ───────────────────────────────────────────────────────────
#define DEVICE_FIRMWARE_VERSION   "0.2.1-phaseB2"

// Production cadence between wake-ups.
#define PUBLISH_INTERVAL_SEC          1800   // 30 min
// During DEBUG_BUILD we override to a much shorter interval so dev iteration
// (and ArduinoOTA discovery) is practical.
#define PUBLISH_INTERVAL_SEC_DEBUG    30

// Active window — sleep through these hours instead of doing the normal cadence.
#define ACTIVE_HOUR_START         6
#define ACTIVE_HOUR_END          24

// Whether deep sleep is enabled. DEBUG_BUILD keeps the device awake so
// ArduinoOTA + serial logs are continuously available.
#if defined(DEBUG_BUILD)
  #define DEEP_SLEEP_ENABLED 0
#else
  #define DEEP_SLEEP_ENABLED 1
#endif

// Cmd-topic listening window after each publish (ms).
#define CMD_LISTEN_MS             3000

// Local timezone (POSIX TZ string used by setenv("TZ", ...)). Used by the
// active-hour guard to decide when to sleep until 06:00.
#define DEVICE_TIMEZONE_POSIX     "CET-1CEST,M3.5.0/2,M10.5.0/3"

// MQTT
#define MQTT_TOPIC_PREFIX        "sauna"
#define MQTT_QOS                 1
