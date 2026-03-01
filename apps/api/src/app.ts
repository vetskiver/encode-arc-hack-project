// src/app.ts
import express from "express";
import cors from "cors";
import routes from "./routes";
import { initArc } from "./integrations/arc";
import { initCircle } from "./integrations/circle";
import { initStork } from "./integrations/stork";

let initialized = false;

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Serverless-safe: initialize once per warm instance
  if (!initialized) {
    initArc();
    initCircle();
    initStork();
    initialized = true;
  }

  app.use(routes);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  return app;
}