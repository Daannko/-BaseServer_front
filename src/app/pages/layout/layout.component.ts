import { Component } from '@angular/core';
import { StorageService } from '../../service/storage.service';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss'
})
export class LayoutComponent {


  constructor(private storageService: StorageService,private route: ActivatedRoute){}


  private loading = true;
  user : any;

  ngOnInit(): void {
    this.user = this.storageService.getUser()['name'];
  }


}
