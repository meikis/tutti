package workspace

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	workspacebiz "github.com/tutti-os/tutti/services/tuttid/biz/workspace"
)

func TestDecodeAppRuntimeReferenceAcceptsFileUnionBranch(t *testing.T) {
	t.Parallel()

	dataRoot := t.TempDir()
	referencePath := filepath.Join(dataRoot, "reports", "monthly.md")
	raw, err := json.Marshal(map[string]any{
		"kind":        "file",
		"displayName": "Report",
		"description": "Monthly report",
		"location": map[string]any{
			"type": "app-data-relative",
			"path": "reports/monthly.md",
		},
		"sizeBytes": 42,
		"mtimeMs":   1710000000000,
		"mimeType":  "text/markdown",
		"score":     0.75,
	})
	if err != nil {
		t.Fatalf("marshal reference: %v", err)
	}
	reference, ok := decodeAppRuntimeReference(raw, appReferenceLocationValidator{
		dataRoot:    dataRoot,
		packageRoot: t.TempDir(),
	})
	if !ok {
		t.Fatal("decodeAppRuntimeReference() ok = false, want true")
	}
	fileReference, ok := reference.(workspacebiz.AppFileReference)
	if !ok {
		t.Fatalf("decodeAppRuntimeReference() = %T, want AppFileReference", reference)
	}
	if fileReference.Path != referencePath {
		t.Fatalf("Path = %q, want %q", fileReference.Path, referencePath)
	}
	if fileReference.DisplayName != "Report" {
		t.Fatalf("DisplayName = %q, want Report", fileReference.DisplayName)
	}
}

func TestDecodeAppRuntimeReferenceAcceptsFileLocationTypes(t *testing.T) {
	t.Parallel()

	dataRoot := t.TempDir()
	packageRoot := t.TempDir()
	for _, tt := range []struct {
		name         string
		locationType string
		relativePath string
		root         string
	}{
		{
			name:         "data relative",
			locationType: "app-data-relative",
			relativePath: "reports/monthly.md",
			root:         dataRoot,
		},
		{
			name:         "package relative",
			locationType: "app-package-relative",
			relativePath: "docs/guide.md",
			root:         packageRoot,
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			raw, err := json.Marshal(map[string]any{
				"kind":        "file",
				"displayName": "Report",
				"location": map[string]any{
					"type": tt.locationType,
					"path": tt.relativePath,
				},
			})
			if err != nil {
				t.Fatalf("marshal reference: %v", err)
			}
			reference, ok := decodeAppRuntimeReference(raw, appReferenceLocationValidator{
				dataRoot:    dataRoot,
				packageRoot: packageRoot,
			})
			if !ok {
				t.Fatal("decodeAppRuntimeReference() ok = false, want true")
			}
			fileReference, ok := reference.(workspacebiz.AppFileReference)
			if !ok {
				t.Fatalf("decodeAppRuntimeReference() = %T, want AppFileReference", reference)
			}
			expectedPath := filepath.Join(tt.root, filepath.FromSlash(tt.relativePath))
			if fileReference.Path != expectedPath {
				t.Fatalf("Path = %q, want %q", fileReference.Path, expectedPath)
			}
		})
	}
}

func TestDecodeAppRuntimeReferenceDropsPathOnlyReference(t *testing.T) {
	t.Parallel()

	dataRoot := t.TempDir()
	raw, err := json.Marshal(map[string]any{
		"kind": "file",
		"path": filepath.Join(dataRoot, "reports", "monthly.md"),
	})
	if err != nil {
		t.Fatalf("marshal reference: %v", err)
	}
	if _, ok := decodeAppRuntimeReference(raw, appReferenceLocationValidator{
		dataRoot:    dataRoot,
		packageRoot: t.TempDir(),
	}); ok {
		t.Fatal("decodeAppRuntimeReference() ok = true, want false")
	}
}

func TestDecodeAppRuntimeReferenceDropsUnknownKind(t *testing.T) {
	t.Parallel()

	if _, ok := decodeAppRuntimeReference(json.RawMessage(`{
		"kind": "url",
		"url": "https://example.test"
	}`), appReferenceLocationValidator{
		dataRoot:    t.TempDir(),
		packageRoot: t.TempDir(),
	}); ok {
		t.Fatal("decodeAppRuntimeReference() ok = true, want false")
	}
}

