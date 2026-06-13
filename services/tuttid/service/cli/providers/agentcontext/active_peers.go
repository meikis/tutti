package agentcontext

import (
	"context"

	agentservice "github.com/tutti-os/tutti/services/tuttid/service/agent"
	cliservice "github.com/tutti-os/tutti/services/tuttid/service/cli"
)

func (p Provider) newActivePeersCommand() cliservice.Command {
	return cliservice.Command{
		Capability: cliservice.Capability{
			ID:          appID + ".agent.active-peers",
			Path:        []string{"agent", "active-peers"},
			Summary:     "Show active peer agents",
			Description: "Show logical active peer agents in the current workspace before editing files.",
			Output:      cliservice.CapabilityOutput{DefaultMode: cliservice.OutputModeJSON, JSON: true},
		},
		Handler: func(ctx context.Context, request cliservice.InvokeRequest) (cliservice.CommandOutput, error) {
			if err := p.requireSessions(); err != nil {
				return cliservice.CommandOutput{}, err
			}
			workspaceID, err := p.workspaceID(ctx, request)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			peers, err := p.sessions.ListActivePeers(ctx, workspaceID)
			if err != nil {
				return cliservice.CommandOutput{}, err
			}
			return cliservice.CommandOutput{Kind: cliservice.OutputModeJSON, Value: map[string]any{
				"agents":         activePeerValues(peers.Agents),
				"selfKnown":      peers.SelfKnown,
				"mayIncludeSelf": peers.MayIncludeSelf,
				"warning":        peers.Warning,
			}}, nil
		},
	}
}

func activePeerValues(peers []agentservice.ActivePeer) []any {
	values := make([]any, 0, len(peers))
	for _, peer := range peers {
		value := sessionValue(peer.Session)
		value["selfRelation"] = peer.SelfRelation
		values = append(values, value)
	}
	return values
}
