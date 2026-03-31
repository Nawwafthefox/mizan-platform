import { Routes } from '@angular/router';
import { LoginComponent } from './login.component';
import { noAuthGuard } from '../../core/guards/auth.guard';

export const AUTH_ROUTES: Routes = [
  { path: 'login', component: LoginComponent, canActivate: [noAuthGuard] },
  {
    path: 'change-password',
    loadComponent: () => import('./change-password.component').then(m => m.ChangePasswordComponent)
  },
  { path: '', redirectTo: 'login', pathMatch: 'full' }
];
