export interface RoutePoint { x: number; y: number }
export interface RouteBox { x: number; y: number; width: number; height: number }

export const TERMINAL_DISTANCE = 28;
export const BEND_DISTANCE = 24;
const CLEARANCE = 16;
export const EDGE_CLEARANCE = 24;
const EPSILON = 0.01;
type Side = "left" | "right" | "top" | "bottom";
interface NodeBox extends RouteBox { id: string; element: SVGGElement; original: RouteBox }
interface LabelBox extends RouteBox { element: SVGGElement; original: RouteBox; aligned: boolean }
interface FlowchartSubgraph { id?: string; nodeIds: string[]; direction?: string; children?: FlowchartSubgraph[] }
interface EdgeRoute {
  element: SVGPolylineElement; source: NodeBox; target: NodeBox;
  startSide: Side; endSide: Side; start: RoutePoint; end: RoutePoint;
  label?: LabelBox; points: RoutePoint[];
}
interface RoutingOptions {
  startDirection?: Side;
  endDirection?: Side;
  occupiedPaths?: RoutePoint[][];
}

/** Keep unrelated edges visually separate, including opposite-direction traffic. */
function trafficCost(a: RoutePoint, b: RoutePoint, paths: RoutePoint[][]): number {
  const vertical = Math.abs(a.x - b.x) < EPSILON;
  const axis = vertical ? "y" : "x", cross = vertical ? "x" : "y";
  const low = Math.min(a[axis], b[axis]), high = Math.max(a[axis], b[axis]);
  let cost = 0;
  for (const path of paths) for (let index = 1; index < path.length; index++) {
    const c = path[index - 1], d = path[index];
    const parallel = vertical === (Math.abs(c.x - d.x) < EPSILON);
    if (parallel) {
      const separation = Math.abs(a[cross] - c[cross]);
      const overlap = Math.min(high, Math.max(c[axis], d[axis])) - Math.max(low, Math.min(c[axis], d[axis]));
      if (overlap > EPSILON && separation < EDGE_CLEARANCE - EPSILON) {
        cost += overlap * (separation < EPSILON ? 16 : 4 * (1 - separation / EDGE_CLEARANCE));
      }
    } else if (c[axis] >= low - EPSILON && c[axis] <= high + EPSILON
      && a[cross] >= Math.min(c[cross], d[cross]) - EPSILON && a[cross] <= Math.max(c[cross], d[cross]) + EPSILON) {
      // A grid can split a crossing into two segments; charge half at each end.
      cost += 240 * (Math.abs(c[axis] - low) < EPSILON || Math.abs(c[axis] - high) < EPSILON ? 0.5 : 1);
    }
  }
  return cost;
}

function inflate(box: RouteBox, margin: number): RouteBox {
  return { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 };
}
function inside(point: RoutePoint, box: RouteBox): boolean {
  return point.x > box.x + EPSILON && point.x < box.x + box.width - EPSILON
    && point.y > box.y + EPSILON && point.y < box.y + box.height - EPSILON;
}
export function crossesBox(a: RoutePoint, b: RoutePoint, box: RouteBox): boolean {
  if (Math.abs(a.x - b.x) < EPSILON) {
    return a.x > box.x + EPSILON && a.x < box.x + box.width - EPSILON
      && Math.max(a.y, b.y) > box.y + EPSILON && Math.min(a.y, b.y) < box.y + box.height - EPSILON;
  }
  if (Math.abs(a.y - b.y) < EPSILON) {
    return a.y > box.y + EPSILON && a.y < box.y + box.height - EPSILON
      && Math.max(a.x, b.x) > box.x + EPSILON && Math.min(a.x, b.x) < box.x + box.width - EPSILON;
  }
  return true;
}
function simplify(points: RoutePoint[]): RoutePoint[] {
  const result: RoutePoint[] = [];
  for (const point of points) {
    const last = result[result.length - 1];
    if (last && Math.abs(last.x - point.x) < EPSILON && Math.abs(last.y - point.y) < EPSILON) continue;
    const before = result[result.length - 2];
    if (before && last && ((Math.abs(before.x - last.x) < EPSILON && Math.abs(last.x - point.x) < EPSILON)
      || (Math.abs(before.y - last.y) < EPSILON && Math.abs(last.y - point.y) < EPSILON))) result.pop();
    result.push(point);
  }
  return result;
}

