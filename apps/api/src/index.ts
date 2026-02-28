import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import routes from "./routes";
import { initArc, setPolicy } from "./integrations/arc";
import { initCircle } from "./integrations/circle";
import { initStork } from "./integrations/stork";
import { startAgentLoop } from "./agent/agentLoop";
import { store } from "./store";

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

app.listen(PORT, async () => {
  console.log(`[Server] RWA Credit Guardian API running on port ${PORT}`);
  console.log(`[Server] Endpoints available at http://localhost:${PORT}/api/*`);

  // Set testnet-friendly policy on-chain (overrides constructor defaults)
  try {
    await setPolicy(
      6000,   // ltvBps = 60%
      14000,  // minHealthBps = 1.40
      12000,  // emergencyHealthBps = 1.20
      BigInt(5 * 1e6),   // liquidityMinUSDC = 5 USDC
      BigInt(10 * 1e6),  // perTxMaxUSDC = 10 USDC
      BigInt(50 * 1e6)   // dailyMaxUSDC = 50 USDC
    );
    console.log("[Server] On-chain policy set to testnet-friendly values");
  } catch (err: any) {
    console.warn("[Server] Could not set on-chain policy:", err.message);
  }

  // Auto-start autonomous agent loop
  const user = store.defaultUser;
  console.log(`[Server] Auto-starting autonomous agent for user: ${user}`);
  startAgentLoop(user);
});
