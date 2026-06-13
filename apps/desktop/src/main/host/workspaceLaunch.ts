import type { TuttidClient } from "@tutti-os/client-tuttid-ts";

export interface WorkspaceLaunchOwnerWindow {
  close(): void;
  destroy?(): void;
}

export interface WorkspaceLaunchAdapters {
  showWorkspaceWindow(workspaceID: string): Promise<void>;
  warnStartupWindowResolutionFailure(error: unknown): void;
}

export interface WorkspaceLaunch {
  openStartupWindow(): Promise<void>;
  showWorkspace(
    ownerWindow: WorkspaceLaunchOwnerWindow | null,
    workspaceID: string
  ): Promise<void>;
}

export interface WorkspaceLaunchDependencies {
  adapters: WorkspaceLaunchAdapters;
  tuttidClient: Pick<TuttidClient, "getStartupWorkspace">;
}

export function createWorkspaceLaunch(
  deps: WorkspaceLaunchDependencies
): WorkspaceLaunch {
  return {
    async openStartupWindow() {
      try {
        const workspaceID = await resolveStartupWorkspaceID();
        await deps.adapters.showWorkspaceWindow(workspaceID);
      } catch (error) {
        deps.adapters.warnStartupWindowResolutionFailure(error);
        throw error;
      }
    },

    showWorkspace
  };

  async function resolveStartupWorkspaceID(): Promise<string> {
    const workspaceToRestore = await deps.tuttidClient.getStartupWorkspace();
    if (!workspaceToRestore) {
      throw new Error("tuttid did not return a startup workspace");
    }
    return workspaceToRestore.id;
  }

  async function showWorkspace(
    ownerWindow: WorkspaceLaunchOwnerWindow | null,
    workspaceID: string
  ): Promise<void> {
    await deps.adapters.showWorkspaceWindow(workspaceID);
    forceCloseWindow(ownerWindow);
  }
}

function forceCloseWindow(
  ownerWindow: WorkspaceLaunchOwnerWindow | null
): void {
  if (!ownerWindow) {
    return;
  }

  if (typeof ownerWindow.destroy === "function") {
    ownerWindow.destroy();
    return;
  }

  ownerWindow.close();
}