func TestDecodeAppRuntimeFileReferenceDropsInvalidLocation(t *testing.T) {
	t.Parallel()

	for _, raw := range []string{
		`{"kind":"file","path":""}`,
		`{"kind":"file","path":"relative.txt"}`,
		`{"kind":"file","path":"/etc/passwd"}`,
		`{"kind":"file","path":"https://example.test/file.md"}`,
		"{\"kind\":\"file\",\"path\":\"/tmp/bad\\u0000name.txt\"}",
		`{"kind":"file","type":"app-data-relative","path":"a.txt"}`,
		`{"kind":"file","location":{"type":"workspace-relative","path":"a.txt"}}`,
		`{"kind":"file","location":{"type":"app-data-relative","path":""}}`,
		`{"kind":"file","location":{"type":"app-data-relative","path":"/a.txt"}}`,
		`{"kind":"file","location":{"type":"app-data-relative","path":"../secret.txt"}}`,
		`{"kind":"file","location":{"type":"app-data-relative","path":"safe/../secret.txt"}}`,
		`{"kind":"file","location":{"type":"app-data-relative","path":"C:/secret.txt"}}`,
		"{\"kind\":\"file\",\"location\":{\"type\":\"app-data-relative\",\"path\":\"bad\\u0000name.txt\"}}",
	} {
		t.Run(raw, func(t *testing.T) {
			if _, ok := decodeAppRuntimeReference(json.RawMessage(raw), appReferenceLocationValidator{
				dataRoot:    t.TempDir(),
				packageRoot: t.TempDir(),
			}); ok {
				t.Fatal("decodeAppRuntimeReference() ok = true, want false")
			}
		})
	}
}

func TestDecodeAppRuntimeFileReferenceDropsInvalidFieldTypes(t *testing.T) {
	t.Parallel()

	for _, raw := range []string{
		fileReferenceJSONForTest(t, map[string]any{"sizeBytes": -1}),
		fileReferenceJSONForTest(t, map[string]any{"mtimeMs": -1}),
		fileReferenceJSONForTest(t, map[string]any{"score": 1.1}),
		fileReferenceJSONForTest(t, map[string]any{"displayName": 12}),
	} {
		t.Run(raw, func(t *testing.T) {
			if _, ok := decodeAppRuntimeReference(json.RawMessage(raw), appReferenceLocationValidator{
				dataRoot:    t.TempDir(),
				packageRoot: t.TempDir(),
			}); ok {
				t.Fatal("decodeAppRuntimeReference() ok = true, want false")
			}
		})
	}
}

