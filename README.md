# Ember — Server & Dashboard

Multi-tenant SaaS backend + dashboard for battery-powered LTE-M sauna temperature sensors. Devices publish to MQTT; this stack ingests, stores time-series, evaluates rules, sends email/SMS alerts, and renders a mobile-first PWA dashboard.

The hardware (LILYGO T-SIM7080G-S3 + MAX31865 + PT100/PT1000, etc.) lives in a separate workstream. This repo accepts that device's MQTT contract verbatim.

## Stack

- **Broker** — Eclipse Mosquitto (TLS in prod, plaintext in dev)
- **DB** — Postgres 16 + TimescaleDB
- **Ingest** — Node + TypeScript MQTT subscriber
- **Notifier** — Node worker (`LISTEN reading_inserted` + 1-min sweep), Resend + Twilio
- **Web** — Next.js 15 (App Router) + Tailwind + shadcn/ui + Recharts, Auth.js
- **Reverse proxy** — Caddy (auto Let's Encrypt in prod)

## MQTT contract

- Topic: `sauna/<device_id>/status`
- QoS: 1, retain: false
- Payload (JSON):
  ```json
  {
    "device_id": "sauna-01",
    "temperature": 72.5,
    "battery_voltage": 3.82,
    "battery_percent": 68,
    "signal": -85,
    "timestamp": "2026-05-13T12:00:00Z"
  }
  ```

## Local dev

```bash
# 1. Install deps
pnpm install

# 2. Configure
cp .env.example .env
# edit .env if you like — defaults work locally

# 3. Bring up broker + Postgres + Caddy
pnpm infra:up

# 4. Run migrations
pnpm db:migrate

# 5. In separate terminals
pnpm dev:ingest        # MQTT → Postgres
pnpm dev:notifier      # rule evaluator
pnpm dev:web           # http://localhost:3000

# 6. Push some fake readings
pnpm fake-device --device sauna-dev-01 --interval 5
```

Sign up at http://localhost:3000/signup, then go to **Account → Claim device** and enter `sauna-dev-01`.

## Deploy (single-VPS pilot)

1. Provision a Hetzner CX22 / DO Droplet (2 vCPU, 4 GB).
2. Install Docker + Docker Compose, clone the repo.
3. Set `APP_HOSTNAME`, real `RESEND_API_KEY`, real `TWILIO_*`, strong DB + MQTT passwords in `.env`.
4. Point DNS for `APP_HOSTNAME` at the VPS.
5. `pnpm infra:up && pnpm db:migrate`.

Caddy will auto-issue a Let's Encrypt certificate. Mosquitto exposes 8883 (TLS) using the same certificate via the `tls_cert_file` mount.

## Repo layout

```
apps/web         Next.js dashboard (PWA)
apps/ingest      MQTT → Postgres
apps/notifier    rule evaluator + email/SMS
packages/shared  Zod payload schema + shared types
infra/           docker-compose + Mosquitto + Caddy + db migrations
scripts/         fake-device.ts + migrate.ts
```
