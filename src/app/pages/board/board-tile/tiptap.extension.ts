import { Node, mergeAttributes } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';
import type { Mark, Schema } from 'prosemirror-model';

type StoredMark = { type: string; attrs: Record<string, any> };

/** Serialize ProseMirror Mark[] → plain objects for storage as node attrs */
function serializeMarks(marks: readonly Mark[]): StoredMark[] {
  return marks.map((m) => ({ type: m.type.name, attrs: m.attrs }));
}

/** Resolve stored mark objects back into ProseMirror Mark instances */
function resolveMarks(stored: StoredMark[], schema: Schema): Mark[] {
  return stored.reduce<Mark[]>((acc, m) => {
    const type = schema.marks[m.type];
    if (type) acc.push(type.create(m.attrs));
    return acc;
  }, []);
}

/** Get the fontSize from storedMarks if a textStyle mark has one */
function getStoredFontSize(stored: StoredMark[]): string | undefined {
  return stored.find((m) => m.type === 'textStyle')?.attrs?.['fontSize'];
}

export const ParagraphWithMarks = Node.create({
  name: 'paragraph',
  group: 'block',
  content: 'inline*',
  parseHTML() {
    return [{ tag: 'p' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes(HTMLAttributes), 0];
  },
  addAttributes() {
    return {
      storedMarks: {
        default: [],
        parseHTML: (el) => {
          const raw = el.getAttribute('data-stored-marks');
          return raw ? JSON.parse(raw) : [];
        },
        renderHTML: (attrs) =>
          attrs['storedMarks']?.length
            ? { 'data-stored-marks': JSON.stringify(attrs['storedMarks']) }
            : {},
      },
    };
  },
});

const marksPluginKey = new PluginKey('paragraphMarks');
const fontSizeDecoKey = new PluginKey('emptyParagraphFontSize');

export const ParagraphAttrPlugin = Extension.create({
  name: 'paragraphAttrPlugin',

  addProseMirrorPlugins() {
    return [
      // Main plugin: carry, restore, and preserve marks across paragraph operations
      new Plugin({
        key: marksPluginKey,

        appendTransaction(transactions, oldState, newState) {
          const { $from } = newState.selection;
          const para = $from.parent;
          if (para.type.name !== 'paragraph') return null;

          // --- Case 1: Paragraph split (Enter) — carry marks to new paragraph ---
          if (
            newState.doc.content.childCount > oldState.doc.content.childCount
          ) {
            if ((para.attrs['storedMarks'] || []).length > 0) return null;

            const marks = newState.storedMarks || oldState.storedMarks;
            if (!marks?.length) return null;

            const pos = $from.before();
            const node = newState.doc.nodeAt(pos);
            if (!node || node.type.name !== 'paragraph') return null;

            return newState.tr
              .setNodeMarkup(pos, undefined, {
                ...node.attrs,
                storedMarks: serializeMarks(marks),
              })
              .setStoredMarks(marks);
          }

          // --- Case 2: Select-all + clear — preserve first character's marks ---
          if (
            oldState.doc.textContent.length > 0 &&
            newState.doc.content.childCount === 1 &&
            para.content.size === 0 &&
            !para.attrs['storedMarks']?.length
          ) {
            let firstMarks: readonly Mark[] | null = null;
            oldState.doc.descendants((n) => {
              if (firstMarks) return false;
              if (n.isText && n.marks?.length) {
                firstMarks = n.marks;
                return false;
              }
              return true;
            });
            if (!firstMarks || !(firstMarks as Mark[]).length) return null;

            const resolved = resolveMarks(
              serializeMarks(firstMarks),
              newState.schema,
            );
            return newState.tr
              .setNodeMarkup(0, undefined, {
                ...para.attrs,
                storedMarks: serializeMarks(firstMarks),
              })
              .setStoredMarks(resolved);
          }

          // --- Case 3: Selection moved into empty paragraph — restore marks ---
          if (
            !oldState.selection.eq(newState.selection) &&
            para.content.size === 0
          ) {
            const stored = para.attrs['storedMarks'] as StoredMark[];
            if (!stored?.length) return null;

            const marks = resolveMarks(stored, newState.schema);
            return marks.length ? newState.tr.setStoredMarks(marks) : null;
          }

          return null;
        },
      }),

      // Decoration plugin: apply font-size to empty paragraphs so line-height is correct
      new Plugin({
        key: fontSizeDecoKey,
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') return true;
              if (node.content.size > 0) return false;
              const stored = node.attrs['storedMarks'] as StoredMark[];
              const fontSize = stored?.length && getStoredFontSize(stored);
              if (fontSize) {
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    style: `font-size: ${fontSize}; line-height: ${fontSize}`,
                  }),
                );
              }
              return false;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});
