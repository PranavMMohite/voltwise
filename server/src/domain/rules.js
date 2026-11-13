import { nanoid } from "nanoid";

export const FIELD_META = {
  voltage: { label: "Voltage", unit: "V" },
  current: { label: "Current", unit: "A" },
  powerFactor: { label: "Power factor", unit: "" },
  thd: { label: "THD", unit: "%" },
  energyKwh: { label: "Energy", unit: "kWh" }
};

export function validateRule(input) {
  const field = input?.field;
  const operator = input?.operator;
  const threshold = Number(input?.threshold);
  const severity = input?.severity || "warning";

  if (!FIELD_META[field]) throw new Error("Unsupported rule field.");
  if (!["gt", "lt", "gte", "lte"].includes(operator)) throw new Error("Unsupported operator.");
  if (!Number.isFinite(threshold)) throw new Error("Threshold must be a finite number.");
  if (!["info", "warning", "critical"].includes(severity)) throw new Error("Invalid severity.");

  const cooldownSeconds = Math.max(0, Math.min(86400, Number(input?.cooldownSeconds ?? 300)));
  if (!Number.isFinite(cooldownSeconds)) throw new Error("Invalid cooldown.");

  return {
    id: input.id || nanoid(10),
    name: String(input.name || `${FIELD_META[field].label} ${operator} ${threshold}`).slice(0, 100),
    field,
    operator,
    threshold,
    unit: FIELD_META[field].unit,
    severity,
    cooldownSeconds,
    enabled: input.enabled !== false,
    createdAt: input.createdAt || new Date().toISOString()
  };
}

export function parseNaturalLanguageRule(sentence) {
  const text = String(sentence || "").trim().toLowerCase();
  const match = text.match(/^alert\s+when\s+(voltage|current|power factor|powerfactor|thd|energy)\s+is\s+(above|below|greater than|less than)\s+(-?\d+(?:\.\d+)?)\s*([a-z%]*)$/i);
  if (!match) {
    throw new Error("Use: Alert when <voltage|current|power factor|THD|energy> is <above|below> <number> [unit].");
  }

  const aliases = {
    voltage: "voltage", current: "current", "power factor": "powerFactor",
    powerfactor: "powerFactor", thd: "thd", energy: "energyKwh"
  };
  const field = aliases[match[1].toLowerCase()];
  const direction = match[2].toLowerCase();
  const operator = ["above", "greater than"].includes(direction) ? "gt" : "lt";
  const threshold = Number(match[3]);
  const expectedUnit = FIELD_META[field].unit;
  const suppliedUnit = match[4];
  const validUnits = {
    voltage: ["", "v", "volt", "volts"],
    current: ["", "a", "amp", "amps"],
    powerFactor: [""],
    thd: ["", "%", "percent"],
    energyKwh: ["", "kwh"]
  };
  if (!validUnits[field].includes(suppliedUnit)) {
    throw new Error(`Unit does not match ${FIELD_META[field].label}. Expected ${expectedUnit || "no unit"}.`);
  }

  return validateRule({
    name: `${FIELD_META[field].label} ${operator === "gt" ? "above" : "below"} ${threshold}${expectedUnit ? ` ${expectedUnit}` : ""}`,
    field, operator, threshold, severity: "warning", cooldownSeconds: 300
  });
}

export function evaluateRule(rule, reading) {
  const value = reading[rule.field];
  if (!Number.isFinite(Number(value))) return false;
  switch (rule.operator) {
    case "gt": return value > rule.threshold;
    case "lt": return value < rule.threshold;
    case "gte": return value >= rule.threshold;
    case "lte": return value <= rule.threshold;
    default: return false;
  }
}
