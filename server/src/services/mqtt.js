import mqtt from "mqtt";
import { config } from "../config.js";
import { ingestTelemetry } from "./telemetry.js";

export function startMqtt() {
  if (!config.mqttUrl) {
    console.log("MQTT disabled (set MQTT_URL to enable).");
    return;
  }
  const client = mqtt.connect(config.mqttUrl, { reconnectPeriod: 3000 });
  client.on("connect", () => {
    console.log(`MQTT connected: ${config.mqttUrl}`);
    client.subscribe(config.mqttTopic, error => {
      if (error) console.error("MQTT subscribe error:", error.message);
      else console.log(`Subscribed to ${config.mqttTopic}`);
    });
  });
  client.on("message", async (topic, buffer) => {
    try {
      const payload = JSON.parse(buffer.toString());
      const topicDeviceId = topic.split("/").filter(Boolean).at(-1);
      await ingestTelemetry({ ...payload, deviceId: payload.deviceId || topicDeviceId });
    } catch (error) {
      console.error("Rejected MQTT message:", error.message);
    }
  });
  client.on("error", error => console.error("MQTT error:", error.message));
}
