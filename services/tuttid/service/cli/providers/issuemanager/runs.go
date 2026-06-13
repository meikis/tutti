package issuemanager

import (
	"context"

	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
	workspaceservice "github.com/tutti-os/tutti/services/tuttid/service/workspace"
)

func (p Provider) newRunListCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.run.list",
			Path:        []string{"issue", "task", "run", "list"},
			Summary:     "List issue task runs",
			Description: "List runs for an issue task.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty(),
				"task-id":  stringProperty(),
			}, "issue-id", "task-id"),
			Output: cliservice.CapabilityOutput{
				DefaultMode: cliservice.OutputModeTable,
				JSON:        true,
				Table:       &cliservice.TableOutput{Columns: runColumns},
			},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireIssueManager(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issueID, taskID, err := issueTaskIDs(request.Input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			runs, err := p.issues.ListRuns(ctx, workspaceID, issueID, taskID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if request.OutputMode == cliservice.OutputModeJSON {
				return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"runs": runValues(runs)}}, nil
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeTable, Columns: runColumns, Rows: runRows(runs)}, nil
		},
	}
}

func (p Provider) newRunGetCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.run.get",
			Path:        []string{"issue", "task", "run", "get"},
			Summary:     "Get issue task run detail",
			Description: "Get run detail and outputs for an issue task.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty(),
				"task-id":  stringProperty(),
				"run-id":   stringProperty(),
			}, "issue-id", "task-id", "run-id"),
			Output: cliservice.CapabilityOutput{DefaultMode: cliservice.OutputModeJSON, JSON: true},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireIssueManager(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issueID, taskID, err := issueTaskIDs(request.Input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			runID, err := cliservice.RequiredStringInput(request.Input, "run-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			detail, err := p.issues.GetRunDetail(ctx, workspaceID, issueID, taskID, runID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
				"detail": map[string]any{
					"run":     runValue(detail.Run),
					"outputs": runOutputValues(detail.Outputs),
				},
			}}, nil
		},
	}
}

func (p Provider) newRunCreateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.run.create",
			Path:        []string{"issue", "task", "run", "create"},
			Summary:     "Create an issue task run",
			Description: "Create an execution run for an issue task. Do not use for breakdown-only work.",
			InputSchema: objectSchema(map[string]any{
				"issue-id":         stringProperty(),
				"task-id":          stringProperty(),
				"run-id":           stringProperty(),
				"agent-provider":   stringProperty(),
				"agent-user-id":    stringProperty(),
				"agent-session-id": stringProperty(),
			}, "issue-id", "task-id", "agent-provider", "agent-session-id"),
			Output: cliservice.CapabilityOutput{DefaultMode: cliservice.OutputModeJSON, JSON: true},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireIssueManager(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issueID, taskID, err := issueTaskIDs(request.Input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			agentProvider, err := cliservice.RequiredStringInput(request.Input, "agent-provider")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			agentSessionID, err := cliservice.RequiredStringInput(request.Input, "agent-session-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			runID, _, err := cliservice.StringInput(request.Input, "run-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			agentUserID, _, err := cliservice.StringInput(request.Input, "agent-user-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			run, err := p.issues.CreateRun(ctx, workspaceID, issueID, taskID, workspaceservice.CreateIssueManagerRunInput{
				RunID:          runID,
				AgentProvider:  agentProvider,
				AgentUserID:    agentUserID,
				AgentSessionID: agentSessionID,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"run": runValue(run)}}, nil
		},
	}
}

func (p Provider) newIssueRunCreateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.run.create",
			Path:        []string{"issue", "run", "create"},
			Summary:     "Create an issue run",
			Description: "Create an execution run for an issue. Do not use for breakdown-only work.",
			InputSchema: objectSchema(map[string]any{
				"issue-id":         stringProperty(),
				"run-id":           stringProperty(),
				"agent-provider":   stringProperty(),
				"agent-user-id":    stringProperty(),
				"agent-session-id": stringProperty(),
			}, "issue-id", "agent-provider", "agent-session-id"),
			Output: cliservice.CapabilityOutput{DefaultMode: cliservice.OutputModeJSON, JSON: true},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireIssueManager(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issueID, err := cliservice.RequiredStringInput(request.Input, "issue-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			agentProvider, err := cliservice.RequiredStringInput(request.Input, "agent-provider")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			agentSessionID, err := cliservice.RequiredStringInput(request.Input, "agent-session-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			runID, _, err := cliservice.StringInput(request.Input, "run-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			agentUserID, _, err := cliservice.StringInput(request.Input, "agent-user-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			run, err := p.issues.CreateRun(ctx, workspaceID, issueID, "", workspaceservice.CreateIssueManagerRunInput{
				RunID:          runID,
				AgentProvider:  agentProvider,
				AgentUserID:    agentUserID,
				AgentSessionID: agentSessionID,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"run": runValue(run)}}, nil
		},
	}
}

