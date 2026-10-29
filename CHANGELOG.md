# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-29

### Added

- A host plugin that keeps the `openrouter` provider model list on the
  currently-free, tool-capable OpenRouter models (at start and every 6 hours),
  with a status file and a backup on change; it is idempotent.
- Key resolution through the credential service, the environment or
  `~/.dsh/.credentials.yaml`.

### Changed

- The documentation is English; the other-vendor free-tier study and its example
  configuration were removed.
