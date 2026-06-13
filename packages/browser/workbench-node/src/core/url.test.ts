import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeBrowserComparableUrl,
  resolveBrowserAddressInput,
  resolveBrowserNavigationUrl,
  resolveHostBrowserNavigationUrl
} from "./url.ts";

test("resolves ordinary HTTP and HTTPS navigation URLs", () => {
  assert.deepEqual(resolveBrowserNavigationUrl("https://example.com/path"), {
    errorCode: null,
    url: "https://example.com/path"
  });
  assert.deepEqual(resolveBrowserNavigationUrl("example.com/docs"), {
    errorCode: null,
    url: "https://example.com/docs"
  });
  assert.deepEqual(resolveBrowserNavigationUrl("localhost:3000"), {
    errorCode: null,
    url: "http://localhost:3000/"
  });
});

test("rejects unsupported browser node navigation protocols", () => {
  assert.deepEqual(resolveBrowserNavigationUrl("file:///etc/passwd"), {
    errorCode: "unsupported-protocol",
    errorParams: { protocol: "file:" },
    url: null
  });
});

test("allows host browser navigation for workspace file URLs", () => {
  assert.deepEqual(
    resolveHostBrowserNavigationUrl("file:///Users/local/project/index.html"),
    {
      errorCode: null,
      url: "file:///Users/local/project/index.html"
    }
  );
});

test("keeps non-URL address input policy host-provided", () => {
  const resolved = resolveBrowserAddressInput("tutti browser node");
  assert.deepEqual(resolved, { errorCode: "invalid-url", url: null });
});

test("turns non-URL address input into host-provided search navigation", () => {
  const resolved = resolveBrowserAddressInput("tutti browser node", {
    resolveSearchUrl(query) {
      const searchUrl = new URL("https://search.example/");
      searchUrl.searchParams.set("q", query);
      return searchUrl.toString();
    }
  });
  assert.equal(resolved.url, "https://search.example/?q=tutti+browser+node");
});

test("normalizes comparable URLs through browser navigation rules", () => {
  assert.equal(
    normalizeBrowserComparableUrl("example.com"),
    "https://example.com/"
  );
  assert.equal(normalizeBrowserComparableUrl("not a url"), null);
});