func (p Provider) newRunCompleteCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.run.complete",
			Path:        []string{"issue", "task", "run", "complete"},
			Summary:     "Complete an issue task run",
			Description: "Complete an execution run and attach output metadata. Do not use for breakdown-only work.",
			InputSchema: objectSchema(map[string]any{
				"issue-id":      stringProperty(),
				"task-id":       stringProperty(),
				"run-id":        stringProperty(),
				"status":        stringProperty(),
				"summary":       stringProperty(),
				"error-message": stringProperty(),
				"outputs":       stringProperty(),
			}, "issue-id", "task-id", "run-id", "status"),
			Output: cliservice.CapabilityOutput{DefaultMode: cliservice.OutputModeJSON, JSON: true},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireIssueManager(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issueID, taskID, err := issueTaskIDs(request.Input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			runID, err := cliservice.RequiredStringInput(request.Input, "run-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			status, err := cliservice.RequiredStringInput(request.Input, "status")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			summary, _, err := cliservice.StringInput(request.Input, "summary")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			errorMessage, _, err := cliservice.StringInput(request.Input, "error-message")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			outputsRaw, _, err := cliservice.StringInput(request.Input, "outputs")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			outputs, err := parseRunOutputs(outputsRaw)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			detail, err := p.issues.CompleteRun(ctx, workspaceID, issueID, taskID, runID, workspaceservice.CompleteIssueManagerRunInput{
				Status:       status,
				Summary:      summary,
				ErrorMessage: errorMessage,
				Outputs:      outputs,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
				"run":     runValue(detail.Run),
				"outputs": runOutputValues(detail.Outputs),
			}}, nil
		},
	}
}

func (p Provider) newIssueRunCompleteCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.run.complete",
			Path:        []string{"issue", "run", "complete"},
			Summary:     "Complete an issue run",
			Description: "Complete an issue-level execution run and attach output metadata. Do not use for breakdown-only work.",
			InputSchema: objectSchema(map[string]any{
				"issue-id":      stringProperty(),
				"run-id":        stringProperty(),
				"status":        stringProperty(),
				"summary":       stringProperty(),
				"error-message": stringProperty(),
				"outputs":       stringProperty(),
			}, "issue-id", "run-id", "status"),
			Output: cliservice.CapabilityOutput{DefaultMode: cliservice.OutputModeJSON, JSON: true},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireIssueManager(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issueID, err := cliservice.RequiredStringInput(request.Input, "issue-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			runID, err := cliservice.RequiredStringInput(request.Input, "run-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			status, err := cliservice.RequiredStringInput(request.Input, "status")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			summary, _, err := cliservice.StringInput(request.Input, "summary")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			errorMessage, _, err := cliservice.StringInput(request.Input, "error-message")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			outputsRaw, _, err := cliservice.StringInput(request.Input, "outputs")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			outputs, err := parseRunOutputs(outputsRaw)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			detail, err := p.issues.CompleteRun(ctx, workspaceID, issueID, "", runID, workspaceservice.CompleteIssueManagerRunInput{
				Status:       status,
				Summary:      summary,
				ErrorMessage: errorMessage,
				Outputs:      outputs,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
				"run":     runValue(detail.Run),
				"outputs": runOutputValues(detail.Outputs),
			}}, nil
		},
	}
}

func issueTaskIDs(input map[string]any) (string, string, error) {
	issueID, err := cliservice.RequiredStringInput(input, "issue-id")
	if err != nil {
		return "", "", err
	}
	taskID, err := cliservice.RequiredStringInput(input, "task-id")
	if err != nil {
		return "", "", err
	}
	return issueID, taskID, nil
}
