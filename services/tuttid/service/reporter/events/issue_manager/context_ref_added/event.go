package context_ref_added

import (
	"context"

	reporterservice "github.com/tutti-os/tutti/services/tuttid/service/reporter"
	reporterevents "github.com/tutti-os/tutti/services/tuttid/service/reporter/events"
)

type Params map[string]any

func Track(ctx context.Context, reporter reporterservice.Reporter, params Params) {
	reporterevents.Track(ctx, reporter, "issue_manager.context_ref_added", map[string]any(params))
}
