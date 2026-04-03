import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./modules/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
  // Redirect old /dashboard/* pages to V3 equivalents — data is in V3 collections only
  { path: 'dashboard',            redirectTo: '/v3/overview',    pathMatch: 'full' },
  { path: 'dashboard/overview',   redirectTo: '/v3/overview',    pathMatch: 'full' },
  { path: 'dashboard/branches',   redirectTo: '/v3/branches',   pathMatch: 'full' },
  { path: 'dashboard/regions',    redirectTo: '/v3/regions',    pathMatch: 'full' },
  { path: 'dashboard/employees',  redirectTo: '/v3/employees',  pathMatch: 'full' },
  { path: 'dashboard/karat',      redirectTo: '/v3/karat',      pathMatch: 'full' },
  { path: 'dashboard/mothan',     redirectTo: '/v3/mothan',     pathMatch: 'full' },
  { path: 'dashboard/heatmap',    redirectTo: '/v3/heatmap',    pathMatch: 'full' },
  { path: 'dashboard/comparison', redirectTo: '/v3/comparison', pathMatch: 'full' },
  { path: 'dashboard/targets',    redirectTo: '/v3/targets',    pathMatch: 'full' },
  // Old-only pages (no V3 equivalent) still load the old dashboard module
  {
    path: 'dashboard',
    loadChildren: () => import('./modules/dashboard/dashboard.routes').then(m => m.DASHBOARD_ROUTES)
  },
  {
    path: 'upload',
    loadChildren: () => import('./modules/upload/upload.routes').then(m => m.UPLOAD_ROUTES)
  },
  {
    path: 'users',
    loadChildren: () => import('./modules/users/users.routes').then(m => m.USERS_ROUTES)
  },
  {
    path: 'super-admin',
    loadChildren: () => import('./modules/super-admin/super-admin.routes').then(m => m.SUPER_ADMIN_ROUTES)
  },
  {
    path: 'v3',
    loadChildren: () => import('./modules/dashboard-v3/dashboard-v3.routes').then(m => m.DASHBOARD_V3_ROUTES)
  },
  { path: '', redirectTo: '/auth/login', pathMatch: 'full' },
  { path: '**', redirectTo: '/auth/login' }
];
