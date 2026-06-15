package workspace

import (
	tuttigenerated "github.com/tutti-os/tutti/services/tuttid/api/generated"
	workspacebiz "github.com/tutti-os/tutti/services/tuttid/biz/workspace"
)

func GeneratedAppFromBiz(app workspacebiz.WorkspaceApp) tuttigenerated.WorkspaceApp {
	return tuttigenerated.WorkspaceApp{
		AppId:            app.Package.AppID,
		DisplayName:      app.Package.DisplayName(),
		Version:          app.Package.Version,
		Description:      app.Package.Description(),
		CreatedAtUnixMs:  app.Package.CreatedAtUnixMs,
		IconUrl:          app.ResolvedIconURL(),
		AvailableVersion: app.AvailableVersion,
		AvailableIconUrl: app.AvailableIconURL,
		UpdateAvailable:  app.UpdateAvailable,
		Installed:        app.Installation != nil,
		Enabled:          app.Installation != nil && app.Installation.Enabled,
		Status:           generatedAppRuntimeStatus(app.Runtime.Status),
		StateRevision:    app.StateRevision,
		LaunchUrl:        app.Runtime.LaunchURL,
		Port:             app.Runtime.Port,
		FailureReason:    app.Runtime.FailureReason,
		LastError:        app.Runtime.LastError,
		StartedAtUnixMs:  app.Runtime.StartedAtUnixMs,
		UpdatedAtUnixMs:  app.Runtime.UpdatedAtUnixMs,
		Source:           generatedAppSource(app.Package.Source),
		Exportable:       app.Package.Source == workspacebiz.AppPackageSourceGenerated || app.Package.Source == workspacebiz.AppPackageSourceImported,
		Tags:             nonNilStrings(app.Package.Manifest.Tags),
		Localizations:    GeneratedAppLocalizationsFromBiz(app.Package.Localizations()),
		MinimizeBehavior: tuttigenerated.WorkspaceAppMinimizeBehavior(app.Package.MinimizeBehavior()),
		WindowMinWidth:   app.Package.WindowMinWidth(),
		WindowMinHeight:  app.Package.WindowMinHeight(),
		Cli:              generatedAppCLIState(app.CLI),
		References:       generatedAppReferencesStateFromBiz(app),
	}
}

func GeneratedAppsFromBiz(apps []workspacebiz.WorkspaceApp) []tuttigenerated.WorkspaceApp {
	result := make([]tuttigenerated.WorkspaceApp, 0, len(apps))
	for _, app := range apps {
		result = append(result, GeneratedAppFromBiz(app))
	}
	return result
}

func GeneratedAppReferenceSearchResultFromBiz(workspaceID string, appID string, result workspacebiz.AppReferenceSearchResult) tuttigenerated.AppReferenceSearchResponse {
	return tuttigenerated.AppReferenceSearchResponse{
		WorkspaceId: workspaceID,
		AppId:       appID,
		References:  generatedAppReferencesFromBiz(result.References),
		NextCursor:  result.NextCursor,
	}
}

func GeneratedAppLocalizationsFromBiz(localizations []workspacebiz.AppManifestLocalization) []tuttigenerated.WorkspaceAppLocalization {
	result := make([]tuttigenerated.WorkspaceAppLocalization, 0, len(localizations))
	for _, localization := range localizations {
		result = append(result, tuttigenerated.WorkspaceAppLocalization{
			Locale:      localization.Locale,
			DisplayName: nullableString(localization.Name),
			Description: nullableString(localization.Description),
			Tags:        nonNilStrings(localization.Tags),
		})
	}
	return result
}

func GeneratedAppCatalogLoadStateFromBiz(state workspacebiz.AppCatalogLoadState) tuttigenerated.WorkspaceAppCatalogLoadState {
	return tuttigenerated.WorkspaceAppCatalogLoadState{
		Status:          generatedAppCatalogLoadStatus(state.Status),
		LastError:       state.LastError,
		UpdatedAtUnixMs: state.UpdatedAtUnixMs,
	}
}

func generatedAppReferencesStateFromBiz(app workspacebiz.WorkspaceApp) tuttigenerated.WorkspaceAppReferencesState {
	return tuttigenerated.WorkspaceAppReferencesState{
		SearchSupported: app.Package.ReferenceSearchSupported(),
	}
}

func generatedAppReferencesFromBiz(references []workspacebiz.AppReference) []tuttigenerated.AppReference {
	result := make([]tuttigenerated.AppReference, 0, len(references))
	for _, reference := range references {
		generated, ok := generatedAppReferenceFromBiz(reference)
		if ok {
			result = append(result, generated)
		}
	}
	return result
}

