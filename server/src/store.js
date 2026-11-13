import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import mongoose from "mongoose";
import { Telemetry, Device, Rule, Alert } from "./models.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, "../data");
const dataFile = path.join(dataDir, "store.json");
let mongo = false;
let local = { telemetry: [], devices: [], rules: [], alerts: [] };

async function persist() {
  await fs.mkdir(dataDir, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(local, null, 2));
}
async function load() {
  try { local = JSON.parse(await fs.readFile(dataFile, "utf8")); }
  catch { await persist(); }
}

export async function initStore() {
  if (config.mongoUri) {
    try {
      await mongooseConnect();
      mongo = true;
      console.log("Persistence: MongoDB");
      return;
    } catch (error) {
      console.error("MongoDB connection failed:", error.message);
      console.error("Falling back to local JSON persistence.");
    }
  }
  await load();
  console.log("Persistence: local JSON file");
}

async function mongooseConnect() {
  const mongoose = (await import("mongoose")).default;
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 4000 });
}

export async function addTelemetry(reading) {
  if (mongo) return (await Telemetry.create(reading)).toObject();
  local.telemetry.push(reading);
  if (local.telemetry.length > 5000) local.telemetry = local.telemetry.slice(-5000);
  await persist();
  return reading;
}
export async function listTelemetry({ deviceId, limit = 100 } = {}) {
  if (mongo) {
    const query = deviceId ? { deviceId } : {};
    return Telemetry.find(query).sort({ timestamp: -1 }).limit(limit).lean();
  }
  return local.telemetry.filter(x => !deviceId || x.deviceId === deviceId)
    .slice().sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, limit);
}
export async function upsertDevice(device) {
  if (mongo) return Device.findOneAndUpdate({ deviceId: device.deviceId }, device, { upsert: true, new: true }).lean();
  const index = local.devices.findIndex(x => x.deviceId === device.deviceId);
  if (index >= 0) local.devices[index] = { ...local.devices[index], ...device };
  else local.devices.push(device);
  await persist();
  return device;
}
export async function listDevices() {
  if (mongo) return Device.find().sort({ deviceId: 1 }).lean();
  return local.devices.slice().sort((a,b) => a.deviceId.localeCompare(b.deviceId));
}
export async function addRule(rule) {
  if (mongo) return (await Rule.create(rule)).toObject();
  local.rules.unshift(rule); await persist(); return rule;
}
export async function listRules() {
  if (mongo) return Rule.find().sort({ createdAt: -1 }).lean();
  return local.rules;
}
export async function addAlert(alert) {
  if (mongo) return (await Alert.create(alert)).toObject();
  local.alerts.unshift(alert);
  if (local.alerts.length > 1000) local.alerts = local.alerts.slice(0, 1000);
  await persist(); return alert;
}
export async function listAlerts(limit = 100) {
  if (mongo) return Alert.find().sort({ createdAt: -1 }).limit(limit).lean();
  return local.alerts.slice(0, limit);
}
