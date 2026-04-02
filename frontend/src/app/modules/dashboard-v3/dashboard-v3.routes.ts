import { Routes } from '@angular/router';
import { DashboardShellComponent } from '../dashboard/dashboard-shell.component';
import { authGuard } from '../../core/guards/auth.guard';

export const DASHBOARD_V3_ROUTES: Routes = [
  {
    path: '',
    component: DashboardShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/coming-soon.component').then(m => m.ComingSoonComponent)
      }
    ]
  }
];
