import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadChildren: () => import('./modules/auth/auth.routes').then(m => m.AUTH_ROUTES)
  },
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
