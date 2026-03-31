import { Routes } from '@angular/router';
import { DashboardShellComponent } from './dashboard-shell.component';
import { authGuard } from '../../core/guards/auth.guard';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      { path: 'overview',      loadComponent: () => import('./pages/overview.component').then(m => m.OverviewComponent) },
      { path: 'branches',      loadComponent: () => import('./pages/branches.component').then(m => m.BranchesComponent) },
      { path: 'employees',     loadComponent: () => import('./pages/employees.component').then(m => m.EmployeesComponent) },
      { path: 'karat',         loadComponent: () => import('./pages/karat.component').then(m => m.KaratComponent) },
      { path: 'mothan',        loadComponent: () => import('./pages/mothan.component').then(m => m.MothanComponent) },
      { path: 'regions',       loadComponent: () => import('./pages/regions.component').then(m => m.RegionsComponent) },
      { path: 'heatmap',       loadComponent: () => import('./pages/heatmap.component').then(m => m.HeatmapComponent) },
      { path: 'comparison',    loadComponent: () => import('./pages/comparison.component').then(m => m.ComparisonComponent) },
      { path: 'my-performance',loadComponent: () => import('./pages/my-performance.component').then(m => m.MyPerformanceComponent) },
      { path: 'rates',         loadComponent: () => import('./pages/rates.component').then(m => m.RatesComponent) },
    ]
  }
];
