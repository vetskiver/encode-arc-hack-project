import { agentTick } from "./agentTick";
import { companyAgentTick } from "./companyAgentTick";
import { store } from "../store";
import { setAgentEnabled, setNextTickAt, setStatus, setLastReason } from "./telemetry";

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let ticking = false;

const TICK_MS = parseInt(process.env.AGENT_TICK_MS || "15000", 10);

export function startAgentLoop(user: string): void {
  if (intervalHandle) {
    console.log("[AgentLoop] Already running");
    return;
  }

  // Enable all companies async (fire and forget — non-fatal)
  (async () => {
    const ids = await store.getAllCompanyIds();
    for (const id of ids) {
      await store.updateCompanyTelemetry(id, {
        agentEnabled: true,
        status: "Monitoring",
        lastReason: "Agent started",
        nextTickAt: Date.now() + TICK_MS,
      });
    }
  })().catch(err => console.warn("[AgentLoop] Failed to enable companies:", err.message));

  setAgentEnabled(true);
  setStatus("Monitoring");
  setLastReason("Agent started");
  setNextTickAt(Date.now() + TICK_MS);

  console.log(`[AgentLoop] Starting loop every ${TICK_MS}ms for all companies`);

  intervalHandle = setInterval(async () => {
    if (ticking) {
      console.warn("[AgentLoop] Skipping tick: previous tick still running");
      return;
    }
    ticking = true;
    const nextTick = Date.now() + TICK_MS;
    setNextTickAt(nextTick);

    try {
      const ids = await store.getAllCompanyIds();

      // Update next tick for all companies
      for (const id of ids) {
        await store.updateCompanyTelemetry(id, { nextTickAt: nextTick });
      }

      // Run the original agent tick (Arc contract + Circle wallet state)
      await agentTick(user);

      // Run per-company simulated ticks
      for (const id of ids) {
        try {
          await companyAgentTick(id);
        } catch (err: any) {
          console.error(`[AgentLoop] Company ${id} tick error:`, err.message);
        }
      }
    } catch (err: any) {
      console.error("[AgentLoop] Tick error:", err.message);
    } finally {
      ticking = false;
    }
  }, TICK_MS);
}

export function stopAgentLoop(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  // Stop all companies async (fire and forget — non-fatal)
  (async () => {
    const ids = await store.getAllCompanyIds();
    for (const id of ids) {
      await store.updateCompanyTelemetry(id, {
        agentEnabled: false,
        status: "Monitoring",
        lastReason: "Agent stopped",
        nextTickAt: 0,
      });
    }
  })().catch(err => console.warn("[AgentLoop] Failed to stop companies:", err.message));

  setAgentEnabled(false);
  setStatus("Monitoring");
  setLastReason("Agent stopped");
  setNextTickAt(0);
  console.log("[AgentLoop] Stopped");
}

export function isRunning(): boolean {
  return intervalHandle !== null;
}