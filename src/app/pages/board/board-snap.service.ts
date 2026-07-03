import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { BoardMainService } from './board-main.service';
import { BoardItem } from './board-item/board-item.data';
import { ItemRect } from './board-item/item.resize.directive';

/** Snap radius in *screen* pixels — converted to world units using the current zoom. */
const SNAP_SCREEN_PX = 8;
/** Extra guide-line length past the involved notes, in world px. */
const GUIDE_PAD = 12;

/** Alignment line in world coordinates (vertical: pos = x, span = y range). */
export type SnapGuideLine = {
  orientation: 'v' | 'h';
  pos: number;
  from: number;
  to: number;
};

/** Outline around a note whose width/height was matched during a resize. */
export type SnapGuideRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SnapGuides = { lines: SnapGuideLine[]; rects: SnapGuideRect[] };

const NO_GUIDES: SnapGuides = { lines: [], rects: [] };

/** Original-ratio reference shown while resizing an image. Two dashed lines
 *  (one vertical, one horizontal) plus a labelled cross, all in world px. */
export type AspectGuide = {
  vLineX: number;
  vLineTop: number;
  vLineHeight: number;
  hLineY: number;
  hLineLeft: number;
  hLineWidth: number;
  crossX: number;
  crossY: number;
  label: string;
};

/** How far the lines extend past the box/cross, in world px. */
const ASPECT_GUIDE_PAD = 18;

type AxisCandidate = { value: number; line: number; other: BoardItem };

@Injectable({ providedIn: 'root' })
export class BoardSnapService {
  constructor(private main: BoardMainService) {}

  private readonly guidesSubject = new BehaviorSubject<SnapGuides>(NO_GUIDES);
  readonly guides$ = this.guidesSubject.asObservable();

  private readonly aspectGuideSubject = new BehaviorSubject<AspectGuide | null>(null);
  readonly aspectGuide$ = this.aspectGuideSubject.asObservable();

  clearGuides() {
    if (this.guidesSubject.value !== NO_GUIDES) {
      this.guidesSubject.next(NO_GUIDES);
    }
  }

  clearAspectGuide() {
    if (this.aspectGuideSubject.value !== null) {
      this.aspectGuideSubject.next(null);
    }
  }

  /**
   * Resize helper for images: snaps a free (single-axis) stretch back to the
   * original aspect ratio when the dragged edge is close, and publishes the
   * original-ratio reference guide. Corner drags (both axes change) keep their
   * locked ratio — no snap — but still show the reference.
   */
  snapImageAspect(
    rect: ItemRect,
    prev: ItemRect,
    ratio: number,
    label: string,
  ): ItemRect {
    const t = this.threshold();
    let { x, y, width, height } = rect;

    const widthChanged = width !== prev.width;
    const heightChanged = height !== prev.height;

    if (ratio > 0) {
      if (widthChanged && !heightChanged) {
        const target = height * ratio;
        if (target >= 1 && Math.abs(width - target) < t) {
          const right = x + width;
          const westMoving = x !== prev.x;
          width = target;
          if (westMoving) x = right - width;
        }
      } else if (heightChanged && !widthChanged) {
        const target = width / ratio;
        if (target >= 1 && Math.abs(height - target) < t) {
          const bottom = y + height;
          const northMoving = y !== prev.y;
          height = target;
          if (northMoving) y = bottom - height;
        }
      }
    }

    x = Math.round(x);
    y = Math.round(y);
    width = Math.round(width);
    height = Math.round(height);

    // Reference cross (anchored at the box's top-left): the vertical line marks
    // the width that matches the ratio for the current height; the horizontal
    // line marks the height that matches the ratio for the current width. When
    // the image is at original ratio, the cross lands on its bottom-right corner.
    const vx = x + height * (ratio || 1);
    const hy = y + width / (ratio || 1);
    const vTop = Math.min(y, hy);
    const vBot = Math.max(y + height, hy);
    const hLeft = Math.min(x, vx);
    const hRight = Math.max(x + width, vx);

    this.aspectGuideSubject.next({
      vLineX: vx,
      vLineTop: vTop - ASPECT_GUIDE_PAD,
      vLineHeight: vBot - vTop + 2 * ASPECT_GUIDE_PAD,
      hLineY: hy,
      hLineLeft: hLeft - ASPECT_GUIDE_PAD,
      hLineWidth: hRight - hLeft + 2 * ASPECT_GUIDE_PAD,
      crossX: vx,
      crossY: hy,
      label,
    });

    return { x, y, width, height };
  }

