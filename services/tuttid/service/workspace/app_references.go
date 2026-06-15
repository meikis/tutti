package workspace

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	pathpkg "path"
	"path/filepath"
	"strings"
	"time"

	workspacebiz "github.com/tutti-os/tutti/services/tuttid/biz/workspace"
)

const (
	appReferenceSearchDefaultLimit  = 20
	appReferenceSearchMaxLimit      = 50
	appReferenceSearchMaxBytes      = 1024 * 1024
	appReferenceSearchTimeout       = 1500 * time.Millisecond
	appReferenceQueryMaxRunes       = 200
	appReferenceCursorMaxRunes      = 2048
	appReferenceDisplayNameMaxRunes = 160
	appReferenceDescriptionMaxRunes = 500
	appReferenceMimeTypeMaxRunes    = 128
)

func (s *AppCenterService) SearchReferences(ctx context.Context, workspaceID string, appID string, input workspacebiz.AppReferenceSearchInput) (workspacebiz.AppReferenceSearchResult, error) {
	if _, err := s.workspaceSummary(ctx, workspaceID); err != nil {
		return workspacebiz.AppReferenceSearchResult{}, err
	}

	appPackage, installation, err := s.installedPackage(ctx, workspaceID, appID)
	if err != nil {
		return workspacebiz.AppReferenceSearchResult{}, err
	}
	if !installation.Enabled || !appPackage.ReferenceSearchSupported() {
		return workspacebiz.AppReferenceSearchResult{}, nil
	}

	runtimeState := s.runner().State(workspaceID, appPackage.AppID)
	if runtimeState.Status != workspacebiz.AppRuntimeStatusRunning || runtimeState.LaunchURL == nil || strings.TrimSpace(*runtimeState.LaunchURL) == "" {
		return workspacebiz.AppReferenceSearchResult{}, nil
	}

	endpointURL, err := appReferenceSearchURL(*runtimeState.LaunchURL, appPackage.Manifest.References.SearchEndpoint)
	if err != nil {
		slog.Warn("workspace app reference search endpoint invalid", "workspaceId", workspaceID, "appId", appPackage.AppID, "error", err)
		return workspacebiz.AppReferenceSearchResult{}, nil
	}

	result, err := s.searchAppRuntimeReferences(ctx, endpointURL, appPackage, workspaceID, input)
	if err != nil {
		slog.Warn("workspace app reference search failed", "workspaceId", workspaceID, "appId", appPackage.AppID, "error", err)
		return workspacebiz.AppReferenceSearchResult{}, nil
	}
	return result, nil
}

