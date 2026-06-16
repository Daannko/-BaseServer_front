import type { JSONContent } from '@tiptap/core';

// ── Shared base ────────────────────────────────────────────────────────────

export interface ElementBase {
  id: string;
  boardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  bgColor: string | null;
  borderColor: string | null;
  borderWidth: number;
}

// ── Per-element type responses ─────────────────────────────────────────────

export interface Note extends ElementBase {
  content: JSONContent; // TiptapDoc
  fontSize: number;
  padding: number | null;
}

export interface Section extends ElementBase {
  title: JSONContent; // TiptapDoc
}

export interface Image extends ElementBase {
  src: string; // blob-store URL, never base64
  naturalWidth: number;
  naturalHeight: number;
}

export interface DrawingStroke {
  color: string;
  width: number;
  /** Flat integer [x0, y0, x1, y1, …] array — local coordinates. */
  points: number[];
}

export interface Drawing extends ElementBase {
  strokes: DrawingStroke[];
}

// ── Board-scoped list response ─────────────────────────────────────────────

export interface BoardElements {
  notes: Note[];
  sections: Section[];
  images: Image[];
  drawings: Drawing[];
}

// ── Create payloads (shared base) ──────────────────────────────────────────

export interface ElementBaseCreate {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex?: number;
  bgColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number;
}

export interface CreateNote extends ElementBaseCreate {
  content?: JSONContent;
  fontSize?: number;
  padding?: number | null;
}

export interface CreateSection extends ElementBaseCreate {
  title?: JSONContent;
}

export interface CreateImage extends ElementBaseCreate {
  src: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface CreateDrawing extends ElementBaseCreate {
  strokes: DrawingStroke[];
}

// ── Update payloads (all fields optional) ──────────────────────────────────

export interface ElementBaseUpdate {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  zIndex?: number;
  bgColor?: string | null;
  borderColor?: string | null;
  borderWidth?: number;
}

export interface UpdateNote extends ElementBaseUpdate {
  content?: JSONContent;
  fontSize?: number;
  padding?: number | null;
}

export interface UpdateSection extends ElementBaseUpdate {
  title?: JSONContent;
}

export interface UpdateImage extends ElementBaseUpdate {
  src?: string;
  naturalWidth?: number;
  naturalHeight?: number;
}

export interface UpdateDrawing extends ElementBaseUpdate {
  strokes?: DrawingStroke[];
}
