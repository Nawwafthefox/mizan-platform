import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopnavComponent } from '../../shared/components/shell/topnav.component';

@Component({
  selector: 'app-super-admin-shell',
  standalone: true,
  imports: [RouterOutlet, TopnavComponent],
  template: `
    <app-topnav />
    <main class="app-main">
      <router-outlet />
    </main>
  `,
  styles: [`
    :host { display: block; }
    .app-main {
      padding-top: calc(var(--mz-nav-h, 56px) + 1.75rem);
      padding-inline: 1.75rem;
      padding-bottom: 2rem;
      min-height: 100vh;
    }
    @media (max-width: 768px) {
      .app-main {
        padding-top: calc(var(--mz-nav-h, 56px) + 1rem);
        padding-inline: 1rem;
      }
    }
  `]
})
export class SuperAdminShellComponent {}
