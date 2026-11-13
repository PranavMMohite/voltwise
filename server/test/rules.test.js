import test from "node:test";
import assert from "node:assert/strict";
import { parseNaturalLanguageRule, validateRule, evaluateRule } from "../src/domain/rules.js";
import { validateTelemetry } from "../src/domain/telemetry.js";

test("parses a supported voltage rule into constrained DSL", () => {
  const rule = parseNaturalLanguageRule("Alert when voltage is below 205 V");
  assert.equal(rule.field, "voltage");
  assert.equal(rule.operator, "lt");
  assert.equal(rule.threshold, 205);
});
test("rejects unsupported natural-language instructions", () => {
  assert.throws(() => parseNaturalLanguageRule("Run a script when voltage drops"));
});
test("validates rule fields and operators", () => {
  assert.throws(() => validateRule({ field: "temperature", operator: "gt", threshold: 5 }));
});
test("evaluates rules deterministically", () => {
  const rule = validateRule({ field: "thd", operator: "gt", threshold: 5 });
  assert.equal(evaluateRule(rule, { thd: 6 }), true);
  assert.equal(evaluateRule(rule, { thd: 4 }), false);
});
test("validates telemetry schema and bounds", () => {
  const reading = validateTelemetry({ deviceId: "meter-1", voltage: 230, current: 4, powerFactor: 0.9, thd: 2, energyKwh: 100 });
  assert.equal(reading.deviceId, "meter-1");
  assert.throws(() => validateTelemetry({ deviceId: "meter-1", voltage: 230, current: 4, powerFactor: 1.5, thd: 2, energyKwh: 100 }));
});

test("rejects empty or oversized message IDs instead of weakening deduplication", () => {
  const base = { deviceId: "meter-1", voltage: 230, current: 4, powerFactor: 0.9, thd: 2, energyKwh: 100 };
  assert.throws(() => validateTelemetry({ ...base, messageId: "   " }), /messageId/);
  assert.throws(() => validateTelemetry({ ...base, messageId: "x".repeat(81) }), /messageId/);
  assert.equal(validateTelemetry({ ...base, messageId: " packet-1 " }).messageId, "packet-1");
});

test("rejects non-finite telemetry and invalid timestamps", () => {
  const base = { deviceId: "meter-1", voltage: 230, current: 4, powerFactor: 0.9, thd: 2, energyKwh: 100 };
  assert.throws(() => validateTelemetry({ ...base, current: "Infinity" }), /finite number/);
  assert.throws(() => validateTelemetry({ ...base, timestamp: "not-a-date" }), /valid date/);
});

test("natural-language parser enforces matching units and fixed comparisons", () => {
  assert.equal(parseNaturalLanguageRule("Alert when THD is greater than 5 percent").operator, "gt");
  assert.throws(() => parseNaturalLanguageRule("Alert when voltage is below 205 A"), /Unit does not match/);
  const rule = validateRule({ field: "voltage", operator: "gte", threshold: 205 });
  assert.equal(evaluateRule(rule, { voltage: 205 }), true);
  assert.equal(evaluateRule(rule, { voltage: "invalid" }), false);
});
