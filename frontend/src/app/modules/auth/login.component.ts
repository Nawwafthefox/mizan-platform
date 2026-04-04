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
        <div class="brand-mesh"></div>
        <div class="brand-particles">
          <span class="particle p1"></span>
          <span class="particle p2"></span>
          <span class="particle p3"></span>
          <span class="particle p4"></span>
          <span class="particle p5"></span>
          <span class="particle p6"></span>
          <span class="particle p7"></span>
          <span class="particle p8"></span>
        </div>

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
          <div class="deco-rings">
            <svg class="deco-svg" viewBox="0 0 300 300" fill="none">
              <circle cx="150" cy="150" r="120" stroke="rgba(201,168,76,0.07)" stroke-width="1"/>
              <circle cx="150" cy="150" r="90"  stroke="rgba(201,168,76,0.11)" stroke-width="1"/>
              <circle cx="150" cy="150" r="60"  stroke="rgba(201,168,76,0.17)" stroke-width="1.5"/>
              <circle cx="150" cy="150" r="30"  fill="rgba(201,168,76,0.05)"   stroke="rgba(201,168,76,0.22)" stroke-width="1.5"/>
              <path d="M150 30 A120 120 0 0 1 270 150" stroke="rgba(201,168,76,0.4)" stroke-width="2" stroke-linecap="round"/>
              <path d="M150 60 A90 90 0 0 0 60 150"    stroke="rgba(201,168,76,0.22)" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </div>
        </div>

        <p class="brand-footer">MIZAN &copy; {{ year }}</p>
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
            <div class="login-error" [class.shake]="error()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {{ error() }}
            </div>
          }

          <form (ngSubmit)="login()" #f="ngForm" class="login-form">

            <div class="field-group">
              <label class="field-label" for="loginUser">
                {{ i18n.isAr() ? 'البريد الإلكتروني / اسم المستخدم' : 'Email / Username' }}
              </label>
              <div class="field-wrap">
                <svg class="field-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <input
                  id="loginUser"
                  class="field-input"
                  type="text"
                  [(ngModel)]="creds.usernameOrEmail"
                  name="user"
                  placeholder="admin@example.com"
                  required
                  autocomplete="username"
                  dir="ltr"
                >
                <span class="field-line"></span>
              </div>
            </div>

            <div class="field-group">
              <label class="field-label" for="loginPw">
                {{ i18n.isAr() ? 'كلمة المرور' : 'Password' }}
              </label>
              <div class="field-wrap">
                <svg class="field-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <input
                  id="loginPw"
                  class="field-input"
                  [type]="showPw() ? 'text' : 'password'"
                  [(ngModel)]="creds.password"
                  name="pw"
                  placeholder="••••••••"
                  required
                  autocomplete="current-password"
                  dir="ltr"
                >
                <button type="button" class="pw-toggle" (click)="showPw.set(!showPw())" [attr.aria-label]="showPw() ? 'Hide password' : 'Show password'">
                  @if (showPw()) {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  } @else {
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  }
                </button>
                <span class="field-line"></span>
              </div>
            </div>

            <button
              type="submit"
              class="submit-btn"
              [disabled]="loading() || !f.valid"
            >
              @if (loading()) {
                <span class="spinner"></span>
                <span>{{ i18n.isAr() ? 'جارٍ الدخول...' : 'Signing in...' }}</span>
              } @else {
                <span>{{ i18n.isAr() ? 'دخول' : 'Sign In' }}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                  <line x1="5" y1="12" x2="19" y2="12"/>
                  <polyline points="12 5 19 12 12 19"/>
                </svg>
              }
              <span class="submit-shine"></span>
            </button>

          </form>

        </div>
      </div>
    </div>
  `,
  styles: [`
    /* ── Wrap ── */
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

    /* Animated gradient mesh */
    .brand-mesh {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 60% at 20% 30%, rgba(201,168,76,0.07) 0%, transparent 60%),
        radial-gradient(ellipse 60% 80% at 80% 70%, rgba(52,211,153,0.04) 0%, transparent 55%),
        radial-gradient(ellipse 50% 50% at 50% 50%, rgba(201,168,76,0.04) 0%, transparent 70%);
      background-size: 200% 200%;
      animation: meshMove 10s cubic-bezier(0.4,0,0.6,1) infinite alternate;
      pointer-events: none;
    }

    @keyframes meshMove {
      0%   { background-position: 0% 0%, 100% 100%, 50% 50%; }
      50%  { background-position: 50% 80%, 20% 30%, 80% 20%; }
      100% { background-position: 100% 50%, 0% 60%, 20% 80%; }
    }

    /* Gold particles */
    .brand-particles {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }

    .particle {
      position: absolute;
      width: 3px;
      height: 3px;
      background: rgba(201,168,76,0.6);
      border-radius: 50%;
      animation: particleFloat 8s ease-in-out infinite;
    }
    .p1 { top: 15%; left: 20%; width: 2px; height: 2px; animation-delay: 0s; animation-duration: 7s; }
    .p2 { top: 35%; left: 75%; width: 3px; height: 3px; animation-delay: -2s; animation-duration: 9s; }
    .p3 { top: 60%; left: 12%; width: 2px; height: 2px; animation-delay: -4s; animation-duration: 6s; }
    .p4 { top: 75%; left: 55%; width: 4px; height: 4px; animation-delay: -1s; animation-duration: 11s; opacity: 0.4; }
    .p5 { top: 25%; left: 45%; width: 2px; height: 2px; animation-delay: -3s; animation-duration: 8s; }
    .p6 { top: 85%; left: 30%; width: 3px; height: 3px; animation-delay: -5s; animation-duration: 7s; opacity: 0.35; }
    .p7 { top: 50%; left: 85%; width: 2px; height: 2px; animation-delay: -6s; animation-duration: 10s; }
    .p8 { top: 10%; left: 60%; width: 3px; height: 3px; animation-delay: -2.5s; animation-duration: 8s; opacity: 0.45; }

    @keyframes particleFloat {
      0%, 100% { transform: translateY(0px) translateX(0px); opacity: 0.6; }
      25%       { transform: translateY(-12px) translateX(4px); opacity: 1; }
      50%       { transform: translateY(-6px) translateX(-6px); opacity: 0.4; }
      75%       { transform: translateY(-18px) translateX(2px); opacity: 0.8; }
    }

    .brand-inner {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 1.5rem;
      position: relative;
      z-index: 1;
    }
    .brand-logo {
      display: flex; align-items: center; gap: .75rem;
    }
    .brand-mark {
      width: 52px; height: 52px;
      background: linear-gradient(135deg, #c9a84c 0%, #e3c76a 100%);
      color: #0b1a12;
      border-radius: 14px;
      display: flex; align-items: center; justify-content: center;
      font-weight: 900; font-size: 1.7rem;
      letter-spacing: -.02em;
      flex-shrink: 0;
      box-shadow: 0 4px 24px rgba(201,168,76,0.35), 0 0 0 1px rgba(201,168,76,0.3);
      transition: transform 250ms cubic-bezier(0.34, 1.56, 0.64, 1);
      &:hover { transform: scale(1.05); }
    }
    .brand-text {
      display: flex; flex-direction: column; gap: .1rem;
    }
    .brand-en {
      font-size: 1.9rem; font-weight: 800;
      color: #c9a84c; letter-spacing: .12em; line-height: 1;
    }
    .brand-ar {
      font-size: .9rem; color: rgba(242,237,228,.4); line-height: 1;
    }
    .brand-tagline {
      font-size: 1.05rem; font-weight: 600;
      color: rgba(242,237,228,.85); line-height: 1.5;
    }
    .brand-sub {
      font-size: .82rem; color: rgba(242,237,228,.35); letter-spacing: .03em;
    }

    .deco-rings {
      position: absolute;
      inset-inline-end: -70px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
    }
    .deco-svg {
      width: 330px; height: 330px;
      animation: ringRotate 30s linear infinite;
    }
    @keyframes ringRotate {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    .brand-footer {
      font-size: .72rem; color: rgba(242,237,228,.2);
      position: relative; z-index: 1;
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
      background: rgba(27, 52, 39, 0.7);
      border: 1px solid rgba(201,168,76,0.16);
      border-radius: 16px;
      padding: 2rem;
      display: flex; flex-direction: column; gap: 1.5rem;
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      box-shadow: 0 8px 48px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.08);
      animation: fadeInUp 350ms cubic-bezier(0.22,1,0.36,1);
    }

    .login-header {
      display: flex; flex-direction: column; gap: .4rem;
    }
    .login-lang {
      display: flex; justify-content: flex-end; margin-bottom: .5rem;
    }
    .login-header h2 {
      font-size: 1.45rem; font-weight: 800; color: #f2ede4;
      letter-spacing: -0.3px;
    }
    .login-header p {
      font-size: .85rem; color: rgba(242,237,228,.4);
    }

    /* Error */
    .login-error {
      display: flex; align-items: center; gap: .5rem;
      padding: .75rem 1rem;
      background: rgba(248,113,113,.1);
      border: 1px solid rgba(248,113,113,.25);
      border-radius: 8px;
      font-size: .85rem;
      color: #f87171;
      animation: slideInDown 250ms cubic-bezier(0.22,1,0.36,1);
    }
    .login-error.shake {
      animation: slideInDown 250ms cubic-bezier(0.22,1,0.36,1),
                 shakeX 400ms cubic-bezier(0.36,0.07,0.19,0.97) 250ms;
    }

    @keyframes slideInDown {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    @keyframes shakeX {
      0%, 100% { transform: translateX(0); }
      20%       { transform: translateX(-6px); }
      40%       { transform: translateX(6px); }
      60%       { transform: translateX(-4px); }
      80%       { transform: translateX(4px); }
    }
    @keyframes fadeInUp {
      from { opacity: 0; transform: translateY(12px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    /* ── Form ── */
    .login-form {
      display: flex; flex-direction: column; gap: 1.25rem;
    }

    .field-group {
      display: flex; flex-direction: column; gap: .45rem;
    }
    .field-label {
      font-size: 11px; font-weight: 700;
      color: rgba(242,237,228,.5);
      text-transform: uppercase; letter-spacing: .06em;
    }
    .field-wrap {
      position: relative;
    }
    .field-icon {
      position: absolute;
      inset-block: 50%;
      transform: translateY(-50%);
      inset-inline-start: .85rem;
      color: rgba(242,237,228,.3);
      pointer-events: none;
      transition: color 200ms ease;
    }
    .field-input {
      width: 100%;
      padding: .7rem .9rem .7rem 2.4rem;
      background: rgba(255,255,255,.04);
      border: 1.5px solid rgba(43,74,56,0.8);
      border-radius: 10px;
      font-size: .9rem;
      color: #f2ede4;
      transition: border-color 220ms cubic-bezier(0.22,1,0.36,1),
                  background 220ms cubic-bezier(0.22,1,0.36,1),
                  box-shadow 220ms cubic-bezier(0.22,1,0.36,1);
      font-family: inherit;

      &::placeholder { color: rgba(242,237,228,.22); }

      &:focus {
        outline: none;
        background: rgba(255,255,255,.06);
        border-color: rgba(201,168,76,0.5);
        box-shadow: 0 0 0 3px rgba(201,168,76,0.1);
      }

      &:focus + .pw-toggle + .field-line,
      &:focus + .field-line {
        transform: scaleX(1);
      }
    }

    /* Animated underline */
    .field-line {
      position: absolute;
      bottom: 0;
      inset-inline-start: 12%;
      width: 76%;
      height: 2px;
      background: linear-gradient(90deg, var(--mz-gold, #c9a84c), var(--mz-gold-2, #e3c76a));
      border-radius: 1px;
      transform: scaleX(0);
      transform-origin: center;
      transition: transform 280ms cubic-bezier(0.22,1,0.36,1);
      pointer-events: none;
    }

    /* Focus-within for field group shows underline */
    .field-wrap:focus-within .field-line { transform: scaleX(1); }
    .field-wrap:focus-within .field-icon { color: rgba(201,168,76,0.7); }

    /* Password toggle */
    .pw-toggle {
      position: absolute;
      top: 50%; transform: translateY(-50%);
      inset-inline-end: .65rem;
      background: none; border: none;
      color: rgba(242,237,228,.3);
      cursor: pointer;
      display: flex; align-items: center;
      padding: .2rem;
      border-radius: 4px;
      transition: color 180ms ease, background 180ms ease;

      &:hover {
        color: rgba(201,168,76,0.8);
        background: rgba(201,168,76,0.08);
      }
    }

    /* Submit button */
    .submit-btn {
      position: relative;
      display: flex; align-items: center; justify-content: center; gap: .5rem;
      width: 100%;
      padding: .8rem 1.5rem;
      background: linear-gradient(135deg, #c9a84c 0%, #e3c76a 100%);
      color: #0b1a12;
      border: none;
      border-radius: 10px;
      font-size: .9rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      cursor: pointer;
      overflow: hidden;
      transition: transform 220ms cubic-bezier(0.22,1,0.36,1),
                  box-shadow 220ms cubic-bezier(0.22,1,0.36,1),
                  opacity 200ms ease;
      margin-top: .25rem;

      .submit-shine {
        position: absolute;
        top: 0; left: -100%;
        width: 55%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent);
        transform: skewX(-18deg);
        transition: none;
        pointer-events: none;
      }

      &:hover:not(:disabled) {
        transform: translateY(-2px) scale(1.01);
        box-shadow: 0 6px 24px rgba(201,168,76,0.45), 0 0 0 1px rgba(201,168,76,0.4);
        .submit-shine {
          left: 150%;
          transition: left 500ms cubic-bezier(0.22,1,0.36,1);
        }
      }

      &:active:not(:disabled) {
        transform: translateY(0) scale(0.99);
        box-shadow: 0 2px 8px rgba(201,168,76,0.3);
      }

      &:disabled {
        opacity: .45;
        cursor: not-allowed;
        transform: none;
      }
    }

    /* Mobile */
    @media (max-width: 768px) {
      .brand-panel { display: none; }
      .form-panel {
        background: #0b1a12;
        padding: 1.25rem;
      }
      .login-card {
        background: rgba(27,52,39,0.8);
        border-color: rgba(201,168,76,0.12);
      }
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
            this.router.navigate(['/v3']);
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