  private threshold(): number {
    return SNAP_SCREEN_PX / (this.main.zoom || 1);
  }

  /** Other notes/sections worth snapping against: everything currently on screen. */
  private candidates(excludeId: string): BoardItem[] {
    return [...this.main.notes, ...this.main.sections, ...this.main.images].filter(
      (n) => n.id !== excludeId && n.inView,
    );
  }

  /**
   * Closest edge/center alignment for `rect` on each axis independently, among
   * `others`. Shared by single-item and group moves.
   */
  private bestAxisSnaps(
    rect: ItemRect,
    others: BoardItem[],
  ): { bestX: AxisCandidate | null; bestY: AxisCandidate | null } {
    const t = this.threshold();
    let bestX: AxisCandidate | null = null;
    let bestY: AxisCandidate | null = null;
    let bestDx = Infinity;
    let bestDy = Infinity;

    for (const o of others) {
      // x values the rect's left edge could take so that left/center/right
      // aligns with the other's left/center/right. `line` is where the
      // alignment actually happens (for drawing the guide).
      const oCenterX = o.getCenterX();
      const xCandidates: Array<[number, number]> = [
        [o.x, o.x], // left ↔ left
        [o.x + o.width, o.x + o.width], // left ↔ right
        [o.x - rect.width, o.x], // right ↔ left
        [o.x + o.width - rect.width, o.x + o.width], // right ↔ right
        [oCenterX - rect.width / 2, oCenterX], // center ↔ center
        [oCenterX, oCenterX], // left ↔ center
        [oCenterX - rect.width, oCenterX], // right ↔ center
        [o.x - rect.width / 2, o.x], // center ↔ left
        [o.x + o.width - rect.width / 2, o.x + o.width], // center ↔ right
      ];
      for (const [value, line] of xCandidates) {
        const d = Math.abs(value - rect.x);
        if (d < t && d < bestDx) {
          bestDx = d;
          bestX = { value, line, other: o };
        }
      }

      const oCenterY = o.getCenterY();
      const yCandidates: Array<[number, number]> = [
        [o.y, o.y], // top ↔ top
        [o.y + o.height, o.y + o.height], // top ↔ bottom
        [o.y - rect.height, o.y], // bottom ↔ top
        [o.y + o.height - rect.height, o.y + o.height], // bottom ↔ bottom
        [oCenterY - rect.height / 2, oCenterY], // center ↔ center
        [oCenterY, oCenterY], // top ↔ center
        [oCenterY - rect.height, oCenterY], // bottom ↔ center
        [o.y - rect.height / 2, o.y], // center ↔ top
        [o.y + o.height - rect.height / 2, o.y + o.height], // center ↔ bottom
      ];
      for (const [value, line] of yCandidates) {
        const d = Math.abs(value - rect.y);
        if (d < t && d < bestDy) {
          bestDy = d;
          bestY = { value, line, other: o };
        }
      }
    }

    return { bestX, bestY };
  }

