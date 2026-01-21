import { ComponentFixture, TestBed } from '@angular/core/testing';

import { QuerySelectComponent } from './query-select.component';

describe('QuerySelectComponent', () => {
  let component: QuerySelectComponent;
  let fixture: ComponentFixture<QuerySelectComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QuerySelectComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(QuerySelectComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
