package agentruntime

import (
	"slices"
	"strings"

	"github.com/tutti-os/tutti/packages/agent/daemon/providerregistry"
)

// Canonical provider capability keys shared by all adapters and surfaced to
// the GUI through runtimeContext.capabilities. Keep in sync with the
// TypeScript side (packages/agent/activity-core/src/capabilities.ts).
const (
	CapabilityImageInput                     = providerregistry.CapabilityImageInput
	CapabilityModelImageInputRequired        = providerregistry.CapabilityModelImageInputRequired
	CapabilitySkills                         = providerregistry.CapabilitySkills
	CapabilityCompact                        = providerregistry.CapabilityCompact
	CapabilityTokenUsage                     = providerregistry.CapabilityTokenUsage
	CapabilityRateLimits                     = providerregistry.CapabilityRateLimits
	CapabilityPlanMode                       = providerregistry.CapabilityPlanMode
	CapabilityInterrupt                      = providerregistry.CapabilityInterrupt
	CapabilityBrowserUse                     = providerregistry.CapabilityBrowserUse
	CapabilityComputerUse                    = providerregistry.CapabilityComputerUse
	CapabilityPlanImplementation             = providerregistry.CapabilityPlanImplementation
	CapabilityPermissionModeChangeDuringTurn = providerregistry.CapabilityPermissionModeChangeDuringTurn
	CapabilityPermissionModeChangeDeferred   = providerregistry.CapabilityPermissionModeChangeDeferred
	// CapabilityGoalPause marks providers whose goal is a controllable
	// entity with a real paused state (codex thread goals). Providers
	// without it (Claude Code: /goal command in, goal_status attachments
	// out, no pause) render the goal banner without pause/resume controls.
	CapabilityGoalPause = providerregistry.CapabilityGoalPause
)

// standardACPCapabilities derives the canonical capability list for ACP
// family providers from the live session state.
func standardACPCapabilities(provider string, promptImage bool, state acpLiveStateSnapshot) []string {
	descriptor, ok := providerregistry.Find(provider)
	if !ok {
		return nil
	}
	profile := descriptor.ComposerProfile
	capabilities := make([]string, 0, len(profile.Capabilities)+2)
	for _, capability := range profile.Capabilities {
		if capability == CapabilityImageInput && !promptImage {
			continue
		}
		capabilities = append(capabilities, capability)
	}
	standardACP := descriptor.Runtime.StandardACP
	if promptImage && standardACP.DeriveImageInputFromPrompt && !slices.Contains(capabilities, CapabilityImageInput) {
		capabilities = append(capabilities, CapabilityImageInput)
	}
	if standardACP.DeriveCompactFromCommands && !slices.Contains(capabilities, CapabilityCompact) {
		for _, command := range state.availableCommands {
			if strings.EqualFold(strings.TrimSpace(command.Name), "compact") {
				capabilities = append(capabilities, CapabilityCompact)
				break
			}
		}
	}
	return capabilities
}

func migratedProviderHasCapability(provider string, capability string) bool {
	profile, ok := migratedProviderComposerProfile(provider)
	if !ok {
		return false
	}
	for _, candidate := range profile.Capabilities {
		if candidate == capability {
			return true
		}
	}
	return false
}
