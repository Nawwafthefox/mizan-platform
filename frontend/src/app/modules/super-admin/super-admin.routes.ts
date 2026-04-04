import { Routes } from '@angular/router';
import { SuperAdminShellComponent } from './super-admin-shell.component';
import { superAdminGuard } from '../../core/guards/auth.guard';

export const SUPER_ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: SuperAdminShellComponent,
    canActivate: [superAdminGuard],
    children: [
      { path: 'dashboard',   loadComponent: () => import('./super-admin-dashboard.component').then(m => m.SuperAdminDashboardComponent) },
      { path: 'tenants',     loadComponent: () => import('./tenants.component').then(m => m.TenantsComponent) },
      { path: 'tiers',       loadComponent: () => import('./tiers.component').then(m => m.TiersComponent) },
      { path: 'users',       loadComponent: () => import('./users-management.component').then(m => m.UsersManagementComponent) },
      { path: 'audit-logs',  loadComponent: () => import('./audit-logs.component').then(m => m.AuditLogsComponent) },
      { path: 'upload-logs', loadComponent: () => import('./upload-logs.component').then(m => m.UploadLogsComponent) },
      { path: 'system',    loadComponent: () => import('./system-controls.component').then(m => m.SystemControlsComponent) },
      { path: 'ai-usage',  loadComponent: () => import('./super-admin-ai-usage.component').then(m => m.SuperAdminAiUsageComponent) },
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' }
    ]
  }
];
