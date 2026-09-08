# SLU Studio Infrastructure Layer

This document describes the production-scale services layered on top of the renderer-neutral SLU Web Shell. These systems are designed to make games easier to debug, validate, ship, and support without forcing any game to adopt a specific renderer, backend, or content pipeline.

The runtime modules are exported from the package root and remain optional. Games can adopt them independently.

## Included systems

- Telemetry and local playtest export
- Input replay capture and playback
- Runtime diagnostics and crash reports
- Localization/copy registry
- Content validation
- Performance budgets
- Platform services abstraction
- Timeline/sequencing
- Save backup/recovery and migrations
- Developer command console registry
- UI stress helpers
- Certification profiles

The shell should continue to prefer semantic interfaces and renderer-neutral data. Browser-specific integrations belong behind adapters.
