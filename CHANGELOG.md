# Changelog

All notable changes to Mermaid Lens are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-11-03
### Added

- Automatically enhance standard Mermaid flowcharts with rounded nodes, dashed decision boxes, pill labels, and distinct white subgraph containers.
- Added JPEG clipboard copy with a desktop clipboard fallback and a white viewer canvas.

### Changed

- Publish as Mermaid Lens Enhanced while retaining the `mermaid-lens` plugin ID and existing settings.
- Keep standard `mermaid` fences for every diagram; notes require no plugin-specific syntax.
- Use beautiful-mermaid behind standard Mermaid blocks, with native compatibility fallback for unsupported diagram types or interactive syntax.
- Apply a Chinese-capable font stack and light-blue defaults while retaining distinct pie chart colors.

### Fixed

- Separate incoming and outgoing flowchart ports and route around existing edges to reduce crossings, shared segments, and tightly packed return paths.
- Size decision boxes before beautiful-mermaid layout, retain side ports and column layouts for long flowcharts, and restore the host renderer on unload.
- Export full diagrams independently of viewer pan/zoom and reduce surrounding padding.

## [0.2.3] - 2026-07-23
### Added

- Added English and Simplified Chinese interfaces that follow Obsidian's configured language.
- Added searchable settings for Obsidian 1.13 while retaining compatibility with Obsidian 1.12.

### Fixed

- Fixed the alignment and responsive width of the Mermaid JSON configuration editor.

[Unreleased]: https://github.com/DaleAndriy/obsidian-mermaid-lens-enhanced/compare/0.3.0...HEAD
[0.3.0]: https://github.com/DaleAndriy/obsidian-mermaid-lens-enhanced/compare/0.2.3...0.3.0
[0.2.3]: https://github.com/aitsuki/obsidian-mermaid-lens/compare/0.2.2...0.2.3
