import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { initStore } from "./store.js";
import routes from "./routes.js";
import { startMqtt } from "./services/mqtt.js";

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", routes);
app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && "body" in error) {
    return res.status(400).json({ error: "Request body must be valid JSON." });
  }
  console.error(error);
  res.status(500).json({ error: "Internal server error." });
});

await initStore();
startMqtt();

app.listen(config.port, () => console.log(`VoltWise API listening on http://localhost:${config.port}`));
