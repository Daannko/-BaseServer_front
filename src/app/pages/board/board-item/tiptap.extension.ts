import { Mark as TiptapMark, mergeAttributes } from '@tiptap/core';
import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

/** Mark linking a span of text to another board element. Clicking the text
 *  (handled in board-note.component) centers the camera on the target.
 *  `targetId` stores the element's serverId when available, else its client id;
 *  resolution (board-main.service) matches either field. */
declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    boardLink: {
      setBoardLink: (attributes: { targetId: string }) => ReturnType;
      unsetBoardLink: () => ReturnType;
    };
  }
}

export const BoardLink = TiptapMark.create({
  name: 'boardLink',
  inclusive: false,

  addOptions() {
    return { HTMLAttributes: { class: 'board-link' } };
  },

  addAttributes() {
    return {
      targetId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-board-link'),
        renderHTML: (attrs) =>
          attrs['targetId'] ? { 'data-board-link': attrs['targetId'] } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-board-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      0,
    ];
  },

  addCommands() {
    return {
      setBoardLink:
        (attributes) =>
        ({ commands }) =>
          commands.setMark(this.name, attributes),
      unsetBoardLink:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

const emptyLineSizeKey = new PluginKey('emptyLineFontSize');

/**
 * Visual-only: give the empty paragraph the caret is in the size the next
 * character would actually use (its active/stored fontSize), so the caret line
 * matches what you'd type. Other empty lines are left at the note default — they
 * deliberately do NOT inherit an earlier run's size (e.g. a big headline), which
 * is what made trailing blank lines render huge. No document changes, so nothing
 * is persisted (unlike the old storedMarks system).
 */
export const EmptyLineFontSize = Extension.create({
  name: 'emptyLineFontSize',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: emptyLineSizeKey,
        props: {
          decorations(state) {
            const decos: Decoration[] = [];
            const sel = state.selection;
            state.doc.descendants((node, pos) => {
              if (node.type.name !== 'paragraph') return true;
              if (node.content.size > 0) return false;

              let size: string | null = null;
              // Only the caret's own empty line is sized — to the size the next
              // char would use. Non-caret empty lines stay at the note default.
              if (sel.empty && sel.$from.parent === node) {
                const marks = state.storedMarks ?? sel.$from.marks();
                size =
                  (marks.find((m) => m.type.name === 'textStyle')?.attrs?.[
                    'fontSize'
                  ] as string) ?? null;
              }
              if (size) {
                decos.push(
                  Decoration.node(pos, pos + node.nodeSize, {
                    style: `font-size: ${size}`,
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

/**
 * Tab handling inside note editors: keep focus in the editor and indent instead
 * of moving to the next focusable element on the page.
 *
 * - In a list: Tab sinks (indents) the item, Shift-Tab lifts it.
 * - In a code block: Tab inserts a real tab character.
 * - In a table: defer to the Table extension's cell navigation.
 * - Otherwise: insert a small indent (four non-breaking spaces) and swallow the
 *   key so the browser does not shift focus.
 */
export const TabIndent = Extension.create({
  name: 'tabIndent',

  addKeyboardShortcuts() {
    const editor = this.editor;
    return {
      Tab: () => {
        // Let the table extension own Tab (move to next cell).
        if (editor.isActive('table')) return false;
        // Indent a list item instead of inserting a tab.
        if (editor.can().sinkListItem('listItem')) {
          return editor.commands.sinkListItem('listItem');
        }
        // Everywhere else (paragraphs, code blocks): insert a real tab. The
        // editor renders paragraphs with white-space: pre-wrap + tab-size so the
        // \t shows as indentation and is preserved in the stored content.
        return editor.commands.insertContent('\t');
      },
      'Shift-Tab': () => {
        if (editor.isActive('table')) return false;
        if (editor.can().liftListItem('listItem')) {
          return editor.commands.liftListItem('listItem');
        }
        // Swallow so focus does not leave the editor.
        return true;
      },
    };
  },
});
