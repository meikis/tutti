package eventstream

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type ClientEvent struct {
	Topic   string
	Payload []byte
}

type PublishedEvent struct {
	ID        string
	Topic     string
	Version   int
	EmittedAt string
	Scope     EventScope
	Payload   []byte
}

type EventScope struct {
	WorkspaceID string
}

type IntentHandler func(context.Context, ClientEvent) error

type Session struct {
	id string

	mu            sync.RWMutex
	closed        bool
	subscriptions map[subscriptionKey]EventScope

	events chan PublishedEvent
	once   sync.Once
}

type subscriptionKey struct {
	topic       string
	workspaceID string
}

type Service struct {
	catalog Catalog

	mu       sync.RWMutex
	sessions map[*Session]struct{}
	handlers map[string]IntentHandler

	nextEventID   uint64
	nextSessionID uint64
}

func NewService(catalog Catalog, handlers map[string]IntentHandler) *Service {
	if catalog == nil {
		defaultCatalog := DefaultCatalog()
		catalog = defaultCatalog
	}

	clonedHandlers := make(map[string]IntentHandler, len(handlers))
	for topic, handler := range handlers {
		clonedHandlers[strings.TrimSpace(topic)] = handler
	}

	return &Service{
		catalog:  catalog,
		handlers: clonedHandlers,
		sessions: make(map[*Session]struct{}),
	}
}

func (s *Service) RegisterIntentHandler(topic string, handler IntentHandler) {
	s.mu.Lock()
	defer s.mu.Unlock()

	trimmedTopic := strings.TrimSpace(topic)
	if trimmedTopic == "" {
		return
	}
	if handler == nil {
		delete(s.handlers, trimmedTopic)
		return
	}
	s.handlers[trimmedTopic] = handler
}

