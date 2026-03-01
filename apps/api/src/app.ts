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

  if (!initialized) {
    initArc();

    const sim = process.env.CIRCLE_SIM_MODE === "true";
    const hasUsdc = !!process.env.USDC_TOKEN_ID_OR_ADDRESS;

    if (sim || hasUsdc) {
      initCircle();
    } else {
      console.warn(
        "[Circle] Skipping init: set CIRCLE_SIM_MODE=true or USDC_TOKEN_ID_OR_ADDRESS"
      );
    }

    initStork();
    initialized = true;
  }

  app.use(routes);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, ts: Date.now() });
  });

  return app;
}