package agentruntime

import (
	"testing"

	agentsessionstore "github.com/tutti-os/tutti/packages/agentactivity/daemon/activity"
)

func TestVisibleFailureCodeClassifiesDeadlineExceededAsRequestTimedOut(t *testing.T) {
	if got := visibleFailureCode("context deadline exceeded"); got != "request_timed_out" {
		t.Fatalf("visibleFailureCode() = %q, want request_timed_out", got)
	}
}

func TestVisibleFailureCodeClassifiesProviderConcurrencyLimit(t *testing.T) {
	detail := `stream disconnected before completion: Concurrency limit exceeded for user, please retry later`
	if got := visibleFailureCode(detail); got != "provider_concurrency_limit" {
		t.Fatalf("visibleFailureCode() = %q, want provider_concurrency_limit", got)
	}
}

func TestVisibleFailureCodeClassifiesConfigTimeout(t *testing.T) {
	detail := `agent session ACP effort configuration failed: acp session/set_config_option timed out after 30s`
	if got := visibleFailureCode(detail); got != "provider_config_timeout" {
		t.Fatalf("visibleFailureCode() = %q, want provider_config_timeout", got)
	}
}

func TestVisibleFailureContentDescribesStartupConfigTimeout(t *testing.T) {
	got := visibleFailureContent(ProviderCodex, "start", "provider_config_timeout")
	want := "Codex could not apply session settings before startup timed out. Try again in a moment."
	if got != want {
		t.Fatalf("visibleFailureContent() = %q, want %q", got, want)
	}
}

func TestVisibleFailureCodeClassifiesStreamDisconnected(t *testing.T) {
	detail := `stream disconnected before completion: Transport error: network error: error decoding response body`
	if got := visibleFailureCode(detail); got != "provider_stream_disconnected" {
		t.Fatalf("visibleFailureCode() = %q, want provider_stream_disconnected", got)
	}
}

func TestVisibleFailureCodeDoesNotTreatPatchContextLoginTextAsAuth(t *testing.T) {
	detail := `acp process exited with code 0: process exited: ERROR codex_core::tools::router: error=apply_patch verification failed: Failed to find expected lines in /Users/wwcome/work/tutti-os/tutti/services/tuttid/service/agentstatus/service_test.go:
func TestServiceLoginRunsProviderLoginCommand(t *testing.T) {
	service := testService(func(name string) (string, error) {`
	if got := visibleFailureCode(detail); got != "process_exited" {
		t.Fatalf("visibleFailureCode() = %q, want process_exited", got)
	}
}

func TestVisibleFailureCodeClassifiesExplicitLoginFailureAsAuth(t *testing.T) {
	if got := visibleFailureCode("Please login to continue."); got != "auth_required" {
		t.Fatalf("visibleFailureCode() = %q, want auth_required", got)
	}
}

func TestVisibleFailureTimelineItemCarriesTimeoutCodeForTurnFailures(t *testing.T) {
	session := reportTestSession()
	event := newTurnActivityEvent(session, EventTurnFailed, "turn-1", SessionStatusFailed, "", "", map[string]any{
		"error": "context deadline exceeded",
	})

	item, ok := visibleFailureTimelineItem("room-1", reportTestSource(), event, session.AgentSessionID, 123)
	if !ok {
		t.Fatal("visibleFailureTimelineItem() returned ok=false")
	}
	if got := item.Payload["code"]; got != "request_timed_out" {
		t.Fatalf("visible failure code = %#v, want request_timed_out", got)
	}
	if got := item.Payload["phase"]; got != "turn" {
		t.Fatalf("visible failure phase = %#v, want turn", got)
	}
}

func reportTestSource() agentsessionstore.EventSource {
	return agentsessionstore.EventSource{Provider: ProviderClaudeCode}
}