/** Visibility-grid A*, balancing distance, bends, crossings and shared lanes. */
export function routeOrthogonally(start: RoutePoint, end: RoutePoint, obstacles: RouteBox[], options: RoutingOptions = {}): RoutePoint[] | undefined {
  if (obstacles.some((box) => inside(start, box) || inside(end, box))) return undefined;
  const codes: Record<Side, number> = { left: 1, right: 2, top: 3, bottom: 4 };
  const startDirection = options.startDirection ? codes[options.startDirection] : 0;
  const endDirection = options.endDirection ? codes[options.endDirection] : 0;
  const opposite = (direction: number): number => direction % 2 ? direction + 1 : direction - 1;
  const heading = (a: RoutePoint, b: RoutePoint): number => Math.abs(a.x - b.x) > EPSILON ? (b.x > a.x ? 2 : 1) : (b.y > a.y ? 4 : 3);
  const clear = (a: RoutePoint, b: RoutePoint): boolean => !obstacles.some((box) => crossesBox(a, b, box));
  const distance = (a: RoutePoint, b: RoutePoint): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  const occupied = options.occupiedPaths ?? [];
  const candidates: RoutePoint[][] = [];
  if (distance(start, end) < EPSILON) return [start];
  const straightDirection = heading(start, end);
  if ((Math.abs(start.x - end.x) < EPSILON || Math.abs(start.y - end.y) < EPSILON) && clear(start, end)
    && (!startDirection || straightDirection !== opposite(startDirection)) && (!endDirection || straightDirection !== opposite(endDirection))
    && (distance(start, end) >= BEND_DISTANCE || straightDirection === startDirection || straightDirection === endDirection)) candidates.push([start, end]);
  for (const bend of [{ x: start.x, y: end.y }, { x: end.x, y: start.y }]) {
    const firstLength = distance(start, bend), lastLength = distance(bend, end);
    const firstDirection = heading(start, bend), lastDirection = heading(bend, end);
    if (firstLength < EPSILON || lastLength < EPSILON) continue;
    if ((!startDirection || firstDirection !== opposite(startDirection)) && (!endDirection || lastDirection !== opposite(endDirection))
      && (firstLength >= BEND_DISTANCE || firstDirection === startDirection) && (lastLength >= BEND_DISTANCE || lastDirection === endDirection)
      && clear(start, bend) && clear(bend, end)) candidates.push([start, bend, end]);
  }
  const pathTraffic = (path: RoutePoint[]): number => path.slice(1).reduce((cost, point, index) => cost + trafficCost(path[index], point, occupied), 0);
  const pathCost = (path: RoutePoint[]): number => pathTraffic(path)
    + path.slice(1).reduce((cost, point, index) => cost + distance(path[index], point), 0) + (path.length - 2) * 24;
  candidates.sort((a, b) => pathCost(a) - pathCost(b));
  const fallback = candidates[0];
  if (fallback && pathTraffic(fallback) < EPSILON) return fallback;
  const unique = (values: number[]): number[] => [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
  const lanes = { x: [] as number[], y: [] as number[] };
  for (const path of occupied) for (let index = 1; index < path.length; index++) {
    const a = path[index - 1], b = path[index];
    const cross = Math.abs(a.x - b.x) < EPSILON ? "x" : "y";
    const axis = cross === "x" ? "y" : "x";
    lanes[cross].push(a[cross] - EDGE_CLEARANCE, a[cross] + EDGE_CLEARANCE);
    lanes[axis].push(Math.min(a[axis], b[axis]) - EDGE_CLEARANCE, Math.max(a[axis], b[axis]) + EDGE_CLEARANCE);
  }
  const xs = unique([start.x, end.x, ...lanes.x, ...obstacles.flatMap((box) => [box.x, box.x + box.width])]);
  const ys = unique([start.y, end.y, ...lanes.y, ...obstacles.flatMap((box) => [box.y, box.y + box.height])]);
  xs.unshift(xs[0] - 48); xs.push(xs[xs.length - 1] + 48);
  ys.unshift(ys[0] - 48); ys.push(ys[ys.length - 1] + 48);
  if (xs.length * ys.length > 12_000) return fallback;
  const nearest = (values: number[], value: number): number => values.findIndex((candidate) => Math.abs(candidate - value) < EPSILON);
  const startIndex = nearest(ys, start.y) * xs.length + nearest(xs, start.x);
  const endIndex = nearest(ys, end.y) * xs.length + nearest(xs, end.x);
  const pointAt = (index: number): RoutePoint => ({ x: xs[index % xs.length], y: ys[Math.floor(index / xs.length)] });
  const heap: { key: number; cost: number; score: number }[] = [];
  const push = (item: typeof heap[number]): void => {
    heap.push(item);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent].score <= item.score) break;
      heap[index] = heap[parent]; index = parent;
    }
    heap[index] = item;
  };
  const pop = (): typeof heap[number] => {
    const first = heap[0];
    const last = heap.pop();
    if (heap.length && last) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (last.score <= heap[child].score) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = last;
    }
    return first;
  };
  const runStates = BEND_DISTANCE * 1000 + 1;
  const stateKey = (index: number, direction: number, run: number): number => (index * 5 + direction) * runStates + Math.floor(Math.min(BEND_DISTANCE, run) * 1000 + 0.000001);
  const indexOf = (key: number): number => Math.floor(Math.floor(key / runStates) / 5);
  const initialKey = stateKey(startIndex, startDirection, startDirection ? BEND_DISTANCE : 0);
  const costs = new Map<number, number>([[initialKey, 0]]);
  const parents = new Map<number, number>();
  push({ key: initialKey, cost: 0, score: distance(start, end) });
  let visited = 0;
  while (heap.length) {
    const current = pop();
    if (current.cost !== costs.get(current.key)) continue;
    if (++visited > 25_000) return fallback;
    const index = indexOf(current.key);
    const previousDirection = Math.floor(current.key / runStates) % 5;
    const run = (current.key % runStates) / 1000;
    if (index === endIndex && (!endDirection || previousDirection !== opposite(endDirection))
      && (run >= BEND_DISTANCE || previousDirection === endDirection)) {
      const path: RoutePoint[] = [];
      let key: number | undefined = current.key;
      while (key !== undefined) { path.push(pointAt(indexOf(key))); key = parents.get(key); }
      return simplify(path.reverse());
    }
    const x = index % xs.length;
    const y = Math.floor(index / xs.length);
    const from = pointAt(index);
    for (const [nx, ny, direction] of [[x - 1, y, 1], [x + 1, y, 2], [x, y - 1, 3], [x, y + 1, 4]]) {
      if (nx < 0 || ny < 0 || nx >= xs.length || ny >= ys.length) continue;
      const nextIndex = ny * xs.length + nx;
      const to = pointAt(nextIndex);
      if (obstacles.some((box) => inside(to, box) || crossesBox(from, to, box))) continue;
      const length = distance(from, to);
      if (previousDirection && direction === opposite(previousDirection)) continue;
      if (previousDirection && previousDirection !== direction && run < BEND_DISTANCE) continue;
      const cost = current.cost + length + (previousDirection && previousDirection !== direction ? 24 : 0) + trafficCost(from, to, occupied);
      const key = stateKey(nextIndex, direction, previousDirection === direction ? run + length : length);
      if (cost >= (costs.get(key) ?? Infinity)) continue;
      costs.set(key, cost); parents.set(key, current.key);
      push({ key, cost, score: cost + distance(to, end) });
    }
  }
  return fallback;
}

