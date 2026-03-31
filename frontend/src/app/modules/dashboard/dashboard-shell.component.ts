import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SidebarComponent } from '../../shared/components/shell/sidebar.component';

@Component({
  selector: 'app-dashboard-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent],
  template: `
    <div class="app-layout">
      <app-sidebar />
      <main class="app-main">
        <router-outlet />
      </main>
    </div>
  `,
  styles: [`
    .app-layout { display: flex; min-height: 100vh; }
    .app-main {
      flex: 1;
      margin-inline-start: var(--sidebar-w);
      padding: 1.75rem;
      overflow-x: hidden;
    }
    @media (max-width: 768px) {
      .app-main { margin-inline-start: 0; padding: 1rem; }
    }
  `]
})
export class DashboardShellComponent {}