  /** Publish the alignment guide lines for a snapped move of `rect` (already at
   *  the snapped x/y). */
  private emitMoveGuides(
    bestX: AxisCandidate | null,
    bestY: AxisCandidate | null,
    rect: ItemRect,
    x: number,
    y: number,
  ): void {
    const lines: SnapGuideLine[] = [];
    if (bestX) {
      const o = bestX.other;
      lines.push({
        orientation: 'v',
        pos: bestX.line,
        from: Math.min(o.y, y) - GUIDE_PAD,
        to: Math.max(o.y + o.height, y + rect.height) + GUIDE_PAD,
      });
    }
    if (bestY) {
      const o = bestY.other;
      lines.push({
        orientation: 'h',
        pos: bestY.line,
        from: Math.min(o.x, x) - GUIDE_PAD,
        to: Math.max(o.x + o.width, x + rect.width) + GUIDE_PAD,
      });
    }
    this.guidesSubject.next(lines.length ? { lines, rects: [] } : NO_GUIDES);
  }

  /**
   * The one move-snap routine shared by every kind of drag. Snaps `rect`
   * (a single element's rect, or a selection's bounding box) translated by
   * (dx, dy) against every on-screen element NOT in `excludeIds`. Each axis
   * snaps independently to the closest candidate within threshold; a Shift-held
   * `lockedAxis` is never snapped. Returns the adjusted translation and emits
   * the alignment guides.
   *
   * Single moves pass a one-item rect (and dx=dy=0 with the rect already at the
   * intended position, via snapMove); group moves pass the bounding box and the
   * intended delta — identical logic for both, so "the group is just a bigger
   * single element".
   */
  snapTranslation(
    rect: ItemRect,
    dx: number,
    dy: number,
    excludeIds: Set<string>,
    lockedAxis?: 'x' | 'y',
  ): { dx: number; dy: number } {
    const others = [
      ...this.main.notes,
      ...this.main.sections,
      ...this.main.images,
    ].filter((n) => !excludeIds.has(n.id) && n.inView);

    const moved: ItemRect = {
      x: rect.x + dx,
      y: rect.y + dy,
      width: rect.width,
      height: rect.height,
    };

    let { bestX, bestY } = this.bestAxisSnaps(moved, others);
    if (lockedAxis === 'x') bestX = null;
    if (lockedAxis === 'y') bestY = null;

    const x = bestX ? bestX.value : moved.x;
    const y = bestY ? bestY.value : moved.y;
    this.emitMoveGuides(bestX, bestY, moved, Math.round(x), Math.round(y));

    return { dx: dx + (x - moved.x), dy: dy + (y - moved.y) };
  }

  /**
   * Snap a single dragged element to nearby elements. Thin wrapper over
   * snapTranslation: the rect is already at the intended position, so the
   * translation is zero and we hand back the absolute snapped position.
   */
  snapMove(
    rect: ItemRect,
    excludeId: string,
    lockedAxis?: 'x' | 'y',
  ): { x: number; y: number } {
    const r = this.snapTranslation(rect, 0, 0, new Set([excludeId]), lockedAxis);
    return { x: Math.round(rect.x + r.dx), y: Math.round(rect.y + r.dy) };
  }

  /**
   * Snap a dragged *multi-selection* as one block. `items` are the selected
   * elements (at their current positions) and (dx, dy) is the intended
   * translation this frame. The group's bounding box is snapped against
   * everything outside the selection; returns the adjusted translation and
   * emits guide lines spanning the group + matched element.
   */
  snapGroupMove(
    items: BoardItem[],
    dx: number,
    dy: number,
    lockedAxis?: 'x' | 'y',
  ): { dx: number; dy: number } {
    if (!items.length) return { dx, dy };

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const it of items) {
      minX = Math.min(minX, it.x);
      minY = Math.min(minY, it.y);
      maxX = Math.max(maxX, it.x + it.width);
      maxY = Math.max(maxY, it.y + it.height);
    }

    const ids = new Set(items.map((i) => i.id));
    return this.snapTranslation(
      { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      dx,
      dy,
      ids,
      lockedAxis,
    );
  }

