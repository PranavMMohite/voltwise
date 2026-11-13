const numericFields = ["voltage", "current", "powerFactor", "thd", "energyKwh"];

export function validateTelemetry(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Telemetry payload must be a JSON object.");
  }

  const deviceId = String(input.deviceId || "").trim();
  if (!deviceId || deviceId.length > 80) {
    throw new Error("deviceId is required and must be at most 80 characters.");
  }

  const messageId = input.messageId ? String(input.messageId).trim().slice(0, 80) : null;
  const relayState = ["ON", "OFF"].includes(String(input.relayState || "").toUpperCase())
    ? String(input.relayState).toUpperCase()
    : "ON";

  const output = {
    messageId,
    deviceId,
    site: String(input.site || "Unassigned site").trim().slice(0, 100),
    feeder: String(input.feeder || "Unassigned feeder").trim().slice(0, 100),
    relayState,
    timestamp: input.timestamp ? new Date(input.timestamp) : new Date()
  };

  if (Number.isNaN(output.timestamp.getTime())) {
    throw new Error("timestamp must be a valid date.");
  }

  for (const field of numericFields) {
    const value = Number(input[field]);
    if (!Number.isFinite(value)) throw new Error(`${field} must be a finite number.`);
    output[field] = value;
  }

  if (output.voltage < 0 || output.current < 0 || output.thd < 0 || output.energyKwh < 0) {
    throw new Error("voltage, current, THD and energy cannot be negative.");
  }
  if (output.powerFactor < -1 || output.powerFactor > 1) {
    throw new Error("powerFactor must be between -1 and 1.");
  }

  return output;
}
