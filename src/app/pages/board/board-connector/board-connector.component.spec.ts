import { ComponentFixture, TestBed } from '@angular/core/testing';

import { BoardConnectorComponent } from './board-connector.component';

describe('BoardConnectorComponent', () => {
  let component: BoardConnectorComponent;
  let fixture: ComponentFixture<BoardConnectorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BoardConnectorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(BoardConnectorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