func TestSearchReferencesQueriesRunningEnabledAppAndDropsInvalidItems(t *testing.T) {
	t.Parallel()

	packageDir := t.TempDir()
	guidePath := filepath.Join(packageDir, "docs", "guide.md")
	outsidePath := filepath.Join(t.TempDir(), "secret.txt")
	requests := 0
	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		requests++
		if request.URL.Path != "/references/search" {
			t.Fatalf("request path = %q, want /references/search", request.URL.Path)
		}
		var body appRuntimeReferenceSearchRequest
		if err := json.NewDecoder(request.Body).Decode(&body); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		if body.Query != "guide" || body.Limit != 5 || len(body.Kinds) != 1 || body.Kinds[0] != "file" {
			t.Fatalf("request body = %#v", body)
		}
		response.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(response).Encode(map[string]any{
			"references": []map[string]any{
				{"kind": "url", "url": "https://example.test"},
				{"kind": "file", "path": outsidePath},
				{"kind": "file", "type": "app-package-relative", "path": "docs/ignored.md"},
				{"kind": "file", "location": map[string]any{
					"type": "app-package-relative",
					"path": "../secret.txt",
				}},
				{"kind": "file", "displayName": "Guide", "location": map[string]any{
					"type": "app-package-relative",
					"path": "docs/guide.md",
				}},
			},
			"nextCursor": "next-page",
		}); err != nil {
			t.Fatalf("encode response: %v", err)
		}
	}))
	t.Cleanup(server.Close)

	service := newAppReferenceSearchServiceForTest(t, appReferenceSearchServiceTestInput{
		enabled:             true,
		referenceSearch:     true,
		runtimeLaunchURL:    server.URL,
		runtimeStatus:       workspacebiz.AppRuntimeStatusRunning,
		runtimeHTTPClient:   server.Client(),
		runtimeResolverStub: &appRuntimeResolverStub{called: make(chan struct{})},
		packageDir:          packageDir,
	})

	result, err := service.SearchReferences(context.Background(), "ws-1", "docs", workspacebiz.AppReferenceSearchInput{
		Query: "guide",
		Limit: 5,
		Kinds: []workspacebiz.AppReferenceKind{workspacebiz.AppReferenceKindFile},
	})
	if err != nil {
		t.Fatalf("SearchReferences() error = %v", err)
	}
	if requests != 1 {
		t.Fatalf("runtime requests = %d, want 1", requests)
	}
	if len(result.References) != 1 {
		t.Fatalf("references = %#v, want one valid reference", result.References)
	}
	reference, ok := result.References[0].(workspacebiz.AppFileReference)
	if !ok {
		t.Fatalf("reference type = %T, want AppFileReference", result.References[0])
	}
	if reference.Path != guidePath {
		t.Fatalf("reference path = %q, want %q", reference.Path, guidePath)
	}
	if result.NextCursor == nil || *result.NextCursor != "next-page" {
		t.Fatalf("nextCursor = %#v, want next-page", result.NextCursor)
	}
	assertRuntimeResolverNotCalled(t, service.Runner.RuntimeResolver.(*appRuntimeResolverStub))
}

func TestSearchReferencesDoesNotQueryAppsThatAreNotEligible(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name            string
		enabled         bool
		referenceSearch bool
		runtimeStatus   workspacebiz.AppRuntimeStatus
		launchURL       string
	}{
		{
			name:            "disabled",
			enabled:         false,
			referenceSearch: true,
			runtimeStatus:   workspacebiz.AppRuntimeStatusRunning,
			launchURL:       "http://127.0.0.1:1",
		},
		{
			name:            "references unsupported",
			enabled:         true,
			referenceSearch: false,
			runtimeStatus:   workspacebiz.AppRuntimeStatusRunning,
			launchURL:       "http://127.0.0.1:1",
		},
		{
			name:            "not running",
			enabled:         true,
			referenceSearch: true,
			runtimeStatus:   workspacebiz.AppRuntimeStatusIdle,
			launchURL:       "http://127.0.0.1:1",
		},
		{
			name:            "missing launch url",
			enabled:         true,
			referenceSearch: true,
			runtimeStatus:   workspacebiz.AppRuntimeStatusRunning,
			launchURL:       "",
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			resolver := &appRuntimeResolverStub{called: make(chan struct{})}
			service := newAppReferenceSearchServiceForTest(t, appReferenceSearchServiceTestInput{
				enabled:             tt.enabled,
				referenceSearch:     tt.referenceSearch,
				runtimeLaunchURL:    tt.launchURL,
				runtimeStatus:       tt.runtimeStatus,
				runtimeResolverStub: resolver,
			})

			result, err := service.SearchReferences(context.Background(), "ws-1", "docs", workspacebiz.AppReferenceSearchInput{Query: "guide"})
			if err != nil {
				t.Fatalf("SearchReferences() error = %v", err)
			}
			if len(result.References) != 0 || result.NextCursor != nil {
				t.Fatalf("result = %#v, want empty", result)
			}
			assertRuntimeResolverNotCalled(t, resolver)
		})
	}
}

