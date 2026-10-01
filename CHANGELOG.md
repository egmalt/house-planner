# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-10-01

Initial public release.

### Added

- 2D plan editor in real millimetres: walls with materials, doors, windows, garage gates, furniture catalog, site zones, room labels with net area, snapping, ruler, undo/redo, view rotation and "north up", whole-building selection.
- 3D view with *Model* and *Materials* looks, RAL wall and accent colours, low-wall modes, iso/top/front cameras.
- Satellite map overlay with geo-referencing, site boundary from GeoJSON, neighbouring parcels, imagery alignment, optional server-locked site data.
- Utility networks as layers with editors, calculations and estimate groups: sewer with septic tank, electrical with circuits and checks (ПУЭ, ГОСТ Р 50571), home-run water supply, hydronic underfloor heating with automatic loop layout.
- Estimate on an A4 sheet with "bought" marks, CSV export and petrovich.ru cart links.
- Area summary: total and living area, rooms, footprint, plot coverage.
- Server storage in PHP without a database: revisions with optimistic concurrency, named snapshots, single-password login, data files closed by cookie, setup wizard.
- Read-only mode on phones and touch-only devices.
- Scripts: `deploy.sh` (SSH or FTP with verification), `plan-pull.sh` / `plan-push.sh`, `plan-validate.mts`.
- Docker image with Apache and PHP, data in a named volume.
- Documentation: plan format, HTTP API, user guides in English and Russian.

[Unreleased]: https://github.com/egmalt/house-planner/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/egmalt/house-planner/releases/tag/v0.1.0
