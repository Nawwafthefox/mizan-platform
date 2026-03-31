import { Routes } from '@angular/router';
import { DashboardShellComponent } from './dashboard-shell.component';
import { authGuard } from '../../core/guards/auth.guard';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    component: DashboardShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/overview.component').then(m => m.OverviewComponent) },
      { path: 'branches',  loadComponent: () => import('./pages/branches.component').then(m => m.BranchesComponent) },
      { path: 'employees', loadComponent: () => import('./pages/employees.component').then(m => m.EmployeesComponent) },
      { path: 'karat',     loadComponent: () => import('./pages/karat.component').then(m => m.KaratComponent) },
      { path: 'mothan',    loadComponent: () => import('./pages/mothan.component').then(m => m.MothanComponent) },
      { path: 'rates',     loadComponent: () => import('./pages/rates.component').then(m => m.RatesComponent) },
    ]
  }
];