func (s *Service) OpenSession() *Session {
	session := &Session{
		id:            fmt.Sprintf("session-%d", atomic.AddUint64(&s.nextSessionID, 1)),
		subscriptions: make(map[subscriptionKey]EventScope),
		events:        make(chan PublishedEvent, 32),
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	s.sessions[session] = struct{}{}
	return session
}

func (s *Service) CloseSession(session *Session) {
	if session == nil {
		return
	}

	s.mu.Lock()
	delete(s.sessions, session)
	s.mu.Unlock()

	session.once.Do(func() {
		session.mu.Lock()
		session.closed = true
		session.mu.Unlock()
		close(session.events)
	})
}

func (s *Service) Subscribe(session *Session, topics []string, scope EventScope) error {
	normalizedTopics, err := normalizeTopics(topics)
	if err != nil {
		return err
	}
	normalizedScope, err := normalizeEventScope(scope)
	if err != nil {
		return err
	}
	for _, topic := range normalizedTopics {
		if err := s.catalog.ValidateSubscription(topic); err != nil {
			return err
		}
	}

	session.mu.Lock()
	defer session.mu.Unlock()
	for _, topic := range normalizedTopics {
		session.subscriptions[newSubscriptionKey(topic, normalizedScope)] = normalizedScope
	}
	return nil
}

func (*Service) Unsubscribe(session *Session, topics []string, scope EventScope) error {
	normalizedTopics, err := normalizeTopics(topics)
	if err != nil {
		return err
	}
	normalizedScope, err := normalizeEventScope(scope)
	if err != nil {
		return err
	}

	session.mu.Lock()
	defer session.mu.Unlock()
	for _, topic := range normalizedTopics {
		delete(session.subscriptions, newSubscriptionKey(topic, normalizedScope))
	}
	return nil
}

func (s *Service) PublishFromClient(ctx context.Context, event ClientEvent) error {
	trimmedTopic := strings.TrimSpace(event.Topic)
	if err := s.catalog.ValidatePublish(trimmedTopic, DirectionClientToServer, event.Payload); err != nil {
		return err
	}

	s.mu.RLock()
	handler := s.handlers[trimmedTopic]
	s.mu.RUnlock()
	if handler == nil {
		return fmt.Errorf("intent handler is not configured for topic %q", trimmedTopic)
	}
	return handler(ctx, ClientEvent{
		Topic:   trimmedTopic,
		Payload: append([]byte(nil), event.Payload...),
	})
}

func (s *Service) PublishFromServer(ctx context.Context, topic string, payload []byte) error {
	return s.PublishFromServerScoped(ctx, topic, payload, EventScope{})
}

func (s *Service) PublishFromServerScoped(_ context.Context, topic string, payload []byte, scope EventScope) error {
	trimmedTopic := strings.TrimSpace(topic)
	normalizedScope, err := normalizeEventScope(scope)
	if err != nil {
		return err
	}
	definition, ok := s.catalog.Topic(trimmedTopic)
	if !ok {
		return &ValidationError{
			Code:    ValidationCodeInvalidTopic,
			Message: fmt.Sprintf("unknown topic %q", trimmedTopic),
			Topic:   trimmedTopic,
		}
	}
	if err := s.catalog.ValidatePublish(trimmedTopic, DirectionServerToClient, payload); err != nil {
		return err
	}

	event := PublishedEvent{
		ID:        fmt.Sprintf("event-%d", atomic.AddUint64(&s.nextEventID, 1)),
		Topic:     trimmedTopic,
		Version:   definition.Version,
		EmittedAt: time.Now().UTC().Format(time.RFC3339Nano),
		Scope:     normalizedScope,
		Payload:   append([]byte(nil), payload...),
	}

	sessions := s.subscribedSessions(trimmedTopic, normalizedScope)
	for _, session := range sessions {
		if !session.enqueue(event) {
			s.CloseSession(session)
		}
	}

	return nil
}

func (*Service) Events(session *Session) <-chan PublishedEvent {
	if session == nil {
		return nil
	}
	return session.events
}

func normalizeTopics(topics []string) ([]string, error) {
	if len(topics) == 0 {
		return nil, &ValidationError{
			Code:    ValidationCodeInvalidPayload,
			Message: "at least one topic is required",
		}
	}

	normalized := make([]string, 0, len(topics))
	seen := make(map[string]struct{}, len(topics))
	for _, topic := range topics {
		trimmedTopic := strings.TrimSpace(topic)
		if trimmedTopic == "" {
			return nil, &ValidationError{
				Code:    ValidationCodeInvalidPayload,
				Message: "topic must not be empty",
			}
		}
		if _, ok := seen[trimmedTopic]; ok {
			continue
		}
		seen[trimmedTopic] = struct{}{}
		normalized = append(normalized, trimmedTopic)
	}
	return normalized, nil
}

func normalizeEventScope(scope EventScope) (EventScope, error) {
	workspaceID := strings.TrimSpace(scope.WorkspaceID)
	if scope.WorkspaceID != "" && workspaceID == "" {
		return EventScope{}, &ValidationError{
			Code:    ValidationCodeInvalidPayload,
			Message: "scope.workspaceId must not be empty",
		}
	}
	return EventScope{WorkspaceID: workspaceID}, nil
}

func newSubscriptionKey(topic string, scope EventScope) subscriptionKey {
	return subscriptionKey{
		topic:       strings.TrimSpace(topic),
		workspaceID: strings.TrimSpace(scope.WorkspaceID),
	}
}

func (s *Service) subscribedSessions(topic string, scope EventScope) []*Session {
	s.mu.RLock()
	defer s.mu.RUnlock()

	sessions := make([]*Session, 0, len(s.sessions))
	for session := range s.sessions {
		if session.isSubscribed(topic, scope) {
			sessions = append(sessions, session)
		}
	}
	return sessions
}

func (s *Session) enqueue(event PublishedEvent) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return false
	}

	select {
	case s.events <- event:
		return true
	default:
		return false
	}
}

func (s *Session) isSubscribed(topic string, scope EventScope) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for key, subscriptionScope := range s.subscriptions {
		if key.topic != topic {
			continue
		}
		if subscriptionScope.WorkspaceID == "" {
			return true
		}
		if subscriptionScope.WorkspaceID == scope.WorkspaceID {
			return true
		}
	}
	return false
}
