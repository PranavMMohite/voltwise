import { nanoid } from "nanoid";
import { evaluateRule } from "../domain/rules.js";
import { addAlert, listRules } from "../store.js";

const lastTriggered = new Map();

export async function processReading(reading) {
  const rules = await listRules();
  const triggered = [];
  for (const rule of rules) {
    if (!rule.enabled || !evaluateRule(rule, reading)) continue;
    const key = `${rule.id}:${reading.deviceId}`;
    const now = Date.now();
    const previous = lastTriggered.get(key) || 0;
    if (now - previous < rule.cooldownSeconds * 1000) continue;
    lastTriggered.set(key, now);

    const alert = {
      id: nanoid(10), ruleId: rule.id, ruleName: rule.name, deviceId: reading.deviceId,
      field: rule.field, value: reading[rule.field], threshold: rule.threshold,
      severity: rule.severity,
      message: `${rule.name}: ${reading.deviceId} reported ${reading[rule.field]}${rule.unit ? ` ${rule.unit}` : ""}.`,
      createdAt: new Date().toISOString()
    };
    await addAlert(alert);
    triggered.push(alert);
  }
  return triggered;
}

export async function testRule(rule, readings) {
  const matches = readings.filter(reading => evaluateRule(rule, reading));
  return { tested: readings.length, matched: matches.length, matches: matches.slice(0, 25) };
}
