const styled = new WeakSet<SVGSVGElement>();

/** Enhance the SVG produced by native Mermaid, including all its syntax support. */
export function enhanceNativeFlowchart(svg: SVGSVGElement): void {
  if (styled.has(svg) || !svg.querySelector(".flowchart-link, .edgePath, .nodes .node")) return;
  if (!svg.querySelector(".node")) return;
  styled.add(svg);
  svg.classList.add("mermaid-lens-native");
  const style = svg.createSvg("style");
  style.textContent = `
    svg.mermaid-lens-native .cluster > rect { fill: #FFFFFF !important; stroke: #E1E5EA !important; }
    svg.mermaid-lens-native .cluster-label, svg.mermaid-lens-native .cluster-label p { color: #20252A; fill: #20252A; }
    svg.mermaid-lens-native .edgeLabel span, svg.mermaid-lens-native .edgeLabel p { font-size: 11px; font-weight: 600; background-color: transparent; }
    svg.mermaid-lens-native .edgeLabel > rect { fill: #F4F9FD !important; stroke: #D4E3EE !important; opacity: 1 !important; }
    svg.mermaid-lens-native .nodeLabel { font-weight: 500; }
  `;
  svg.querySelectorAll<SVGRectElement>(".node > rect, .node > .label-container").forEach((shape) => {
    if (shape.tagName.toLowerCase() !== "rect") return;
    if (!shape.hasAttribute("rx")) shape.setAttribute("rx", "12");
    if (!shape.hasAttribute("ry")) shape.setAttribute("ry", "12");
  });
  svg.querySelectorAll<SVGGElement>("g.edgeLabel").forEach((label) => {
    // Some Mermaid versions have both an outer edgeLabel group and inner labels.
    if (label.querySelector("g.edgeLabel")) return;
    label.querySelectorAll<SVGTextElement>("text").forEach((text) => text.setAttribute("font-weight", "600"));
    try {
      const bounds = label.getBBox();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const background = label.createSvg("rect");
      background.setAttribute("x", String(bounds.x - 6));
      background.setAttribute("y", String(bounds.y - 3));
      background.setAttribute("width", String(bounds.width + 12));
      background.setAttribute("height", String(bounds.height + 6));
      background.setAttribute("rx", "12");
      background.setAttribute("fill", "#F4F9FD");
      background.setAttribute("stroke", "#D4E3EE");
      label.insertBefore(background, label.firstChild);
    } catch {
      // Detached SVGs can lack geometry. Their existing Mermaid label is retained.
    }
  });
}
