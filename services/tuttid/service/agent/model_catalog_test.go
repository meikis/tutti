package agent

import (
	"context"
	"testing"
	"time"
)

func TestAgentModelCatalogReturnsClaudeStaticModels(t *testing.T) {
	catalog := &CachedAgentModelCatalog{
		Now: func() time.Time {
			return time.UnixMilli(1000)
		},
	}

	result, err := catalog.ListModels(context.Background(), "claude-code")
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}
	if result.Source != "claude-static" {
		t.Fatalf("source = %q, want claude-static", result.Source)
	}
	if len(result.Models) == 0 || result.Models[0].ID != "default" {
		t.Fatalf("models = %#v", result.Models)
	}
}

func TestAgentModelCatalogCachesGeminiFallbackForShortTTL(t *testing.T) {
	now := time.UnixMilli(1000)
	lister := &fakeAgentModelLister{
		models:   []AgentModelOption{{ID: "auto", DisplayName: "auto", IsDefault: true}},
		fallback: true,
	}
	catalog := &CachedAgentModelCatalog{
		Gemini: lister,
		Now: func() time.Time {
			return now
		},
	}

	if _, err := catalog.ListModels(context.Background(), "gemini"); err != nil {
		t.Fatalf("first ListModels returned error: %v", err)
	}
	if _, err := catalog.ListModels(context.Background(), "gemini"); err != nil {
		t.Fatalf("second ListModels returned error: %v", err)
	}
	if lister.calls != 1 {
		t.Fatalf("lister calls before ttl = %d, want 1", lister.calls)
	}

	now = now.Add(geminiModelFallbackTTL + time.Millisecond)
	if _, err := catalog.ListModels(context.Background(), "gemini"); err != nil {
		t.Fatalf("third ListModels returned error: %v", err)
	}
	if lister.calls != 2 {
		t.Fatalf("lister calls after fallback ttl = %d, want 2", lister.calls)
	}
}
