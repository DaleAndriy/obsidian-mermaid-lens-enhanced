import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { renderBeautifulDiagram } from "../src/beautiful-renderer";
import { crossesBox, TERMINAL_DISTANCE, type RouteBox } from "../src/flowchart-routing";

function boxFor(node: Element): RouteBox {
  const rect = node.querySelector('rect');
  const [dx, dy] = (node.getAttribute('transform') ?? '').match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)?.map(Number) ?? [0, 0];
  return { x: Number(rect?.getAttribute('x')) + dx, y: Number(rect?.getAttribute('y')) + dy,
    width: Number(rect?.getAttribute('width')), height: Number(rect?.getAttribute('height')) };
}

function render(source: string): SVGSVGElement {
  const markup = renderBeautifulDiagram("diagram", source, document);
  expect(markup).toBeTruthy();
  return new DOMParser().parseFromString(markup ?? "", "image/svg+xml").documentElement as unknown as SVGSVGElement;
}

describe("beautiful-mermaid behind standard Mermaid blocks", () => {
  it("sizes decision rectangles before layout and connects straight to their sides", () => {
    const svg = render('flowchart LR\nA([开始]) --> B{配置有效？}\nB -->|是| C[渲染图表]\nB -->|否| D[使用默认配置]\nC --> E([完成])\nD --> E');
    expect(svg.querySelectorAll('g.node')).toHaveLength(5);
    const decision = svg.querySelector('[data-decision="true"] rect');
    expect(Number(decision?.getAttribute('height'))).toBeLessThan(60);
    expect(decision?.getAttribute('stroke-dasharray')).toBe('3 3');
    for (const edge of Array.from(svg.querySelectorAll('polyline.edge'))) {
      const points = (edge.getAttribute('points') ?? '').split(/\s+/).map((point) => point.split(',').map(Number));
      for (const [side, point] of [['from', points[0]], ['to', points[points.length - 1]]] as const) {
        const id = edge.getAttribute(`data-${side}`);
        const node = Array.from(svg.querySelectorAll('g.node')).find((node) => node.getAttribute('data-id') === id);
        expect(node).toBeTruthy();
        const { x, y, width, height } = boxFor(node!);
        // Ports are on a side, with room for the rounded corners.
        const verticalSide = Math.min(Math.abs(point[0] - x), Math.abs(point[0] - x - width)) < 8
          && point[1] > y + 5 && point[1] < y + height - 5;
        const horizontalSide = Math.min(Math.abs(point[1] - y), Math.abs(point[1] - y - height)) < 8
          && point[0] > x + 5 && point[0] < x + width - 5;
        expect(verticalSide || horizontalSide).toBe(true);
      }
    }
  });

  it("preserves the long TD graph while spreading cycles into columns", () => {
    const markdown = readFileSync('fixtures/acceptance/04-增强流程图.md', 'utf8');
    const source = /```mermaid\n([\s\S]*?)```/.exec(markdown)?.[1] ?? '';
    const svg = render(source);
    expect(svg.querySelectorAll('g.node')).toHaveLength(17);
    expect(svg.querySelectorAll('polyline.edge')).toHaveLength(19);
    const width = Number(svg.getAttribute('width'));
    const height = Number(svg.getAttribute('height'));
    expect(width / height).toBeGreaterThan(0.7);
    expect(svg.querySelector('.edge-label rect')?.getAttribute('fill')).toBe('#F4F9FD');
    expect(svg.getAttribute('data-layout-refined')).toBe('true');
    const nodes = Array.from(svg.querySelectorAll('g.node')).map(boxFor);
    const paths = Array.from(svg.querySelectorAll('polyline.edge')).map((edge) =>
      (edge.getAttribute('points') ?? '').split(/\s+/).map((point) => point.split(',').map(Number)));
    let crossings = 0;
    for (let i = 0; i < paths.length; i++) for (let j = i + 1; j < paths.length; j++) {
      for (let a = 1; a < paths[i].length; a++) for (let b = 1; b < paths[j].length; b++) {
        const [p, q] = [paths[i][a - 1], paths[i][a]], [r, s] = [paths[j][b - 1], paths[j][b]];
        const vertical = Math.abs(p[0] - q[0]) < 0.01;
        const otherVertical = Math.abs(r[0] - s[0]) < 0.01;
        if (vertical === otherVertical) {
          const axis = vertical ? 1 : 0, cross = 1 - axis;
          if (Math.abs(p[cross] - r[cross]) < 0.01) {
            const overlap = Math.min(Math.max(p[axis], q[axis]), Math.max(r[axis], s[axis]))
              - Math.max(Math.min(p[axis], q[axis]), Math.min(r[axis], s[axis]));
            expect(overlap).toBeLessThanOrEqual(0.01);
          }
        } else {
          const [v, w, h, k] = vertical ? [p, q, r, s] : [r, s, p, q];
          if (v[0] > Math.min(h[0], k[0]) + 0.01 && v[0] < Math.max(h[0], k[0]) - 0.01
            && h[1] > Math.min(v[1], w[1]) + 0.01 && h[1] < Math.max(v[1], w[1]) - 0.01) crossings++;
        }
      }
    }
    expect(crossings).toBeLessThanOrEqual(1);
    for (const edge of Array.from(svg.querySelectorAll('polyline.edge'))) {
      const points = (edge.getAttribute('points') ?? '').split(/\s+/).map((point) => {
        const [x, y] = point.split(',').map(Number); return { x, y };
      });
      const length = (index: number): number => Math.abs(points[index].x - points[index - 1].x) + Math.abs(points[index].y - points[index - 1].y);
      expect(length(1)).toBeGreaterThanOrEqual(TERMINAL_DISTANCE - 0.01);
      expect(length(points.length - 1)).toBeGreaterThanOrEqual(TERMINAL_DISTANCE - 0.01);
      points.slice(1).forEach((point, index) => {
        expect(Math.min(Math.abs(point.x - points[index].x), Math.abs(point.y - points[index].y))).toBeLessThan(0.01);
        nodes.forEach((node) => expect(crossesBox(points[index], point, node)).toBe(false));
      });
    }
    const labels = Array.from(svg.querySelectorAll('g.edge-label'));
    const bySource = new Map<string, RouteBox[]>();
    labels.forEach((label) => {
      const key = label.getAttribute('data-from') ?? '';
      bySource.set(key, [...bySource.get(key) ?? [], boxFor(label)]);
    });
    expect([...bySource.values()].some((group) => group.length === 3)).toBe(true);
    for (const group of bySource.values()) {
      if (group.length < 2) continue;
      const centers = group.map((box) => box.y + box.height / 2);
      expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(0.01);
    }
  });

  it.each(['TD', 'BT', 'LR', 'RL'])('separates incoming and outgoing ports in %s cycles', (direction) => {
    const svg = render(`flowchart ${direction}\nA[Start] --> B[Middle]\nB --> C[End]\nC --> A\nB --> D[Branch]`);
    expect(svg.getAttribute('data-layout-refined')).toBe('true');
    const ports = new Map<string, number[][]>();
    for (const edge of Array.from(svg.querySelectorAll('polyline.edge'))) {
      const points = (edge.getAttribute('points') ?? '').split(/\s+/).map((point) => point.split(',').map(Number));
      for (const [side, point] of [['from', points[0]], ['to', points[points.length - 1]]] as const) {
        const id = edge.getAttribute(`data-${side}`) ?? '';
        const existing = ports.get(id) ?? [];
        existing.forEach((other) => expect(Math.hypot(point[0] - other[0], point[1] - other[1])).toBeGreaterThan(10));
        ports.set(id, [...existing, point]);
      }
    }
  });

  it("keeps subgraph containers white and internal nodes blue", () => {
    const svg = render('flowchart TD\nsubgraph Box[分组]\nA[开始] --> B[结束]\nend');
    expect(svg.querySelector('.subgraph rect')?.getAttribute('fill')).toBe('#FFFFFF');
    expect(svg.querySelector('.node rect')?.getAttribute('fill')).toBe('var(--_node-fill)');
    expect(svg.querySelector('style')?.textContent).not.toContain('@import');
    expect(svg.querySelector('style')?.textContent).not.toContain('display=swap');
  });
});
