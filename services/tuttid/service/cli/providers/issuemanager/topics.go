package issuemanager

import (
	"context"

	workspaceissues "github.com/tutti-os/tutti/packages/workspace/issues"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
	workspaceservice "github.com/tutti-os/tutti/services/tuttid/service/workspace"
)

func (p Provider) newTopicListCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.topic.list",
			Path:        []string{"issue", "topic", "list"},
			Summary:     "List issue topics",
			Description: "List workspace issue topics. Use a returned topicId when listing or creating issues.",
			Output: cliservice.CapabilityOutput{
				DefaultMode: cliservice.OutputModeTable,
				JSON:        true,
				Table:       &cliservice.TableOutput{Columns: topicColumns},
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
			list, err := p.issues.ListTopics(ctx, workspaceID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if request.OutputMode == cliservice.OutputModeJSON {
				return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
					"topics": topicValues(list.Items),
				}}, nil
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeTable, Columns: topicColumns, Rows: topicRows(list.Items)}, nil
		},
	}
}

func (p Provider) newTopicCreateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.topic.create",
			Path:        []string{"issue", "topic", "create"},
			Summary:     "Create an issue topic",
			Description: "Create a workspace issue topic.",
			InputSchema: objectSchema(map[string]any{
				"topic-id": stringProperty("Stable topic id to create; generated when omitted."),
				"title":    stringProperty("Topic title."),
				"summary":  stringProperty("Topic summary."),
			}, "title"),
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
			topicID, _, err := cliservice.StringInput(request.Input, "topic-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			summary, _, err := cliservice.StringInput(request.Input, "summary")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			topic, err := p.issues.CreateTopic(ctx, workspaceID, workspaceservice.CreateIssueManagerTopicInput{
				TopicID: topicID,
				Title:   title,
				Summary: summary,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"topic": topicValue(topic)}}, nil
		},
	}
}

func (p Provider) newTopicUpdateCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.topic.update",
			Path:        []string{"issue", "topic", "update"},
			Summary:     "Update an issue topic",
			Description: "Update a workspace issue topic title, summary, or pin state.",
			InputSchema: objectSchema(map[string]any{
				"topic-id": stringProperty("Topic to update."),
				"title":    stringProperty("Replace the topic title."),
				"summary":  stringProperty("Replace the topic summary."),
				"pinned":   booleanProperty("Set whether the topic is pinned."),
			}, "topic-id"),
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
			topicID, err := cliservice.RequiredStringInput(request.Input, "topic-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			title, hasTitle, err := cliservice.StringInput(request.Input, "title")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			summary, hasSummary, err := cliservice.StringInput(request.Input, "summary")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			pinned, hasPinned, err := boolInput(request.Input, "pinned")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if !hasTitle && !hasSummary && !hasPinned {
				return cliservice.CommandOutput{}, workspaceissues.ErrInvalidArgument
			}
			topic, err := p.issues.UpdateTopic(ctx, workspaceID, topicID, workspaceservice.UpdateIssueManagerTopicInput{
				Title:      title,
				HasTitle:   hasTitle,
				Summary:    summary,
				HasSummary: hasSummary,
				Pinned:     pinned,
				HasPinned:  hasPinned,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"topic": topicValue(topic)}}, nil
		},
	}
}

func (p Provider) newTopicDeleteCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".issue.topic.delete",
			Path:        []string{"issue", "topic", "delete"},
			Summary:     "Delete an issue topic",
			Description: "Delete an empty non-default issue topic.",
			InputSchema: objectSchema(map[string]any{
				"topic-id": stringProperty("Topic to delete."),
			}, "topic-id"),
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
			topicID, err := cliservice.RequiredStringInput(request.Input, "topic-id")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			removed, err := p.issues.DeleteTopic(ctx, workspaceID, topicID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{"removed": removed}}, nil
		},
	}
}
