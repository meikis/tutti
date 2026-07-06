package agent

import (
	"encoding/json"
	"strings"
	"testing"

	agentsessionstore "github.com/tutti-os/tutti/packages/agentactivity/daemon/activity"
	eventstream "github.com/tutti-os/tutti/services/tuttid/service/eventstream"
)

// Contract test between the activity projection's push payload builder and the
// event stream catalog schema. The catalog decodes state_patch data with
// DisallowUnknownFields, so a field added to the payload but not to the schema
// fails the WHOLE publish — the GUI then misses the settle entirely and the
// conversation looks like it never finishes. This test replays the exact
// publisher wrapping (AgentActivityPublisher) against the catalog validator.
func TestActivityStatePatchEventPayloadPassesEventCatalogValidation(t *testing.T) {
	t.Parallel()

	activeTurnID := "turn-1"
	inputs := map[string]agentsessionstore.ReportSessionStateInput{
		"running turn": {
			WorkspaceID:    "workspace-1",
			AgentSessionID: "agent-session-1",
			State: agentsessionstore.WorkspaceAgentSessionStateUpdate{
				Provider:         "codex",
				AgentTargetID:    "local:codex",
				CurrentPhase:     "working",
				OccurredAtUnixMS: 1000,
				SubmitAvailability: &agentsessionstore.WorkspaceAgentSubmitAvailability{
					State:  "blocked",
					Reason: "active_turn",
				},
				Turn: &agentsessionstore.WorkspaceAgentTurnStateUpdate{
					TurnID:       "turn-1",
					ActiveTurnID: &activeTurnID,
					Phase:        "running",
					SubmitAvailability: &agentsessionstore.WorkspaceAgentSubmitAvailability{
						State:  "blocked",
						Reason: "active_turn",
					},
					StartedAtUnixMS: 1000,
				},
			},
		},
		"settled turn": {
			WorkspaceID:    "workspace-1",
			AgentSessionID: "agent-session-1",
			State: agentsessionstore.WorkspaceAgentSessionStateUpdate{
				Provider:         "codex",
				CurrentPhase:     "idle",
				OccurredAtUnixMS: 2000,
				SubmitAvailability: &agentsessionstore.WorkspaceAgentSubmitAvailability{
					State: "available",
				},
				Turn: &agentsessionstore.WorkspaceAgentTurnStateUpdate{
					TurnID:  "turn-1",
					Phase:   "settled",
					Outcome: "completed",
					SubmitAvailability: &agentsessionstore.WorkspaceAgentSubmitAvailability{
						State: "available",
					},
					CompletedAtUnixMS: 2000,
				},
			},
		},
	}

	catalog := eventstream.DefaultCatalog()
	for name, input := range inputs {
		t.Run(name, func(t *testing.T) {
			t.Parallel()

			payload := wrapAgentActivityUpdatedEnvelope(t, input, activityStatePatchEventPayload(input, 1000))
			if err := catalog.ValidatePublish(
				eventstream.TopicAgentActivityUpdated,
				eventstream.DirectionServerToClient,
				payload,
			); err != nil {
				t.Fatalf("ValidatePublish() error = %v, want nil", err)
			}
		})
	}
}

// wrapAgentActivityUpdatedEnvelope mirrors AgentActivityPublisher's envelope
// construction so the validated bytes match production publishes.
func wrapAgentActivityUpdatedEnvelope(
	t *testing.T,
	input agentsessionstore.ReportSessionStateInput,
	data map[string]any,
) []byte {
	t.Helper()
	workspaceID := strings.TrimSpace(input.WorkspaceID)
	agentSessionID := strings.TrimSpace(input.AgentSessionID)
	if _, ok := data["workspaceId"]; !ok {
		data["workspaceId"] = workspaceID
	}
	if _, ok := data["agentSessionId"]; !ok {
		data["agentSessionId"] = agentSessionID
	}
	if _, ok := data["eventType"]; !ok {
		data["eventType"] = "state_patch"
	}
	dataPayload, err := json.Marshal(data)
	if err != nil {
		t.Fatalf("marshal data: %v", err)
	}
	payload, err := json.Marshal(map[string]any{
		"workspaceId":    workspaceID,
		"agentSessionId": agentSessionID,
		"eventType":      "state_patch",
		"data":           json.RawMessage(dataPayload),
	})
	if err != nil {
		t.Fatalf("marshal payload: %v", err)
	}
	return payload
}
