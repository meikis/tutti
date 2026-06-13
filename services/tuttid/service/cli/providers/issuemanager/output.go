package issuemanager

import (
	"strings"

	workspaceissues "github.com/tutti-os/tutti/packages/workspace/issues"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
)

var issueColumns = []cliservice.TableColumn{
	{Key: "id", Label: "ID"},
	{Key: "title", Label: "Title"},
	{Key: "status", Label: "Status"},
	{Key: "updatedAt", Label: "Updated"},
}

var topicColumns = []cliservice.TableColumn{
	{Key: "id", Label: "ID"},
	{Key: "title", Label: "Title"},
	{Key: "default", Label: "Default"},
	{Key: "pinned", Label: "Pinned"},
	{Key: "lastActivityAt", Label: "Last Activity"},
}

var taskColumns = []cliservice.TableColumn{
	{Key: "id", Label: "ID"},
	{Key: "title", Label: "Title"},
	{Key: "status", Label: "Status"},
	{Key: "priority", Label: "Priority"},
	{Key: "updatedAt", Label: "Updated"},
}

var runColumns = []cliservice.TableColumn{
	{Key: "id", Label: "ID"},
	{Key: "status", Label: "Status"},
	{Key: "agentProvider", Label: "Provider"},
	{Key: "agentSessionId", Label: "Session"},
	{Key: "updatedAt", Label: "Updated"},
}

func issueRows(items []workspaceissues.Issue) []map[string]any {
	rows := make([]map[string]any, 0, len(items))
	for _, issue := range items {
		rows = append(rows, map[string]any{
			"id":        issue.IssueID,
			"topicId":   issue.TopicID,
			"title":     issue.Title,
			"status":    string(issue.Status),
			"updatedAt": issue.UpdatedAtUnixMS,
		})
	}
	return rows
}

func topicRows(items []workspaceissues.Topic) []map[string]any {
	rows := make([]map[string]any, 0, len(items))
	for _, topic := range items {
		rows = append(rows, map[string]any{
			"id":             topic.TopicID,
			"title":          topic.Title,
			"default":        topic.IsDefault,
			"pinned":         topic.PinnedAtUnixMS > 0,
			"lastActivityAt": topic.LastActivityAtUnixMS,
		})
	}
	return rows
}

func taskRows(items []workspaceissues.Task) []map[string]any {
	rows := make([]map[string]any, 0, len(items))
	for _, task := range items {
		rows = append(rows, map[string]any{
			"id":        task.TaskID,
			"title":     task.Title,
			"status":    string(task.Status),
			"priority":  string(task.Priority),
			"updatedAt": task.UpdatedAtUnixMS,
		})
	}
	return rows
}

func runRows(items []workspaceissues.Run) []map[string]any {
	rows := make([]map[string]any, 0, len(items))
	for _, run := range items {
		rows = append(rows, map[string]any{
			"id":             run.RunID,
			"status":         string(run.Status),
			"agentProvider":  run.AgentProvider,
			"agentSessionId": run.AgentSessionID,
			"updatedAt":      run.UpdatedAtUnixMS,
		})
	}
	return rows
}

func topicValue(item workspaceissues.Topic) map[string]any {
	return map[string]any{
		"topicId":              item.TopicID,
		"workspaceId":          item.WorkspaceID,
		"title":                item.Title,
		"summary":              item.Summary,
		"isDefault":            item.IsDefault,
		"pinnedAtUnixMs":       item.PinnedAtUnixMS,
		"lastActivityAtUnixMs": item.LastActivityAtUnixMS,
		"createdAtUnixMs":      item.CreatedAtUnixMS,
		"updatedAtUnixMs":      item.UpdatedAtUnixMS,
	}
}

func issueValue(item workspaceissues.Issue) map[string]any {
	return map[string]any{
		"issueId":                item.IssueID,
		"workspaceId":            item.WorkspaceID,
		"topicId":                item.TopicID,
		"title":                  item.Title,
		"content":                item.Content,
		"status":                 string(item.Status),
		"taskCount":              item.TaskCount,
		"notStartedCount":        item.NotStartedCount,
		"runningCount":           item.RunningCount,
		"pendingAcceptanceCount": item.PendingAcceptanceCount,
		"completedCount":         item.CompletedCount,
		"failedCount":            item.FailedCount,
		"canceledCount":          item.CanceledCount,
		"creatorUserId":          item.CreatorUserID,
		"creatorDisplayName":     item.CreatorDisplayName,
		"creatorAvatarUrl":       item.CreatorAvatarURL,
		"createdAtUnixMs":        item.CreatedAtUnixMS,
		"updatedAtUnixMs":        item.UpdatedAtUnixMS,
	}
}

