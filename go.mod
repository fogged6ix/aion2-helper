module aion2helper

go 1.24

require (
	github.com/jchv/go-webview2 v0.0.0
	golang.org/x/sys v0.35.0
)

require github.com/jchv/go-winloader v0.0.0-20250406163304-c1995be93bd1 // indirect

// go-webview2 с небольшой правкой (окно создаётся скрытым) — лежит в third_party
replace github.com/jchv/go-webview2 => ./third_party/go-webview2

// зависимости положены рядом, чтобы сборка не требовала сети
replace github.com/jchv/go-winloader => ./third_party/go-winloader

replace golang.org/x/sys => ./third_party/sys
