package agent

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGeminiCLIModelListerReadsModelsFromSettingsSchema(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{
			"properties": {
				"modelConfigs": {
					"default": {
						"modelIdResolutions": {
							"auto": "gemini-3-pro-preview",
							"flash": "gemini-3-flash-preview"
						},
						"modelDefinitions": {
							"gemini-3-flash-preview": {
								"isVisible": true,
								"displayName": "Gemini 3 Flash",
								"dialogDescription": "Fast model"
							},
							"gemini-1-hidden": {
								"isVisible": false,
								"displayName": "Hidden"
							}
						}
					}
				}
			}
		}`))
	}))
	defer server.Close()

	result, err := (GeminiCLIModelLister{URL: server.URL}).ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}
	if result.IsFallback {
		t.Fatal("IsFallback = true, want schema result")
	}
	if len(result.Models) != 3 {
		t.Fatalf("len(models) = %d, want aliases plus visible model", len(result.Models))
	}
	if result.Models[0].ID != "auto" || !result.Models[0].IsDefault {
		t.Fatalf("first model = %#v, want default auto alias", result.Models[0])
	}
	if result.Models[2].ID != "gemini-3-flash-preview" || result.Models[2].DisplayName != "Gemini 3 Flash" {
		t.Fatalf("visible model = %#v", result.Models[2])
	}
}

func TestGeminiCLIModelListerFallsBackWhenSchemaUnavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "unavailable", http.StatusBadGateway)
	}))
	defer server.Close()

	result, err := (GeminiCLIModelLister{URL: server.URL}).ListModels(context.Background())
	if err != nil {
		t.Fatalf("ListModels returned error: %v", err)
	}
	if !result.IsFallback {
		t.Fatal("IsFallback = false, want fallback models")
	}
	if len(result.Models) == 0 || result.Models[0].ID != "auto" {
		t.Fatalf("fallback models = %#v", result.Models)
	}
}