func taskValue(item workspaceissues.Task) map[string]any {
	return map[string]any{
		"taskId":             item.TaskID,
		"issueId":            item.IssueID,
		"workspaceId":        item.WorkspaceID,
		"title":              item.Title,
		"content":            item.Content,
		"status":             string(item.Status),
		"priority":           string(item.Priority),
		"sortIndex":          item.SortIndex,
		"dueAtUnixMs":        item.DueAtUnixMS,
		"creatorUserId":      item.CreatorUserID,
		"creatorDisplayName": item.CreatorDisplayName,
		"creatorAvatarUrl":   item.CreatorAvatarURL,
		"latestRunId":        item.LatestRunID,
		"createdAtUnixMs":    item.CreatedAtUnixMS,
		"updatedAtUnixMs":    item.UpdatedAtUnixMS,
	}
}

func runValue(item workspaceissues.Run) map[string]any {
	return map[string]any{
		"runId":              item.RunID,
		"taskId":             item.TaskID,
		"issueId":            item.IssueID,
		"workspaceId":        item.WorkspaceID,
		"requesterUserId":    item.RequesterUserID,
		"agentUserId":        item.AgentUserID,
		"agentSessionId":     item.AgentSessionID,
		"agentProvider":      item.AgentProvider,
		"status":             string(item.Status),
		"summary":            item.Summary,
		"errorMessage":       item.ErrorMessage,
		"outputDir":          item.OutputDir,
		"executionDirectory": item.ExecutionDirectory,
		"createdAtUnixMs":    item.CreatedAtUnixMS,
		"startedAtUnixMs":    item.StartedAtUnixMS,
		"completedAtUnixMs":  item.CompletedAtUnixMS,
		"updatedAtUnixMs":    item.UpdatedAtUnixMS,
	}
}

func runOutputValue(item workspaceissues.RunOutput) map[string]any {
	return map[string]any{
		"outputId":        item.OutputID,
		"runId":           item.RunID,
		"taskId":          item.TaskID,
		"issueId":         item.IssueID,
		"workspaceId":     item.WorkspaceID,
		"path":            item.Path,
		"displayName":     item.DisplayName,
		"mediaType":       item.MediaType,
		"sizeBytes":       item.SizeBytes,
		"createdAtUnixMs": item.CreatedAtUnixMS,
	}
}

func contextRefValue(item workspaceissues.ContextRef) map[string]any {
	return map[string]any{
		"contextRefId":    item.ContextRefID,
		"workspaceId":     item.WorkspaceID,
		"issueId":         item.IssueID,
		"taskId":          item.TaskID,
		"parentKind":      string(item.ParentKind),
		"refType":         item.RefType,
		"path":            item.Path,
		"displayName":     item.DisplayName,
		"createdAtUnixMs": item.CreatedAtUnixMS,
	}
}

func topicValues(items []workspaceissues.Topic) []any {
	values := make([]any, 0, len(items))
	for _, item := range items {
		values = append(values, topicValue(item))
	}
	return values
}

func issueValues(items []workspaceissues.Issue) []any {
	values := make([]any, 0, len(items))
	for _, item := range items {
		values = append(values, issueValue(item))
	}
	return values
}

func taskValues(items []workspaceissues.Task) []any {
	values := make([]any, 0, len(items))
	for _, item := range items {
		values = append(values, taskValue(item))
	}
	return values
}

func runValues(items []workspaceissues.Run) []any {
	values := make([]any, 0, len(items))
	for _, item := range items {
		values = append(values, runValue(item))
	}
	return values
}

func runOutputValues(items []workspaceissues.RunOutput) []any {
	values := make([]any, 0, len(items))
	for _, item := range items {
		values = append(values, runOutputValue(item))
	}
	return values
}

func contextRefValues(items []workspaceissues.ContextRef) []any {
	values := make([]any, 0, len(items))
	for _, item := range items {
		values = append(values, contextRefValue(item))
	}
	return values
}

func statusCountsValue(counts workspaceissues.StatusCounts) map[string]any {
	return map[string]any{
		"all":               counts.All,
		"notStarted":        counts.NotStarted,
		"running":           counts.Running,
		"pendingAcceptance": counts.PendingAcceptance,
		"completed":         counts.Completed,
		"failed":            counts.Failed,
		"canceled":          counts.Canceled,
	}
}

func maybeAddNextPageToken(value map[string]any, token string) {
	if token = strings.TrimSpace(token); token != "" {
		value["nextPageToken"] = token
	}
}
