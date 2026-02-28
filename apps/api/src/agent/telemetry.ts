import { store } from "../store";

export function setStatus(status: "Monitoring" | "Executing" | "Risk Mode"): void {
  store.updateTelemetry({ status });
}

export function setLastReason(reason: string): void {
  store.updateTelemetry({ lastReason: reason });
}

export function setNextTickAt(ts: number): void {
  store.updateTelemetry({ nextTickAt: ts });
}

export function setAgentEnabled(enabled: boolean): void {
  store.updateTelemetry({ agentEnabled: enabled });
}

export function setLastSnapshot(snapshot: any): void {
  store.updateTelemetry({ lastSnapshot: snapshot });
}
