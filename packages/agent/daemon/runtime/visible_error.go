package agentruntime

import (
	"fmt"
	"regexp"
	"strings"

	agentsessionstore "github.com/tutti-os/tutti/packages/agentactivity/daemon/activity"
	activityshared "github.com/tutti-os/tutti/packages/agentactivity/daemon/activity/events"
)

const (
	visibleErrorKind     = "agent_visible_error"
	visibleErrorSeverity = "error"
)

var (
	ansiEscapePattern  = regexp.MustCompile(`\x1b\[[0-9;?]*[ -/]*[@-~]`)
	authFailurePattern = regexp.MustCompile(
		`(?i)\b(api key|credentials?|log in|login|logged in|sign in|signin|token|unauthori[sz]ed|unauthenticated|not authenticated|authentication required|authentication failed|authenticate|auth required)\b|auth_required`,
	)
)

func visibleFailureTimelineItem(
	roomID string,
	source agentsessionstore.EventSource,
	event activityshared.Event,
	sessionID string,
	timestamp int64,
) (agentsessionstore.WorkspaceAgentTimelineItem, bool) {
	if event.Type != activityshared.EventSessionFailed && event.Type != activityshared.EventTurnFailed {
		return agentsessionstore.WorkspaceAgentTimelineItem{}, false
	}
	eventID := strings.TrimSpace(event.EventID)
	if strings.TrimSpace(sessionID) == "" || eventID == "" {
		return agentsessionstore.WorkspaceAgentTimelineItem{}, false
	}
	phase := "turn"
	if event.Type == activityshared.EventSessionFailed {
		phase = "start"
	}
	detail := visibleFailureDetail(event)
	code := visibleFailureCode(detail)
	provider := firstNonEmptyString(string(event.Provider), source.Provider)
	content := visibleFailureContent(provider, phase, code)
	payload := map[string]any{
		"kind":          visibleErrorKind,
		"severity":      visibleErrorSeverity,
		"phase":         phase,
		"code":          code,
		"provider":      provider,
		"sourceEventId": eventID,
		"retryable":     visibleFailureRetryable(code, detail),
		"content":       content,
		"text":          content,
	}
	if detail != "" {
		payload["detail"] = detail
	}
	return agentsessionstore.WorkspaceAgentTimelineItem{
		RoomID:           strings.TrimSpace(roomID),
		AgentSessionID:   strings.TrimSpace(sessionID),
		TurnID:           strings.TrimSpace(event.Payload.TurnID),
		EventSource:      "runtime",
		EventID:          "visible-error:" + eventID,
		ActorType:        "agent",
		ActorID:          provider,
		OccurredAtUnixMS: timestamp,
		CreatedAtUnixMS:  timestamp,
		Role:             string(activityshared.MessageRoleAssistant),
		ItemType:         "message.assistant",
		Status:           messageStreamStateFailed,
		Payload:          payload,
	}, true
}

func visibleFailureMessageUpdate(
	source agentsessionstore.EventSource,
	event activityshared.Event,
	sessionID string,
	timestamp int64,
) (agentsessionstore.WorkspaceAgentMessageUpdate, bool) {
	if event.Type != activityshared.EventSessionFailed && event.Type != activityshared.EventTurnFailed {
		return agentsessionstore.WorkspaceAgentMessageUpdate{}, false
	}
	eventID := strings.TrimSpace(event.EventID)
	if strings.TrimSpace(sessionID) == "" || eventID == "" {
		return agentsessionstore.WorkspaceAgentMessageUpdate{}, false
	}
	phase := "turn"
	if event.Type == activityshared.EventSessionFailed {
		phase = "start"
	}
	detail := visibleFailureDetail(event)
	code := visibleFailureCode(detail)
	provider := firstNonEmptyString(string(event.Provider), source.Provider)
	content := visibleFailureContent(provider, phase, code)
	payload := map[string]any{
		"kind":          visibleErrorKind,
		"severity":      visibleErrorSeverity,
		"phase":         phase,
		"code":          code,
		"provider":      provider,
		"sourceEventId": eventID,
		"retryable":     visibleFailureRetryable(code, detail),
		"content":       content,
		"text":          content,
		"source":        "runtime",
	}
	if detail != "" {
		payload["detail"] = detail
	}
	return agentsessionstore.WorkspaceAgentMessageUpdate{
		AgentSessionID:   strings.TrimSpace(sessionID),
		MessageID:        "visible-error:" + eventID,
		Seq:              uint64(timestamp),
		TurnID:           strings.TrimSpace(event.Payload.TurnID),
		Role:             string(activityshared.MessageRoleAssistant),
		Kind:             "text",
		Status:           messageStreamStateFailed,
		Payload:          payload,
		OccurredAtUnixMS: timestamp,
	}, true
}

func shouldAppendVisibleFailure(events []activityshared.Event, event activityshared.Event) bool {
	if event.Type != activityshared.EventSessionFailed && event.Type != activityshared.EventTurnFailed {
		return false
	}
	scopeTurnID := strings.TrimSpace(event.Payload.TurnID)
	for _, candidate := range events {
		if candidate.Type != activityshared.EventMessageAppended && candidate.Type != activityshared.EventMessageCreated {
			continue
		}
		role := candidate.Payload.Role
		if role != "" && role != activityshared.MessageRoleAssistant {
			continue
		}
		if strings.TrimSpace(candidate.Payload.TurnID) != scopeTurnID {
			continue
		}
		if asString(candidate.Payload.Metadata["kind"]) == visibleErrorKind {
			return false
		}
		if asString(candidate.Payload.Metadata["streamState"]) == messageStreamStateFailed ||
			strings.TrimSpace(candidate.Payload.Status) == messageStreamStateFailed {
			return false
		}
	}
	return true
}

