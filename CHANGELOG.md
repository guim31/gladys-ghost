# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-11-16

### Added

- First version: the figures of a Ghost blog (Ghost 5 or 6, self-hosted or
  Ghost(Pro)) read with the Admin API key of a custom integration: the blog
  online and its version, members (total, free, paid, new in 24 hours and 7
  days), posts (published, drafts, scheduled, the latest one and its date) and
  the subscribers of each active newsletter, as Gladys devices.
- Scene triggers: new member (optionally for a plan), post published.
- Scene action "Read the figures of the blog", with a ready-made sentence.
- Dashboard widget "Ghost blog", the latest post and the Refresh button can be
  hidden.
- "Test the connection" action, texts in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-ghost/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-ghost/releases/tag/v1.0.0
