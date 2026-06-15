export { registerWorkspaceAppCenterServices } from "./services/registerWorkspaceAppCenterServices";
export { IWorkspaceAppCenterService } from "./services/workspaceAppCenterService.interface";
export { shouldShowWorkspaceApp } from "./services/workspaceAppVisibility";
export {
  createWorkspaceAppCenterContribution,
  createWorkspaceAppCenterDockEntries,
  reportWorkspaceAppOpenedFromDockEntry,
  resolveWorkspaceAppDisplayName,
  workspaceAppBrowserPartitionPrefix,
  workspaceAppCenterNodeID,
  workspaceAppDockEntryId,
  workspaceAppWebviewInstanceId,
  workspaceAppWebviewTypeID
} from "./services/internal/workspaceAppCenterContribution";
export { WorkspaceAppCenterIntegration } from "./ui/WorkspaceAppCenterIntegration";
export { WorkspaceAppCenterPane } from "./ui/WorkspaceAppCenterPane";
export { useWorkspaceAppCenterService } from "./ui/useWorkspaceAppCenterService";
