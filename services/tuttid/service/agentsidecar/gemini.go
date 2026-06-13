package agentsidecar

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
)

type GeminiPreparer struct{}

func (GeminiPreparer) Provider() string {
	return "gemini"
}

func (GeminiPreparer) Prepare(_ context.Context, input ProviderPrepareInput) (ProviderPrepareResult, error) {
	geminiHome := filepath.Join(input.RuntimeRoot, "gemini-home")
	geminiDir := filepath.Join(geminiHome, ".gemini")
	if err := os.MkdirAll(geminiDir, 0o700); err != nil {
		return ProviderPrepareResult{}, fmt.Errorf("create gemini home: %w", err)
	}
	if err := exposeUserGeminiFiles(geminiDir); err != nil {
		return ProviderPrepareResult{}, err
	}
	instructionsPath := filepath.Join(geminiDir, "GEMINI.md")
	if err := os.WriteFile(instructionsPath, []byte(tuttiCLIPolicy(input.PrepareInput)), 0o600); err != nil {
		return ProviderPrepareResult{}, fmt.Errorf("write gemini instructions: %w", err)
	}
	if _, err := installProviderNativeSkills(filepath.Join(geminiDir, "skills"), input.PrepareInput); err != nil {
		return ProviderPrepareResult{}, err
	}
	if input.Manifest != nil {
		input.Manifest.RecordManagedFile(instructionsPath, "provider-instructions", true)
		input.Manifest.RecordManagedFile(geminiHome, "gemini-home", true)
	}
	return ProviderPrepareResult{
		Cwd: input.Cwd,
		Env: []string{
			"HOME=" + geminiHome,
		},
	}, nil
}

func exposeUserGeminiFiles(geminiDir string) error {
	userHome, err := os.UserHomeDir()
	if err != nil || userHome == "" {
		return nil
	}
	userGeminiDir := filepath.Join(userHome, ".gemini")
	for _, name := range []string{
		".env",
		"a2a-oauth-tokens.json",
		"google_accounts.json",
		"installation_id",
		"keybindings.json",
		"mcp-oauth-tokens.json",
		"oauth_creds.json",
		"projects.json",
		"settings.json",
		"state.json",
		"trustedFolders.json",
	} {
		source := filepath.Join(userGeminiDir, name)
		info, err := os.Stat(source)
		if err != nil || info.IsDir() {
			continue
		}
		target := filepath.Join(geminiDir, name)
		if err := copyFile(source, target, info.Mode().Perm()); err != nil {
			return fmt.Errorf("expose gemini %s: %w", name, err)
		}
	}
	return nil
}
