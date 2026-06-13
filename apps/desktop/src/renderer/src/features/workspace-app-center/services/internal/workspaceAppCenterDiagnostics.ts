import { normalizeTuttidError } from "@tutti-os/client-tuttid-ts";
import type { DesktopRuntimeApi } from "@preload/types";
import { getDesktopErrorCode } from "../../../../lib/desktopErrors.ts";

export type WorkspaceAppCenterOperation =
  | "app_center.refresh"
  | "app_center.refresh_catalog"
  | "app_center.start_workspace_updates"
  | "app_factory.prepare_modification"
  | "app_factory.publish"
  | "workspace_app.delete"
  | "workspace_app.export"
  | "workspace_app.import"
  | "workspace_app.install"
  | "workspace_app.prepare_launch"
  | "workspace_app.refresh_install_state"
  | "workspace_app.refresh_launch_wait_state"
  | "workspace_app.replace_icon"
  | "workspace_app.start_enabled"
  | "workspace_app.update";

export type WorkspaceAppCenterUiAction =
  | "delete_app"
  | "export_app"
  | "import_app"
  | "install_app"
  | "open_app"
  | "prepare_factory_job_modification"
  | "publish_factory_job"
  | "refresh_install_state"
  | "refresh_launch_wait_state"
  | "replace_app_icon"
  | "update_app";

export interface WorkspaceAppCenterOperationDetails {
  appId?: string;
  jobId?: string;
  operation: WorkspaceAppCenterOperation;
  uiAction?: WorkspaceAppCenterUiAction;
  workspaceId: string;
}

export function recordWorkspaceAppCenterOperationFailure(input: {
  details: WorkspaceAppCenterOperationDetails;
  error: unknown;
  runtimeApi?: Pick<DesktopRuntimeApi, "logRendererDiagnostic">;
  toastMessage: string;
}): void {
  if (!input.runtimeApi) {
    return;
  }

  const protocolError = normalizeTuttidError(input.error);
  void input.runtimeApi
    .logRendererDiagnostic({
      details: {
        ...input.details,
        developerMessage:
          protocolError?.developerMessage ??
          (input.error instanceof Error ? input.error.message : null),
        errorCode:
          protocolError?.code ?? getDesktopErrorCode(input.error) ?? null,
        params: protocolError?.params ?? null,
        reason: protocolError?.reason ?? null,
        retryable: protocolError?.retryable ?? null,
        statusCode: protocolError?.statusCode ?? null,
        toastMessage: input.toastMessage,
        uiAction: input.details.uiAction ?? input.details.operation
      },
      event: "workspace_app_center_operation_failed",
      level: "warn",
      source: "workspace-app-center",
      workspaceId: input.details.workspaceId
    })
    .catch(() => undefined);
}
