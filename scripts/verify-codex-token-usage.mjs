#!/usr/bin/env node
/**
 * Verify Codex App Server tokenUsage semantics.
 *
 * Runs 3 short turns and records every thread/tokenUsage/updated notification.
 * Expected outcome:
 *   - last.inputTokens  ≈ stable   (per-request context fill)
 *   - last.totalTokens  = last.inputTokens + outputTokens + reasoningTokens
 *   - total.totalTokens ↑ grows    (cumulative across all API calls in thread)
 *
 * This confirms that Tutti should use last.inputTokens (not total.totalTokens)
 * as the context-window fill metric.
 *
 * Usage:  node verify-codex-token-usage.mjs [--debug]
 */

import { spawn } from "child_process";
import { createInterface } from "readline";

const DEBUG = process.argv.includes("--debug");
const TURNS = [
  "Reply with exactly the single word: apple",
  "Reply with exactly the single word: banana",
  "Reply with exactly the single word: cherry"
];
const TURN_DRAIN_MS = 3000; // wait after turn/completed for late notifications
const TIMEOUT_MS = 180_000;

// ─── state ───────────────────────────────────────────────────────────────────

let threadId = null;
let msgId = 0;
let currentTurnIdx = 0;
let turnDrainTimer = null;
const usageRows = []; // all collected tokenUsage notifications

// ─── launch ──────────────────────────────────────────────────────────────────

const proc = spawn("codex", ["app-server"], {
  stdio: ["pipe", "pipe", "inherit"]
});
const rl = createInterface({ input: proc.stdout });

const globalTimer = setTimeout(() => {
  console.error("\n[timeout]");
  printReport();
  proc.kill();
  process.exit(1);
}, TIMEOUT_MS);

proc.on("exit", () => clearTimeout(globalTimer));

// ─── helpers ─────────────────────────────────────────────────────────────────

function send(method, params, id) {
  const msg = { method, params: params ?? {} };
  if (id !== undefined) msg.id = id;
  if (DEBUG) console.error("[send]", JSON.stringify(msg));
  proc.stdin.write(JSON.stringify(msg) + "\n");
}

function request(method, params) {
  const id = ++msgId;
  send(method, params, id);
  return id;
}

// ─── message router ──────────────────────────────────────────────────────────

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  if (DEBUG) console.error("[recv]", JSON.stringify(msg).slice(0, 300));

  if (msg.id === 1) {
    // initialize response
    send("initialized", {});
    // Use default model by omitting "model" field
    request("thread/start", {});
    return;
  }

  if (msg.id === 2 && msg.result?.thread?.id) {
    threadId = msg.result.thread.id;
    console.log(`[thread] ${threadId}`);
    startNextTurn();
    return;
  }

  if (!msg.id && msg.method) {
    handleNotification(msg.method, msg.params ?? {});
  }
});

function handleNotification(method, params) {
  switch (method) {
    case "thread/tokenUsage/updated": {
      const tu = params.tokenUsage;
      if (!tu) return;

      const row = {
        turn: currentTurnIdx + 1,
        "last.input": tu.last?.inputTokens ?? null,
        "last.output": tu.last?.outputTokens ?? null,
        "last.reasoning": tu.last?.reasoningOutputTokens ?? null,
        "last.total": tu.last?.totalTokens ?? null,
        "cumul.total": tu.total?.totalTokens ?? null,
        window: tu.modelContextWindow ?? null
      };
      usageRows.push(row);

      const fill =
        row["last.input"] != null && row.window
          ? ((row["last.input"] / row.window) * 100).toFixed(1) + "%"
          : "?";
      const wrongFill =
        row["cumul.total"] != null && row.window
          ? ((row["cumul.total"] / row.window) * 100).toFixed(1) + "%"
          : "?";

      console.log(
        `  [tokenUsage] turn=${row.turn}` +
          `  last.input=${row["last.input"]}` +
          `  last.total=${row["last.total"]}` +
          `  cumul.total=${row["cumul.total"]}` +
          `  fill(correct)=${fill}` +
          `  fill(wrong)=${wrongFill}`
      );
      break;
    }

    case "turn/completed": {
      console.log(`  [turn/completed] status=${params.turn?.status}`);
      // Drain window: wait a bit for any late tokenUsage notifications
      // before starting the next turn.
      clearTimeout(turnDrainTimer);
      turnDrainTimer = setTimeout(() => {
        currentTurnIdx++;
        if (currentTurnIdx < TURNS.length) {
          startNextTurn();
        } else {
          printReport();
          send("thread/unsubscribe", { threadId });
          proc.stdin.end();
        }
      }, TURN_DRAIN_MS);
      break;
    }

    case "turn/started":
      console.log(`  [turn/started] id=${params.turn?.id}`);
      break;

    case "item/agentMessage/delta":
      // suppress noisy deltas unless debugging
      if (DEBUG) console.error("[delta]", params.delta?.slice(0, 40));
      break;
  }
}

