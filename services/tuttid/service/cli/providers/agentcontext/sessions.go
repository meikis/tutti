package agentcontext

import (
	"context"
	"strings"

	agentservice "github.com/tutti-os/tutti/services/tuttid/service/agent"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
)

var sessionColumns = []cliservice.TableColumn{
	{Key: "id", Label: "ID"},
	{Key: "provider", Label: "Provider"},
	{Key: "status", Label: "Status"},
	{Key: "title", Label: "Title"},
}

func (p Provider) newSessionsCommand(path []string, id string) cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          id,
			Path:        path,
			Summary:     "List agent sessions",
			Description: "List agent sessions in the current workspace.",
			Output: cliservice.CapabilityOutput{
				DefaultMode: cliservice.OutputModeTable,
				JSON:        true,
				Table:       &cliservice.TableOutput{Columns: sessionColumns},
			},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireSessions(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			sessions, err := p.sessions.List(ctx, workspaceID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if request.OutputMode == cliservice.OutputModeJSON {
				return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"sessions": sessionValues(sessions)}}, nil
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeTable, Columns: sessionColumns, Rows: sessionRows(sessions)}, nil
		},
	}
}

func (p Provider) newSessionMessagesCommand(path []string, id string) cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          id,
			Path:        path,
			Summary:     "Get agent session messages",
			Description: "Get recent messages for an agent session.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"session-id":    map[string]any{"type": "string"},
					"limit":         map[string]any{"type": "string"},
					"after-version": map[string]any{"type": "string"},
				},
				"required": []string{"session-id"},
			},
			Output: cliservice.CapabilityOutput{DefaultMode: cliservice.OutputModeJSON, JSON: true},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireSessions(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			sessionID, err := cliservice.RequiredStringInput(request.Input, "session-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			limit, _, err := cliservice.IntInput(request.Input, "limit")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			afterVersion, _, err := cliservice.Int64Input(request.Input, "after-version")
			if err != nil || afterVersion < 0 {
				return cliservice.CommandOutput{}, agentservice.ErrInvalidArgument
			}
			page, err := p.sessions.ListMessages(ctx, workspaceID, sessionID, agentservice.ListMessagesInput{
				AfterVersion: uint64(afterVersion),
				Limit:        limit,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
				"agentSessionId": page.AgentSessionID,
				"messages":       messageValues(page.Messages),
				"latestVersion":  page.LatestVersion,
				"hasMore":        page.HasMore,
			}}, nil
		},
	}
}

func sessionRows(sessions []agentservice.Session) []map[string]any {
	rows := make([]map[string]any, 0, len(sessions))
	for _, session := range sessions {
		title := ""
		if session.Title != nil {
			title = *session.Title
		}
		rows = append(rows, map[string]any{
			"id":       session.ID,
			"provider": session.Provider,
			"status":   session.Status,
			"title":    strings.TrimSpace(title),
		})
	}
	return rows
}
