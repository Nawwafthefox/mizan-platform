import { Routes } from '@angular/router';
import { SuperAdminShellComponent } from './super-admin-shell.component';
import { superAdminGuard } from '../../core/guards/auth.guard';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: SuperAdminShellComponent,
    canActivate: [superAdminGuard],
    children: [
      { path: 'dashboard', loadComponent: () => import('./super-admin-dashboard.component').then(m => m.SuperAdminDashboardComponent) },
      { path: 'tenants',   loadComponent: () => import('./tenants.component').then(m => m.TenantsComponent) },
      { path: 'tiers',     loadComponent: () => import('./tiers.component').then(m => m.TiersComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  }
];
