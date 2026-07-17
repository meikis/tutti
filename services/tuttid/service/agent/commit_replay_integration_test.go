package agent

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"

	agenthost "github.com/tutti-os/tutti/packages/agent/host"
	storesqlite "github.com/tutti-os/tutti/packages/agent/store-sqlite"
	_ "modernc.org/sqlite"
)

type durableMarkerParticipant struct{}

func (durableMarkerParticipant) Participate(ctx context.Context, writer storesqlite.TransactionWriter, delta storesqlite.TransactionDelta) error {
	_, err := writer.ExecContext(ctx, `INSERT INTO test_durable_outbox (transaction_id, delivered) VALUES (?, 0)`, delta.TransactionID)
	return err
}

type replayObserver struct {
	fail  bool
	calls int
}

func (o *replayObserver) ObserveCommitted(context.Context, agenthost.CommittedDelta) error {
	o.calls++
	if o.fail {
		return errors.New("observer unavailable")
	}
	return nil
}

func TestDurableMarkerSurvivesObserverFailureAndCanReplay(t *testing.T) {
	db, err := sql.Open("sqlite", filepath.Join(t.TempDir(), "agent-store.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	db.SetMaxOpenConns(1)
	store := storesqlite.New(db, storesqlite.Options{TransactionParticipant: durableMarkerParticipant{}})
	if err := store.Migrate(context.Background()); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE test_durable_outbox (transaction_id TEXT PRIMARY KEY, delivered INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}

	result, err := store.ReportSessionState(context.Background(), storesqlite.SessionStateReport{
		WorkspaceID: "workspace-1", AgentSessionID: "session-1", Provider: "codex", OccurredAtUnixMS: 1,
	})
	if err != nil {
		t.Fatal(err)
	}
	delta := agenthost.CanonicalDelta(result.CommitDelta)
	observer := &replayObserver{fail: true}
	agenthost.NotifyCommitted(context.Background(), observer, delta)

	var delivered int
	if err := db.QueryRow(`SELECT delivered FROM test_durable_outbox WHERE transaction_id = ?`, result.TransactionID).Scan(&delivered); err != nil || delivered != 0 {
		t.Fatalf("durable marker after observer failure delivered=%d error=%v", delivered, err)
	}
	observer.fail = false
	agenthost.NotifyCommitted(context.Background(), observer, delta)
	if observer.calls != 2 {
		t.Fatalf("observer calls=%d, want failed delivery plus replay", observer.calls)
	}
	if _, err := db.Exec(`UPDATE test_durable_outbox SET delivered = 1 WHERE transaction_id = ?`, result.TransactionID); err != nil {
		t.Fatal(err)
	}
}
