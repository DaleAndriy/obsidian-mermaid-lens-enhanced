import { describe, expect, it } from "vitest";
import { crossesBox, EDGE_CLEARANCE, routeOrthogonally } from "../src/flowchart-routing";

describe('orthogonal obstacle routing', () => {
  it('detours around a blocking rectangle', () => {
    const obstacle = { x: 60, y: -20, width: 80, height: 40 };
    const path = routeOrthogonally({ x: 0, y: 0 }, { x: 200, y: 0 }, [obstacle]);
    expect(path).toBeTruthy();
    expect(path?.some((point) => Math.abs(point.y) >= 20)).toBe(true);
    path?.slice(1).forEach((point, index) => expect(crossesBox(path[index], point, obstacle)).toBe(false));
  });

  it('fails safely when a required port is inside an obstacle', () => {
    expect(routeOrthogonally({ x: 80, y: 0 }, { x: 200, y: 0 }, [{ x: 60, y: -20, width: 80, height: 40 }])).toBeUndefined();
  });

  it('gives opposite-direction edges separate lanes', () => {
    const path = routeOrthogonally({ x: 0, y: 0 }, { x: 200, y: 0 }, [], {
      occupiedPaths: [[{ x: 160, y: 0 }, { x: 40, y: 0 }]]
    });
    expect(path).toBeTruthy();
    const lane = { x: 40, y: -EDGE_CLEARANCE + 0.01, width: 120, height: EDGE_CLEARANCE * 2 - 0.02 };
    path?.slice(1).forEach((point, index) => expect(crossesBox(path[index], point, lane)).toBe(false));
  });

  it('detours around another edge when the extra distance is reasonable', () => {
    const path = routeOrthogonally({ x: 0, y: 0 }, { x: 200, y: 0 }, [], {
      occupiedPaths: [[{ x: 100, y: -60 }, { x: 100, y: 60 }]]
    });
    expect(path).toBeTruthy();
    path?.slice(1).forEach((point, index) => expect(crossesBox(path[index], point, { x: 99.99, y: -60, width: 0.02, height: 120 })).toBe(false));
  });

  it('allows an unavoidable crossing rather than failing the diagram', () => {
    const path = routeOrthogonally({ x: 0, y: 0 }, { x: 200, y: 0 }, [
      { x: -50, y: -100, width: 300, height: 90 }, { x: -50, y: 10, width: 300, height: 90 }
    ], { occupiedPaths: [[{ x: 100, y: -100 }, { x: 100, y: 100 }]] });
    expect(path).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  });
});
