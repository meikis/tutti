package agent

import (
	"errors"
	"testing"
)

func TestPromptAttachmentStoreRejectsDotPathSegments(t *testing.T) {
	store := PromptAttachmentStore{RootDir: t.TempDir()}
	for _, input := range []struct {
		name           string
		workspaceID    string
		agentSessionID string
		attachmentID   string
	}{
		{name: "workspace dotdot", workspaceID: "..", agentSessionID: "session-1", attachmentID: "attachment-1"},
		{name: "session dotdot", workspaceID: "workspace-1", agentSessionID: "..", attachmentID: "attachment-1"},
		{name: "attachment dot", workspaceID: "workspace-1", agentSessionID: "session-1", attachmentID: "."},
	} {
		t.Run(input.name, func(t *testing.T) {
			_, err := store.attachmentPath(input.workspaceID, input.agentSessionID, input.attachmentID, "image/png")
			if !errors.Is(err, ErrInvalidArgument) {
				t.Fatalf("attachmentPath error = %v, want ErrInvalidArgument", err)
			}
		})
	}
}
