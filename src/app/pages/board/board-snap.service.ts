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
   * Snap a dragged note so its edges/centers align with nearby notes.
   * Each axis snaps independently to the closest candidate within threshold.
   * Emits guide lines for whatever was snapped to.
   */
  snapMove(rect: ItemRect, excludeId: string): { x: number; y: number } {
    const t = this.threshold();
    let bestX: AxisCandidate | null = null;
    let bestY: AxisCandidate | null = null;
    let bestDx = Infinity;
    let bestDy = Infinity;

    for (const o of this.candidates(excludeId)) {
      // x values the note's left edge could take so that left/center/right
      // aligns with the other note's left/center/right. `line` is where the
      // alignment actually happens (for drawing the guide).
      const xCandidates: Array<[number, number]> = [
        [o.x, o.x], // left ↔ left
        [o.x + o.width, o.x + o.width], // left ↔ right
        [o.x - rect.width, o.x], // right ↔ left
        [o.x + o.width - rect.width, o.x + o.width], // right ↔ right
        [o.getCenterX() - rect.width / 2, o.getCenterX()], // center ↔ center
      ];
      for (const [value, line] of xCandidates) {
        const d = Math.abs(value - rect.x);
        if (d < t && d < bestDx) {
          bestDx = d;
          bestX = { value, line, other: o };
        }
      }

      const yCandidates: Array<[number, number]> = [
        [o.y, o.y],
        [o.y + o.height, o.y + o.height],
        [o.y - rect.height, o.y],
        [o.y + o.height - rect.height, o.y + o.height],
        [o.getCenterY() - rect.height / 2, o.getCenterY()],
      ];
      for (const [value, line] of yCandidates) {
        const d = Math.abs(value - rect.y);
        if (d < t && d < bestDy) {
          bestDy = d;
          bestY = { value, line, other: o };
        }
      }
    }

    const x = Math.round(bestX ? bestX.value : rect.x);
    const y = Math.round(bestY ? bestY.value : rect.y);

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

    return { x, y };
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
        const wCandidates: Array<[number, number | null]> = [[o.width, null]];
        if (westMoving) {
          wCandidates.push([right - o.x, o.x], [right - (o.x + o.width), o.x + o.width]);
        } else {
          wCandidates.push([o.x - rect.x, o.x], [o.x + o.width - rect.x, o.x + o.width]);
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
        const hCandidates: Array<[number, number | null]> = [[o.height, null]];
        if (northMoving) {
          hCandidates.push([bottom - o.y, o.y], [bottom - (o.y + o.height), o.y + o.height]);
        } else {
          hCandidates.push([o.y - rect.y, o.y], [o.y + o.height - rect.y, o.y + o.height]);
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
