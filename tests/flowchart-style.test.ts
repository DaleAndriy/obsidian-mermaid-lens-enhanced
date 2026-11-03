import { describe, expect, it, vi } from "vitest";
import { enhanceNativeFlowchart } from "../src/flowchart-style";

describe("native SVG enhancement", () => {
  it("adds scoped, exportable styling and one opaque label background", () => {
    const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><g class="nodes"><g class="node"><rect /></g></g><g class="cluster"><rect /></g><g class="edgeLabel"><text>Yes</text></g></svg>', 'image/svg+xml').documentElement as unknown as SVGSVGElement;
    const label = svg.querySelector('g.edgeLabel') as SVGGElement;
    Object.assign(label, { getBBox: () => ({ x: -10, y: -5, width: 20, height: 10 }) });
    const createSvg = (parent: Element) => (name: string) => {
      const node = document.createElementNS('http://www.w3.org/2000/svg', name);
      parent.append(node);
      return node;
    };
    Object.assign(svg, { createSvg: vi.fn(createSvg(svg)) });
    Object.assign(label, { createSvg: vi.fn(createSvg(label)) });
    enhanceNativeFlowchart(svg);
    enhanceNativeFlowchart(svg);
    expect(svg.querySelectorAll('style')).toHaveLength(1);
    expect(svg.querySelector('.node rect')?.getAttribute('rx')).toBe('12');
    expect(label.querySelectorAll('rect')).toHaveLength(1);
    expect(label.querySelector('rect')?.getAttribute('width')).toBe('32');
    expect(svg.querySelector('style')?.textContent).toContain('opacity: 1 !important');
    expect(svg.querySelector('style')?.textContent).toContain('.cluster > rect { fill: #FFFFFF');
  });

  it("leaves non-flowchart SVGs unchanged", () => {
    const svg = new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><circle r="20" /></svg>', 'image/svg+xml').documentElement as unknown as SVGSVGElement;
    const original = svg.outerHTML;
    enhanceNativeFlowchart(svg);
    expect(svg.outerHTML).toBe(original);
  });
});
