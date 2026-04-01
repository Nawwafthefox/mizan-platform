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

      <!-- Brand panel (hidden on mobile) -->
      <div class="brand-panel" dir="ltr">
        <div class="brand-inner">
          <div class="brand-logo">
            <div class="brand-mark">M</div>
            <div class="brand-text">
              <span class="brand-en">MIZAN</span>
              <span class="brand-ar">ميزان</span>
            </div>
          </div>
          <p class="brand-tagline">
            {{ i18n.isAr()
              ? 'المنصة الذكية لتحليل بيانات الذهب'
              : 'Intelligent Gold Analytics Platform' }}
          </p>
          <p class="brand-sub">
            {{ i18n.isAr()
              ? 'بيانات دقيقة · رؤى استراتيجية · قرارات أفضل'
              : 'Accurate data · Strategic insights · Better decisions' }}
          </p>

          <!-- Decorative rings -->
          <svg class="deco-svg" viewBox="0 0 300 300" fill="none">
            <circle cx="150" cy="150" r="120" stroke="rgba(201,168,76,0.08)" stroke-width="1"/>
            <circle cx="150" cy="150" r="90"  stroke="rgba(201,168,76,0.12)" stroke-width="1"/>
            <circle cx="150" cy="150" r="60"  stroke="rgba(201,168,76,0.18)" stroke-width="1.5"/>
            <circle cx="150" cy="150" r="30"  fill="rgba(201,168,76,0.06)"   stroke="rgba(201,168,76,0.22)" stroke-width="1.5"/>
            <path d="M150 30 A120 120 0 0 1 270 150" stroke="rgba(201,168,76,0.35)" stroke-width="2" stroke-linecap="round"/>
            <path d="M150 60 A90 90 0 0 0 60 150"    stroke="rgba(201,168,76,0.20)" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </div>

        <p class="brand-footer">MIZAN © {{ year }}</p>
      </div>

      <!-- Form panel -->
      <div class="form-panel">
        <div class="login-card">

          <!-- Header -->
          <div class="login-header">
            <div class="login-lang">
              <div class="lang-toggle lang-toggle--light" (click)="i18n.toggle()">
                <span [class.active]="i18n.isAr()">AR</span>
                <span [class.active]="!i18n.isAr()">EN</span>
              </div>
            </div>
            <h2>{{ i18n.isAr() ? 'تسجيل الدخول' : 'Sign In' }}</h2>
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
                placeholder="admin@example.com" required
                autocomplete="username" dir="ltr">
            </div>
            <div class="form-group">
              <label>{{ i18n.isAr() ? 'كلمة المرور' : 'Password' }}</label>
              <div class="pw-wrap">
                <input class="form-control" [type]="showPw() ? 'text' : 'password'"
                  [(ngModel)]="creds.password" name="pw"
                  placeholder="••••••••" required
                  autocomplete="current-password" dir="ltr">
                <button type="button" class="pw-toggle" (click)="showPw.set(!showPw())">
                  {{ showPw() ? '🙈' : '👁' }}
                </button>
              </div>
            </div>
            <button type="submit" class="btn btn--gold btn--lg w-full"
              [disabled]="loading() || !f.valid">
              @if (loading()) { <span class="spinner"></span> }
              {{ i18n.isAr() ? 'دخول' : 'Sign In' }}
            </button>
          </form>

        </div>
      </div>
    </div>
  `,
  styles: [`
    .login-wrap {
      min-height: 100vh;
      display: flex;
    }

    /* ── Brand panel ── */
    .brand-panel {
      flex: 0 0 42%;
      background: #0b1a12;
      border-inline-end: 1px solid rgba(201,168,76,.14);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 2.5rem;
      position: relative;
      overflow: hidden;
    }
    .brand-inner {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.5rem;
    }
    .brand-logo {
      display: flex; align-items: center; gap: .75rem;
    }
    .brand-mark {
      width: 48px; height: 48px;
      background: #c9a84c;
      color: #0b1a12;
      border-radius: 13px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 1.6rem;
      letter-spacing: -.02em;
      flex-shrink: 0;
    }
    .brand-text {
      display: flex; flex-direction: column; gap: .1rem;
    }
    .brand-en {
      font-size: 1.8rem; font-weight: 800;
      color: #c9a84c; letter-spacing: .1em; line-height: 1;
    }
    .brand-ar {
      font-size: .9rem; color: rgba(242,237,228,.45); line-height: 1;
    }
    .brand-tagline {
      font-size: 1.05rem; font-weight: 600;
      color: rgba(242,237,228,.85);
      line-height: 1.5;
    }
    .brand-sub {
      font-size: .82rem;
      color: rgba(242,237,228,.38);
      letter-spacing: .03em;
    }
    .deco-svg {
      position: absolute;
      inset-inline-end: -60px; top: 50%;
      transform: translateY(-50%);
      width: 320px; height: 320px;
      pointer-events: none;
    }
    .brand-footer {
      font-size: .72rem; color: rgba(242,237,228,.22);
    }

    /* ── Form panel ── */
    .form-panel {
      flex: 1;
      background: #142a1e;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .login-card {
      width: 100%; max-width: 400px;
      display: flex; flex-direction: column; gap: 1.5rem;
    }
    .login-header {
      display: flex; flex-direction: column; gap: .4rem;
    }
    .login-lang {
      display: flex; justify-content: flex-end; margin-bottom: .5rem;
    }
    .login-header h2 {
      font-size: 1.4rem; font-weight: 800; color: #f2ede4;
    }
    .login-header p {
      font-size: .85rem; color: rgba(242,237,228,.45);
    }
    .login-form { display: flex; flex-direction: column; gap: 1rem; }
    .pw-wrap { position: relative; }
    .pw-wrap .form-control { padding-inline-end: 2.5rem; }
    .pw-toggle {
      position: absolute; top: 50%; transform: translateY(-50%);
      inset-inline-end: .6rem;
      background: none; border: none; font-size: .9rem;
      color: rgba(242,237,228,.4); cursor: pointer;
    }

    @media (max-width: 768px) {
      .brand-panel { display: none; }
      .form-panel { background: #0b1a12; }
    }
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
