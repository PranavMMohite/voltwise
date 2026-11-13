import mongoose from "mongoose";

const telemetrySchema = new mongoose.Schema({
  deviceId: { type: String, index: true },
  site: String, feeder: String, timestamp: { type: Date, index: true },
  voltage: Number, current: Number, powerFactor: Number, thd: Number, energyKwh: Number
}, { versionKey: false });

const deviceSchema = new mongoose.Schema({
  deviceId: { type: String, unique: true },
  name: String, site: String, feeder: String, createdAt: String
}, { versionKey: false });

const ruleSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  name: String, field: String, operator: String, threshold: Number, unit: String,
  severity: String, cooldownSeconds: Number, enabled: Boolean, createdAt: String
}, { versionKey: false });

const alertSchema = new mongoose.Schema({
  id: String, ruleId: String, ruleName: String, deviceId: String, field: String,
  value: Number, threshold: Number, severity: String, message: String, createdAt: String
}, { versionKey: false });

export const Telemetry = mongoose.model("Telemetry", telemetrySchema);
export const Device = mongoose.model("Device", deviceSchema);
export const Rule = mongoose.model("Rule", ruleSchema);
export const Alert = mongoose.model("Alert", alertSchema);
