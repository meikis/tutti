package opened

import (
	"context"
	"testing"

	reporterservice "github.com/tutti-os/tutti/services/tuttid/service/reporter"
)

type recordingReporter struct {
	events []reporterservice.Event
}

func (r *recordingReporter) Track(_ context.Context, events ...reporterservice.Event) {
	r.events = append(r.events, events...)
}

func (*recordingReporter) Close() error {
	return nil
}

func TestTrackReportsWorkspaceOpened(t *testing.T) {
	reporter := &recordingReporter{}

	Track(context.Background(), reporter, Params{
		RouteView: "workspace",
	})

	if len(reporter.events) != 1 {
		t.Fatalf("events = %d, want 1", len(reporter.events))
	}
	event := reporter.events[0]
	if event.Name != "workspace.opened" {
		t.Fatalf("event name = %q, want workspace.opened", event.Name)
	}
	if event.ClientTS == 0 {
		t.Fatal("event client timestamp is zero")
	}
	if event.Params["route_view"] != "workspace" {
		t.Fatalf("route_view = %v, want workspace", event.Params["route_view"])
	}
}
