import { store } from "../store";

export function setStatus(status: "Monitoring" | "Executing" | "Risk Mode"): void {
  store.telemetry.status = status;
}

export function setLastReason(reason: string): void {
  store.telemetry.lastReason = reason;
}

export function setNextTickAt(ts: number): void {
  store.telemetry.nextTickAt = ts;
}

export function setAgentEnabled(enabled: boolean): void {
  store.telemetry.agentEnabled = enabled;
}

export function setLastSnapshot(snapshot: any): void {
  store.telemetry.lastSnapshot = snapshot;
}
