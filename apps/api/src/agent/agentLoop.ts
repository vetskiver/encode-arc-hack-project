import { agentTick } from "./agentTick";
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

  setAgentEnabled(true);
  setStatus("Monitoring");
  setLastReason("Agent started");
  setNextTickAt(Date.now() + TICK_MS);

  console.log(`[AgentLoop] Starting loop every ${TICK_MS}ms for user: ${user}`);

  intervalHandle = setInterval(async () => {
    if (ticking) {
      console.warn("[AgentLoop] Skipping tick: previous tick still running");
      return;
    }
    ticking = true;
    setNextTickAt(Date.now() + TICK_MS);
    try {
      await agentTick(user);
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
  setAgentEnabled(false);
  setStatus("Monitoring");
  setLastReason("Agent stopped");
  setNextTickAt(0);
  console.log("[AgentLoop] Stopped");
}

export function isRunning(): boolean {
  return intervalHandle !== null;
}
