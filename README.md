# VoltWise
**IoT Rule Engineering, Telemetry & Fault Verification Workbench**

VoltWise is a portfolio-grade prototype for ingesting simulated electrical telemetry, injecting communication faults, authoring constrained alert rules, and running automated verification checks.

It is designed around industrial electrical-monitoring concepts such as voltage, current, power factor, THD, energy, and relay state tracking. All telemetry and hardware responses are simulated in software.

## What works
- **Telemetry Ingestion & Schema Guard:** REST and optional MQTT (`voltwise/telemetry/<deviceId>`) ingestion with strict bounds validation for voltage, current, power factor, THD, and energy.
- **Idempotency & Deduplication:** Rejects repeated non-empty `messageId` values during the current server process. The in-memory cache is bounded to 2,000 IDs; deduplication is not retained across restarts or shared between server instances.
- **Heartbeat & Recovery Monitoring:** Reports devices `OFFLINE` after 15 seconds without telemetry and measures recovery time in milliseconds when telemetry resumes. These states are process-local and simulated.
- **Fault Injection & Relay ACK Bench:** Interactive workbench to simulate link drops, duplicate replays, malformed packets, and relay command ACK timeouts.
- **Automated 5-Step Verification Suite:** One-click runner checks baseline ingestion, duplicate rejection, schema guard behavior, simulated relay timeout detection, and heartbeat recovery timing.
- **Bulk Device Onboarding:** CSV fleet import with row-level validation.
- **Rule Authoring & Evaluation:** Constrained natural-language rule parser, rule DSL validation, deterministic evaluation, and trigger cooldown suppression.
- **Flexible Persistence:** Local JSON persistence by default, with optional MongoDB persistence when a reachable `MONGODB_URI` is configured. The local JSON store is not designed for concurrent multi-process writes.

## Safety and scope
- Telemetry and relay responses are simulated. MQTT messages, when a broker is configured, are treated as test inputs; this does not establish compatibility with PM-01 or other physical hardware.
- The rule sentence parser is a fixed, constrained pattern matcher. It is not LLM-powered and does not generate or execute arbitrary code.
- Rules only create software alerts and simulated relay state changes. They do not control physical breakers or electrical equipment.
- Example thresholds are demonstration values, not electrical safety or regulatory guidance.
- This is an MVP/portfolio prototype. Add authentication, authorization, TLS, rate limits, and deployment hardening before production use.

## Requirements
- Node.js 20+
- npm 10+
- Optional: MongoDB (otherwise local JSON storage is used)
- Optional: Mosquitto or another MQTT broker

## Run locally
From the project root:

```bash
npm install
cp .env.example .env
npm run dev
```

Windows PowerShell equivalent for copying env:
```powershell
Copy-Item .env.example .env
```

Open:
- Frontend: http://localhost:5173
- API health: http://localhost:4000/api/health

## Demo workflow
1. Start the app and open **Overview**.
2. Click **Simulate 5 CCMS** to generate live telemetry packets for five virtual electrical units (`ccms-01` to `ccms-05`).
3. Open **Fault & Verify** in the sidebar to test simulated link drops (`Drop Heartbeat` / `Reconnect & Recover`), `Replay Duplicate`, `Invalid Packet`, and relay ACK timeout scenarios. The timeout is simulated immediately and reports the configured 3,000 ms threshold; it does not wait three seconds for a real device.
4. Click **Run Verification Suite** in the top bar to execute all 5 automated protocol checks and view the Pass/Fail diagnostic report.
5. Open **Rule studio** and create a rule using a supported sentence, for example:
   - `Alert when voltage is below 205 V`
   - `Alert when THD is above 5 percent`
   - `Alert when power factor is below 0.85`
   - `Alert when current is above 30 A`
6. Save the rule, test it against synthetic readings, and inspect trigger events in **Alert history**.

## Natural-language rule grammar
Supported pattern:

`Alert when <field> is <above|below> <number> [unit]`

Fields:
- voltage (V)
- current (A)
- power factor (unitless)
- THD (percent)
- energy (kWh)

The parser produces a constrained rule:
```json
{
  "name": "Voltage below 205 V",
  "field": "voltage",
  "operator": "lt",
  "threshold": 205,
  "unit": "V",
  "severity": "warning",
  "cooldownSeconds": 300
}
```
The backend validates the rule independently before saving or evaluating it. Parsing is deterministic and only supports the listed sentence pattern; it does not call an LLM.

## API overview
- `GET /api/health`
- `GET /api/diagnostics`
- `GET /api/devices`
- `POST /api/devices/bulk`
- `POST /api/devices/:id/fault`
- `POST /api/devices/:id/relay`
- `POST /api/verify/run`
- `GET /api/telemetry/latest`
- `GET /api/telemetry/history?deviceId=ccms-01&limit=100`
- `POST /api/telemetry`
- `GET /api/rules`
- `POST /api/rules/parse`
- `POST /api/rules`
- `POST /api/rules/:id/test`
- `GET /api/alerts`

### Telemetry message example
```json
{
  "messageId": "ccms-01-1731480000-101",
  "deviceId": "ccms-01",
  "site": "Airoli Demo Campus",
  "feeder": "Feeder-A",
  "relayState": "ON",
  "timestamp": "2026-11-13T06:30:00.000Z",
  "voltage": 228.4,
  "current": 12.7,
  "powerFactor": 0.96,
  "thd": 2.1,
  "energyKwh": 1432.8
}
```

### MQTT
If a broker is running, set `MQTT_URL` and optionally `MQTT_TOPIC` in `.env`. Publish JSON telemetry to:
`voltwise/telemetry/<deviceId>`

The topic suffix is used as a fallback device ID when `deviceId` is absent from the payload.

## Suggested next improvements
- Add an LLM provider behind a server-side interface returning only the constrained DSL with user confirmation.
- Add persistent diagnostic event storage in MongoDB alongside telemetry collections.
- Add role-based access control and per-site tenancy.
- Add time-window sliding rules, hysteresis, and alert acknowledgement.