function startNextTurn() {
  const prompt = TURNS[currentTurnIdx];
  console.log(`\n[turn ${currentTurnIdx + 1}/${TURNS.length}] "${prompt}"`);
  request("turn/start", { threadId, input: [{ type: "text", text: prompt }] });
}

// ─── report ──────────────────────────────────────────────────────────────────

function printReport() {
  console.log("\n════════════════════════════════════════════════════");
  console.log(` Raw tokenUsage rows (${usageRows.length} total)`);
  console.log("════════════════════════════════════════════════════");
  console.table(usageRows);

  if (usageRows.length === 0) {
    console.log("No tokenUsage notifications received.");
    console.log("Try running with --debug to inspect the raw message stream.");
    return;
  }

  const cumulTotals = usageRows
    .map((r) => r["cumul.total"])
    .filter((v) => v != null);
  const lastInputs = usageRows
    .map((r) => r["last.input"])
    .filter((v) => v != null);
  const window = usageRows[0]?.window;

  const cumulGrows =
    cumulTotals.length >= 2 &&
    cumulTotals[cumulTotals.length - 1] > cumulTotals[0];
  const maxInput = Math.max(...lastInputs);
  const minInput = Math.min(...lastInputs);
  const inputStable = lastInputs.length >= 2 && maxInput / minInput < 4;

  console.log("\n Findings:");
  console.log(
    "  cumul.total grows across turns?  ",
    cumulGrows
      ? "✓ YES  → total is cumulative, not context fill"
      : "✗ NO   → unexpected; investigate further"
  );
  console.log(
    "  last.input roughly stable?       ",
    inputStable
      ? "✓ YES  → last.inputTokens is per-request context"
      : "~ GROWS (conversation history expanding, expected for long sessions)"
  );

  if (window && lastInputs.length > 0 && cumulTotals.length > 0) {
    const correctPct = (
      (lastInputs[lastInputs.length - 1] / window) *
      100
    ).toFixed(1);
    const wrongPct = (
      (cumulTotals[cumulTotals.length - 1] / window) *
      100
    ).toFixed(1);
    console.log(`\n Context window display (window=${window}):`);
    console.log(
      `   last.inputTokens  → ${correctPct}%  ← what Tutti now shows`
    );
    console.log(
      `   cumul.totalTokens → ${wrongPct}%  ← what triggered the false compact alert`
    );
  }

  const cumulExceedsWindow = window && cumulTotals.some((t) => t > window);
  if (cumulExceedsWindow) {
    console.log(
      "\n ⚠  cumul.total exceeded modelContextWindow — this is exactly the false-positive\n" +
        "    that triggered the compact alert in session bf9cf10a."
    );
  }

  console.log("════════════════════════════════════════════════════\n");
}

// ─── kick off ────────────────────────────────────────────────────────────────

console.log("Starting codex app-server (default model) …");
request("initialize", {
  clientInfo: {
    name: "tutti-verify",
    title: "Tutti token-usage verify",
    version: "0.0.1"
  }
});
