/** Change decision presentation before beautiful-mermaid layout; never edit the note. */
const FLOWCHART_HEADER = /^\s*(?:flowchart|graph)(?:[ \t]+(?:TD|TB|LR|RL|BT)\b|[ \t]*(?:;|\r?$))/m;

function wrapPlainLabel(label: string): string {
  // Keep authored HTML, explicit line breaks, Markdown and escaped strings intact.
  const quoted = label.startsWith('"') && label.endsWith('"');
  const text = quoted ? label.slice(1, -1) : label;
  if (!/[\u3400-\u9fff]/.test(text) || /[<>[\]{}"`\\\n]/.test(text)) return label;
  const lines: string[] = [];
  let line = "";
  let units = 0;
  for (const character of text) {
    const width = (character.codePointAt(0) ?? 0) >= 0x2e80 ? 2 : 1;
    if (units + width > 28 && line) {
      lines.push(line);
      line = "";
      units = 0;
    }
    line += character;
    units += width;
  }
  lines.push(line);
  const wrapped = lines.join("<br/>");
  return quoted ? `"${wrapped}"` : wrapped;
}

export function prepareFlowchartSource(source: string): string {
  // Leave frontmatter/directives to Mermaid. A normal flowchart header may follow them.
  const header = FLOWCHART_HEADER.exec(source);
  if (!header) return source;
  let output = source.slice(0, header.index);
  let quote = "";
  let comment = false;
  let bracketDepth = 0;
  let parenthesisDepth = 0;
  let edgeLabel = false;
  for (let i = header.index; i < source.length; i++) {
    const character = source[i];
    if (character === "\n") comment = false;
    if (!quote && source.slice(i, i + 2) === "%%") comment = true;
    if (!comment && (character === '"' || character === "`")) {
      if (!quote) quote = character;
      else if (quote === character && source[i - 1] !== "\\") quote = "";
    }
    if (!comment && !quote && !bracketDepth && !parenthesisDepth && !edgeLabel && character === "["
      && /[\p{L}\p{N}_-]$/u.test(source.slice(0, i))) {
      const end = source.indexOf("]", i + 1);
      if (end !== -1) {
        const label = source.slice(i + 1, end);
        const wrapped = wrapPlainLabel(label);
        if (wrapped !== label) {
          output += `[${wrapped}]`;
          i = end;
          continue;
        }
      }
    }
    if (!comment && !quote) {
      if (character === "[") bracketDepth++;
      if (character === "]") bracketDepth = Math.max(0, bracketDepth - 1);
      if (character === "(") parenthesisDepth++;
      if (character === ")") parenthesisDepth = Math.max(0, parenthesisDepth - 1);
      if (character === "|" && !bracketDepth && !parenthesisDepth) edgeLabel = !edgeLabel;
    }
    if (!comment && !quote && !bracketDepth && !parenthesisDepth && !edgeLabel && character === "{" && source[i + 1] !== "{") {
      const id = /([\p{L}\p{N}_-]+)$/u.exec(source.slice(0, i))?.[1];
      if (id) {
        let end = i + 1;
        let innerQuote = "";
        for (; end < source.length; end++) {
          const next = source[end];
          if (next === '"' || next === "`") {
            if (!innerQuote) innerQuote = next;
            else if (innerQuote === next && source[end - 1] !== "\\") innerQuote = "";
          }
          if (!innerQuote && (next === "}" || next === "{" || next === "\n")) break;
        }
        if (source[end] === "}" && source[end + 1] !== "}") {
          output += `[${wrapPlainLabel(source.slice(i + 1, end))}]`;
          i = end;
          continue;
        }
      }
    }
    output += character;
  }
  return output;
}
