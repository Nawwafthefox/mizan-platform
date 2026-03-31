import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { I18nService } from '../../core/services/i18n.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrap" [attr.dir]="i18n.lang()">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <span class="logo-en">MIZAN</span>
            <span class="logo-ar">ميزان</span>
            <div class="lang-toggle login-lang" (click)="i18n.toggle()">
              <span [class.active]="i18n.isAr()">AR</span>
              <span [class.active]="!i18n.isAr()">EN</span>
            </div>
          </div>
          <p>{{ i18n.isAr() ? 'منصة تحليلات الذهب' : 'Gold Analytics Platform' }}</p>
        </div>

        @if (error()) {
          <div class="alert alert--error">{{ error() }}</div>
        }

        <form (ngSubmit)="login()" #f="ngForm" class="login-form">
          <div class="form-group">
            <label>{{ i18n.isAr() ? 'البريد الإلكتروني / اسم المستخدم' : 'Email / Username' }}</label>
            <input class="form-control" type="text"
              [(ngModel)]="creds.usernameOrEmail" name="user"
              placeholder="admin@example.com" required autocomplete="username" dir="ltr">
          </div>
          <div class="form-group">
            <label>{{ i18n.isAr() ? 'كلمة المرور' : 'Password' }}</label>
            <div class="pw-wrap">
              <input class="form-control" [type]="showPw() ? 'text' : 'password'"
                [(ngModel)]="creds.password" name="pw"
                placeholder="••••••••" required autocomplete="current-password" dir="ltr">
              <button type="button" class="pw-toggle" (click)="showPw.set(!showPw())">
                {{ showPw() ? '🙈' : '👁' }}
              </button>
            </div>
          </div>
          <button type="submit" class="btn btn--primary btn--lg w-full"
            [disabled]="loading() || !f.valid">
            @if (loading()) { <span class="spinner"></span> }
            {{ i18n.isAr() ? 'دخول' : 'Sign In' }}
          </button>
        </form>

        <p class="footer-note">MIZAN | ميزان &copy; {{ year }}</p>
      </div>
    </div>
  `,
  styles: [`
    .login-wrap {
      min-height: 100vh;
      background: linear-gradient(135deg, var(--mizan-green-dark) 0%, var(--mizan-green) 60%, #1b5e3b 100%);
      display: flex; align-items: center; justify-content: center;
      padding: 1rem;
    }
    .login-card {
      background: var(--mizan-surface);
      border-radius: 14px;
      padding: 2.5rem 2rem;
      width: 100%; max-width: 400px;
      box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column; gap: 1.5rem;
    }
    .login-header { text-align: center; }
    .login-logo { display: flex; align-items: center; justify-content: center; gap: .5rem; margin-bottom: .5rem; flex-wrap: wrap; }
    .login-lang { margin-inline-start: .5rem; }
    .logo-en { font-size: 2rem; font-weight: 800; color: var(--mizan-green-dark); letter-spacing: .12em; }
    .logo-ar { font-size: 1rem; color: var(--mizan-text-muted); }
    .login-header p { font-size: .85rem; color: var(--mizan-text-muted); }
    .login-form { display: flex; flex-direction: column; gap: 1rem; }
    .pw-wrap { position: relative; }
    .pw-wrap .form-control { padding-inline-end: 2.5rem; }
    .pw-toggle {
      position: absolute; top: 50%; transform: translateY(-50%);
      inset-inline-end: .6rem;
      background: none; border: none; font-size: .9rem; color: var(--mizan-text-muted);
    }
    .footer-note { text-align: center; font-size: .75rem; color: var(--mizan-text-muted); }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  i18n = inject(I18nService);

  creds = { usernameOrEmail: '', password: '' };
  loading = signal(false);
  error = signal('');
  showPw = signal(false);
  year = new Date().getFullYear();

  login(): void {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.creds.usernameOrEmail, this.creds.password).subscribe({
      next: res => {
        this.loading.set(false);
        if (res.success && res.data) {
          const user = res.data.user;
          if (user.mustChangePassword) {
            this.router.navigate(['/auth/change-password']);
            return;
          }
          if (user.role === 'SUPER_ADMIN') {
            this.router.navigate(['/super-admin/dashboard']);
          } else {
            this.router.navigate(['/dashboard']);
          }
        } else {
          this.error.set(res.message || 'فشل تسجيل الدخول');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'بيانات غير صحيحة');
      }
    });
  }
}