func visibleFailureDetail(event activityshared.Event) string {
	detail := activityshared.BestEffortErrorMessage(event.Payload)
	if detail == "" {
		detail = firstNonEmptyString(
			payloadString(event.Payload.Metadata, "stopReason"),
			payloadString(event.Payload.Metadata, "reason"),
			strings.TrimSpace(event.Payload.Status),
		)
	}
	return limitVisibleErrorDetail(cleanVisibleErrorText(detail))
}

func cleanVisibleErrorText(value string) string {
	cleaned := ansiEscapePattern.ReplaceAllString(value, "")
	cleaned = strings.ReplaceAll(cleaned, "\r\n", "\n")
	cleaned = strings.ReplaceAll(cleaned, "\r", "\n")
	lines := strings.Split(cleaned, "\n")
	for index, line := range lines {
		lines[index] = strings.TrimRight(line, " \t")
	}
	return strings.TrimSpace(strings.Join(lines, "\n"))
}

func limitVisibleErrorDetail(value string) string {
	const maxDetailLength = 4000
	if len(value) <= maxDetailLength {
		return value
	}
	return strings.TrimSpace(value[:maxDetailLength]) + "\n..."
}

func visibleFailureCode(detail string) string {
	normalized := strings.ToLower(detail)
	switch {
	case authFailurePattern.MatchString(detail):
		return "auth_required"
	case strings.Contains(normalized, "concurrency limit exceeded"):
		return "provider_concurrency_limit"
	case strings.Contains(normalized, "session/set_config_option") &&
		strings.Contains(normalized, "timed out"):
		return "provider_config_timeout"
	case strings.Contains(normalized, "stream disconnected before completion") ||
		strings.Contains(normalized, "stream closed before response.completed"):
		return "provider_stream_disconnected"
	case strings.Contains(normalized, "quota") ||
		strings.Contains(normalized, "rate limit") ||
		strings.Contains(normalized, "limit exceeded") ||
		strings.Contains(normalized, "resource_exhausted") ||
		strings.Contains(normalized, "too many requests") ||
		strings.Contains(normalized, " 429"):
		return "quota_or_rate_limit"
	case strings.Contains(normalized, "process exited") ||
		strings.Contains(normalized, "exited with code") ||
		strings.Contains(normalized, "exit status") ||
		strings.Contains(normalized, "fork/exec") ||
		strings.Contains(normalized, "no such file or directory"):
		return "process_exited"
	case strings.Contains(normalized, "deadline exceeded") ||
		strings.Contains(normalized, "timed out"):
		return "request_timed_out"
	case strings.Contains(normalized, "failed to connect") ||
		strings.Contains(normalized, "guest-agent") ||
		strings.Contains(normalized, "workspace is recovering") ||
		strings.Contains(normalized, "runtime"):
		return "runtime_unavailable"
	case strings.TrimSpace(detail) != "":
		return "provider_error"
	default:
		return "unknown"
	}
}

func visibleFailureRetryable(code string, detail string) bool {
	if code == "runtime_unavailable" || code == "request_timed_out" {
		return true
	}
	normalized := strings.ToLower(detail)
	return code == "quota_or_rate_limit" && strings.Contains(normalized, "rate")
}

func visibleFailureContent(provider string, phase string, code string) string {
	name := visibleProviderName(provider)
	if phase == "start" {
		switch code {
		case "auth_required":
			return fmt.Sprintf("%s needs authentication or configuration.", name)
		case "provider_concurrency_limit":
			return fmt.Sprintf("%s could not start because too many requests are already running for this user. Try again after another task finishes.", name)
		case "provider_config_timeout":
			return fmt.Sprintf("%s could not apply session settings before startup timed out. Try again in a moment.", name)
		case "provider_stream_disconnected":
			return fmt.Sprintf("%s could not start because the response was interrupted. Try again in a moment.", name)
		case "request_timed_out":
			return fmt.Sprintf("%s could not start before the request timed out.", name)
		case "runtime_unavailable":
			return fmt.Sprintf("%s could not start because the runtime is unavailable.", name)
		default:
			return fmt.Sprintf("%s failed to start.", name)
		}
	}
	switch code {
	case "auth_required":
		return fmt.Sprintf("%s needs authentication or configuration.", name)
	case "provider_concurrency_limit":
		return fmt.Sprintf("%s is handling too many requests for this user. Try again after another task finishes.", name)
	case "provider_config_timeout":
		return fmt.Sprintf("%s could not apply session settings before the request timed out. Try again in a moment.", name)
	case "provider_stream_disconnected":
		return fmt.Sprintf("%s response was interrupted before it completed. Try again in a moment.", name)
	case "request_timed_out":
		return fmt.Sprintf("%s request timed out.", name)
	case "quota_or_rate_limit":
		return fmt.Sprintf("%s request failed because a quota or rate limit was reached.", name)
	default:
		return fmt.Sprintf("%s request failed.", name)
	}
}

func visibleProviderName(provider string) string {
	switch strings.TrimSpace(provider) {
	case ProviderClaudeCode:
		return "Claude Code"
	case ProviderCodex:
		return "Codex"
	case ProviderNexight:
		return "Nexight"
	case ProviderGemini:
		return "Gemini"
	case ProviderHermes:
		return "Hermes"
	case ProviderOpenClaw:
		return "OpenClaw"
	default:
		return "Agent"
	}
}
