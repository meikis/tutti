package issuemanager

import (
	"encoding/json"
	"mime"
	"path/filepath"
	"strings"

	workspaceissues "github.com/tutti-os/tutti/packages/workspace/issues"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
	workspaceservice "github.com/tutti-os/tutti/services/tuttid/service/workspace"
)

func listInput(input map[string]any) (workspaceservice.ListIssueManagerItemsInput, error) {
	result := workspaceservice.ListIssueManagerItemsInput{}
	var err error
	if result.TopicID, err = cliservice.RequiredStringInput(input, "topic-id"); err != nil {
		return result, err
	}
	if result.StatusFilter, _, err = cliservice.StringInput(input, "status"); err != nil {
		return result, err
	}
	if result.SearchQuery, _, err = cliservice.StringInput(input, "search"); err != nil {
		return result, err
	}
	if result.PageToken, _, err = cliservice.StringInput(input, "page-token"); err != nil {
		return result, err
	}
	if result.PageSize, _, err = cliservice.IntInput(input, "page-size"); err != nil {
		return result, err
	}
	return result, nil
}

func parseRunOutputs(raw string) ([]workspaceissues.CompleteRunOutputInput, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	var decoded []map[string]any
	if err := json.Unmarshal([]byte(raw), &decoded); err != nil {
		return nil, workspaceissues.ErrInvalidArgument
	}
	outputs := make([]workspaceissues.CompleteRunOutputInput, 0, len(decoded))
	for _, item := range decoded {
		pathValue := stringMapValue(item, "path")
		if strings.TrimSpace(pathValue) == "" {
			return nil, workspaceissues.ErrInvalidArgument
		}
		displayName := stringMapValue(item, "displayName")
		if displayName == "" {
			displayName = stringMapValue(item, "title")
		}
		mediaType := stringMapValue(item, "mediaType")
		if mediaType == "" {
			mediaType = mediaTypeByPath(pathValue)
		}
		outputs = append(outputs, workspaceissues.CompleteRunOutputInput{
			OutputID:    stringMapValue(item, "outputId"),
			Path:        pathValue,
			DisplayName: displayName,
			MediaType:   mediaType,
			SizeBytes:   int64MapValue(item, "sizeBytes"),
		})
	}
	return outputs, nil
}

func mediaTypeByPath(path string) string {
	mediaType := mime.TypeByExtension(filepath.Ext(path))
	if mediaType != "" {
		return mediaType
	}
	switch strings.ToLower(filepath.Ext(path)) {
	case ".md", ".markdown":
		return "text/markdown; charset=utf-8"
	case ".json":
		return "application/json"
	case ".txt", ".log":
		return "text/plain; charset=utf-8"
	default:
		return "application/octet-stream"
	}
}

func stringMapValue(item map[string]any, key string) string {
	value, ok := item[key]
	if !ok || value == nil {
		return ""
	}
	text, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(text)
}

func int64MapValue(item map[string]any, key string) int64 {
	value, ok := item[key]
	if !ok || value == nil {
		return 0
	}
	switch typed := value.(type) {
	case float64:
		return int64(typed)
	case string:
		var decoded int64
		if err := json.Unmarshal([]byte(typed), &decoded); err == nil {
			return decoded
		}
	}
	return 0
}

func stringProperty(description ...string) map[string]any {
	return schemaProperty("string", description...)
}

func integerProperty(description ...string) map[string]any {
	return schemaProperty("string", description...)
}

func booleanProperty(description ...string) map[string]any {
	return schemaProperty("boolean", description...)
}

func schemaProperty(propertyType string, description ...string) map[string]any {
	property := map[string]any{"type": propertyType}
	if len(description) > 0 && strings.TrimSpace(description[0]) != "" {
		property["description"] = strings.TrimSpace(description[0])
	}
	return property
}

func boolInput(input map[string]any, key string) (bool, bool, error) {
	value, ok := input[key]
	if !ok || value == nil {
		return false, false, nil
	}
	if typed, ok := value.(bool); ok {
		return typed, true, nil
	}
	raw, ok := value.(string)
	if !ok {
		return false, true, cliservice.ErrInvalidInput
	}
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "1", "true", "yes", "on":
		return true, true, nil
	case "0", "false", "no", "off":
		return false, true, nil
	default:
		return false, true, cliservice.ErrInvalidInput
	}
}

func issueStatusDescription() string {
	return "Issue status: not_started, running, in_progress, pending_acceptance, completed, failed, or canceled."
}

func objectSchema(properties map[string]any, required ...string) map[string]any {
	schema := map[string]any{
		"type":       "object",
		"properties": properties,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	return schema
}
