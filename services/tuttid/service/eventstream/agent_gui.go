package eventstream

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tutti-os/tutti/services/tuttid/biz/agentgui"
)

type AgentGUILaunchPublisher struct {
	Service *Service
}

func (p AgentGUILaunchPublisher) PublishAgentGUILaunchRequested(
	ctx context.Context,
	request agentgui.LaunchRequest,
) error {
	if p.Service == nil {
		return nil
	}
	request = agentgui.NormalizeLaunchRequest(request)
	if request.WorkspaceID == "" || request.AgentSessionID == "" || request.Provider == "" {
		return fmt.Errorf("agent gui launch request requires workspaceId, agentSessionId, and provider")
	}
	payload := agentGUILaunchRequestedPayload{
		WorkspaceID:    request.WorkspaceID,
		AgentSessionID: request.AgentSessionID,
		Provider:       request.Provider,
		Source:         firstNonEmptyString(request.Source, "cli"),
		Reason:         strings.TrimSpace(request.Reason),
		RequestID:      strings.TrimSpace(request.RequestID),
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal agent gui launch requested payload: %w", err)
	}
	return p.Service.PublishFromServerScoped(
		ctx,
		TopicAgentGUILaunchRequested,
		encoded,
		EventScope{WorkspaceID: request.WorkspaceID},
	)
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if trimmed := strings.TrimSpace(value); trimmed != "" {
			return trimmed
		}
	}
	return ""
}