func (s *AppCenterService) searchAppRuntimeReferences(ctx context.Context, endpointURL string, appPackage workspacebiz.AppPackage, workspaceID string, input workspacebiz.AppReferenceSearchInput) (workspacebiz.AppReferenceSearchResult, error) {
	payload := appRuntimeReferenceSearchRequest{
		Query: trimRunes(strings.TrimSpace(input.Query), appReferenceQueryMaxRunes),
		Limit: normalizeAppReferenceSearchLimit(input.Limit),
		Kinds: []string{string(workspacebiz.AppReferenceKindFile)},
	}
	if cursor := trimRunes(strings.TrimSpace(input.Cursor), appReferenceCursorMaxRunes); cursor != "" {
		payload.Cursor = cursor
	}
	if len(input.Kinds) > 0 && !appReferenceKindsIncludeFile(input.Kinds) {
		return workspacebiz.AppReferenceSearchResult{}, nil
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return workspacebiz.AppReferenceSearchResult{}, err
	}
	searchCtx, cancel := context.WithTimeout(ctx, appReferenceSearchTimeout)
	defer cancel()
	request, err := http.NewRequestWithContext(searchCtx, http.MethodPost, endpointURL, bytes.NewReader(body))
	if err != nil {
		return workspacebiz.AppReferenceSearchResult{}, err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")

	client := appReferenceSearchHTTPClient(s.runner().HTTPClient)
	response, err := client.Do(request)
	if err != nil {
		return workspacebiz.AppReferenceSearchResult{}, err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return workspacebiz.AppReferenceSearchResult{}, fmt.Errorf("app reference search returned status %d", response.StatusCode)
	}

	decoder := json.NewDecoder(io.LimitReader(response.Body, appReferenceSearchMaxBytes))
	var raw appRuntimeReferenceSearchResponse
	if err := decoder.Decode(&raw); err != nil {
		return workspacebiz.AppReferenceSearchResult{}, err
	}

	validator := appReferenceLocationValidator{
		dataRoot:    filepath.Join(s.workspaceAppStateRoot(workspaceID, appPackage.AppID), "data"),
		packageRoot: appPackage.PackageDir,
	}
	references := make([]workspacebiz.AppReference, 0, len(raw.References))
	for index, rawReference := range raw.References {
		reference, ok := decodeAppRuntimeReference(rawReference, validator)
		if !ok {
			slog.Warn("workspace app reference item dropped", "workspaceId", workspaceID, "appId", appPackage.AppID, "index", index)
			continue
		}
		references = append(references, reference)
		if len(references) >= payload.Limit {
			break
		}
	}

	return workspacebiz.AppReferenceSearchResult{
		References: references,
		NextCursor: normalizeOptionalCursor(raw.NextCursor),
	}, nil
}

type appRuntimeReferenceSearchRequest struct {
	Query  string   `json:"query"`
	Limit  int      `json:"limit"`
	Cursor string   `json:"cursor,omitempty"`
	Kinds  []string `json:"kinds"`
}

type appRuntimeReferenceSearchResponse struct {
	References []json.RawMessage `json:"references"`
	NextCursor *string           `json:"nextCursor,omitempty"`
}

type appRuntimeReferenceKindHeader struct {
	Kind string `json:"kind"`
}

type appRuntimeFileReference struct {
	Kind        string                       `json:"kind"`
	DisplayName *string                      `json:"displayName,omitempty"`
	Description *string                      `json:"description,omitempty"`
	Location    *appRuntimeReferenceLocation `json:"location,omitempty"`
	SizeBytes   *int64                       `json:"sizeBytes,omitempty"`
	MtimeMs     *int64                       `json:"mtimeMs,omitempty"`
	MimeType    *string                      `json:"mimeType,omitempty"`
	Score       *float64                     `json:"score,omitempty"`
}

type appRuntimeReferenceLocation struct {
	Type string `json:"type"`
	Path string `json:"path"`
}

type appReferenceLocationValidator struct {
	dataRoot    string
	packageRoot string
}

func decodeAppRuntimeReference(raw json.RawMessage, validator appReferenceLocationValidator) (workspacebiz.AppReference, bool) {
	var header appRuntimeReferenceKindHeader
	if err := json.Unmarshal(raw, &header); err != nil {
		return nil, false
	}
	switch strings.TrimSpace(header.Kind) {
	case string(workspacebiz.AppReferenceKindFile):
		return decodeAppRuntimeFileReference(raw, validator)
	default:
		return nil, false
	}
}

func decodeAppRuntimeFileReference(raw json.RawMessage, validator appReferenceLocationValidator) (workspacebiz.AppReference, bool) {
	var decoded appRuntimeFileReference
	if err := json.Unmarshal(raw, &decoded); err != nil {
		return nil, false
	}
	referencePath, ok := normalizeAppRuntimeFileReferencePath(decoded, validator)
	if !ok {
		return nil, false
	}
	sizeBytes, ok := normalizeOptionalNonNegativeInt64(decoded.SizeBytes)
	if !ok {
		return nil, false
	}
	mtimeMs, ok := normalizeOptionalNonNegativeInt64(decoded.MtimeMs)
	if !ok {
		return nil, false
	}
	score, ok := normalizeOptionalScore(decoded.Score)
	if !ok {
		return nil, false
	}
	mimeType, ok := normalizeOptionalBoundedString(decoded.MimeType, appReferenceMimeTypeMaxRunes)
	if !ok {
		return nil, false
	}
	displayName, ok := normalizeOptionalBoundedString(decoded.DisplayName, appReferenceDisplayNameMaxRunes)
	if !ok {
		return nil, false
	}
	if displayName == "" {
		displayName = filepath.Base(referencePath)
	}
	description, ok := normalizeOptionalBoundedString(decoded.Description, appReferenceDescriptionMaxRunes)
	if !ok {
		return nil, false
	}
	return workspacebiz.AppFileReference{
		DisplayName: displayName,
		Description: description,
		Path:        referencePath,
		SizeBytes:   sizeBytes,
		MtimeMs:     mtimeMs,
		MimeType:    mimeType,
		Score:       score,
	}, true
}

func normalizeAppRuntimeFileReferencePath(reference appRuntimeFileReference, validator appReferenceLocationValidator) (string, bool) {
	if reference.Location == nil {
		return "", false
	}
	return resolveAppRuntimeFileReferenceLocation(*reference.Location, validator)
}

func resolveAppRuntimeFileReferenceLocation(location appRuntimeReferenceLocation, validator appReferenceLocationValidator) (string, bool) {
	relativePath, ok := normalizeAppReferenceRelativePath(location.Path)
	if !ok {
		return "", false
	}
	var root string
	switch strings.TrimSpace(location.Type) {
	case "app-data-relative":
		root = validator.dataRoot
	case "app-package-relative":
		root = validator.packageRoot
	default:
		return "", false
	}
	if strings.TrimSpace(root) == "" {
		return "", false
	}
	absoluteRoot, err := filepath.Abs(root)
	if err != nil {
		return "", false
	}
	absolutePath, err := filepath.Abs(filepath.Join(absoluteRoot, filepath.FromSlash(relativePath)))
	if err != nil {
		return "", false
	}
	if !isPathWithinRoot(absoluteRoot, absolutePath) {
		return "", false
	}
	return absolutePath, true
}

func normalizeAppReferenceRelativePath(value string) (string, bool) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.Contains(trimmed, "\x00") {
		return "", false
	}
	normalized := strings.ReplaceAll(trimmed, "\\", "/")
	if strings.HasPrefix(normalized, "/") || strings.HasPrefix(normalized, "//") || hasAppReferenceDrivePrefix(normalized) {
		return "", false
	}
	for _, segment := range strings.Split(normalized, "/") {
		if segment == ".." {
			return "", false
		}
	}
	cleaned := pathpkg.Clean(normalized)
	if cleaned == "." || strings.HasPrefix(cleaned, "../") || cleaned == ".." || strings.HasPrefix(cleaned, "/") {
		return "", false
	}
	return cleaned, true
}

