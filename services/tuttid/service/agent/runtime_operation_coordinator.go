package agent

import (
	"context"
	"time"

	agenthost "github.com/tutti-os/tutti/packages/agent/host"
)

const runtimeOperationLeaseDuration = 30 * time.Second

type RuntimeOperationStore interface {
	agenthost.RuntimeOperationStore
	FindTurnByClientSubmitID(context.Context, string, string, string) (string, bool, error)
}
type RuntimeOperationEventPublisher = agenthost.RuntimeOperationEventPublisher

var ErrRuntimeOperationInProgress = agenthost.ErrRuntimeOperationInProgress
var ErrRuntimeOperationFailed = agenthost.ErrRuntimeOperationFailed

func runtimeOperationID(workspaceID, agentSessionID, kind, subjectID string) string {
	return agenthost.RuntimeOperationID(workspaceID, agentSessionID, kind, subjectID)
}

func payloadText(payload map[string]any, key string) string {
	return agenthost.RuntimeOperationPayloadText(payload, key)
}

func isRetryableRuntimeOperationError(err error) bool {
	return agenthost.IsRetryableRuntimeOperationError(err)
}

func runtimeOperationNextAttemptAt(now time.Time, attempt int, failed bool) int64 {
	return agenthost.RuntimeOperationNextAttemptAt(now, attempt, failed)
}

func (s *Service) StepRuntimeOperationWorker(ctx context.Context, recovering bool) error {
	return s.applicationHost(serviceHostPreparation{service: s}).StepRuntimeOperationWorker(ctx, recovering)
}

func (s *Service) RecoverRuntimeOperations(ctx context.Context) error {
	return s.applicationHost(serviceHostPreparation{service: s}).RecoverRuntimeOperations(ctx)
}

func (s *Service) Recover(ctx context.Context) error {
	return s.applicationHost(serviceHostPreparation{service: s}).Recover(ctx)
}

func (s *Service) RunRuntimeOperationWorker(ctx context.Context) {
	s.applicationHost(serviceHostPreparation{service: s}).RunRuntimeOperationWorker(ctx)
}