function rectBounds(rect: Element): RouteBox {
  return { x: Number(rect.getAttribute("x")), y: Number(rect.getAttribute("y")), width: Number(rect.getAttribute("width")), height: Number(rect.getAttribute("height")) };
}
function edgePoints(edge: Element): RoutePoint[] {
  return (edge.getAttribute("points") ?? "").trim().split(/\s+/).map((pair) => {
    const [x, y] = pair.split(",").map(Number); return { x, y };
  });
}
function sideAt(node: RouteBox, point: RoutePoint): Side {
  return ([['left', Math.abs(point.x - node.x)], ['right', Math.abs(point.x - node.x - node.width)],
    ['top', Math.abs(point.y - node.y)], ['bottom', Math.abs(point.y - node.y - node.height)]] as [Side, number][])
    .sort((a, b) => a[1] - b[1])[0][0];
}
function port(node: RouteBox, side: Side, fraction: number): RoutePoint {
  if (side === "left" || side === "right") return { x: node.x + (side === "right" ? node.width : 0), y: node.y + node.height * fraction };
  return { x: node.x + node.width * fraction, y: node.y + (side === "bottom" ? node.height : 0) };
}
function stub(point: RoutePoint, side: Side): RoutePoint {
  return { x: point.x + (side === "left" ? -TERMINAL_DISTANCE : side === "right" ? TERMINAL_DISTANCE : 0),
    y: point.y + (side === "top" ? -TERMINAL_DISTANCE : side === "bottom" ? TERMINAL_DISTANCE : 0) };
}
function overlaps(a: RouteBox, b: RouteBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** Widen a downstream box only when it can accept a clear, labelled bypass. */
function widenBypassTargets(nodes: NodeBox[], routes: EdgeRoute[], direction: string): void {
  const vertical = direction === "TD" || direction === "TB" || direction === "BT";
  const axis = vertical ? "y" : "x";
  const cross = vertical ? "x" : "y";
  const crossDimension = vertical ? "width" : "height";
  const forwardSign = direction === "BT" || direction === "RL" ? -1 : 1;
  const forward: Side = direction === "LR" ? "right" : direction === "RL" ? "left" : direction === "BT" ? "top" : "bottom";
  const backward: Side = direction === "LR" ? "left" : direction === "RL" ? "right" : direction === "BT" ? "bottom" : "top";
  const lowBound = Math.min(...nodes.map((node) => node[cross]));
  const highBound = Math.max(...nodes.map((node) => node[cross] + node[crossDimension]));
  for (const edge of routes) {
    if (!edge.label || edge.startSide !== forward || edge.endSide !== backward
      || (edge.end[axis] - edge.start[axis]) * forwardSign <= EPSILON) continue;
    const target = edge.target;
    const obstacles = nodes.filter((node) => node !== edge.source && node !== target).map((node) => inflate(node, CLEARANCE));
    const blocked = (coordinate: number): boolean => obstacles.some((box) => crossesBox(
      vertical ? { x: coordinate, y: edge.start.y } : { x: edge.start.x, y: coordinate },
      vertical ? { x: coordinate, y: edge.end.y } : { x: edge.end.x, y: coordinate }, box));
    if (!blocked(edge.end[cross]) || blocked(edge.start[cross])) continue;
    const growHigh = edge.start[cross] > target[cross] + target[crossDimension] - CLEARANCE;
    const growLow = edge.start[cross] < target[cross] + CLEARANCE;
    if (!growHigh && !growLow) continue;
    let coordinate = edge.start[cross];
    // Branch labels share a rank: leave room for neighbouring labels as well.
    for (const other of routes) {
      if (other === edge || other.source !== edge.source || !other.label || other.startSide !== edge.startSide) continue;
      const gap = (edge.label.width + other.label.width) / 2 + CLEARANCE;
      if (growHigh && other.end[cross] < edge.start[cross]) coordinate = Math.max(coordinate, other.end[cross] + gap);
      if (growLow && other.end[cross] > edge.start[cross]) coordinate = Math.min(coordinate, other.end[cross] - gap);
    }
    if (coordinate < edge.source[cross] + CLEARANCE
      || coordinate > edge.source[cross] + edge.source[crossDimension] - CLEARANCE) continue;
    const fraction = (edge.end[cross] - target[cross]) / target[crossDimension];
    const size = growHigh ? (coordinate - target[cross]) / fraction
      : (target[cross] + target[crossDimension] - coordinate) / (1 - fraction);
    if (!Number.isFinite(size) || size <= target[crossDimension] || size > target.original[crossDimension] * 3) continue;
    const position = growLow ? target[cross] + target[crossDimension] - size : target[cross];
    const candidate = { ...target, [cross]: position, [crossDimension]: size };
    if (position < lowBound || position + size > highBound) continue;
    if (blocked(coordinate) || nodes.some((node) => node !== target && overlaps(candidate, inflate(node, CLEARANCE)))) continue;
    const previous = { ...target };
    target[cross] = position; target[crossDimension] = size;
    for (const route of routes) {
      for (const endpoint of ["start", "end"] as const) {
        if ((endpoint === "start" ? route.source : route.target) !== target) continue;
        const side = endpoint === "start" ? route.startSide : route.endSide;
        const verticalSide = side === "left" || side === "right";
        const offset = verticalSide ? (route[endpoint].y - previous.y) / previous.height
          : (route[endpoint].x - previous.x) / previous.width;
        route[endpoint] = port(target, side, offset);
      }
    }
  }
}

/** Put the return edge of a two-way connection in an outer lane. */
function separateReciprocalEdges(nodes: NodeBox[], routes: EdgeRoute[], direction: string): EdgeRoute[] {
  const vertical = direction === "TD" || direction === "TB" || direction === "BT";
  const axis = vertical ? "y" : "x";
  const extent = vertical ? "height" : "width";
  const forwardSign = direction === "BT" || direction === "RL" ? -1 : 1;
  const handled = new Set<EdgeRoute>();
  const forwardEdges: EdgeRoute[] = [];
  for (const edge of routes) {
    if (handled.has(edge)) continue;
    const reverse = routes.find((candidate) => candidate.source === edge.target && candidate.target === edge.source);
    if (!reverse) continue;
    if (Boolean(edge.label) === Boolean(reverse.label)) {
      handled.add(edge); handled.add(reverse);
      continue;
    }
    const edgeMovesForward = (edge.target[axis] + edge.target[extent] / 2
      - edge.source[axis] - edge.source[extent] / 2) * forwardSign >= EPSILON;
    const feedback = edgeMovesForward ? reverse : edge;
    const forwardEdge = edgeMovesForward ? edge : reverse;
    const sourceCenter = forwardEdge.source[axis] + forwardEdge.source[extent] / 2;
    const targetCenter = forwardEdge.target[axis] + forwardEdge.target[extent] / 2;
    if ((targetCenter - sourceCenter) * forwardSign < EPSILON) continue;
    handled.add(edge); handled.add(reverse);
    const sideOptions: Side[] = vertical ? ["left", "right"] : ["top", "bottom"];
    const obstacles = nodes.filter((node) => node !== feedback.source && node !== feedback.target)
      .map((node) => inflate(node, CLEARANCE));
    const candidates = sideOptions.map((side) => {
      const start = port(feedback.source, side, 0.5), end = port(feedback.target, side, 0.5);
      const startStub = stub(start, side), endStub = stub(end, side);
      const lane = side === "left" ? Math.min(...nodes.map((node) => node.x)) - CLEARANCE - TERMINAL_DISTANCE
        : side === "right" ? Math.max(...nodes.map((node) => node.x + node.width)) + CLEARANCE + TERMINAL_DISTANCE
          : side === "top" ? Math.min(...nodes.map((node) => node.y)) - CLEARANCE - TERMINAL_DISTANCE
            : Math.max(...nodes.map((node) => node.y + node.height)) + CLEARANCE + TERMINAL_DISTANCE;
      const firstLane = vertical ? { x: lane, y: startStub.y } : { x: startStub.x, y: lane };
      const secondLane = vertical ? { x: lane, y: endStub.y } : { x: endStub.x, y: lane };
      const points = [start, startStub, firstLane, secondLane, endStub, end];
      const clear = points.slice(1).every((point, index) => !obstacles.some((box) => crossesBox(points[index], point, box)));
      return { side, clear, distance: points.slice(1).reduce((sum, point, index) => sum
        + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0) };
    }).sort((a, b) => Number(b.clear) - Number(a.clear) || a.distance - b.distance);
    const choice = candidates[0];
    if (!choice?.clear) continue;
    feedback.startSide = choice.side;
    feedback.endSide = choice.side;
    forwardEdges.push(forwardEdge);
  }
  return forwardEdges;
}

/** Align flow-facing ports when their nodes can share a clear straight lane. */
function alignForwardPorts(nodes: NodeBox[], routes: EdgeRoute[], direction: string, eligible: Set<EdgeRoute>): void {
  const vertical = direction === "TD" || direction === "TB" || direction === "BT";
  const axis = vertical ? "y" : "x";
  const cross = vertical ? "x" : "y";
  const dimension = vertical ? "height" : "width";
  const crossDimension = vertical ? "width" : "height";
  const forwardSign = direction === "BT" || direction === "RL" ? -1 : 1;
  const forward: Side = direction === "LR" ? "right" : direction === "RL" ? "left" : direction === "BT" ? "top" : "bottom";
  const backward: Side = direction === "LR" ? "left" : direction === "RL" ? "right" : direction === "BT" ? "bottom" : "top";
  for (const edge of routes) {
    if (!eligible.has(edge) || edge.startSide !== forward || edge.endSide !== backward) continue;
    const sourceCenter = edge.source[axis] + edge.source[dimension] / 2;
    const targetCenter = edge.target[axis] + edge.target[dimension] / 2;
    if ((targetCenter - sourceCenter) * forwardSign < TERMINAL_DISTANCE) continue;
    const desired = edge.start[cross];
    const margin = 5;
    if (desired < edge.target[cross] + margin
      || desired > edge.target[cross] + edge.target[crossDimension] - margin) {
      const oldPosition = edge.target[cross], oldSize = edge.target[crossDimension];
      const end = oldPosition + oldSize;
      const newPosition = desired < oldPosition + margin ? desired - CLEARANCE : oldPosition;
      const newEnd = desired > end - margin ? desired + CLEARANCE : end;
      const newSize = newEnd - newPosition;
      if (newSize <= oldSize || newSize > edge.target.original[crossDimension] * 3) continue;
      const candidate = { ...edge.target, [cross]: newPosition, [crossDimension]: newSize };
      if (nodes.some((node) => node !== edge.target && overlaps(candidate, inflate(node, CLEARANCE)))) continue;
      for (const route of routes) {
        for (const endpoint of ["start", "end"] as const) {
          const node = endpoint === "start" ? route.source : route.target;
          if (node !== edge.target) continue;
          const side = endpoint === "start" ? route.startSide : route.endSide;
          const usesCross = vertical ? side === "top" || side === "bottom" : side === "left" || side === "right";
          if (!usesCross) continue;
          const point = route[endpoint];
          point[cross] = newPosition + ((point[cross] - oldPosition) / oldSize) * newSize;
        }
      }
      edge.target[cross] = newPosition;
      edge.target[crossDimension] = newSize;
    }
    const targetPorts = routes.filter((other) => other !== edge && (
      other.source === edge.target && other.startSide === edge.endSide ? other.start
        : other.target === edge.target && other.endSide === edge.endSide ? other.end : undefined
    )).map((other) => other.source === edge.target ? other.start : other.end);
    if (targetPorts.some((point) => Math.abs(point[cross] - desired) < EDGE_CLEARANCE - EPSILON)) continue;
    edge.end[cross] = desired;
  }
}

/** Keep Mermaid's node and cluster geometry, refining only the edges in grouped diagrams. */
function refineSubgraphLayout(svg: SVGSVGElement, direction: string, subgraphs: FlowchartSubgraph[]): void {
  const nodes: NodeBox[] = [];
  for (const element of Array.from(svg.querySelectorAll<SVGGElement>("g.node"))) {
    const rect = element.querySelector("rect");
    if (!rect) return;
    const original = rectBounds(rect);
    if (original.width <= 0 || original.height <= 0) return;
    nodes.push({ ...original, original, id: element.getAttribute("data-id") ?? "", element });
  }
  if (!nodes.length || nodes.length > 80) return;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const groups: FlowchartSubgraph[] = [];
  const collectGroups = (items: FlowchartSubgraph[]): void => items.forEach((group) => {
    groups.push(group);
    if (group.children) collectGroups(group.children);
  });
  collectGroups(subgraphs);
  const groupFor = (source: string, target: string): FlowchartSubgraph | undefined => groups
    .filter((group) => group.nodeIds.includes(source) && group.nodeIds.includes(target))
    .sort((a, b) => a.nodeIds.length - b.nodeIds.length)[0];
  const groupBoxFor = (group: FlowchartSubgraph): RouteBox | undefined => {
    if (!group.id) return undefined;
    const element = Array.from(svg.querySelectorAll<SVGGElement>("g.subgraph"))
      .find((candidate) => candidate.getAttribute("data-id") === group.id);
    const rectangle = element?.querySelector<SVGRectElement>(":scope > rect");
    return rectangle ? rectBounds(rectangle) : undefined;
  };
  const labels = Array.from(svg.querySelectorAll<SVGGElement>("g.edge-label"));
  const routes: EdgeRoute[] = [];
  for (const element of Array.from(svg.querySelectorAll<SVGPolylineElement>("polyline.edge"))) {
    const source = byId.get(element.getAttribute("data-from") ?? "");
    const target = byId.get(element.getAttribute("data-to") ?? "");
    const points = edgePoints(element);
    if (!source || !target || source === target || points.length < 2) return;
    const labelElement = labels.find((label) => label.getAttribute("data-from") === source.id
      && label.getAttribute("data-to") === target.id && label.getAttribute("data-label") === element.getAttribute("data-label"));
    const labelRect = labelElement?.querySelector("rect");
    const original = labelRect ? rectBounds(labelRect) : undefined;
    routes.push({ element, source, target, points, start: points[0], end: points[points.length - 1],
      startSide: sideAt(source, points[0]), endSide: sideAt(target, points[points.length - 1]),
      label: original && labelElement ? { ...original, original, element: labelElement, aligned: false } : undefined });
  }
  if (!routes.length || routes.length > 150) return;

  const opposite: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };
  const preferredSides = (graphDirection: string): [Side, Side] => graphDirection === "LR" ? ["right", "left"]
    : graphDirection === "RL" ? ["left", "right"] : graphDirection === "BT" ? ["top", "bottom"] : ["bottom", "top"];
  const edgeDirection = (edge: EdgeRoute): string => groupFor(edge.source.id, edge.target.id)?.direction ?? direction;
  const nodeObstacles = nodes.map((node) => inflate(node, CLEARANCE));
  const reserved: RoutePoint[][] = [];
  const handled = new Set<EdgeRoute>();
  const center = (node: NodeBox, axis: "x" | "y"): number => node[axis] + node[axis === "x" ? "width" : "height"] / 2;
  const makeStraight = (edge: EdgeRoute, vertical: boolean): boolean => {
    const axis = vertical ? "y" : "x", cross = vertical ? "x" : "y";
    const crossExtent = vertical ? "width" : "height";
    const sourceCenter = center(edge.source, axis), targetCenter = center(edge.target, axis);
    const sourceSide: Side = vertical ? (sourceCenter < targetCenter ? "bottom" : "top")
      : sourceCenter < targetCenter ? "right" : "left";
    const targetSide = opposite[sourceSide];
    const low = Math.max(edge.source[cross], edge.target[cross]) + 7;
    const high = Math.min(edge.source[cross] + edge.source[crossExtent], edge.target[cross] + edge.target[crossExtent]) - 7;
    if (high < low || Math.abs(sourceCenter - targetCenter) < TERMINAL_DISTANCE) return false;
    const oldCross = (edge.start[cross] + edge.end[cross]) / 2;
    const coordinate = Math.max(low, Math.min(high, oldCross));
    const start = port(edge.source, sourceSide, (coordinate - edge.source[cross]) / edge.source[crossExtent]);
    const end = port(edge.target, targetSide, (coordinate - edge.target[cross]) / edge.target[crossExtent]);
    if (nodes.some((node) => node !== edge.source && node !== edge.target && crossesBox(start, end, inflate(node, 2)))) return false;
    edge.startSide = sourceSide; edge.endSide = targetSide;
    edge.start = start; edge.end = end; edge.points = [start, end];
    return true;
  };
  const laneFeedback = (edge: EdgeRoute, vertical: boolean, groupBox?: RouteBox): boolean => {
    const preferredLane: Side = vertical
      ? (direction === "RL" ? "left" : "right")
      : (direction === "BT" || direction === "RL" ? "top" : "bottom");
    const sides: Side[] = vertical ? [preferredLane, preferredLane === "left" ? "right" : "left"]
      : [preferredLane, preferredLane === "top" ? "bottom" : "top"];
    const candidates = sides.map((side) => {
      const start = port(edge.source, side, 0.5), end = port(edge.target, side, 0.5);
      const startStub = stub(start, side), endStub = stub(end, side);
      const lane = side === "left" ? Math.min(edge.source.x, edge.target.x, groupBox?.x ?? Infinity) - TERMINAL_DISTANCE - CLEARANCE
        : side === "right" ? Math.max(edge.source.x + edge.source.width, edge.target.x + edge.target.width,
          groupBox ? groupBox.x + groupBox.width : -Infinity) + TERMINAL_DISTANCE + CLEARANCE
          : side === "top" ? Math.min(edge.source.y, edge.target.y, groupBox?.y ?? Infinity) - TERMINAL_DISTANCE - CLEARANCE
            : Math.max(edge.source.y + edge.source.height, edge.target.y + edge.target.height,
              groupBox ? groupBox.y + groupBox.height : -Infinity) + TERMINAL_DISTANCE + CLEARANCE;
      const firstLane = vertical ? { x: lane, y: startStub.y } : { x: startStub.x, y: lane };
      const secondLane = vertical ? { x: lane, y: endStub.y } : { x: endStub.x, y: lane };
      const points = simplify([start, startStub, firstLane, secondLane, endStub, end]);
      const obstacles = nodes.filter((node) => node !== edge.source && node !== edge.target).map((node) => inflate(node, 2));
      const clear = points.slice(1).every((point, index) => !obstacles.some((box) => crossesBox(points[index], point, box)));
      const length = points.slice(1).reduce((sum, point, index) => sum
        + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0);
      const traffic = reserved.reduce((sum, path) => sum + points.slice(1).reduce((pathSum, point, index) =>
        pathSum + trafficCost(points[index], point, [path]), 0), 0);
      return { side, points, clear, cost: length + traffic + (side === preferredLane ? 0 : 48) };
    }).filter((candidate) => candidate.clear).sort((a, b) => a.cost - b.cost);
    const chosen = candidates[0];
    if (!chosen) return false;
    edge.startSide = chosen.side; edge.endSide = chosen.side;
    edge.start = chosen.points[0]; edge.end = chosen.points[chosen.points.length - 1]; edge.points = chosen.points;
    reserved.push(edge.points);
    return true;
  };

  // In a local subgraph, keep the labelled branch direct and send its return edge
  // around the pair on a separate lane.
  for (const edge of routes) {
    if (handled.has(edge) || !groupFor(edge.source.id, edge.target.id)) continue;
    const reverse = routes.find((candidate) => candidate.source === edge.target && candidate.target === edge.source);
    if (!reverse || Boolean(edge.label) === Boolean(reverse.label)) continue;
    const branch = edge.label ? edge : reverse;
    const feedback = branch === edge ? reverse : edge;
    const vertical = Math.abs(center(branch.source, "y") - center(branch.target, "y"))
      >= Math.abs(center(branch.source, "x") - center(branch.target, "x"));
    if (!makeStraight(branch, vertical) || !laneFeedback(feedback, vertical, groupBoxFor(groupFor(edge.source.id, edge.target.id)!))) return;
    reserved.push(branch.points);
    handled.add(branch); handled.add(feedback);
  }

  const ordered = [...routes].filter((edge) => !handled.has(edge)).sort((a, b) => {
    const span = (edge: EdgeRoute): number => Math.abs(edge.start.x - edge.end.x) + Math.abs(edge.start.y - edge.end.y);
    return span(a) - span(b);
  });
  for (const edge of ordered) {
    const graphDirection = edgeDirection(edge);
    const vertical = graphDirection === "TD" || graphDirection === "TB" || graphDirection === "BT";
    if (makeStraight(edge, vertical)) {
      handled.add(edge);
      reserved.push(edge.points);
    }
  }
  for (const edge of ordered.filter((candidate) => !handled.has(candidate))) {
    const [preferredStart, preferredEnd] = preferredSides(edgeDirection(edge));
    const obstacles = nodeObstacles.filter((_, index) => nodes[index] !== edge.source && nodes[index] !== edge.target);
    const candidates: { startSide: Side; endSide: Side; points: RoutePoint[]; cost: number }[] = [];
    for (const startSide of [preferredStart, "left", "right", "top", "bottom"] as Side[]) {
      for (const endSide of [preferredEnd, "left", "right", "top", "bottom"] as Side[]) {
        const start = port(edge.source, startSide, 0.5), end = port(edge.target, endSide, 0.5);
        const startIsVertical = startSide === "top" || startSide === "bottom";
        const endIsVertical = endSide === "top" || endSide === "bottom";
        if (startIsVertical && !endIsVertical) {
          const alignedY = stub(start, startSide).y;
          if (alignedY >= edge.target.y + 7 && alignedY <= edge.target.y + edge.target.height - 7) {
            end.y = alignedY;
          }
        } else if (!startIsVertical && endIsVertical) {
          const alignedX = stub(end, endSide).x;
          if (alignedX >= edge.source.x + 7 && alignedX <= edge.source.x + edge.source.width - 7) {
            start.x = alignedX;
          }
        }
        const routed = routeOrthogonally(stub(start, startSide), stub(end, endSide), obstacles, {
          startDirection: startSide, endDirection: opposite[endSide], occupiedPaths: reserved
        });
        if (!routed) continue;
        const points = simplify([start, ...routed, end]);
        const length = points.slice(1).reduce((sum, point, index) => sum
          + Math.abs(point.x - points[index].x) + Math.abs(point.y - points[index].y), 0);
        const bends = Math.max(0, points.length - 2);
        const deviation = (startSide === preferredStart ? 0 : 600) + (endSide === preferredEnd ? 0 : 600);
        candidates.push({ startSide, endSide, points, cost: bends * 1000 + length + deviation });
      }
    }
    const chosen = candidates.sort((a, b) => a.cost - b.cost)[0];
    if (!chosen) return;
    edge.startSide = chosen.startSide; edge.endSide = chosen.endSide;
    edge.start = chosen.points[0]; edge.end = chosen.points[chosen.points.length - 1]; edge.points = chosen.points;
    reserved.push(edge.points);
  }

  const placedLabels: LabelBox[] = [];
  for (const edge of routes) {
    if (!edge.label) continue;
    const candidates = edge.points.slice(1).map((point, index) => {
      const previous = edge.points[index];
      const horizontal = Math.abs(point.y - previous.y) < EPSILON;
      const length = Math.abs(point.x - previous.x) + Math.abs(point.y - previous.y);
      const fits = length >= (horizontal ? edge.label!.width : edge.label!.height) + 12;
      return { x: (point.x + previous.x) / 2 - edge.label!.width / 2,
        y: (point.y + previous.y) / 2 - edge.label!.height / 2, width: edge.label!.width, height: edge.label!.height, fits };
    }).filter((candidate) => candidate.fits && !nodes.some((node) => overlaps(candidate, inflate(node, 8)))
      && !placedLabels.some((label) => overlaps(candidate, inflate(label, 8))))
      .sort((a, b) => {
        const midpoint = (candidate: RouteBox): number => Math.abs(candidate.x + candidate.width / 2 - (edge.start.x + edge.end.x) / 2)
          + Math.abs(candidate.y + candidate.height / 2 - (edge.start.y + edge.end.y) / 2);
        return midpoint(a) - midpoint(b);
      });
    const chosen = candidates[0];
    if (!chosen) return;
    edge.label.x = chosen.x; edge.label.y = chosen.y; edge.label.aligned = true;
    placedLabels.push(edge.label);
  }

  const bounds: RouteBox[] = [...nodes, ...placedLabels,
    ...routes.flatMap((edge) => edge.points.map((point) => ({ ...point, width: 0, height: 0 }))),
    ...Array.from(svg.querySelectorAll<SVGRectElement>("g.subgraph > rect:first-of-type"), rectBounds)];
  const x = Math.min(...bounds.map((box) => box.x)) - 8, y = Math.min(...bounds.map((box) => box.y)) - 8;
  const width = Math.max(...bounds.map((box) => box.x + box.width)) - x + 8;
  const height = Math.max(...bounds.map((box) => box.y + box.height)) - y + 8;
  for (const edge of routes) {
    edge.element.setAttribute("points", edge.points.map((point) => `${point.x},${point.y}`).join(" "));
    edge.element.setAttribute("stroke-linejoin", "round");
    if (edge.label) edge.label.element.setAttribute("transform", `translate(${edge.label.x - edge.label.original.x},${edge.label.y - edge.label.original.y})`);
  }
  svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height));
  svg.setAttribute("data-layout-refined", "true");
}

