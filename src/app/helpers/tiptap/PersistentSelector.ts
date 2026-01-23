import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

type Sel = { from: number; to: number };
type Meta = { type: 'blur'; selection: Sel } | { type: 'focus' };

const key = new PluginKey<DecorationSet>('persistentSelection');

// Exported so callers can clear the decoration programmatically.
export const PersistentSelectionKey = key;

export const PersistentSelection = Extension.create({
  name: 'persistentSelection',

  addProseMirrorPlugins() {
    let blurred = false;

    return [
      new Plugin<DecorationSet>({
        key,

        state: {
          init: () => DecorationSet.empty,
          apply(tr, prev) {
            const meta = tr.getMeta(key) as Meta | undefined;

            if (meta?.type === 'focus') {
              blurred = false;
              return DecorationSet.empty;
            }

            if (meta?.type === 'blur') {
              blurred = true;

              const { from, to } = meta.selection;
              if (from === to) return DecorationSet.empty;

              return DecorationSet.create(tr.doc, [
                Decoration.inline(from, to, {
                  class: 'pm-persistent-selection',
                }),
              ]);
            }

            return blurred ? prev.map(tr.mapping, tr.doc) : DecorationSet.empty;
          },
        },

        props: {
          decorations(state) {
            return this.getState(state);
          },
          handleDOMEvents: {
            blur: (view) => {
              const { from, to } = view.state.selection;
              view.dispatch(
                view.state.tr.setMeta(key, {
                  type: 'blur',
                  selection: { from, to },
                }),
              );
              return false;
            },
            focus: (view) => {
              view.dispatch(view.state.tr.setMeta(key, { type: 'focus' }));
              return false;
            },
          },
        },
      }),
    ];
  },
});
