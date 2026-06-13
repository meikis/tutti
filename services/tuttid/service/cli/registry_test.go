package cli

import (
	"context"
	"errors"
	"testing"
)

func TestRegistryListsCapabilities(t *testing.T) {
	registry, err := NewRegistry(testCommand("doctor.ping"))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	capabilities := registry.Capabilities(context.Background(), InvokeContext{Source: "cli"})
	if len(capabilities) != 1 {
		t.Fatalf("len(capabilities) = %d, want 1", len(capabilities))
	}
	if capabilities[0].ID != "doctor.ping" {
		t.Fatalf("capability id = %q", capabilities[0].ID)
	}
}

func TestRegistryInvokesCommand(t *testing.T) {
	registry, err := NewRegistry(testCommand("doctor.ping"))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	output, err := registry.Invoke(context.Background(), InvokeRequest{
		CommandID: "doctor.ping",
		Context:   InvokeContext{Source: "cli"},
	})
	if err != nil {
		t.Fatalf("Invoke: %v", err)
	}
	if output.Kind != OutputModePlain || output.Text != "ok" {
		t.Fatalf("output = %#v", output)
	}
}

func TestRegistryReturnsCommandNotFound(t *testing.T) {
	registry, err := NewRegistry(testCommand("doctor.ping"))
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	_, err = registry.Invoke(context.Background(), InvokeRequest{CommandID: "missing"})
	if !errors.Is(err, ErrCommandNotFound) {
		t.Fatalf("err = %v, want ErrCommandNotFound", err)
	}
}

func TestRegistryRejectsDuplicateCommandID(t *testing.T) {
	_, err := NewRegistry(testCommand("doctor.ping"), testCommand("doctor.ping"))
	if !errors.Is(err, ErrInvalidCommand) {
		t.Fatalf("err = %v, want ErrInvalidCommand", err)
	}
}

type testProvider struct {
	appID    string
	commands []Command
}

func (p testProvider) AppID() string {
	return p.appID
}

func (p testProvider) Commands() []Command {
	return p.commands
}

func TestRegistryFromProviders(t *testing.T) {
	registry, err := NewRegistryFromProviders(testProvider{
		appID:    "diagnostics",
		commands: []Command{testCommand("diagnostics.doctor.ping")},
	})
	if err != nil {
		t.Fatalf("NewRegistryFromProviders: %v", err)
	}
	capabilities := registry.Capabilities(context.Background(), InvokeContext{Source: "cli"})
	if len(capabilities) != 1 || capabilities[0].ID != "diagnostics.doctor.ping" {
		t.Fatalf("capabilities = %#v", capabilities)
	}
}

func TestRegistryCapabilitiesKeepRegistrationOrder(t *testing.T) {
	registry, err := NewRegistry(
		testCommandWithPath("diagnostics.second", []string{"second"}),
		testCommandWithPath("diagnostics.first", []string{"first"}),
	)
	if err != nil {
		t.Fatalf("NewRegistry: %v", err)
	}

	capabilities := registry.Capabilities(context.Background(), InvokeContext{Source: "cli"})
	if len(capabilities) != 2 {
		t.Fatalf("len(capabilities) = %d, want 2", len(capabilities))
	}
	if capabilities[0].ID != "diagnostics.second" || capabilities[1].ID != "diagnostics.first" {
		t.Fatalf("capabilities = %#v", capabilities)
	}
}

func testCommand(id string) Command {
	return testCommandWithPath(id, []string{"doctor", "ping"})
}

func testCommandWithPath(id string, path []string) Command {
	return Command{
		Capability: Capability{
			ID:      id,
			Path:    path,
			Summary: "Check CLI command routing",
			Output: CapabilityOutput{
				DefaultMode: OutputModePlain,
				JSON:        true,
			},
		},
		Handler: func(context.Context, InvokeRequest) (CommandOutput, error) {
			return CommandOutput{
				Kind: OutputModePlain,
				Text: "ok",
			}, nil
		},
	}
}
