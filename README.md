# Mermaid Lens Enhanced

Mermaid Lens Enhanced is an Obsidian plugin that applies one shared Mermaid configuration across your vault and opens diagrams in a dedicated pan-and-zoom viewer.

[简体中文](README.zh-CN.md)

| Zoomed out | Zoomed in |
| --- | --- |
| <img width="1920" height="1032" alt="Mermaid diagram zoomed out" src="https://github.com/user-attachments/assets/8c4a4d00-4f26-43dc-ad41-5b1870aae718" /> | <img width="1920" height="1032" alt="Mermaid diagram zoomed in" src="https://github.com/user-attachments/assets/2bf8285c-4b39-4736-8de6-e46cb684e918" /> |

https://github.com/user-attachments/assets/056c7e1b-5d88-4508-99bb-ded31a615efd

## Features

- Enhance ordinary Mermaid flowcharts with rounded nodes, dashed decisions, aligned branch labels, and separate routes for incoming and outgoing edges.
- Copy full diagrams as JPEG images from the viewer.
- Apply one Mermaid theme, color palette, font, spacing, and layout configuration throughout your vault.
- Open large or complex diagrams in a viewer unconstrained by the note width.
- Pan by dragging and zoom with the mouse wheel, toolbar, keyboard, or touch gestures.
- Choose single-click, double-click, or expand-button activation.
- Follow links and use buttons inside diagrams without accidentally opening the viewer.
- Validate new Mermaid configuration before saving it and retain the previous valid configuration if applying or saving fails.
- Preserve the natural size of small diagrams while constraining large diagrams to the note width.

## Installation

Mermaid Lens Enhanced requires Obsidian 1.12.0 or later.

This enhanced fork is distributed through GitHub Releases. It keeps the original `mermaid-lens` plugin ID, so it replaces an existing Mermaid Lens installation in the same folder and keeps its settings.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from [GitHub Releases](https://github.com/DaleAndriy/obsidian-mermaid-lens-enhanced/releases).
2. Place all three files in:

   ```text
   <Vault>/.obsidian/plugins/mermaid-lens/
   ```

3. Reload Obsidian, then enable **Mermaid Lens Enhanced** under **Settings → Community plugins**.

## Usage

### Create a Mermaid diagram

The plugin uses Obsidian's standard Mermaid syntax:

````markdown
```mermaid
sequenceDiagram
    participant App as Mobile app
    participant API as API server
    App->>API: Request
    API-->>App: Response
```
````

### Open the viewer

By default, click a Mermaid diagram to open it. You can change the trigger under **Settings → Mermaid Lens Enhanced** to double-click or the expand button only.

Viewer controls:

| Input | Action |
| --- | --- |
| Drag with the primary mouse button | Pan |
| Mouse wheel | Zoom around the pointer |
| `+`, `=`, or `-` | Zoom in or out |
| Double-click | Fit the diagram to the viewer |
| Toolbar buttons | Zoom out, fit, or zoom in |
| Escape | Close the viewer |
| One- or two-finger touch gesture | Pan or pinch to zoom |

### Configure diagram appearance

Open **Settings → Mermaid Lens Enhanced**, edit **Global Mermaid configuration**, and select **Apply and redraw**. The value must be a JSON object accepted by Mermaid's `initialize()` API. For example:

```json
{
  "theme": "base",
  "themeVariables": {
    "primaryColor": "#EEF2FF",
    "primaryBorderColor": "#6366F1",
    "primaryTextColor": "#1E293B",
    "lineColor": "#64748B"
  },
  "sequence": {
    "actorMargin": 40,
    "messageMargin": 30
  }
}
```

See the [Mermaid configuration reference](https://mermaid.js.org/config/schema-docs/config.html) for available fields. Changes remain a draft until you select **Apply and redraw**. Use **Restore defaults** to return to the bundled configuration.

## Compatibility

- Requires Obsidian 1.12.0 or later.
- Supports desktop and mobile.
- Mermaid Lens Enhanced modifies Obsidian's shared Mermaid configuration. Other plugins that initialize Mermaid may override it depending on plugin load order.

## Development and contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for build, test, and acceptance-testing instructions.

## Standard Mermaid compatibility

Use ordinary `mermaid` fences for every diagram. Flowcharts automatically receive rounded nodes, dashed decision boxes, pill labels and contrasting subgraph backgrounds. The plugin renders supported diagrams with beautiful-mermaid, including flowchart layout and side connections. Unsupported diagram types and interactive syntax retain a native compatibility fallback. Other diagram types retain their native structures, with global font and color defaults; pie slices use distinct categorical colors. Notes require no special syntax.

The viewer supports full-diagram JPEG clipboard copy with a white background.

## Credits

Based on [Mermaid Lens by aitsuki](https://github.com/aitsuki/obsidian-mermaid-lens), with enhanced rendering powered by [beautiful-mermaid](https://github.com/lukilabs/beautiful-mermaid). Original copyright and MIT license are retained.
