package agent

import (
	"context"
	"errors"
	"strings"
)

func (s *Service) ensureRuntimeSession(
	ctx context.Context,
	workspaceID string,
	agentSessionID string,
) (ProviderRuntimeSession, error) {
	ensured, err := s.ensureRuntimeSessionResult(ctx, workspaceID, agentSessionID)
	return ensured.Session, err
}

type ensuredRuntimeSession struct {
	Session ProviderRuntimeSession
}

func (s *Service) ensureRuntimeSessionResult(
	ctx context.Context,
	workspaceID string,
	agentSessionID string,
) (ensuredRuntimeSession, error) {
	if session, ok := s.controller().Session(workspaceID, agentSessionID); ok {
		return ensuredRuntimeSession{Session: session}, nil
	}
	if s.SessionReader == nil {
		return ensuredRuntimeSession{}, ErrSessionNotFound
	}
	persisted, ok := s.SessionReader.GetSession(workspaceID, agentSessionID)
	if !ok || strings.TrimSpace(persisted.Provider) == "" {
		return ensuredRuntimeSession{}, ErrSessionNotFound
	}
	if isStaleHiddenLiveModelDiscoverySession(persisted) {
		if _, err := s.Delete(ctx, workspaceID, agentSessionID); err != nil && !errors.Is(err, ErrSessionNotFound) {
			return ensuredRuntimeSession{}, err
		}
		return ensuredRuntimeSession{}, ErrSessionNotFound
	}
	// Imported sessions used to be rejected here, which is what surfaced the
	// "can't resume on this device, start a new conversation" dead-end. They now
	// resume in place (same-device) or, when the provider session can't be
	// restored locally, get a fresh provider session created on demand. The
	// recreate is opt-in (RecreateIfMissing) so it stays scoped to imported
	// conversations and doesn't change restore-error handling for normal ones.
	imported := strings.TrimSpace(persisted.Origin) == WorkspaceAgentSessionOriginImported
	prepared, err := s.prepareRuntimeForResume(ctx, persisted)
	if err != nil {
		return ensuredRuntimeSession{}, err
	}
	// Wait out any in-flight Claude startup so this resume never overlaps
	// another credential-touching Claude process during OAuth refresh. Released
	// as soon as the session has resumed.
	releaseStartup, err := s.awaitClaudeStartupSlot(ctx, persisted.Provider)
	if err != nil {
		return ensuredRuntimeSession{}, err
	}
	session, err := func() (ProviderRuntimeSession, error) {
		defer releaseStartup()
		runtimeContext := persistedSessionRuntimeContext(persisted)
		return s.controller().Resume(ctx, RuntimeResumeInput{
			WorkspaceID:       strings.TrimSpace(persisted.WorkspaceID),
			AgentSessionID:    strings.TrimSpace(persisted.ID),
			Provider:          strings.TrimSpace(persisted.Provider),
			ProviderSessionID: strings.TrimSpace(persisted.ProviderSessionID),
			Cwd:               strings.TrimSpace(prepared.Cwd),
			Env:               append([]string(nil), prepared.Env...),
			Title:             strings.TrimSpace(persisted.Title),
			Status:            persistedRuntimeResumeStatus(persisted.ActiveTurnID),
			Settings:          cloneComposerSettings(persisted.Settings),
			CreatedAtUnixMS:   persisted.CreatedAtUnixMS,
			UpdatedAtUnixMS:   persisted.UpdatedAtUnixMS,
			Visible:           boolPointer(persisted.Metadata.Visible),
			RuntimeContext:    runtimeContext,
			RecreateIfMissing: imported,
		})
	}()
	if err != nil {
		return ensuredRuntimeSession{}, normalizeRuntimeError(err)
	}
	return ensuredRuntimeSession{Session: session}, nil
}

func (s *Service) prepareRuntimeForResume(ctx context.Context, session PersistedSession) (preparedRuntime, error) {
	input := createSessionInputFromPersisted(session)
	return s.prepareRuntime(ctx, strings.TrimSpace(session.WorkspaceID), strings.TrimSpace(session.Cwd), input)
}
