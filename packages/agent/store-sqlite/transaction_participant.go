package storesqlite

import (
	"context"
	"database/sql"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"
)

const (
	MutationEntitySession          = "session"
	MutationEntityTurn             = "turn"
	MutationEntityInteraction      = "interaction"
	MutationEntityMessage          = "message"
	MutationEntityRuntimeOperation = "runtime_operation"
	MutationEntityRuntimeEvent     = "runtime_operation_event"
	MutationEntityGoalState        = "goal_state"
	MutationEntityGoalOperation    = "goal_operation"
	MutationEntityGoalInbox        = "goal_reconcile_inbox"
)

// TransactionWriter is the intentionally narrow store-adapter seam for
// caller-owned durable markers. It does not expose *sql.Tx to Host domain code.
type TransactionWriter interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

// TransactionParticipant atomically appends host-owned durable facts to a
// canonical store transaction. Implementations must use only writer and return
// before commit; post-commit wakeups belong to agenthost.CommitObserver.
type TransactionParticipant interface {
	Participate(context.Context, TransactionWriter, TransactionDelta) error
}

type TransactionMutation struct {
	MutationID     string
	WorkspaceID    string
	AgentSessionID string
	EntityKind     string
	EntityID       string
	Operation      string
	Version        int64
}

type TransactionDelta struct {
	TransactionID string
	WorkspaceID   string
	Mutations     []TransactionMutation
}

func transactionMutation(workspaceID, agentSessionID, entityKind, entityID, operation string, version int64) TransactionMutation {
	return TransactionMutation{
		WorkspaceID: strings.TrimSpace(workspaceID), AgentSessionID: strings.TrimSpace(agentSessionID),
		EntityKind: strings.TrimSpace(entityKind), EntityID: strings.TrimSpace(entityID),
		Operation: strings.TrimSpace(operation), Version: version,
	}
}

func (s *Store) commitTransaction(ctx context.Context, tx *sql.Tx, workspaceID string, mutations []TransactionMutation) (TransactionDelta, error) {
	delta := TransactionDelta{WorkspaceID: strings.TrimSpace(workspaceID)}
	for _, mutation := range mutations {
		if mutation.EntityKind == "" || mutation.EntityID == "" {
			continue
		}
		if mutation.WorkspaceID == "" {
			mutation.WorkspaceID = delta.WorkspaceID
		}
		delta.Mutations = append(delta.Mutations, mutation)
	}
	if len(delta.Mutations) > 0 {
		delta.TransactionID = uuid.NewString()
		for index := range delta.Mutations {
			delta.Mutations[index].MutationID = delta.TransactionID + ":" + strconv.Itoa(index+1)
		}
		if participant := s.opts.TransactionParticipant; participant != nil {
			if err := participant.Participate(ctx, tx, delta); err != nil {
				return TransactionDelta{}, fmt.Errorf("participate in canonical transaction: %w", err)
			}
		}
	}
	if err := tx.Commit(); err != nil {
		return TransactionDelta{}, err
	}
	return delta, nil
}
