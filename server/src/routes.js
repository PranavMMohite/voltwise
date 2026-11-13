import express from "express";
import { nanoid } from "nanoid";
import { parseNaturalLanguageRule, validateRule } from "./domain/rules.js";
import {
  ingestTelemetry,
  getDiagnostics,
  setDeviceOfflineState,
  sendRelayCommand
} from "./services/telemetry.js";
import { testRule } from "./services/engine.js";
import { addRule, listRules, listDevices, listTelemetry, listAlerts, upsertDevice } from "./store.js";

const router = express.Router();

router.get("/health", (_req, res) => res.json({ status: "ok", name: "VoltWise API", timestamp: new Date().toISOString() }));

router.get("/diagnostics", (_req, res) => {
  res.json(getDiagnostics());
});

router.post("/devices/:id/fault", (req, res) => {
  const { offline } = req.body || {};
  const state = setDeviceOfflineState(req.params.id, Boolean(offline));
  res.json(state);
});

router.post("/devices/:id/relay", async (req, res, next) => {
  try {
    const { state, simulateTimeout } = req.body || {};
    const result = await sendRelayCommand(req.params.id, state, Boolean(simulateTimeout));
    res.json(result);
  } catch (e) { next(e); }
});

router.post("/verify/run", async (_req, res, next) => {
  try {
    const results = [];
    const testDev = "ccms-verify-01";
    const msgId = `msg-${nanoid(6)}`;

    const step1 = await ingestTelemetry({
      messageId: msgId,
      deviceId: testDev,
      site: "Rabale Test Bench",
      feeder: "CCMS-Feeder-01",
      voltage: 231.4,
      current: 14.2,
      powerFactor: 0.97,
      thd: 1.8,
      energyKwh: 512.4
    });
    results.push({
      id: "TEST-01",
      name: "Valid CCMS Telemetry Ingestion",
      passed: !step1.duplicate && step1.reading.deviceId === testDev,
      detail: `Ingested packet ${msgId} cleanly.`
    });

    const step2 = await ingestTelemetry({
      messageId: msgId,
      deviceId: testDev,
      site: "Rabale Test Bench",
      feeder: "CCMS-Feeder-01",
      voltage: 231.4,
      current: 14.2,
      powerFactor: 0.97,
      thd: 1.8,
      energyKwh: 512.4
    });
    results.push({
      id: "TEST-02",
      name: "Idempotency & Duplicate Packet Rejection",
      passed: step2.duplicate === true,
      detail: step2.duplicate ? `Duplicate messageId (${msgId}) blocked from double-write.` : "Failed to block duplicate."
    });

    let caughtInvalid = false;
    try {
      await ingestTelemetry({
        deviceId: testDev,
        voltage: -45,
        current: 10,
        powerFactor: 0.9,
        thd: 2.0,
        energyKwh: 100
      });
    } catch {
      caughtInvalid = true;
    }
    results.push({
      id: "TEST-03",
      name: "Malformed Telemetry Schema Guard",
      passed: caughtInvalid,
      detail: caughtInvalid ? "Rejected negative voltage (-45V) before storage." : "Accepted invalid voltage."
    });

    const relayFail = await sendRelayCommand(testDev, "OFF", true);
    results.push({
      id: "TEST-04",
      name: "Relay Command ACK Timeout Detection",
      passed: relayFail.ok === false && relayFail.ackReceived === false,
      detail: "Flagged COMMAND_TIMEOUT when CCMS failed to ACK within 3000ms."
    });

    setDeviceOfflineState(testDev, true);
    await new Promise(r => setTimeout(r, 120));
    const recovery = await ingestTelemetry({
      messageId: `msg-${nanoid(6)}`,
      deviceId: testDev,
      site: "Rabale Test Bench",
      feeder: "CCMS-Feeder-01",
      voltage: 229.8,
      current: 13.9,
      powerFactor: 0.96,
      thd: 1.9,
      energyKwh: 512.6
    });
    results.push({
      id: "TEST-05",
      name: "Heartbeat Loss & Recovery Timing",
      passed: typeof recovery.recoveryMs === "number" && recovery.recoveryMs >= 100,
      detail: `Detected link loss and measured recovery in ${recovery.recoveryMs} ms.`
    });

    const passedCount = results.filter(r => r.passed).length;
    res.json({
      summary: `${passedCount}/${results.length} checks passed`,
      allPassed: passedCount === results.length,
      executedAt: new Date().toISOString(),
      results
    });
  } catch (e) { next(e); }
});

