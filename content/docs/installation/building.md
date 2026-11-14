---
sidebar_position: 6
title: Building & Releasing
description: Make targets for building, testing, cross-compiling, and tagging releases.
keywords: [build from source, go build, make, cross compile, release]
---


```bash
make build       # go generate (minify JS) + go build → ./palisade
make generate    # regenerate minified JS only (go generate ./...), no build
make css         # recompile the admin-UI Tailwind CSS (standalone CLI, no Node); commit the output
make icons       # subset the hugeicons font to the icons in use; commit the output
make run         # build + run
make test        # go test ./...
make lint        # golangci-lint run ./... — same check CI and the pre-commit hook run
make fuzz        # run every Fuzz* target for FUZZTIME (default 30s) each
make bench       # proxy pipeline benchmarks → bench.txt (see BENCHMARKS.md)
make hooks       # point git at .githooks/ so golangci-lint runs before every local commit
make clean       # remove binary, minified JS, dist/
make dist        # cross-compile linux/amd64 + linux/arm64 (CGO_ENABLED=0)
make checksums   # sha256sum dist/* → dist/checksums.txt
make tag VERSION=v1.0.0   # roll CHANGELOG, commit, annotated git tag + push (triggers the release workflow)
```

`make build` and `make test` both depend on `hooks`, so git is pointed at `.githooks/` automatically the
first time you build or test. Run `make hooks` by name only if you want it enabled before either of those.

Run a single package's tests:

```bash
go test ./internal/proxy -run TestName -v
```

:::warning[Always use make build after editing JS]
Never run bare `go build` after editing JavaScript in `static/js/src/*.js` — the minifier runs via
`go generate`, which `make build` triggers but `go build` does not. Use `make build`, or run
`go generate ./...` first.
:::

## Fuzzing

Every parser of untrusted input has a `Fuzz*` target: client IP resolution, edge JWT verification,
the challenge, waiting-room and SSO cookies, request body and header extractors, admin rule parsers,
config import, the MCP JSON-RPC envelope and more. `make fuzz` runs them all locally; CI runs the same
target weekly (`fuzz.yml`) and uploads any failing input as an artifact. Commit a crasher under
`testdata/fuzz/` together with its fix.

```bash
make fuzz FUZZTIME=2m
```