func TestSearchReferencesRuntimeFailuresReturnEmptyResults(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name       string
		statusCode int
		body       string
	}{
		{name: "http error", statusCode: http.StatusInternalServerError, body: `{"references":[]}`},
		{name: "invalid json", statusCode: http.StatusOK, body: `{`},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
				response.WriteHeader(tt.statusCode)
				_, _ = response.Write([]byte(tt.body))
			}))
			t.Cleanup(server.Close)
			service := newAppReferenceSearchServiceForTest(t, appReferenceSearchServiceTestInput{
				enabled:           true,
				referenceSearch:   true,
				runtimeLaunchURL:  server.URL,
				runtimeStatus:     workspacebiz.AppRuntimeStatusRunning,
				runtimeHTTPClient: server.Client(),
			})

			result, err := service.SearchReferences(context.Background(), "ws-1", "docs", workspacebiz.AppReferenceSearchInput{Query: "guide"})
			if err != nil {
				t.Fatalf("SearchReferences() error = %v", err)
			}
			if len(result.References) != 0 || result.NextCursor != nil {
				t.Fatalf("result = %#v, want empty", result)
			}
		})
	}
}

type appReferenceSearchServiceTestInput struct {
	enabled             bool
	referenceSearch     bool
	runtimeLaunchURL    string
	runtimeStatus       workspacebiz.AppRuntimeStatus
	runtimeHTTPClient   *http.Client
	runtimeResolverStub *appRuntimeResolverStub
	packageDir          string
}

func newAppReferenceSearchServiceForTest(t *testing.T, input appReferenceSearchServiceTestInput) *AppCenterService {
	t.Helper()

	store := newAppStoreStub()
	packageDir := input.packageDir
	if packageDir == "" {
		packageDir = t.TempDir()
	}
	references := (*workspacebiz.AppManifestReferences)(nil)
	if input.referenceSearch {
		references = &workspacebiz.AppManifestReferences{SearchEndpoint: "/references/search"}
	}
	if err := store.PutAppPackage(context.Background(), workspacebiz.AppPackage{
		AppID:      "docs",
		Version:    "1.0.0",
		PackageDir: packageDir,
		Manifest: workspacebiz.AppManifest{
			SchemaVersion: workspacebiz.AppManifestSchemaVersionV1,
			AppID:         "docs",
			Version:       "1.0.0",
			Name:          "Docs",
			Description:   "Docs app",
			Icon:          workspacebiz.AppManifestIcon{Type: "asset", Src: "icon.png"},
			Runtime: workspacebiz.AppManifestRuntime{
				Bootstrap:       "bootstrap.sh",
				HealthcheckPath: "/healthz",
			},
			References: references,
		},
		Source: workspacebiz.AppPackageSourceGenerated,
	}); err != nil {
		t.Fatalf("PutAppPackage() error = %v", err)
	}
	if err := store.PutWorkspaceAppInstallation(context.Background(), workspacebiz.AppInstallation{
		WorkspaceID: "ws-1",
		AppID:       "docs",
		Enabled:     input.enabled,
	}); err != nil {
		t.Fatalf("PutWorkspaceAppInstallation() error = %v", err)
	}
	runner := &AppRunner{
		HTTPClient:         input.runtimeHTTPClient,
		RuntimeResolver:    input.runtimeResolverStub,
		HealthcheckTimeout: 0,
	}
	state := workspacebiz.AppRuntimeState{Status: input.runtimeStatus}
	if input.runtimeLaunchURL != "" {
		state.LaunchURL = &input.runtimeLaunchURL
	}
	runner.setState(appRuntimeKey("ws-1", "docs"), state)
	return &AppCenterService{
		Store:          store,
		WorkspaceStore: &catalogStoreStub{getWorkspace: workspacebiz.Summary{ID: "ws-1", Name: "Workspace"}},
		Runner:         runner,
		StateDir:       t.TempDir(),
	}
}

func fileReferenceJSONForTest(t *testing.T, fields map[string]any) string {
	t.Helper()
	payload := map[string]any{
		"kind": "file",
		"location": map[string]any{
			"type": "app-data-relative",
			"path": "a.txt",
		},
	}
	for key, value := range fields {
		payload[key] = value
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		t.Fatalf("marshal file reference: %v", err)
	}
	return string(raw)
}

func assertRuntimeResolverNotCalled(t *testing.T, resolver *appRuntimeResolverStub) {
	t.Helper()
	if resolver == nil {
		return
	}
	select {
	case <-resolver.called:
		t.Fatal("runtime resolver was called")
	default:
	}
}