func hasAppReferenceDrivePrefix(value string) bool {
	return len(value) >= 2 && value[1] == ':' && ((value[0] >= 'a' && value[0] <= 'z') || (value[0] >= 'A' && value[0] <= 'Z'))
}

func appReferenceSearchURL(launchURL string, searchEndpoint string) (string, error) {
	base, err := url.Parse(strings.TrimSpace(launchURL))
	if err != nil {
		return "", err
	}
	if base.Scheme != "http" && base.Scheme != "https" {
		return "", fmt.Errorf("unsupported app launch url scheme %q", base.Scheme)
	}
	endpoint := strings.TrimSpace(searchEndpoint)
	if endpoint == "" || !strings.HasPrefix(endpoint, "/") || strings.HasPrefix(endpoint, "//") {
		return "", fmt.Errorf("invalid reference search endpoint %q", searchEndpoint)
	}
	base.Path = endpoint
	base.RawQuery = ""
	base.Fragment = ""
	return base.String(), nil
}

func appReferenceSearchHTTPClient(client *http.Client) *http.Client {
	if client != nil {
		return client
	}
	return http.DefaultClient
}

func normalizeAppReferenceSearchLimit(limit int) int {
	if limit <= 0 {
		return appReferenceSearchDefaultLimit
	}
	if limit > appReferenceSearchMaxLimit {
		return appReferenceSearchMaxLimit
	}
	return limit
}

func appReferenceKindsIncludeFile(kinds []workspacebiz.AppReferenceKind) bool {
	for _, kind := range kinds {
		if kind == workspacebiz.AppReferenceKindFile {
			return true
		}
	}
	return false
}

func normalizeOptionalCursor(value *string) *string {
	if value == nil {
		return nil
	}
	normalized := trimRunes(strings.TrimSpace(*value), appReferenceCursorMaxRunes)
	if normalized == "" {
		return nil
	}
	return &normalized
}

func normalizeOptionalBoundedString(value *string, maxRunes int) (string, bool) {
	if value == nil {
		return "", true
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return "", true
	}
	if runeCount(trimmed) > maxRunes {
		return "", false
	}
	return trimmed, true
}

func normalizeOptionalNonNegativeInt64(value *int64) (*int64, bool) {
	if value == nil {
		return nil, true
	}
	if *value < 0 {
		return nil, false
	}
	normalized := *value
	return &normalized, true
}

func normalizeOptionalScore(value *float64) (*float64, bool) {
	if value == nil {
		return nil, true
	}
	if *value < 0 || *value > 1 {
		return nil, false
	}
	normalized := *value
	return &normalized, true
}

func trimRunes(value string, maxRunes int) string {
	if maxRunes <= 0 || runeCount(value) <= maxRunes {
		return value
	}
	runes := []rune(value)
	return string(runes[:maxRunes])
}

func runeCount(value string) int {
	return len([]rune(value))
}

func isPathWithinRoot(rootPath string, candidatePath string) bool {
	root := filepath.Clean(rootPath)
	candidate := filepath.Clean(candidatePath)
	relative, err := filepath.Rel(root, candidate)
	if err != nil {
		return false
	}
	return relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)) && !filepath.IsAbs(relative))
}
