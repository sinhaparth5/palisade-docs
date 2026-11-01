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
make run         # build + run
make test        # go test ./...
make lint        # golangci-lint run ./... — same check CI and the pre-commit hook run
make hooks       # point git at .githooks/ so golangci-lint runs before every local commit
make clean       # remove binary, minified JS, dist/
make dist        # cross-compile linux/amd64 + linux/arm64 + windows/amd64 (CGO_ENABLED=0)
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