func generatedAppReferenceFromBiz(reference workspacebiz.AppReference) (tuttigenerated.AppReference, bool) {
	switch typed := reference.(type) {
	case workspacebiz.AppFileReference:
		var generated tuttigenerated.AppReference
		if err := generated.FromAppFileReference(generatedAppFileReferenceFromBiz(typed)); err != nil {
			return tuttigenerated.AppReference{}, false
		}
		return generated, true
	default:
		return tuttigenerated.AppReference{}, false
	}
}

func generatedAppFileReferenceFromBiz(reference workspacebiz.AppFileReference) tuttigenerated.AppFileReference {
	score := nullableFloat32(reference.Score)
	return tuttigenerated.AppFileReference{
		Kind:        tuttigenerated.AppFileReferenceKindFile,
		DisplayName: nullableString(reference.DisplayName),
		Description: nullableString(reference.Description),
		Path:        reference.Path,
		SizeBytes:   reference.SizeBytes,
		MtimeMs:     reference.MtimeMs,
		MimeType:    nullableString(reference.MimeType),
		Score:       score,
	}
}

func nullableString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func nullableFloat32(value *float64) *float32 {
	if value == nil {
		return nil
	}
	converted := float32(*value)
	return &converted
}

func nonNilStrings(values []string) []string {
	if values == nil {
		return []string{}
	}
	return values
}

func generatedAppSource(source workspacebiz.AppPackageSource) tuttigenerated.WorkspaceAppSource {
	switch source {
	case workspacebiz.AppPackageSourceGenerated:
		return tuttigenerated.WorkspaceAppSourceGenerated
	case workspacebiz.AppPackageSourceImported:
		return tuttigenerated.WorkspaceAppSourceImported
	default:
		return tuttigenerated.WorkspaceAppSourceBuiltin
	}
}

func generatedAppCatalogLoadStatus(status workspacebiz.AppCatalogLoadStatus) tuttigenerated.WorkspaceAppCatalogLoadStatus {
	switch status {
	case workspacebiz.AppCatalogLoadStatusLoading:
		return tuttigenerated.WorkspaceAppCatalogLoadStatusLoading
	case workspacebiz.AppCatalogLoadStatusReady:
		return tuttigenerated.WorkspaceAppCatalogLoadStatusReady
	case workspacebiz.AppCatalogLoadStatusFailed:
		return tuttigenerated.WorkspaceAppCatalogLoadStatusFailed
	default:
		return tuttigenerated.WorkspaceAppCatalogLoadStatusDisabled
	}
}

func generatedAppRuntimeStatus(status workspacebiz.AppRuntimeStatus) tuttigenerated.WorkspaceAppRuntimeStatus {
	switch status {
	case workspacebiz.AppRuntimeStatusRunning:
		return tuttigenerated.WorkspaceAppRuntimeStatusRunning
	case workspacebiz.AppRuntimeStatusPreparing:
		return tuttigenerated.WorkspaceAppRuntimeStatusPreparing
	case workspacebiz.AppRuntimeStatusStarting:
		return tuttigenerated.WorkspaceAppRuntimeStatusStarting
	case workspacebiz.AppRuntimeStatusFailed:
		return tuttigenerated.WorkspaceAppRuntimeStatusFailed
	case workspacebiz.AppRuntimeStatusStopping:
		return tuttigenerated.WorkspaceAppRuntimeStatusStopping
	default:
		return tuttigenerated.WorkspaceAppRuntimeStatusIdle
	}
}

func generatedAppCLIState(state workspacebiz.AppCLIState) tuttigenerated.WorkspaceAppCliState {
	return tuttigenerated.WorkspaceAppCliState{
		Status: generatedAppCLIStatus(state.Status),
		Scope:  nullableString(state.Scope),
		Active: state.Active,
		Issues: generatedAppCLIIssues(state.Issues),
	}
}

func generatedAppCLIIssues(issues []workspacebiz.AppCLIIssue) []tuttigenerated.WorkspaceAppCliIssue {
	result := make([]tuttigenerated.WorkspaceAppCliIssue, 0, len(issues))
	for _, issue := range issues {
		result = append(result, tuttigenerated.WorkspaceAppCliIssue{
			Code:    issue.Code,
			Message: issue.Message,
			Path:    nullableString(issue.Path),
		})
	}
	return result
}

func generatedAppCLIStatus(status workspacebiz.AppCLIStatus) tuttigenerated.WorkspaceAppCliStatus {
	switch status {
	case workspacebiz.AppCLIStatusPending:
		return tuttigenerated.Pending
	case workspacebiz.AppCLIStatusActive:
		return tuttigenerated.Active
	case workspacebiz.AppCLIStatusWarning:
		return tuttigenerated.Warning
	case workspacebiz.AppCLIStatusError:
		return tuttigenerated.Error
	default:
		return tuttigenerated.None
	}
}
