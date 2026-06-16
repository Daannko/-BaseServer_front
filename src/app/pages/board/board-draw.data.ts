import type { JSONContent } from '@tiptap/core';
import { BoardItem } from './board-item/board-item.data';
import type { Drawing, DrawingStroke } from './models/element.model';
import { emptyDoc } from '../../helpers/rich-text.util';

export interface DrawPoint {
  x: number;
  y: number;
}

/** One pen stroke inside a drawing element. Points are local to the element
 *  origin (Topic.x/Topic.y); `width` is in world units. A drawing holds one
 *  sub-stroke normally, or several once strokes are merged. */
export interface SubStroke {
  color: string;
  width: number;
  points: DrawPoint[];
  /** Cached SVG path `d` in local coordinates. */
  d: string;
}

/** Same as SubStroke but with absolute world points — the form used while
 *  drawing and when merging/unmerging across elements. */
export interface AbsStroke {
  color: string;
  width: number;
  points: DrawPoint[];
}

/**
 * One or more freehand strokes as a movable/deletable/mergeable board element,
 * persisted as a Topic (one element = one topic). Stored as *vector* data, never
 * a raster image: Topic.content holds each sub-stroke's color, width and a flat
 * `[x0,y0,…]` integer point array local to the element origin. Local + rounded
 * keeps the payload tiny and makes moving the element free (only x/y change).
 */
export class BoardDrawing extends BoardItem {
  readonly isDrawing = true as const;
  strokes: SubStroke[];

  constructor(
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    strokes: SubStroke[],
  ) {
    super(id, x, y, width, height, emptyDoc(), drawingDoc(strokes));
    this.strokes = strokes;
  }

  /** True once two or more strokes have been merged into this element. */
  get isMerged(): boolean {
    return this.strokes.length > 1;
  }

  /** Sub-strokes with absolute world points (for merge / unmerge). */
  toAbsolute(): AbsStroke[] {
    return this.strokes.map((s) => ({
      color: s.color,
      width: s.width,
      points: s.points.map((p) => ({ x: p.x + this.x, y: p.y + this.y })),
    }));
  }

  /** Build one element from absolute sub-strokes: union bounding box, points
   *  re-based to the box origin. */
  static fromAbsolute(subs: AbsStroke[]): BoardDrawing {
    const all: DrawPoint[] = [];
    let maxWidth = 0;
    for (const s of subs) {
      for (const p of s.points) all.push(p);
      if (s.width > maxWidth) maxWidth = s.width;
    }
    const b = computeBounds(all, maxWidth);
    const strokes: SubStroke[] = subs.map((s) => {
      const local = s.points.map((p) => ({ x: p.x - b.x, y: p.y - b.y }));
      return { color: s.color, width: s.width, points: local, d: buildStrokePath(local) };
    });
    return new BoardDrawing(
      globalThis.crypto.randomUUID(),
      b.x,
      b.y,
      b.width,
      b.height,
      strokes,
    );
  }

  /** Convenience for a single freehand stroke captured in absolute points. */
  static newDrawing(
    absPoints: DrawPoint[],
    color: string,
    strokeWidth: number,
  ): BoardDrawing {
    return BoardDrawing.fromAbsolute([{ color, width: strokeWidth, points: absPoints }]);
  }

  static fromDrawingElement(el: Drawing): BoardDrawing {
    const strokes: SubStroke[] = (el.strokes ?? []).map((s) => {
      const points: DrawPoint[] = [];
      const flat = s.points ?? [];
      for (let i = 0; i + 1 < flat.length; i += 2) {
        points.push({ x: flat[i], y: flat[i + 1] });
      }
      return {
        color: s.color ?? '#ffd54f',
        width: s.width ?? 4,
        points,
        d: buildStrokePath(points),
      };
    });
    const drawing = new BoardDrawing(
      el.id, el.x, el.y, el.width, el.height, strokes,
    );
    drawing.hydrateBase(el);
    drawing.saved();
    return drawing;
  }
}

/** Build a smooth SVG path through `points` using quadratic curves between
 *  successive midpoints. A single point renders as a round dot (relies on
 *  stroke-linecap="round"). */
export function buildStrokePath(points: DrawPoint[]): string {
  if (points.length === 0) return '';
  const p0 = points[0];
  if (points.length === 1) {
    return `M ${p0.x} ${p0.y} L ${p0.x} ${p0.y}`;
  }

  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const curr = points[i];
    const next = points[i + 1];
    const midX = (curr.x + next.x) / 2;
    const midY = (curr.y + next.y) / 2;
    d += ` Q ${curr.x} ${curr.y} ${midX} ${midY}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function computeBounds(
  points: DrawPoint[],
  strokeWidth: number,
): { x: number; y: number; width: number; height: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  if (!isFinite(minX)) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const pad = strokeWidth / 2;
  return {
    x: minX - pad,
    y: minY - pad,
    width: maxX - minX + strokeWidth,
    height: maxY - minY + strokeWidth,
  };
}

interface SubStrokeAttrs {
  c: string;
  w: number;
  /** Flat [x0,y0,…] integers, local to the element origin. */
  p: number[];
}

interface DrawingAttrs {
  strokes: SubStrokeAttrs[];
}

/** Serialize sub-strokes (local points) to a compact content doc. */
function drawingDoc(strokes: SubStroke[]): JSONContent {
  const attrs: DrawingAttrs = {
    strokes: strokes.map((s) => {
      const p: number[] = [];
      for (const pt of s.points) p.push(Math.round(pt.x), Math.round(pt.y));
      return { c: s.color, w: Math.round(s.width * 100) / 100, p };
    }),
  };
  return { type: 'drawing', attrs } as JSONContent;
}

function parseDrawingContent(content: unknown): SubStroke[] {
  const attrs = (content as any)?.attrs as DrawingAttrs | undefined;
  const list = Array.isArray(attrs?.strokes) ? attrs!.strokes : [];
  return list.map((s) => {
    const flat = Array.isArray(s?.p) ? s.p : [];
    const points: DrawPoint[] = [];
    for (let i = 0; i + 1 < flat.length; i += 2) {
      points.push({ x: flat[i], y: flat[i + 1] });
    }
    return {
      color: s?.c ?? '#ffd54f',
      width: s?.w ?? 4,
      points,
      d: buildStrokePath(points),
    };
  });
}
