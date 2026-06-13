# Automation CLI Commands

The automation app exposes commands under the `automation` scope.

## Commands

### `tutti automation list`

List automation definitions.

### `tutti automation get`

Get one automation definition by id or exact name.

Examples:

```sh
tutti automation get --automation-id aut_123
tutti automation get --name "Daily review"
```

### `tutti automation create`

Create an automation definition.

Examples:

```sh
tutti automation create --name "Daily review" --prompt "Review today's changes"
tutti automation create --name "Hourly triage" --prompt "Triage open issues" --schedule-type interval --interval-minutes 60
tutti automation create --name "Weekday report" --prompt "Write a status report" --schedule-type weekly --days-of-week 1,2,3,4,5 --time-of-day 09:00
```

Schedule arguments:

- `--schedule-type manual|interval|daily|weekly|cron`
- `--interval-minutes 60`
- `--time-of-day 09:00`
- `--days-of-week 1,2,3,4,5`
- `--cron "0 9 * * 1"`

Runner arguments:

- `--provider codex`
- `--model gpt-5`
- `--reasoning-effort high`
- `--permission-mode full-access`
- `--runner-args "--model gpt-5"`
- `--env KEY=value,OTHER=value`

### `tutti automation update`

Update one automation definition by id. Omitted fields keep their current values.

Examples:

```sh
tutti automation update --automation-id aut_123 --name "Daily repo review"
tutti automation update --automation-id aut_123 --enabled false
tutti automation update --automation-id aut_123 --schedule-type cron --cron "0 9 * * 1"
```

### `tutti automation delete`

Delete one automation definition and its run history by id.

Examples:

```sh
tutti automation delete --automation-id aut_123
```

### `tutti automation run`

Trigger one automation immediately by id or exact name.

Examples:

```sh
tutti automation run --automation-id aut_123
tutti automation run --name "Daily review"
```

### `tutti automation runs`

List recent automation runs, optionally filtered by automation id.

Examples:

```sh
tutti automation runs
tutti automation runs --automation-id aut_123 --limit 20
```

### `tutti automation complete-run`

Submit the final structured status for a running automation.

This command is intended for automation runner prompts. It updates only the
matching running run's task status. The user-facing result should still be sent
as the agent's normal final Markdown response.
