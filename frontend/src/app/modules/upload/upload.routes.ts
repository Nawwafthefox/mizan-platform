import { Routes } from '@angular/router';
import { DashboardShellComponent } from '../dashboard/dashboard-shell.component';
import { authGuard } from '../../core/guards/auth.guard';

export const UPLOAD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./upload.component').then(m => m.UploadComponent) }
    ]
  }
];
