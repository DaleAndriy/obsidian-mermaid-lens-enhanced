import { parseMermaid, renderMermaidSVG } from "beautiful-mermaid";
import { prepareFlowchartSource } from "./flowchart-source";
import { remapSvgIds } from "./viewer-utils";
import type { MermaidConfig } from "./config-utils";
import { refineFlowchartLayout } from "./flowchart-routing";

const SUPPORTED = /^\s*(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|xychart-beta)\b/;

/** Render standard Mermaid source; undefined requests the native compatibility path. */
export function renderBeautifulDiagram(id: string, source: string, document: Document, config: MermaidConfig = {}): string | undefined {
  const code = source.replace(/^\s*%%[^\n]*\n/gm, "").trim();
  const type = SUPPORTED.exec(code)?.[1];
  if (!type) return undefined;
  // These features are accepted by Mermaid but not fully represented by this renderer.
  if (/^\s*(?:click|href)\b/m.test(code) || /@\{|\bid\s*:|\[\[/m.test(code)) return undefined;
  const flowchart = type === "flowchart" || type === "graph";
  const variables = config.themeVariables && typeof config.themeVariables === "object" && !Array.isArray(config.themeVariables)
    ? config.themeVariables as Record<string, unknown> : {};
  const value = (key: string, fallback: string): string => typeof variables[key] === "string" ? variables[key] : fallback;
  const font = value("fontFamily", '"PingFang SC", "Microsoft YaHei", sans-serif').replace(/[;{}]/g, "");
  const graph = flowchart ? parseMermaid(code) : undefined;
  const decisions = graph
    ? new Set([...graph.nodes.values()].filter((node) => node.shape === "diamond").map((node) => node.id))
    : new Set<string>();
  const markup = renderMermaidSVG(flowchart ? prepareFlowchartSource(code) : code, {
    bg: "#FFFFFF", fg: value("primaryTextColor", "#1769AA"), line: value("lineColor", "#A6ADB4"), accent: value("primaryTextColor", "#1769AA"),
    muted: value("primaryTextColor", "#3978A8"), surface: value("primaryColor", "#E7F3FC"), border: value("primaryBorderColor", "#D4E3EE"),
    font: "PingFang SC", nodeSpacing: 36, layerSpacing: 44, padding: 8
  }).replace(/@import\s+url\([^)]*\)\s*;/gi, "");
  const Parser = document.defaultView?.DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(markup, "image/svg+xml");
  if (parsed.querySelector("parsererror") || parsed.documentElement.localName !== "svg") {
    throw new Error("Invalid SVG returned by beautiful-mermaid");
  }
  const svg = document.importNode(parsed.documentElement, true) as unknown as SVGSVGElement;
  svg.id = id;
  svg.querySelectorAll("style").forEach((style) => {
    style.textContent = (style.textContent ?? "")
      .replace(/text\s*\{\s*font-family:[^}]+\}/, `#${id} text { font-family: ${font}; }`)
      .replace(/\bsvg\s*\{/g, `#${id} {`);
  });
  if (flowchart) {
    svg.querySelectorAll<SVGGElement>("g.node").forEach((node) => {
      const rectangle = node.querySelector("rect");
      if (!rectangle || node.getAttribute("data-shape") !== "rectangle") return;
      rectangle.setAttribute("rx", "12");
      rectangle.setAttribute("ry", "12");
      if (decisions.has(node.getAttribute("data-id") ?? "")) {
        node.setAttribute("data-decision", "true");
        rectangle.setAttribute("fill", value("secondaryColor", "#F3F9FD"));
        rectangle.setAttribute("stroke-dasharray", "3 3");
      }
    });
    svg.querySelectorAll<SVGGElement>("g.edge-label").forEach((label) => {
      const rectangle = label.querySelector("rect");
      rectangle?.setAttribute("fill", value("edgeLabelBackground", "#F4F9FD"));
      rectangle?.setAttribute("rx", "12");
      rectangle?.setAttribute("ry", "12");
      rectangle?.setAttribute("stroke", "#D4E3EE");
      label.querySelectorAll("text").forEach((text) => text.setAttribute("font-weight", "600"));
    });
    svg.querySelectorAll<SVGGElement>("g.subgraph").forEach((group) => {
      group.querySelectorAll<SVGRectElement>(":scope > rect").forEach((rectangle, index) => {
        rectangle.setAttribute("fill", value("clusterBkg", "#FFFFFF"));
        rectangle.setAttribute("stroke", index === 0 ? value("clusterBorder", "#E1E5EA") : "none");
      });
      group.querySelectorAll(":scope > text").forEach((text) => text.setAttribute("fill", "#20252A"));
    });
    refineFlowchartLayout(svg, graph?.direction ?? "TD");
  }
  remapSvgIds(svg);
  const Serializer = document.defaultView?.XMLSerializer ?? XMLSerializer;
  return new Serializer().serializeToString(svg);
}
