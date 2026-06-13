package issuemanager

import (
	"context"

	workspaceissues "github.com/tutti-os/tutti/packages/workspace/issues"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
	workspaceservice "github.com/tutti-os/tutti/services/tuttid/service/workspace"
)

func (p Provider) newIssueListCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.list",
			Path:        []string{"issue", "list"},
			Summary:     "List issues",
			Description: "List issue records in a specific workspace topic.",
			InputSchema: objectSchema(map[string]any{
				"topic-id":   stringProperty("Required topic id. Use issue topic list to discover workspace topics."),
				"status":     stringProperty(),
				"search":     stringProperty(),
				"page-size":  integerProperty(),
				"page-token": stringProperty(),
			}, "topic-id"),
			Output: cliservice.CapabilityOutput{
				DefaultMode: cliservice.OutputModeTable,
				JSON:        true,
				Table:       &cliservice.TableOutput{Columns: issueColumns},
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
			input, err := listInput(request.Input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			list, err := p.issues.ListIssues(ctx, workspaceID, input)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if request.OutputMode == cliservice.OutputModeJSON {
				value := map[string]any{
					"issues":       issueValues(list.Items),
					"totalCount":   list.TotalCount,
					"statusCounts": statusCountsValue(list.StatusCounts),
				}
				maybeAddNextPageToken(value, list.NextPageToken)
				return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: value}, nil
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeTable, Columns: issueColumns, Rows: issueRows(list.Items)}, nil
		},
	}
}

func (p Provider) newIssueGetCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.get",
			Path:        []string{"issue", "get"},
			Summary:     "Get issue detail",
			Description: "Get an issue detail record and its tasks.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty(),
			}, "issue-id"),
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
			detail, err := p.issues.GetIssueDetail(ctx, workspaceID, issueID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
				"detail": map[string]any{
					"issue":       issueValue(detail.Issue),
					"tasks":       taskValues(detail.Tasks),
					"contextRefs": contextRefValues(detail.ContextRefs),
				},
			}}, nil
		},
	}
}

func (p Provider) newIssueCreateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.create",
			Path:        []string{"issue", "create"},
			Summary:     "Create an issue",
			Description: "Create an issue in a specific workspace topic.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty(),
				"topic-id": stringProperty("Required topic id. Use issue topic list to discover workspace topics."),
				"title":    stringProperty(),
				"content":  stringProperty(),
			}, "topic-id", "title"),
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
			title, err := cliservice.RequiredStringInput(request.Input, "title")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issueID, _, err := cliservice.StringInput(request.Input, "issue-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			topicID, err := cliservice.RequiredStringInput(request.Input, "topic-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			content, _, err := cliservice.StringInput(request.Input, "content")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			issue, err := p.issues.CreateIssue(ctx, workspaceID, workspaceservice.CreateIssueManagerIssueInput{
				IssueID: issueID,
				TopicID: topicID,
				Title:   title,
				Content: content,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"issue": issueValue(issue)}}, nil
		},
	}
}

func (p Provider) newIssueUpdateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.update",
			Path:        []string{"issue", "update"},
			Summary:     "Update an issue",
			Description: "Update issue title, content, or status.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty("Issue to update."),
				"title":    stringProperty("Replace the issue title."),
				"content":  stringProperty("Replace the issue content."),
				"status":   stringProperty(issueStatusDescription()),
			}, "issue-id"),
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
			if !hasTitle && !hasContent && !hasStatus {
				return cliservice.CommandOutput{}, workspaceissues.ErrInvalidArgument
			}
			issue, err := p.issues.UpdateIssue(ctx, workspaceID, issueID, workspaceservice.UpdateIssueManagerIssueInput{
				Title:      title,
				HasTitle:   hasTitle,
				Content:    content,
				HasContent: hasContent,
				Status:     status,
				HasStatus:  hasStatus,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"issue": issueValue(issue)}}, nil
		},
	}
}

func (p Provider) newIssueDeleteCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.delete",
			Path:        []string{"issue", "delete"},
			Summary:     "Delete an issue",
			Description: "Delete an issue from the current workspace.",
			InputSchema: objectSchema(map[string]any{
				"issue-id": stringProperty(),
			}, "issue-id"),
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
			removed, err := p.issues.DeleteIssue(ctx, workspaceID, issueID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"removed": removed}}, nil
		},
	}
}
