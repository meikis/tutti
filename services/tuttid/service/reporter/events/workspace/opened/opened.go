package opened

import (
	"context"

	reporterservice "github.com/tutti-os/tutti/services/tuttid/service/reporter"
	reporterevents "github.com/tutti-os/tutti/services/tuttid/service/reporter/events"
)

type Params struct {
	RouteView string
}

func Track(ctx context.Context, reporter reporterservice.Reporter, params Params) {
	reporterevents.Track(ctx, reporter, "workspace.opened", map[string]any{
		"route_view": params.RouteView,
	})
}