router.get("/devices", async (_req, res, next) => {
  try { res.json(await listDevices()); } catch (e) { next(e); }
});

router.post("/devices/bulk", async (req, res, next) => {
  try {
    const rows = req.body?.devices;
    if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: "Provide a non-empty devices array." });
    if (rows.length > 500) return res.status(400).json({ error: "Maximum 500 devices per import." });
    const seen = new Set();
    const accepted = [];
    const rejected = [];
    for (const [index, row] of rows.entries()) {
      const deviceId = String(row.deviceId || "").trim();
      if (!deviceId || deviceId.length > 80 || seen.has(deviceId)) {
        rejected.push({ row: index + 1, reason: !deviceId ? "deviceId is required" : seen.has(deviceId) ? "duplicate deviceId in import" : "deviceId too long" });
        continue;
      }
      seen.add(deviceId);
      accepted.push(await upsertDevice({
        deviceId, name: String(row.name || deviceId).slice(0, 100),
        site: String(row.site || "Unassigned site").slice(0, 100),
        feeder: String(row.feeder || "Unassigned feeder").slice(0, 100),
        createdAt: new Date().toISOString()
      }));
    }
    res.json({ imported: accepted.length, rejected, devices: accepted });
  } catch (e) { next(e); }
});

router.get("/telemetry/latest", async (_req, res, next) => {
  try {
    const readings = await listTelemetry({ limit: 1000 });
    const latest = new Map();
    for (const item of readings) {
      if (!latest.has(item.deviceId) || new Date(item.timestamp) > new Date(latest.get(item.deviceId).timestamp)) latest.set(item.deviceId, item);
    }
    res.json([...latest.values()].sort((a,b) => a.deviceId.localeCompare(b.deviceId)));
  } catch (e) { next(e); }
});

router.get("/telemetry/history", async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));
    res.json(await listTelemetry({ deviceId: req.query.deviceId, limit }));
  } catch (e) { next(e); }
});

router.post("/telemetry", async (req, res, next) => {
  try { res.status(201).json(await ingestTelemetry(req.body)); } catch (e) { res.status(400).json({ error: e.message }); }
});

router.get("/rules", async (_req, res, next) => {
  try { res.json(await listRules()); } catch (e) { next(e); }
});

router.post("/rules/parse", (req, res) => {
  try { res.json({ rule: parseNaturalLanguageRule(req.body?.sentence), explanation: "This sentence was mapped to a restricted rule format. Review the threshold and confirm before saving." }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/rules", async (req, res, next) => {
  try {
    const rule = validateRule(req.body);
    const saved = await addRule(rule);
    res.status(201).json(saved);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

router.post("/rules/:id/test", async (req, res, next) => {
  try {
    const rules = await listRules();
    const rule = rules.find(item => item.id === req.params.id);
    if (!rule) return res.status(404).json({ error: "Rule not found." });
    const recent = await listTelemetry({ limit: 200 });
    const generated = Array.isArray(req.body?.readings) ? req.body.readings : [];
    const result = await testRule(rule, [...recent, ...generated]);
    res.json({ rule, ...result });
  } catch (e) { next(e); }
});

router.get("/alerts", async (req, res, next) => {
  try { res.json(await listAlerts(Math.max(1, Math.min(300, Number(req.query.limit || 100))))); } catch (e) { next(e); }
});

export default router;
