import {
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  AfterViewInit,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { BoardDebugService } from '../board-debug.service';

/**
 * Floating performance overlay (top-right). Reads metrics from
 * BoardDebugService and paints them straight into the DOM from a
 * runOutsideAngular rAF loop, so the overlay refreshes every frame without
 * adding any change-detection work of its own.
 */
@Component({
  selector: 'app-board-debug-overlay',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './board-debug-overlay.component.html',
  styleUrl: './board-debug-overlay.component.scss',
})
export class BoardDebugOverlayComponent implements AfterViewInit, OnDestroy {
  @ViewChild('fpsEl') fpsEl!: ElementRef<HTMLElement>;
  @ViewChild('frameEl') frameEl!: ElementRef<HTMLElement>;
  @ViewChild('cdBoardEl') cdBoardEl!: ElementRef<HTMLElement>;
  @ViewChild('cdNotesEl') cdNotesEl!: ElementRef<HTMLElement>;
  @ViewChild('liveEl') liveEl!: ElementRef<HTMLElement>;
  @ViewChild('mountEl') mountEl!: ElementRef<HTMLElement>;
  @ViewChild('destroyEl') destroyEl!: ElementRef<HTMLElement>;

  private rafId = 0;

  constructor(
    public debug: BoardDebugService,
    private zone: NgZone,
  ) {}

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const paint = () => {
        if (this.debug.overlayVisible && this.fpsEl) {
          this.setText(this.fpsEl, String(this.debug.fps));
          this.setColor(this.fpsEl, this.fpsColor(this.debug.fps));
          this.setText(this.frameEl, this.debug.frameMs.toFixed(1) + ' ms');
          this.setText(this.cdBoardEl, String(this.debug.cdBoard) + '/s');
          this.setText(this.cdNotesEl, String(this.debug.cdNotes) + '/s');
          this.setText(this.liveEl, String(this.debug.notesLive));
          this.setText(this.mountEl, String(this.debug.noteMounts) + '/s');
          this.setText(this.destroyEl, String(this.debug.noteDestroys) + '/s');
          this.setColor(this.mountEl, this.debug.noteMounts > 0 ? '#ff6b6b' : '#7ee787');
          this.setColor(this.destroyEl, this.debug.noteDestroys > 0 ? '#ff6b6b' : '#7ee787');
        }
        this.rafId = requestAnimationFrame(paint);
      };
      this.rafId = requestAnimationFrame(paint);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.rafId);
  }

  toggleEditor(event: Event): void {
    this.debug.setDisableEditor((event.target as HTMLInputElement).checked);
  }

  hide(): void {
    this.debug.setOverlayVisible(false);
  }

  private setText(ref: ElementRef<HTMLElement>, text: string): void {
    if (ref?.nativeElement && ref.nativeElement.textContent !== text) {
      ref.nativeElement.textContent = text;
    }
  }

  private setColor(ref: ElementRef<HTMLElement>, color: string): void {
    if (ref?.nativeElement) ref.nativeElement.style.color = color;
  }

  private fpsColor(fps: number): string {
    if (fps >= 50) return '#7ee787';
    if (fps >= 30) return '#ffd54f';
    return '#ff6b6b';
  }
}
