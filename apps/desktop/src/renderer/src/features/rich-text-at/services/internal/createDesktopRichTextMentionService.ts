import { createRichTextMentionService } from "@tutti-os/ui-rich-text/service";
import type { RichTextMentionService } from "@tutti-os/ui-rich-text/service";
import type { IDesktopRichTextAtService } from "../richTextAtService.interface.ts";

export function createDesktopRichTextMentionService(input: {
  richTextAtService: IDesktopRichTextAtService;
  workspaceId: string;
}): RichTextMentionService {
  return createRichTextMentionService({
    providers: input.richTextAtService.getProviders({
      capabilities: [
        "file",
        "workspace-app",
        "workspace-issue",
        "agent-target",
        "agent-session"
      ],
      surface: "desktop-workspace-root",
      target: "workspace",
      workspaceId: input.workspaceId
    })
  });
}
