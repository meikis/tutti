package agentcontext

import (
	"context"

	agentproviderbiz "github.com/tutti-os/tutti/services/tuttid/biz/agentprovider"
	preferencesbiz "github.com/tutti-os/tutti/services/tuttid/biz/preferences"
	agentservice "github.com/tutti-os/tutti/services/tuttid/service/agent"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
)

var providerColumns = []cliservice.TableColumn{
	{Key: "provider", Label: "Provider"},
	{Key: "status", Label: "Status"},
	{Key: "detail", Label: "Detail"},
}

func (p Provider) newProvidersCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".agent.providers",
			Path:        []string{"agent", "providers"},
			Summary:     "List available agent providers",
			Description: "List agent providers and whether tuttid can start their local runtime command.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"provider": map[string]any{"type": "string"},
				},
			},
			Output: cliservice.CapabilityOutput{
				DefaultMode: cliservice.OutputModeTable,
				JSON:        true,
				Table:       &cliservice.TableOutput{Columns: providerColumns},
			},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireSessions(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			provider, _, err := cliservice.StringInput(request.Input, "provider")
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			availability, err := p.sessions.ListProviderAvailability(ctx, agentservice.ProviderAvailabilityInput{
				Provider: provider,
			})
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			if request.OutputMode == cliservice.OutputModeJSON {
				defaultProvider, err := p.defaultAgentProvider(ctx)
				if err != nil {
					return cliservice.CommandOutput{}, err
				}
				return cliservice.CommandOutput{
					Kind: cliservice.OutputModeJSON,
					Value: map[string]any{
						"defaultProvider": defaultProvider,
						"providers":       providerAvailabilityValues(availability),
					},
				}, nil
			}
			return cliservice.CommandOutput{
				Kind:    cliservice.OutputModeTable,
				Columns: providerColumns,
				Rows:    providerAvailabilityRows(availability),
			}, nil
		},
	}
}

func (p Provider) defaultAgentProvider(ctx context.Context) (string, error) {
	if p.preferences == nil {
		return preferencesbiz.DefaultDesktopPreferences().DefaultAgentProvider, nil
	}
	preferences, err := p.preferences.Get(ctx)
	if err != nil {
		return "", err
	}
	defaultProvider := agentproviderbiz.Normalize(preferences.DefaultAgentProvider)
	if defaultProvider == "" {
		defaultProvider = preferencesbiz.DefaultDesktopPreferences().DefaultAgentProvider
	}
	return defaultProvider, nil
}

func providerAvailabilityRows(items []agentservice.ProviderAvailability) []map[string]any {
	rows := make([]map[string]any, 0, len(items))
	for _, item := range items {
		rows = append(rows, map[string]any{
			"provider": item.Provider,
			"status":   item.Status,
			"detail":   providerAvailabilityDetail(item),
		})
	}
	return rows
}

func providerAvailabilityValues(items []agentservice.ProviderAvailability) []any {
	values := make([]any, 0, len(items))
	for _, item := range items {
		checks := make([]any, 0, len(item.Checks))
		for _, check := range item.Checks {
			checks = append(checks, map[string]any{
				"name":   check.Name,
				"passed": check.Passed,
				"detail": check.Detail,
			})
		}
		value := map[string]any{
			"provider":   item.Provider,
			"status":     item.Status,
			"checks":     checks,
			"capturedAt": item.CapturedAt,
		}
		if item.LastError != nil {
			value["lastError"] = map[string]any{
				"code":    item.LastError.Code,
				"message": item.LastError.Message,
			}
		}
		values = append(values, value)
	}
	return values
}

func providerAvailabilityDetail(item agentservice.ProviderAvailability) string {
	if item.LastError != nil && item.LastError.Message != "" {
		return item.LastError.Message
	}
	for _, check := range item.Checks {
		if check.Detail != "" {
			return check.Detail
		}
	}
	return ""
}
