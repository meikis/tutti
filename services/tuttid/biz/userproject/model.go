package userproject

import "strings"

type Project struct {
	ID               string
	Path             string
	Label            string
	CreatedAtUnixMS  int64
	UpdatedAtUnixMS  int64
	LastUsedAtUnixMS int64
}

func LabelFromPath(path string) string {
	path = strings.TrimRight(strings.TrimSpace(path), "/")
	if path == "" {
		return ""
	}
	index := strings.LastIndex(path, "/")
	if index < 0 {
		return path
	}
	return strings.TrimSpace(path[index+1:])
}
