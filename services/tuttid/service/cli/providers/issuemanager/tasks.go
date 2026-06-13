package issuemanager

import (
	"context"

	workspaceissues "github.com/tutti-os/tutti/packages/workspace/issues"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
	workspaceservice "github.com/tutti-os/tutti/services/tuttid/service/workspace"
)

func (p Provider) newTaskListCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.list",
			Path:        []string{"issue", "task", "list"},
			Summary:     "List issue tasks",
			Description: "List tasks under an issue.",
			InputSchema: objectSchema(map[string]any{
				"issue-id":   stringProperty(),
				"status":     stringProperty(),
				"search":     stringProperty(),
				"page-size":  integerProperty(),
				"page-token": stringProperty(),
			}, "issue-id"),
			Output: cliservice.CapabilityOutput{
				DefaultMode: cliservice.OutputModeTable,
				JSON:        true,
				Table:       &cliservice.TableOutput{Columns: taskColumns},
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
			issueID, err := cliservice.RequiredStringInput(request.Input, "issue-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			input, err := listInput(request.Input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			list, err := p.issues.ListTasks(ctx, workspaceID, issueID, input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if request.OutputMode == cliservice.OutputModeJSON {
				value := map[string]any{
					"tasks":        taskValues(list.Items),
					"totalCount":   list.TotalCount,
					"statusCounts": statusCountsValue(list.StatusCounts),
				}
				maybeAddNextPageToken(value, list.NextPageToken)
				return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: value}, nil
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeTable, Columns: taskColumns, Rows: taskRows(list.Items)}, nil
		},
	}
}

func (p Provider) newTaskGetCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.get",
			Path:        []string{"issue", "task", "get"},
			Summary:     "Get issue task detail",
			Description: "Get task detail, latest run, recent runs, and latest outputs.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty(),
				"task-id":  stringProperty(),
			}, "issue-id", "task-id"),
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
			taskID, err := cliservice.RequiredStringInput(request.Input, "task-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			detail, err := p.issues.GetTaskDetail(ctx, workspaceID, issueID, taskID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			var latestRun any
			if detail.LatestRun != nil {
				latestRun = runValue(*detail.LatestRun)
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
				"detail": map[string]any{
					"task":          taskValue(detail.Task),
					"contextRefs":   contextRefValues(detail.ContextRefs),
					"latestRun":     latestRun,
					"recentRuns":    runValues(detail.RecentRuns),
					"latestOutputs": runOutputValues(detail.LatestOutputs),
				},
			}}, nil
		},
	}
}

func (p Provider) newTaskCreateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.create",
			Path:        []string{"issue", "task", "create"},
			Summary:     "Create an issue task",
			Description: "Create a child task under an issue. Use this to persist task breakdown output without creating a run.",
			InputSchema: objectSchema(map[string]any{
				"issue-id":    stringProperty("Issue that owns the task."),
				"task-id":     stringProperty("Stable task id to create; generated when omitted."),
				"title":       stringProperty("Task title."),
				"content":     stringProperty("Task instructions or notes."),
				"priority":    stringProperty("Task priority: high, medium, or low."),
				"due-at-unix": integerProperty("Due time as a Unix timestamp in seconds."),
			}, "issue-id", "title"),
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
			title, err := cliservice.RequiredStringInput(request.Input, "title")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			taskID, _, err := cliservice.StringInput(request.Input, "task-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			content, _, err := cliservice.StringInput(request.Input, "content")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			priority, _, err := cliservice.StringInput(request.Input, "priority")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			dueAtUnix, _, err := cliservice.Int64Input(request.Input, "due-at-unix")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			task, err := p.issues.CreateTask(ctx, workspaceID, issueID, workspaceservice.CreateIssueManagerTaskInput{
				TaskID:      taskID,
				Title:       title,
				Content:     content,
				Priority:    priority,
				DueAtUnixMS: dueAtUnix * 1000,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"task": taskValue(task)}}, nil
		},
	}
}

func (p Provider) newTaskUpdateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.update",
			Path:        []string{"issue", "task", "update"},
			Summary:     "Update an issue task",
			Description: "Update a task under an issue. Breakdown updates should edit task fields without creating or completing runs.",
			InputSchema: objectSchema(map[string]any{
				"issue-id":    stringProperty("Issue that owns the task."),
				"task-id":     stringProperty("Task to update."),
				"title":       stringProperty("Replace the task title."),
				"content":     stringProperty("Replace the task instructions or notes."),
				"status":      stringProperty("Task status: not_started, running, in_progress, pending_acceptance, completed, failed, or canceled."),
				"priority":    stringProperty("Task priority: high, medium, or low."),
				"due-at-unix": integerProperty("Set due time as a Unix timestamp in seconds."),
			}, "issue-id", "task-id"),
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
			taskID, err := cliservice.RequiredStringInput(request.Input, "task-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			title, hasTitle, err := cliservice.StringInput(request.Input, "title")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			content, hasContent, err := cliservice.StringInput(request.Input, "content")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			status, hasStatus, err := cliservice.StringInput(request.Input, "status")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			priority, hasPriority, err := cliservice.StringInput(request.Input, "priority")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			dueAtUnix, hasDueAt, err := cliservice.Int64Input(request.Input, "due-at-unix")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if !hasTitle && !hasContent && !hasStatus && !hasPriority && !hasDueAt {
				return cliservice.CommandOutput{}, workspaceissues.ErrInvalidArgument
			}
			task, err := p.issues.UpdateTask(ctx, workspaceID, issueID, taskID, workspaceservice.UpdateIssueManagerTaskInput{
				Title:       title,
				HasTitle:    hasTitle,
				Content:     content,
				HasContent:  hasContent,
				Status:      status,
				HasStatus:   hasStatus,
				Priority:    priority,
				HasPriority: hasPriority,
				DueAtUnixMS: dueAtUnix * 1000,
				HasDueAt:    hasDueAt,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"task": taskValue(task)}}, nil
		},
	}
}

func (p Provider) newTaskDeleteCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.task.delete",
			Path:        []string{"issue", "task", "delete"},
			Summary:     "Delete an issue task",
			Description: "Delete a task under an issue.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty(),
				"task-id":  stringProperty(),
			}, "issue-id", "task-id"),
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
			taskID, err := cliservice.RequiredStringInput(request.Input, "task-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			removed, err := p.issues.DeleteTask(ctx, workspaceID, issueID, taskID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"removed": removed}}, nil
		},
	}
}