  /**
   * Snap a resize so the note matches nearby notes' width/height, or so the
   * dragged edge lines up with their edges. `prev` is the rect before this
   * resize step — used to infer which edges are being dragged (west/north
   * drags shift x/y together with the size, east/south keep them fixed).
   * Size matches highlight the matched note; edge alignments draw a line.
   */
  snapResize(rect: ItemRect, prev: ItemRect, excludeId: string): ItemRect {
    const t = this.threshold();
    const others = this.candidates(excludeId);
    let { x, y, width, height } = rect;

    const widthChanged = rect.width !== prev.width;
    const heightChanged = rect.height !== prev.height;
    const westMoving = widthChanged && rect.x !== prev.x;
    const northMoving = heightChanged && rect.y !== prev.y;

    // null line value = size match (highlight the note instead of a line)
    let bestW: { value: number; line: number | null; other: BoardItem } | null = null;
    let bestH: { value: number; line: number | null; other: BoardItem } | null = null;

    if (widthChanged) {
      const right = rect.x + rect.width;
      let best = Infinity;
      for (const o of others) {
        // Match the other note's width, or align the moving edge with its edges.
        const oCenterX = o.getCenterX();
        const wCandidates: Array<[number, number | null]> = [[o.width, null]];
        if (westMoving) {
          wCandidates.push([right - o.x, o.x], [right - (o.x + o.width), o.x + o.width], [right - oCenterX, oCenterX]);
        } else {
          wCandidates.push([o.x - rect.x, o.x], [o.x + o.width - rect.x, o.x + o.width], [oCenterX - rect.x, oCenterX]);
        }
        for (const [value, line] of wCandidates) {
          if (value < 1) continue;
          const d = Math.abs(value - rect.width);
          if (d < t && d < best) {
            best = d;
            bestW = { value, line, other: o };
          }
        }
      }
      if (bestW) {
        width = bestW.value;
        if (westMoving) x = right - width;
      }
    }

    if (heightChanged) {
      const bottom = rect.y + rect.height;
      let best = Infinity;
      for (const o of others) {
        const oCenterY = o.getCenterY();
        const hCandidates: Array<[number, number | null]> = [[o.height, null]];
        if (northMoving) {
          hCandidates.push([bottom - o.y, o.y], [bottom - (o.y + o.height), o.y + o.height], [bottom - oCenterY, oCenterY]);
        } else {
          hCandidates.push([o.y - rect.y, o.y], [o.y + o.height - rect.y, o.y + o.height], [oCenterY - rect.y, oCenterY]);
        }
        for (const [value, line] of hCandidates) {
          if (value < 1) continue;
          const d = Math.abs(value - rect.height);
          if (d < t && d < best) {
            best = d;
            bestH = { value, line, other: o };
          }
        }
      }
      if (bestH) {
        height = bestH.value;
        if (northMoving) y = bottom - height;
      }
    }

    const lines: SnapGuideLine[] = [];
    const rects: SnapGuideRect[] = [];
    const addRectFor = (o: BoardItem) => {
      if (!rects.some((r) => r.x === o.x && r.y === o.y && r.width === o.width && r.height === o.height)) {
        rects.push({ x: o.x, y: o.y, width: o.width, height: o.height });
      }
    };
    if (bestW) {
      if (bestW.line === null) {
        addRectFor(bestW.other);
      } else {
        const o = bestW.other;
        lines.push({
          orientation: 'v',
          pos: bestW.line,
          from: Math.min(o.y, y) - GUIDE_PAD,
          to: Math.max(o.y + o.height, y + height) + GUIDE_PAD,
        });
      }
    }
    if (bestH) {
      if (bestH.line === null) {
        addRectFor(bestH.other);
      } else {
        const o = bestH.other;
        lines.push({
          orientation: 'h',
          pos: bestH.line,
          from: Math.min(o.x, x) - GUIDE_PAD,
          to: Math.max(o.x + o.width, x + width) + GUIDE_PAD,
        });
      }
    }
    this.guidesSubject.next(
      lines.length || rects.length ? { lines, rects } : NO_GUIDES,
    );

    return {
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(width),
      height: Math.round(height),
    };
  }
}
