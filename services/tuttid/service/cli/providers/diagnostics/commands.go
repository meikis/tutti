package diagnostics

import (
	"context"

	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
)

const appID = "diagnostics"

type Provider struct{}

func NewProvider() Provider {
	return Provider{}
}

func (Provider) AppID() string {
	return appID
}

func (Provider) Commands() []cliservice.Command {
	return []cliservice.Command{newPingCommand()}
}

func newPingCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:      appID + ".doctor.ping",
			Path:    []string{"doctor", "ping"},
			Summary: "Check CLI command routing",
			Output: cliservice.CapabilityOutput{
				DefaultMode: cliservice.OutputModePlain,
				JSON:        true,
			},
		},
		Handler: func(context.Context, cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			return cliservice.CommandOutput{
				Kind: cliservice.OutputModePlain,
				Text: "ok",
			}, nil
		},
	}
}
