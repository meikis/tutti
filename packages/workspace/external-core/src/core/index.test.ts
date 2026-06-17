import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTuttiExternalAtQueryInput,
  normalizeTuttiExternalFileOpenInput,
  normalizeTuttiExternalFileSelectInput,
  tuttiExternalAtDefaultMaxResults,
  tuttiExternalAtMaxResultsLimit,
  tuttiExternalAtProviderIds
} from "./index.ts";

test("normalizes at query defaults", () => {
  assert.deepEqual(normalizeTuttiExternalAtQueryInput({ keyword: "readme" }), {
    keyword: "readme",
    maxResults: tuttiExternalAtDefaultMaxResults,
    providers: undefined
  });
});

test("caps at query max results and deduplicates providers", () => {
  assert.deepEqual(
    normalizeTuttiExternalAtQueryInput({
      keyword: "",
      maxResults: tuttiExternalAtMaxResultsLimit + 10,
      providers: ["file", "file", "agent-session"]
    }),
    {
      keyword: "",
      maxResults: tuttiExternalAtMaxResultsLimit,
      providers: ["file", "agent-session"]
    }
  );
});

test("rejects unsupported at providers", () => {
  assert.throws(
    () =>
      normalizeTuttiExternalAtQueryInput({
        keyword: "readme",
        providers: ["file", "not-supported"]
      }),
    /unsupported provider/
  );
});

test("keeps the default provider set explicit", () => {
  assert.deepEqual(tuttiExternalAtProviderIds, [
    "file",
    "workspace-issue",
    "workspace-app",
    "agent-session",
    "agent-generated-file"
  ]);
});

test("normalizes file select input", () => {
  assert.deepEqual(normalizeTuttiExternalFileSelectInput(undefined), {});
  assert.deepEqual(normalizeTuttiExternalFileSelectInput({ multiple: true }), {
    multiple: true
  });
  assert.deepEqual(normalizeTuttiExternalFileSelectInput({ multiple: false }), {
    multiple: false
  });
});

test("normalizes file open input", () => {
  assert.deepEqual(
    normalizeTuttiExternalFileOpenInput({
      mode: "auto",
      mtimeMs: 123,
      name: " Report.md ",
      path: " docs/report.md ",
      sizeBytes: null
    }),
    {
      mode: "auto",
      mtimeMs: 123,
      name: "Report.md",
      path: "docs/report.md",
      sizeBytes: null
    }
  );
});

test("rejects invalid file open input", () => {
  assert.throws(
    () => normalizeTuttiExternalFileOpenInput({ path: "" }),
    /path is required/
  );
  assert.throws(
    () => normalizeTuttiExternalFileOpenInput({ path: "README.md", mode: "x" }),
    /mode is unsupported/
  );
});
