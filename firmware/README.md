# Ember firmware — LILYGO T-SIM7080G-S3 v1.0

Firmware that publishes the temperature/battery payload to the Ember MQTT
broker. Phase A targets a Wi-Fi bench setup so we can prove the data path
without waiting on a SIM. Later phases add deep sleep, LTE-M and OTA.

See `C:\Users\aseljeseth\.claude\plans\jazzy-seeking-quokka.md` for the full
multi-phase plan.

## Wiring

```
PT100 (3 wires)  ──►  MAX31865 (3-wire mode)  ──SPI──►  ESP32-S3
                       VIN  ◄── LILYGO 3V3 pad
                       GND  ◄── LILYGO GND pad
                       CLK  ─── GPIO 9
                       SDO  ─── GPIO 10
                       SDI  ─── GPIO 11
                       CS   ─── GPIO 12
                       RDY  ─── GPIO 13  (optional)
                       3V3 / 3Vo pad: leave unconnected
```

The Adafruit MAX31865 needs the `SH2` jumper closed for 3-wire mode (and `SH1`
left open). Solder side. See Adafruit's RTD tutorial.

## One-time setup

1. **PlatformIO**: install the VS Code extension *or* the CLI:
   ```powershell
   pip install platformio
   ```
2. **Provision the device in the dashboard**:
   - Sign into `/admin` as super admin.
   - **Devices → + Provision device** → enter `sauna-dev-01`.
   - Copy the one-time MQTT password.
3. **Tell Mosquitto about the device**:
   ```powershell
   docker compose -f ..\infra\docker-compose.yml exec mosquitto `
     mosquitto_passwd -b /mosquitto/config/passwd sauna-dev-01 '<PASSWORD>'
   ```
   Append to `..\infra\mosquitto\acl`:
   ```
   user sauna-dev-01
   topic write sauna/sauna-dev-01/status
   topic read  sauna/sauna-dev-01/cmd
   ```
   Reload: `docker compose -f ..\infra\docker-compose.yml kill -s HUP mosquitto`
4. **Find your bench machine's LAN IP** (e.g. `ipconfig` → `IPv4 Address`).
   Make sure port 1883 is reachable from the LILYGO (Windows Defender Firewall
   may block it by default).
5. **Create `firmware/include/secrets.h`** from `secrets.h.example` and fill in
   real Wi-Fi credentials, `MQTT_HOST = <your LAN IP>`, and the MQTT password
   from step 2.

## Build & flash (Phase A — Wi-Fi)

```powershell
cd firmware
pio run -e dev_wifi -t upload
pio device monitor -b 115200
```

You should see, every 30 seconds:

```
→ temp=21.84 °C  batt=0.00 V (0%)  rssi=-54 dBm
MQTT → sauna/sauna-dev-01/status (210 bytes)
```

Open `/devices/sauna-dev-01` as the customer and the sparkline / chart should
populate. The `apps/ingest` log shows `reading ingested device_id=sauna-dev-01 …`.

## Next phases

- **Phase B** — deep sleep + 30-min cadence + real 18650 pack.
- **Phase C** — switch to LTE-M when the Telenor SIM arrives; same publisher
  code, different transport (`pio run -e prod_lte`).
- **Phase D** — TLS, NVS-stored config, OTA partition swap.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| `MAX31865 fault: 0x80` | RTD open — check the PT100 wiring at the screw terminals |
| `Wi-Fi: timeout` | Wrong SSID/password, or the bench AP is on 5 GHz only |
| `MQTT: connect failed, state=-2` | Broker unreachable from the LILYGO (firewall, wrong IP) |
| `MQTT: connect failed, state=4` | Wrong username/password — re-check the one in `mosquitto_passwd` |
| `MQTT: connect failed, state=5` | ACL not allowing the topic — re-check `infra/mosquitto/acl` |
| `temp=nan` | RTD reading out of plausible range — usually a wiring or jumper issue |
