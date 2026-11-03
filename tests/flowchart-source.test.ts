import { describe, expect, it, vi } from "vitest";
import { prepareFlowchartSource } from "../src/flowchart-source";
import { MermaidConfigManager, type MermaidApi } from "../src/config-manager";

describe("standard Mermaid rendering", () => {
  it("changes decision presentation before layout without changing links", () => {
    const source = 'flowchart LR\nA[Start] --> B{"Ready?"}\nB -->|yes| C[Done]';
    const result = prepareFlowchartSource(source);
    expect(result).toContain('B["Ready?"]');
    expect(result).toContain('B -->|yes| C[Done]');
  });

  it("preserves non-flowcharts and braces inside labels, directives and shape declarations", () => {
    for (const source of [
      'sequenceDiagram\nA->>B: JSON{x}',
      'flowchart LR\nA[JSON{x}] --> B[End]',
      'flowchart LR\nA@{shape: diamond, label: "Ready?"}',
      'flowchart LR\n%% A{Ignored}\nA --> B',
      'flowchart LR\nA{{Hexagon}} --> B',
      'flowchart LR\nA -->|JSON{x}| B'
    ]) expect(prepareFlowchartSource(source)).toBe(source);
  });

  it("keeps frontmatter and label characters intact while handling a header without direction", () => {
    const source = '---\ntitle: foo{bar}\n---\nflowchart\nA[pipe|label] --> B{Ready?}';
    const prepared = prepareFlowchartSource(source);
    expect(prepared).toContain('title: foo{bar}');
    expect(prepared).toContain('A[pipe|label] --> B[Ready?]');
  });

  it("delegates other diagrams unchanged and restores render on unload", async () => {
    const result = { svg: '<svg />', bindFunctions: vi.fn() };
    const render = vi.fn(async () => result);
    const api: MermaidApi = { initialize: vi.fn(), render };
    const manager = new MermaidConfigManager(async () => api);
    await manager.install({});
    expect(await api.render?.('chart', 'pie\n"A":1')).toBe(result);
    expect(render).toHaveBeenCalledWith('chart', 'pie\n"A":1');
    manager.dispose();
    expect(api.render).toBe(render);
  });

  it("uses beautiful-mermaid directly for an ordinary flowchart", async () => {
    const source = 'flowchart TD\nA{Ready?} --> B';
    const render = vi.fn();
    const api: MermaidApi = { initialize: vi.fn(), render };
    await new MermaidConfigManager(async () => api).install({});
    const result = await api.render?.('chart', source) as { svg: string };
    expect(result.svg).toContain('data-decision="true"');
    expect(render).not.toHaveBeenCalled();
  });

  it("retains links through an unchanged compatibility path", async () => {
    const source = 'flowchart TD\nA[Link]\nclick A "https://example.com"';
    const render = vi.fn().mockResolvedValue({ svg: '<svg />' });
    const api: MermaidApi = { initialize: vi.fn(), render };
    await new MermaidConfigManager(async () => api).install({});
    await api.render?.('chart', source);
    expect(render).toHaveBeenCalledWith('chart', source);
  });
});
