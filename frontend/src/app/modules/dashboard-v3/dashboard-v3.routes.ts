import { Routes } from '@angular/router';
import { DashboardV3ShellComponent } from './dashboard-v3-shell.component';
import { authGuard } from '../../core/guards/auth.guard';

export const DASHBOARD_V3_ROUTES: Routes = [
  {
    path: '',
    component: DashboardV3ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'overview', pathMatch: 'full' },
      {
        path: 'overview',
        loadComponent: () =>
          import('./pages/v3-overview.component').then(m => m.V3OverviewComponent)
      },
      {
        path: 'alerts',
        loadComponent: () =>
          import('./pages/v3-alerts.component').then(m => m.V3AlertsComponent)
      },
      {
        path: 'branches',
        loadComponent: () =>
          import('./pages/v3-branches.component').then(m => m.V3BranchesComponent)
      },
      {
        path: 'regions',
        loadComponent: () =>
          import('./pages/v3-regions.component').then(m => m.V3RegionsComponent)
      },
      {
        path: 'employees',
        loadComponent: () =>
          import('./pages/v3-employees.component').then(m => m.V3EmployeesComponent)
      },
      {
        path: 'karat',
        loadComponent: () =>
          import('./pages/v3-karat.component').then(m => m.V3KaratComponent)
      },
      {
        path: 'mothan',
        loadComponent: () =>
          import('./pages/v3-mothan.component').then(m => m.V3MothanComponent)
      },
      {
        path: 'heatmap',
        loadComponent: () =>
          import('./pages/v3-heatmap.component').then(m => m.V3HeatmapComponent)
      },
      {
        path: 'comparison',
        loadComponent: () =>
          import('./pages/v3-comparison.component').then(m => m.V3ComparisonComponent)
      },
      {
        path: 'targets',
        loadComponent: () =>
          import('./pages/v3-targets.component').then(m => m.V3TargetsComponent)
      },
      {
        path: 'premium',
        loadComponent: () =>
          import('./pages/v3-premium.component').then(m => m.V3PremiumComponent)
      },
    ]
  }
];
