// src/index.ts (local dev only)
import dotenv from "dotenv";
import path from "path";
import { createApp } from "./app";
import { setPolicy } from "./integrations/arc";
import { startAgentLoop } from "./agent/agentLoop";
import { store } from "./store";

dotenv.config({ path: path.resolve(__dirname, "../../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const PORT = parseInt(process.env.PORT || "4000", 10);
const app = createApp();

export default app;

app.listen(PORT, async () => {
  console.log(`[Server] API running on port ${PORT}`);

  // OPTIONAL: keep for local only (recommended)
  try {
    await setPolicy(
      6000,
      14000,
      12000,
      BigInt(5 * 1e6),
      BigInt(10 * 1e6),
      BigInt(50 * 1e6)
    );
    console.log("[Server] On-chain policy set (local)");
  } catch (err: any) {
    console.warn("[Server] Could not set on-chain policy:", err.message);
  }

  // Auto-start the multi-company agent loop so demos run immediately.
  try {
    const user = store.defaultUser;
    startAgentLoop(user);
    console.log(`[Server] Auto-started agent loop for default user ${user}`);
  } catch (err: any) {
    console.warn("[Server] Could not start agent loop:", err.message);
  }
});
