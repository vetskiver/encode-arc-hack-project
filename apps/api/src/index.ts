import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import routes from "./routes";
import { initArc } from "./integrations/arc";
import { initCircle } from "./integrations/circle";
import { initStork } from "./integrations/stork";

// Load env from project root
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
// Also try local .env
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = parseInt(process.env.PORT || "4000", 10);

const app = express();
app.use(cors());
app.use(express.json());

// Initialize integrations
initArc();
initCircle();
initStork();

// Mount routes
app.use(routes);

// Health check
app.get("/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

app.listen(PORT, () => {
  console.log(`[Server] RWA Credit Guardian API running on port ${PORT}`);
  console.log(`[Server] Endpoints available at http://localhost:${PORT}/api/*`);
});
