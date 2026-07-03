import {
  AfterViewInit,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { Editor } from '@tiptap/core';
import type { JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { HighlightedCodeBlock, lowlight } from '../board-item/tiptap.service';

/**
 * Rich-text input for quiz OPEN answers. Reuses the SAME editor building blocks
 * as board notes — syntax-highlighted code blocks (```), inline code (`), and
 * tab-to-indent — so writing code in an answer feels identical to a note.
 *
 * Deliberately a slim extension set (no tables / board-links / font sizing):
 * an answer only needs prose + code. Content is plain ProseMirror JSON; the
 * parent mirrors it to plain text for grading and renders it back through the
 * shared NoteRenderService in the results view.
 */
@Component({
  selector: 'app-quiz-answer-editor',
  standalone: true,
  template: `<div #host class="quiz-answer-host"></div>`,
  styleUrl: './quiz-answer-editor.component.scss',
})
export class QuizAnswerEditorComponent
  implements AfterViewInit, OnChanges, OnDestroy
{
  /** Current answer document (the editor's source of truth). */
  @Input() doc: JSONContent | null = null;
  /** Disable editing once the quiz is submitted. */
  @Input() readOnly = false;
  @Output() docChange = new EventEmitter<JSONContent>();

  @ViewChild('host', { static: true }) host!: ElementRef<HTMLElement>;

  private editor?: Editor;
  /** True while emitting our own update, so the resulting [doc] change doesn't
   *  bounce back into setContent and reset the cursor. */
  private selfEmitting = false;

  ngAfterViewInit(): void {
    this.editor = new Editor({
      element: this.host.nativeElement,
      editable: !this.readOnly,
      extensions: [
        StarterKit.configure({
          heading: false,
          bulletList: false,
          orderedList: false,
          listItem: false,
          blockquote: false,
          horizontalRule: false,
          // Replaced by the syntax-highlighting block below.
          codeBlock: false,
        }),
        HighlightedCodeBlock.configure({ lowlight, defaultLanguage: 'plaintext' }),
      ],
      content: this.doc ?? '',
      editorProps: {
        attributes: { class: 'quiz-answer-content', spellcheck: 'true' },
        // Tab inserts a real tab instead of moving focus to the next control.
        // Handled here (not via the note's TabIndent extension) because that one
        // depends on the list extensions, which this slim editor doesn't load.
        handleKeyDown: (view, event) => {
          if (event.key !== 'Tab') return false;
          event.preventDefault();
          const { state, dispatch } = view;
          if (!event.shiftKey) {
            dispatch(state.tr.insertText('\t'));
            return true;
          }
          // Shift+Tab: outdent by removing a tab right before the cursor, if any.
          const sel = state.selection;
          if (sel.empty && sel.from > 0) {
            const before = state.doc.textBetween(sel.from - 1, sel.from);
            if (before === '\t') dispatch(state.tr.delete(sel.from - 1, sel.from));
          }
          return true;
        },
      },
      onUpdate: ({ editor }) => {
        this.selfEmitting = true;
        this.docChange.emit(editor.getJSON());
        this.selfEmitting = false;
      },
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.editor) return;
    if (changes['readOnly']) {
      this.editor.setEditable(!this.readOnly);
    }
    // A genuine external change (e.g. switching to another question) reloads the
    // doc; our own emits are skipped so typing isn't interrupted.
    if (changes['doc'] && !this.selfEmitting) {
      const incoming = this.doc ?? '';
      const current = this.editor.getJSON();
      if (JSON.stringify(current) !== JSON.stringify(this.doc ?? null)) {
        this.editor.commands.setContent(incoming, { emitUpdate: false });
      }
    }
  }

  ngOnDestroy(): void {
    try {
      this.editor?.destroy();
    } catch {
      /* already torn down */
    }
    this.editor = undefined;
  }
}
