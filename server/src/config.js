import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: Number(process.env.PORT || 4000),
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
  mongoUri: process.env.MONGODB_URI || "",
  mqttUrl: process.env.MQTT_URL || "",
  mqttTopic: process.env.MQTT_TOPIC || "voltwise/telemetry/#"
};
