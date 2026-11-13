import { nanoid } from "nanoid";
import { validateTelemetry } from "../domain/telemetry.js";
import { addTelemetry, upsertDevice } from "../store.js";
import { processReading } from "./engine.js";

const seenMessageIds = new Set();
const deviceHealth = new Map();
const diagnosticEvents = [];

export const telemetryStats = {
  acceptedPackets: 0,
  duplicatesRejected: 0,
  malformedRejected: 0,
  relayCommandsSent: 0,
  relayTimeouts: 0
};

function logDiagnostic(type, deviceId, detail, severity = "info") {
  diagnosticEvents.unshift({
    id: nanoid(8),
    type,
    deviceId,
    detail,
    severity,
    timestamp: new Date().toISOString()
  });
  if (diagnosticEvents.length > 100) diagnosticEvents.pop();
}

export function recordMalformedPacket(deviceId, reason) {
  telemetryStats.malformedRejected += 1;
  logDiagnostic("MALFORMED_PACKET", deviceId || "unknown", reason, "warning");
}

export function getDiagnostics() {
  const now = Date.now();
  const healthList = [];
  for (const [deviceId, info] of deviceHealth.entries()) {
    const msSinceSeen = now - info.lastSeenMs;
    const isOffline = info.forcedOffline || msSinceSeen > 15000;
    healthList.push({
      ...info,
      status: isOffline ? "OFFLINE" : "ONLINE",
      msSinceSeen
    });
  }
  return {
    stats: { ...telemetryStats },
    devices: healthList.sort((a, b) => a.deviceId.localeCompare(b.deviceId)),
    events: diagnosticEvents.slice(0, 30)
  };
}

export function setDeviceOfflineState(deviceId, offline) {
  const existing = deviceHealth.get(deviceId) || {
    deviceId,
    relayState: "ON",
    lastSeenMs: Date.now(),
    offlineSinceMs: null,
    lastRecoveryMs: null
  };
  if (offline && !existing.forcedOffline) {
    existing.forcedOffline = true;
    existing.offlineSinceMs = Date.now();
    logDiagnostic("HEARTBEAT_LOST", deviceId, "Simulated heartbeat drop / link loss injected.", "critical");
  } else if (!offline && existing.forcedOffline) {
    const recoveryMs = existing.offlineSinceMs ? Date.now() - existing.offlineSinceMs : 0;
    existing.forcedOffline = false;
    existing.offlineSinceMs = null;
    existing.lastRecoveryMs = recoveryMs;
    existing.lastSeenMs = Date.now();
    logDiagnostic("DEVICE_RECOVERED", deviceId, `Heartbeat restored after ${recoveryMs} ms outage.`, "info");
  }
  deviceHealth.set(deviceId, existing);
  return existing;
}

export async function sendRelayCommand(deviceId, targetState, simulateTimeout = false) {
  telemetryStats.relayCommandsSent += 1;
  const state = String(targetState || "OFF").toUpperCase() === "ON" ? "ON" : "OFF";
  const current = deviceHealth.get(deviceId) || {
    deviceId,
    relayState: "ON",
    lastSeenMs: Date.now(),
    forcedOffline: false
  };

  if (simulateTimeout || current.forcedOffline) {
    telemetryStats.relayTimeouts += 1;
    logDiagnostic(
      "RELAY_ACK_TIMEOUT",
      deviceId,
      `Command RELAY_${state} timed out (no ACK within 3000ms).`,
      "critical"
    );
    return { ok: false, deviceId, requestedState: state, ackReceived: false, latencyMs: 3000 };
  }

  const latencyMs = Math.floor(45 + Math.random() * 90);
  current.relayState = state;
  current.lastSeenMs = Date.now();
  deviceHealth.set(deviceId, current);
  logDiagnostic(
    "RELAY_ACK_OK",
    deviceId,
    `Relay switched to ${state} (ACK in ${latencyMs}ms).`,
    "info"
  );
  return { ok: true, deviceId, relayState: state, ackReceived: true, latencyMs };
}

export async function ingestTelemetry(input) {
  let reading;
  try {
    reading = validateTelemetry(input);
  } catch (err) {
    recordMalformedPacket(input?.deviceId, err.message);
    throw err;
  }

  if (reading.messageId) {
    if (seenMessageIds.has(reading.messageId)) {
      telemetryStats.duplicatesRejected += 1;
      logDiagnostic(
        "DUPLICATE_DROPPED",
        reading.deviceId,
        `Rejected duplicate packet messageId=${reading.messageId}.`,
        "warning"
      );
      return { reading, alerts: [], duplicate: true };
    }
    seenMessageIds.add(reading.messageId);
    if (seenMessageIds.size > 2000) {
      const first = seenMessageIds.values().next().value;
      seenMessageIds.delete(first);
    }
  }

  const now = Date.now();
  const prev = deviceHealth.get(reading.deviceId);
  let recoveryMs = null;
  if (prev && (prev.forcedOffline || now - prev.lastSeenMs > 15000)) {
    recoveryMs = prev.offlineSinceMs ? now - prev.offlineSinceMs : now - prev.lastSeenMs;
    logDiagnostic(
      "DEVICE_RECOVERED",
      reading.deviceId,
      `Device reconnected and resumed telemetry (recovery time: ${recoveryMs}ms).`,
      "info"
    );
  }

  deviceHealth.set(reading.deviceId, {
    deviceId: reading.deviceId,
    relayState: reading.relayState,
    lastSeenMs: now,
    forcedOffline: false,
    offlineSinceMs: null,
    lastRecoveryMs: recoveryMs ?? prev?.lastRecoveryMs ?? null
  });

  telemetryStats.acceptedPackets += 1;
  await addTelemetry(reading);
  await upsertDevice({
    deviceId: reading.deviceId,
    name: reading.deviceId,
    site: reading.site,
    feeder: reading.feeder,
    createdAt: new Date().toISOString()
  });

  const alerts = await processReading(reading);
  return { reading, alerts, duplicate: false, recoveryMs };
}
