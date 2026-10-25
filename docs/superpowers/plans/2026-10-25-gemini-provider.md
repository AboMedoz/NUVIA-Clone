# Gemini Provider Implementation Plan

> Execute within the user-selected clone using subagent-driven-development.

**Goal:** Add an optional Gemini online provider while retaining local adapters.

**Architecture:** Existing FastAPI task service selects an explicit provider;
Node retains public authorization/jobs/persistence. Use current task contracts.

**Tech Stack:** Python/FastAPI, HTTPS, existing JavaScript launchers.

**Spec:** [Provider design](../specs/2026-10-25-gemini-provider.md).

## Tasks

- [x] Provider: verify official REST documentation; add meaningful failing tests;
      implement explicit selection, configuration, schemas, bounded transport,
      validation, capability readiness, provenance and honest error mapping.
- [x] Integration: regression-test private credential isolation and preservation
      of provider/local paths; add launcher/setup/example/container configuration.
- [x] Document switching, supported tasks, privacy, quotas and live-test limits.
- [x] Independently review the complete change; repair material findings; run
      relevant Python, launcher and Node-to-Python checks plus lint/format.
- [x] Check staged diff and commit focused changes; report exact evidence and
      activation requirements. Push only if a configured authorized remote exists.

## Review focus

No implicit cloud fallback; no key in browser/errors/logs; no acceptance of invalid
citations or malformed model output; no accidental local package activation;
bounded concurrent requests/timeouts; model/provider versions survive persistence.

## Validation and delivery

Independent review passed after fixing blank model-name default handling. Root
verified 108 Python tests (including ONNX and 39 Gemini regressions), 42 API
tests using an existing isolated-test MongoDB binary with downloads disabled,
9 launcher/setup tests, live Node-to-FastAPI local contract flow, lint, formatting,
Ruff and compose configuration. No UI changes require rendered revalidation.
No Gemini key was configured; no live Google inference, quota or model quality
acceptance is claimed. No local model weights downloaded or adapters removed.
The clone has no configured remote, so delivery stays on the local task branch.
