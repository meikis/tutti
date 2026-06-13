package defaults

import (
	"os"
	"path/filepath"
	"strings"
)

type generatedDefaultsSpec struct {
	State generatedStateDefaults
}

type generatedStateDefaults struct {
	ProductionDirName    string
	DevelopmentDirName   string
	RunDirName           string
	ListenerInfoFileName string
}

type ResolvedDefaults struct {
	Runtime RuntimeDefaults
	State   StateDefaults
}

type RuntimeDefaults struct {
	Env string
}

type StateDefaults struct {
	RootDir                string
	RunDir                 string
	TuttidListenerInfoPath string
}

const (
	legacyProductionDirName  = ".nextop"
	legacyDevelopmentDirName = ".nextop-dev"
)

func ResolveDefaultsFromEnv() ResolvedDefaults {
	env := resolveTuttiEnv()
	stateRootDir := resolveStateRootDir(env)
	runDir := resolveRunDir(stateRootDir)

	return ResolvedDefaults{
		Runtime: RuntimeDefaults{
			Env: env,
		},
		State: StateDefaults{
			RootDir:                stateRootDir,
			RunDir:                 runDir,
			TuttidListenerInfoPath: resolveListenerInfoPath(runDir),
		},
	}
}

func resolveTuttiEnv() string {
	value := strings.ToLower(resolveStringOverride("TUTTI_ENV", "NEXTOP_ENV", ""))
	switch value {
	case "dev", "development", "local":
		return "development"
	default:
		return "production"
	}
}

func resolveStateRootDir(env string) string {
	override := resolveStringOverride("TUTTI_STATE_DIR", "NEXTOP_STATE_DIR", "")
	if override != "" {
		return override
	}

	homeDir, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(homeDir) == "" {
		if env == "development" {
			return generatedDefaults.State.DevelopmentDirName
		}
		return generatedDefaults.State.ProductionDirName
	}

	dirName := generatedDefaults.State.ProductionDirName
	legacyDirName := legacyProductionDirName
	if env == "development" {
		dirName = generatedDefaults.State.DevelopmentDirName
		legacyDirName = legacyDevelopmentDirName
	}

	stateRootDir := filepath.Join(homeDir, dirName)
	legacyStateRootDir := filepath.Join(homeDir, legacyDirName)
	if _, err := os.Stat(stateRootDir); os.IsNotExist(err) {
		if _, legacyErr := os.Stat(legacyStateRootDir); legacyErr == nil {
			return legacyStateRootDir
		}
	}
	return stateRootDir
}

func resolveRunDir(stateRootDir string) string {
	override := resolveStringOverride("TUTTID_RUN_DIR", "NEXTOPD_RUN_DIR", "")
	if override != "" {
		return override
	}

	return filepath.Join(stateRootDir, generatedDefaults.State.RunDirName)
}

func resolveListenerInfoPath(runDir string) string {
	override := resolveStringOverride("TUTTID_LISTENER_INFO_PATH", "NEXTOPD_LISTENER_INFO_PATH", "")
	if override != "" {
		return override
	}

	return filepath.Join(runDir, generatedDefaults.State.ListenerInfoFileName)
}

func resolveStringOverride(name string, legacyName string, fallback string) string {
	override := strings.TrimSpace(os.Getenv(name))
	if override != "" {
		return override
	}
	legacyOverride := strings.TrimSpace(os.Getenv(legacyName))
	if legacyOverride != "" {
		return legacyOverride
	}
	return fallback
}
