---
name: workspace-app
description: Use for `mention://workspace-app?...` links to discover, inspect, or invoke CLI-enabled Tutti workspace app commands.
---

# Workspace App

Use this skill when the current user turn contains one or more `mention://workspace-app?...` links.

Use the injected `tutti-cli` skill as the command reference for CLI syntax and available commands. This skill owns workspace app mention interpretation and decides how to use that CLI reference.

## Mention Contract

Treat a `mention://workspace-app?...` link as the machine-readable source of truth for the referenced app. The mention uses `workspaceId` and `appId`.

- `workspaceId`: workspace context for command discovery and invocation.
- `appId`: target workspace app id.

Do not infer app behavior from the mention label alone.

## Context Recovery

After reading the mention query, recover the smallest useful app context through Tutti CLI:

1. Read the injected `tutti-cli` command guide and find commands whose description says they are provided by the mentioned workspace app.
2. If several apps have similar names, match by `appId` from the mention, not only by the visible label.
3. Use the listed `tutti <scope> <command>` examples to inspect or invoke the app.
4. Prefer `--json` when the command output is used as context for reasoning.

If the mentioned app has no visible CLI commands in the command guide, explain that the app is not currently exposing usable CLI capabilities instead of guessing an app-specific command.

## Invocation Rules

Read command summaries and required inputs before invoking an app command. Ask for missing required inputs when the user did not provide enough information.

Only invoke app commands when the current user turn asks you to use, run, inspect, query, or otherwise interact with the app. For general questions about what the app can do, summarize the visible app commands instead.

Keep user-visible prompts thin. App mention interpretation and CLI lookup structure belong in this skill rather than in the visible handoff prompt.
