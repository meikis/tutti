import type { DesktopWorkbenchContributionFactory } from "../workspaceWorkbenchContributionFactory";
import { createWorkspaceTerminalContribution } from "../workspaceTerminalContribution.ts";

export const terminalWorkbenchContributionFactory: DesktopWorkbenchContributionFactory =
  {
    id: "workspace-terminal",
    order: 40,
    create(context) {
      return createWorkspaceTerminalContribution({
        appI18n: context.appI18n,
        confirmCloseGuard: context.confirmCloseGuard,
        dockIcon: context.dockIcons.terminal,
        hostFilesApi: context.hostFilesApi,
        i18n: context.i18n,
        tuttidClient: context.tuttidClient,
        platformApi: context.platformApi,
        reporterService: context.reporterService,
        runtimeApi: context.runtimeApi,
        workspaceId: context.workspaceId
      });
    }
  };
