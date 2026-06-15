package agent

import (
	"slices"
	"testing"
)

func TestComposerProviderCapabilitiesDefaults(t *testing.T) {
	t.Parallel()
	claude := composerProviderCapabilities("claude-code")
	for _, want := range []string{"imageInput", "skills", "compact", "tokenUsage", "rateLimits", "planMode", "interrupt"} {
		if !slices.Contains(claude, want) {
			t.Fatalf("claude defaults = %v, missing %q", claude, want)
		}
	}
	codex := composerProviderCapabilities("codex")
	if !slices.Contains(codex, "planMode") {
		t.Fatalf("codex defaults must include planMode (re-negotiated at session start): %v", codex)
	}
	if !slices.Contains(codex, "compact") || !slices.Contains(codex, "skills") {
		t.Fatalf("codex defaults = %v", codex)
	}
	if got := composerProviderCapabilities("gemini"); len(got) != 1 || got[0] != "interrupt" {
		t.Fatalf("gemini defaults = %v, want [interrupt]", got)
	}
	if got := composerProviderCapabilities("openclaw"); len(got) != 1 || got[0] != "interrupt" {
		t.Fatalf("openclaw defaults = %v, want [interrupt]", got)
	}
	if got := composerProviderCapabilities("unknown"); got != nil {
		t.Fatalf("unknown provider defaults = %v, want nil", got)
	}
}

func TestNormalizeComposerSettingsClampsByProviderSupport(t *testing.T) {
	t.Parallel()
	// model/reasoning: providers without composer settings support must be cleared.
	for _, provider := range []string{"hermes", "nexight", "openclaw"} {
		got := normalizeComposerSettingsForProvider(provider, ComposerSettings{
			Model:           "some-model",
			ReasoningEffort: "high",
			PlanMode:        true,
		})
		if got.Model != "" {
			t.Fatalf("%s model = %q, want empty", provider, got.Model)
		}
		if got.ReasoningEffort != "" {
			t.Fatalf("%s reasoningEffort = %q, want empty", provider, got.ReasoningEffort)
		}
	}
	// planMode: only providers whose static capabilities include planMode keep it.
	for _, provider := range []string{"claude-code", "codex"} {
		got := normalizeComposerSettingsForProvider(provider, ComposerSettings{PlanMode: true})
		if !got.PlanMode {
			t.Fatalf("%s planMode clamped, want preserved", provider)
		}
	}
	for _, provider := range []string{"gemini", "hermes", "nexight", "openclaw"} {
		got := normalizeComposerSettingsForProvider(provider, ComposerSettings{PlanMode: true})
		if got.PlanMode {
			t.Fatalf("%s planMode = true, want clamped to false", provider)
		}
	}
	// providers with settings support keep their values.
	codex := normalizeComposerSettingsForProvider("codex", ComposerSettings{
		Model:           "gpt-5.3-codex",
		ReasoningEffort: "high",
	})
	if codex.Model != "gpt-5.3-codex" || codex.ReasoningEffort != "high" {
		t.Fatalf("codex settings clamped unexpectedly: %+v", codex)
	}
}

func TestComposerConfigConfigurableTruthTable(t *testing.T) {
	t.Parallel()
	// Pins the backend configurable flags to the legacy GUI hardcoded table so
	// the GUI can derive support from data instead of provider names.
	cases := []struct {
		provider   string
		model      bool
		permission bool
	}{
		{"claude-code", true, true},
		{"codex", true, true},
		{"gemini", true, false},
		{"hermes", false, false},
		{"nexight", false, true},
		{"openclaw", false, false},
	}
	for _, tc := range cases {
		model := composerModelConfig(tc.provider, "", nil)
		reasoning := composerReasoningConfig(tc.provider, "", "en")
		permission := composerPermissionConfig(tc.provider, "", "en")
		if model.Configurable != tc.model {
			t.Fatalf("%s modelConfig.configurable = %v, want %v", tc.provider, model.Configurable, tc.model)
		}
		if reasoning.Configurable != tc.model {
			t.Fatalf("%s reasoningConfig.configurable = %v, want %v", tc.provider, reasoning.Configurable, tc.model)
		}
		if permission.Configurable != tc.permission {
			t.Fatalf("%s permissionConfig.configurable = %v, want %v", tc.provider, permission.Configurable, tc.permission)
		}
	}
}