/** Refine flat rectangular flowcharts transactionally; other layouts retain library geometry. */
export function refineFlowchartLayout(svg: SVGSVGElement, direction: string, subgraphs: FlowchartSubgraph[] = []): void {
  if (svg.querySelector(".subgraph")) {
    refineSubgraphLayout(svg, direction, subgraphs);
    return;
  }
  const nodes: NodeBox[] = [];
  for (const element of Array.from(svg.querySelectorAll<SVGGElement>("g.node"))) {
    const rect = element.querySelector("rect");
    if (!rect) return;
    const original = rectBounds(rect);
    if (original.width <= 0 || original.height <= 0) return;
    nodes.push({ ...original, original, id: element.getAttribute("data-id") ?? "", element });
  }
  if (!nodes.length || nodes.length > 80) return;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const labels = Array.from(svg.querySelectorAll<SVGGElement>("g.edge-label"));
  const routes: EdgeRoute[] = [];
  for (const element of Array.from(svg.querySelectorAll<SVGPolylineElement>("polyline.edge"))) {
    const source = byId.get(element.getAttribute("data-from") ?? "");
    const target = byId.get(element.getAttribute("data-to") ?? "");
    const points = edgePoints(element);
    if (!source || !target || source === target || points.length < 2) return;
    const labelElement = labels.find((label) => label.getAttribute("data-from") === source.id
      && label.getAttribute("data-to") === target.id && label.getAttribute("data-label") === element.getAttribute("data-label"));
    const labelRect = labelElement?.querySelector("rect");
    const original = labelRect ? rectBounds(labelRect) : undefined;
    routes.push({ element, source, target, points, start: points[0], end: points[points.length - 1],
      startSide: sideAt(source, points[0]), endSide: sideAt(target, points[points.length - 1]),
      label: original && labelElement ? { ...original, original, element: labelElement, aligned: false } : undefined });
  }
  if (routes.length > 150) return;
  const vertical = direction === "TD" || direction === "TB" || direction === "BT";
  const axis = vertical ? "y" : "x";
  const dimension = vertical ? "height" : "width";
  const crossAxis = vertical ? "x" : "y";
  const crossDimension = vertical ? "width" : "height";
  const columnGap = TERMINAL_DISTANCE * 2 + EDGE_CLEARANCE * 2;
  const ordered = [...nodes].sort((a, b) => a.original[axis] - b.original[axis]);
  const crowdedPort = (node: NodeBox, side: Side): boolean => {
    const count = routes.filter((edge) => (edge.source === node && edge.startSide === side)
      || (edge.target === node && edge.endSide === side)).length;
    const span = side === "left" || side === "right" ? node.height : node.width;
    return count > 1 && span / (count + 1) < EDGE_CLEARANCE;
  };
  const turnLanes = new Map<EdgeRoute, number>();
  const spaceRanks = (): void => {
    for (let index = 0; index < ordered.length; index++) {
      const node = ordered[index];
      for (const before of ordered.slice(0, index)) {
        if (node.original[axis] - before.original[axis] < EPSILON) continue;
        const sharesColumn = before.original[crossAxis] < node.original[crossAxis] + node[crossDimension]
          && node.original[crossAxis] < before.original[crossAxis] + before[crossDimension];
        const connections = routes.filter((edge) => (edge.source === before && edge.target === node)
          || (edge.source === node && edge.target === before));
        if (!sharesColumn && !connections.length) continue;
        const labelSize = Math.max(0, ...connections.map((edge) => edge.label?.[dimension] ?? 0));
        const lanes = Math.max(0, ...connections.map((edge) => turnLanes.get(edge) ?? 0));
        const gap = Math.max(TERMINAL_DISTANCE * 2 + lanes * EDGE_CLEARANCE,
          labelSize ? labelSize + TERMINAL_DISTANCE * 4 : 0);
        node[axis] = Math.max(node[axis], before[axis] + before[dimension] + gap);
      }
    }
  };
  spaceRanks();

  // Stretch crowded column centers without stretching text boxes, leaving
  // corridors for feedback edges alongside intermediate nodes.
  let crossExpansion = 0;
  for (let index = 0; index < nodes.length; index++) {
    const a = nodes[index].original;
    for (const { original: b } of nodes.slice(index + 1)) {
      if (a[axis] >= b[axis] + b[dimension] || b[axis] >= a[axis] + a[dimension]) continue;
      const centerDistance = Math.abs(a[crossAxis] + a[crossDimension] / 2 - b[crossAxis] - b[crossDimension] / 2);
      if (centerDistance < EPSILON) continue;
      const gap = centerDistance - (a[crossDimension] + b[crossDimension]) / 2;
      crossExpansion = Math.max(crossExpansion, (columnGap - gap) / centerDistance);
    }
  }
  const crossCenter = (Math.min(...nodes.map((node) => node[crossAxis]))
    + Math.max(...nodes.map((node) => node[crossAxis] + node[crossDimension]))) / 2;
  for (const node of nodes) {
    node[crossAxis] += (node[crossAxis] + node[crossDimension] / 2 - crossCenter) * crossExpansion;
  }

  const supportsForwardFeedback = direction === "TD" || direction === "TB" || direction === "LR";
  const reciprocalForward = new Set(supportsForwardFeedback ? separateReciprocalEdges(nodes, routes, direction) : []);

  // Allocate incoming and outgoing ports together so they cannot share a stem.
  for (const node of nodes) for (const side of ["left", "right", "top", "bottom"] as Side[]) {
    const group = routes.filter((edge) => (edge.source === node && edge.startSide === side) || (edge.target === node && edge.endSide === side));
    const cross = side === "left" || side === "right" ? "y" : "x";
    const originalPort = (edge: EdgeRoute): number => (edge.source === node ? edge.start : edge.end)[cross];
    const remote = (edge: EdgeRoute): number => {
      const other = edge.source === node ? edge.target : edge.source;
      return other[cross] + (cross === "x" ? other.width : other.height) / 2;
    };
    group.sort((a, b) => originalPort(a) - originalPort(b) || remote(a) - remote(b));
    group.forEach((edge, index) => {
      const point = port(node, side, (index + 1) / (group.length + 1));
      if (edge.source === node) edge.start = point; else edge.end = point;
    });
  }
  widenBypassTargets(nodes, routes, direction);
  alignForwardPorts(nodes, routes, direction, reciprocalForward);
  const oppositeSide: Record<Side, Side> = { left: "right", right: "left", top: "bottom", bottom: "top" };
  // Align facing ports where a clear corridor exists. Tiny offsets otherwise
  // force unnecessary doglegs just to satisfy the minimum bend distance.
  for (const edge of routes) {
    if (edge.endSide !== oppositeSide[edge.startSide]) continue;
    const cross = edge.startSide === "left" || edge.startSide === "right" ? "y" : "x";
    const axis = cross === "x" ? "y" : "x", size = cross === "x" ? "width" : "height";
    const sign = edge.startSide === "bottom" || edge.startSide === "right" ? 1 : -1;
    if ((edge.end[axis] - edge.start[axis]) * sign < TERMINAL_DISTANCE * 2 - EPSILON) continue;
    let low = Math.max(edge.source[cross], edge.target[cross]) + CLEARANCE;
    let high = Math.min(edge.source[cross] + edge.source[size], edge.target[cross] + edge.target[size]) - CLEARANCE;
    for (const [node, side, point] of [[edge.source, edge.startSide, edge.start], [edge.target, edge.endSide, edge.end]] as const) {
      for (const other of routes) {
        if (other === edge) continue;
        const adjacent = other.source === node && other.startSide === side ? other.start
          : other.target === node && other.endSide === side ? other.end : undefined;
        if (!adjacent) continue;
        if (adjacent[cross] < point[cross]) low = Math.max(low, adjacent[cross] + EDGE_CLEARANCE);
        else high = Math.min(high, adjacent[cross] - EDGE_CLEARANCE);
      }
    }
    const obstacles = nodes.filter((node) => node !== edge.source && node !== edge.target).map((node) => inflate(node, CLEARANCE));
    const candidates = [edge.target.width !== edge.target.original.width ? edge.end[cross] : (edge.start[cross] + edge.end[cross]) / 2,
      edge.start[cross], edge.end[cross], low, high,
      ...obstacles.flatMap((box) => [box[cross], box[cross] + box[size]])];
    const coordinate = candidates.filter((value) => value >= low && value <= high
      && !obstacles.some((box) => crossesBox({ ...edge.start, [cross]: value }, { ...edge.end, [cross]: value }, box)))
      .sort((a, b) => Math.abs(a - edge.start[cross]) + Math.abs(a - edge.end[cross])
        - Math.abs(b - edge.start[cross]) - Math.abs(b - edge.end[cross]))[0];
    if (coordinate !== undefined) { edge.start[cross] = coordinate; edge.end[cross] = coordinate; }
  }
  // Add space only when a turn competes with another terminal stem. A
  // solitary two-turn connection fits in the same gap as a straight edge.
  for (const edge of routes) {
    if (Math.abs(edge.start[crossAxis] - edge.end[crossAxis]) < EPSILON) continue;
    if (crowdedPort(edge.source, edge.startSide) || crowdedPort(edge.target, edge.endSide)) {
      turnLanes.set(edge, 2);
      continue;
    }
    if (edge.endSide !== oppositeSide[edge.startSide]
      || (vertical ? edge.startSide !== "top" && edge.startSide !== "bottom"
        : edge.startSide !== "left" && edge.startSide !== "right")) continue;
    const middle = (edge.start[axis] + edge.end[axis]) / 2;
    const from = { ...edge.start, [axis]: middle }, to = { ...edge.end, [axis]: middle };
    const stems = routes.filter((other) => other !== edge).flatMap((other) => [
      [other.start, stub(other.start, other.startSide)], [stub(other.end, other.endSide), other.end]
    ]);
    if (trafficCost(from, to, stems) > EPSILON) turnLanes.set(edge, 1);
  }
  const compactPositions = new Map(nodes.map((node) => [node, node[axis]]));
  spaceRanks();
  for (const edge of routes) {
    edge.start[axis] += edge.source[axis] - compactPositions.get(edge.source)!;
    edge.end[axis] += edge.target[axis] - compactPositions.get(edge.target)!;
  }
  const forward: Side = direction === "LR" ? "right" : direction === "RL" ? "left" : direction === "BT" ? "top" : "bottom";
  for (const node of nodes) {
    const branches = routes.filter((edge) => edge.source === node && edge.label && edge.startSide === forward
      && (direction === "BT" || direction === "RL" ? edge.end[axis] < edge.start[axis] : edge.end[axis] > edge.start[axis]));
    if (branches.length < 2) continue;
    const sourceCoordinate = branches[0].start[axis];
    const nearestTarget = direction === "BT" || direction === "RL"
      ? Math.max(...branches.map((edge) => edge.end[axis])) : Math.min(...branches.map((edge) => edge.end[axis]));
    const coordinate = (sourceCoordinate + nearestTarget) / 2;
    for (const branch of branches) {
      const label = branch.label;
      if (!label) continue;
      label.x = (vertical ? branch.end.x : coordinate) - label.width / 2;
      label.y = (vertical ? coordinate : branch.end.y) - label.height / 2;
      label.aligned = true;
    }
    const sorted = branches.map((edge) => edge.label as LabelBox).sort((a, b) => vertical ? a.x - b.x : a.y - b.y);
    for (let index = 1; index < sorted.length; index++) {
      const before = sorted[index - 1], current = sorted[index];
      if (vertical) current.x = Math.max(current.x, before.x + before.width + 16);
      else current.y = Math.max(current.y, before.y + before.height + 16);
    }
  }
  const nodeObstacles = nodes.map((node) => inflate(node, CLEARANCE));
  const placedLabels = routes.flatMap((edge) => edge.label?.aligned ? [edge.label] : []);
  // Establish short local connections first; feedback edges then use free lanes.
  const routeOrder = [...routes].sort((a, b) => {
    const span = (edge: EdgeRoute): number => Math.abs(edge.start.x - edge.end.x) + Math.abs(edge.start.y - edge.end.y);
    return span(a) - span(b);
  });
  const routed = new Set<EdgeRoute>();
  for (const edge of routeOrder) {
    const start = stub(edge.start, edge.startSide), end = stub(edge.end, edge.endSide);
    const obstacles = [...nodeObstacles, ...placedLabels.filter((label) => label !== edge.label).map((label) => inflate(label, 4))];
    let labelEntry: RoutePoint | undefined;
    let labelExit: RoutePoint | undefined;
    if (edge.label?.aligned) {
      const label = edge.label;
      const reverse = direction === "BT" || direction === "RL";
      const before = vertical
        ? { x: label.x + label.width / 2, y: label.y - TERMINAL_DISTANCE }
        : { x: label.x - TERMINAL_DISTANCE, y: label.y + label.height / 2 };
      const after = vertical
        ? { x: label.x + label.width / 2, y: label.y + label.height + TERMINAL_DISTANCE }
        : { x: label.x + label.width + TERMINAL_DISTANCE, y: label.y + label.height / 2 };
      labelEntry = reverse ? after : before;
      labelExit = reverse ? before : after;
    }
    const occupiedPaths = routes.filter((other) => other !== edge).flatMap((other) => routed.has(other)
      ? [other.points] : [[other.start, stub(other.start, other.startSide)], [stub(other.end, other.endSide), other.end]]);
    const first = routeOrthogonally(start, labelEntry ?? end, obstacles, {
      startDirection: edge.startSide, endDirection: labelEntry ? forward : oppositeSide[edge.endSide], occupiedPaths
    });
    const second = labelExit ? routeOrthogonally(labelExit, end, obstacles, {
      startDirection: forward, endDirection: oppositeSide[edge.endSide], occupiedPaths
    }) : [];
    if (!first || !second) return;
    if (labelEntry && labelExit && obstacles.some((box) => crossesBox(labelEntry, labelExit, box))) return;
    edge.points = simplify([edge.start, ...first, ...second, edge.end]);
    routed.add(edge);
    if (edge.label && !edge.label.aligned) {
      const candidates = edge.points.slice(1).map((point, index) => {
        const before = edge.points[index];
        const length = Math.abs(point.x - before.x) + Math.abs(point.y - before.y);
        return { x: (point.x + before.x) / 2 - edge.label!.width / 2,
          y: (point.y + before.y) / 2 - edge.label!.height / 2, length,
          width: edge.label!.width, height: edge.label!.height };
      }).sort((a, b) => b.length - a.length);
      const position = candidates.find((candidate) => !nodes.some((node) => overlaps(candidate, inflate(node, 12)))
        && !placedLabels.some((label) => overlaps(candidate, inflate(label, 8))));
      if (!position) return;
      edge.label.x = position.x; edge.label.y = position.y;
      placedLabels.push(edge.label);
    }
  }

  // Commit only a complete, valid layout; no partially shifted diagrams.
  nodes.forEach((node) => {
    node.element.setAttribute("transform", `translate(${node.x - node.original.x},${node.y - node.original.y})`);
    if (node.width !== node.original.width) {
      node.element.querySelector("rect")?.setAttribute("width", String(node.width));
      for (const text of Array.from(node.element.querySelectorAll("text[x], tspan[x]"))) {
        text.setAttribute("x", String(Number(text.getAttribute("x")) + (node.width - node.original.width) / 2));
      }
    }
    if (node.height !== node.original.height) {
      node.element.querySelector("rect")?.setAttribute("height", String(node.height));
      for (const text of Array.from(node.element.querySelectorAll("text[y], tspan[y]"))) {
        text.setAttribute("y", String(Number(text.getAttribute("y")) + (node.height - node.original.height) / 2));
      }
    }
  });
  for (const edge of routes) {
    edge.element.setAttribute("points", edge.points.map((point) => `${point.x},${point.y}`).join(" "));
    edge.element.setAttribute("stroke-linejoin", "round");
    if (edge.label) edge.label.element.setAttribute("transform", `translate(${edge.label.x - edge.label.original.x},${edge.label.y - edge.label.original.y})`);
  }
  const bounds: RouteBox[] = [...nodes, ...routes.flatMap((edge) => edge.label ? [edge.label] : []),
    ...routes.flatMap((edge) => edge.points.map((point) => ({ ...point, width: 0, height: 0 })))];
  const x = Math.min(...bounds.map((box) => box.x)) - 8, y = Math.min(...bounds.map((box) => box.y)) - 8;
  const width = Math.max(...bounds.map((box) => box.x + box.width)) - x + 8;
  const height = Math.max(...bounds.map((box) => box.y + box.height)) - y + 8;
  svg.setAttribute("viewBox", `${x} ${y} ${width} ${height}`);
  svg.setAttribute("width", String(width)); svg.setAttribute("height", String(height));
  svg.setAttribute("data-layout-refined", "true");
}
