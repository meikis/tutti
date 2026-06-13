package app_opened

import (
	"context"

	reporterservice "github.com/tutti-os/tutti/services/tuttid/service/reporter"
	reporterevents "github.com/tutti-os/tutti/services/tuttid/service/reporter/events"
)

type Params map[string]any

func Track(ctx context.Context, reporter reporterservice.Reporter, params Params) {
	reporterevents.Track(ctx, reporter, "app_center.app_opened", map[string]any(params))
}
