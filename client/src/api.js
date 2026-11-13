const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";
async function request(path, options = {}) {
  const response = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export const api = {
  health: () => request("/health"),
  diagnostics: () => request("/diagnostics"),
  devices: () => request("/devices"),
  latest: () => request("/telemetry/latest"),
  history: (deviceId) => request(`/telemetry/history?deviceId=${encodeURIComponent(deviceId)}&limit=80`),
  rules: () => request("/rules"),
  alerts: () => request("/alerts?limit=100"),
  parseRule: (sentence) => request("/rules/parse", { method: "POST", body: JSON.stringify({ sentence }) }),
  saveRule: (rule) => request("/rules", { method: "POST", body: JSON.stringify(rule) }),
  testRule: (id, readings) => request(`/rules/${id}/test`, { method: "POST", body: JSON.stringify({ readings }) }),
  ingest: (reading) => request("/telemetry", { method: "POST", body: JSON.stringify(reading) }),
  bulkDevices: (devices) => request("/devices/bulk", { method: "POST", body: JSON.stringify({ devices }) }),
  toggleFault: (deviceId, offline) => request(`/devices/${encodeURIComponent(deviceId)}/fault`, { method: "POST", body: JSON.stringify({ offline }) }),
  sendRelay: (deviceId, state, simulateTimeout = false) => request(`/devices/${encodeURIComponent(deviceId)}/relay`, { method: "POST", body: JSON.stringify({ state, simulateTimeout }) }),
  runVerification: () => request("/verify/run", { method: "POST" })
};
