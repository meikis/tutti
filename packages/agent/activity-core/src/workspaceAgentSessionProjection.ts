import type { WorkspaceAgentSession } from "@tutti-os/client-tuttid-ts";

export type WorkspaceAgentSessionDerivedStatus =
  | "working"
  | "waiting"
  | "completed"
  | "failed"
  | "canceled"
  | "unknown";

export function workspaceAgentSessionStatus(
  session: Pick<
    WorkspaceAgentSession,
    "activeTurn" | "latestTurn" | "pendingInteractions"
  >
): WorkspaceAgentSessionDerivedStatus {
  if ((session.pendingInteractions?.length ?? 0) > 0) return "waiting";
  const activeTurn = session.activeTurn;
  if (activeTurn && activeTurn.phase !== "settled") {
    return activeTurn.phase === "waiting" ? "waiting" : "working";
  }
  switch (session.latestTurn?.outcome) {
    case "failed":
      return "failed";
    case "canceled":
      return "canceled";
    case "completed":
      return "completed";
    default:
      return "unknown";
  }
}

export function workspaceAgentSessionLastError(
  session: Pick<WorkspaceAgentSession, "activeTurn" | "latestTurn">
): string | null {
  return (
    session.activeTurn?.error?.message?.trim() ||
    session.latestTurn?.error?.message?.trim() ||
    null
  );
}
