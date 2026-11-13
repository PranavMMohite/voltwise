# VoltWise
**AI-assisted IoT Rule Engineering & Telemetry Workbench**

VoltWise is a portfolio-grade prototype for ingesting simulated electrical telemetry, authoring constrained alert rules, testing them against historical/simulated readings, and monitoring rule triggers.

It is designed around publicly described electrical-monitoring concepts such as voltage, current, power factor, THD and energy. It is **not connected to real PM-01 hardware** and does not use EazyIoT's private packet schema.

## What works
- REST telemetry ingestion with schema validation.
- Optional MQTT subscriber (`voltwise/telemetry/<deviceId>`).
- Simulated device generator for repeatable demo data.
- Device list and latest readings.
- Bulk device onboarding through CSV.
- Rule authoring from a restricted natural-language template.
- Rule DSL validation and deterministic evaluation.
- Rule testing against recent telemetry and a generated simulation batch.
- Trigger history and duplicate suppression cooldown.
- Optional MongoDB persistence; local JSON persistence works out of the box.

## Safety and scope
- All telemetry is simulated unless you deliberately publish your own compatible test messages.
- The natural-language rule helper only maps supported phrases to a small JSON rule format. It does not generate or execute arbitrary code.
- Rules only create software alerts. They do not control breakers, relays, or electrical equipment.
- Example thresholds are demonstration values, not electrical safety or regulatory guidance.
- This is an MVP/portfolio prototype, not a production deployment. Add authentication, authorization, TLS, rate limits, observability, and deployment hardening before real use.

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

Open:
- Frontend: http://localhost:5173
- API health: http://localhost:4000/api/health

Windows PowerShell equivalent for copying env:
```powershell
Copy-Item .env.example .env
```

## Demo workflow
1. Start the app.
2. Click **Start simulator**. It posts simulated telemetry for 5 sample meters.
3. Create a rule using a supported sentence, for example:
   - `Alert when voltage is below 205 V`
   - `Alert when THD is above 5 percent`
   - `Alert when power factor is below 0.85`
   - `Alert when current is above 30 A`
4. Save the rule, then use **Test rule** to evaluate recent telemetry plus generated samples.
5. Inspect the trigger history.

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
The backend validates the rule independently before saving or evaluating it.

## API overview
- `GET /api/health`
- `GET /api/devices`
- `POST /api/devices/bulk`
- `GET /api/telemetry/latest`
- `GET /api/telemetry/history?deviceId=meter-01&limit=100`
- `POST /api/telemetry`
- `GET /api/rules`
- `POST /api/rules/parse`
- `POST /api/rules`
- `POST /api/rules/:id/test`
- `GET /api/alerts`

### Telemetry message example
```json
{
  "deviceId": "meter-01",
  "site": "Airoli Demo Campus",
  "feeder": "Feeder-A",
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
- Add a real LLM provider behind a server-side interface, returning only the constrained DSL and requiring user confirmation.
- Add rule versioning and audit logs.
- Add role-based access control and per-site tenancy.
- Add time-window rules, hysteresis and alert acknowledgement.
- Add integration tests and a deployment pipeline.
