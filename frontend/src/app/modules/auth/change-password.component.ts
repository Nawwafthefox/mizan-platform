import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-change-password',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="login-wrap">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <span class="logo-en">MIZAN</span>
            <span class="logo-ar">ميزان</span>
          </div>
          <h2>تغيير كلمة المرور</h2>
          <p>يجب عليك تغيير كلمة المرور قبل المتابعة</p>
        </div>

        @if (error()) { <div class="alert alert--error">{{ error() }}</div> }
        @if (success()) { <div class="alert alert--success">تم تغيير كلمة المرور بنجاح</div> }

        <form (ngSubmit)="submit()" #f="ngForm" class="login-form">
          <div class="form-group">
            <label>كلمة المرور الحالية</label>
            <input class="form-control" type="password"
              [(ngModel)]="form.old" name="old" required dir="ltr">
          </div>
          <div class="form-group">
            <label>كلمة المرور الجديدة</label>
            <input class="form-control" type="password"
              [(ngModel)]="form.new1" name="new1" required minlength="8" dir="ltr"
              (input)="checkStrength()">
            <div class="strength-bar">
              <div class="strength-fill" [style.width]="strength() + '%'"
                [style.background]="strengthColor()"></div>
            </div>
            <small [style.color]="strengthColor()">{{ strengthLabel() }}</small>
          </div>
          <div class="form-group">
            <label>تأكيد كلمة المرور</label>
            <input class="form-control" type="password"
              [(ngModel)]="form.new2" name="new2" required dir="ltr">
          </div>
          <button type="submit" class="btn btn--primary btn--lg w-full"
            [disabled]="loading() || form.new1 !== form.new2 || form.new1.length < 8">
            @if (loading()) { <span class="spinner"></span> }
            تغيير كلمة المرور
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .login-wrap {
      min-height: 100vh;
      background: linear-gradient(135deg, var(--mizan-green-dark) 0%, var(--mizan-green) 60%, #1b5e3b 100%);
      display: flex; align-items: center; justify-content: center; padding: 1rem;
    }
    .login-card {
      background: var(--mizan-surface); border-radius: 14px; padding: 2.5rem 2rem;
      width: 100%; max-width: 400px; box-shadow: var(--shadow-lg);
      display: flex; flex-direction: column; gap: 1.5rem;
    }
    .login-header { text-align: center; }
    .login-logo { display: flex; align-items: baseline; justify-content: center; gap: .5rem; margin-bottom: .5rem; }
    .logo-en { font-size: 1.6rem; font-weight: 800; color: var(--mizan-green-dark); letter-spacing: .12em; }
    .logo-ar { font-size: .9rem; color: var(--mizan-text-muted); }
    h2 { font-size: 1.1rem; font-weight: 700; color: var(--mizan-green-dark); }
    .login-header p { font-size: .82rem; color: var(--mizan-text-muted); }
    .login-form { display: flex; flex-direction: column; gap: 1rem; }
    .strength-bar { height: 4px; background: var(--mizan-border); border-radius: 2px; margin-top: .3rem; overflow: hidden; }
    .strength-fill { height: 100%; transition: width .3s, background .3s; }
  `]
})
export class ChangePasswordComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  form = { old: '', new1: '', new2: '' };
  loading = signal(false);
  error = signal('');
  success = signal(false);
  strength = signal(0);

  checkStrength(): void {
    const p = this.form.new1;
    let s = 0;
    if (p.length >= 8) s += 25;
    if (/[A-Z]/.test(p)) s += 25;
    if (/[0-9]/.test(p)) s += 25;
    if (/[^A-Za-z0-9]/.test(p)) s += 25;
    this.strength.set(s);
  }

  strengthColor(): string {
    const s = this.strength();
    if (s <= 25) return '#dc3545';
    if (s <= 50) return '#ffc107';
    if (s <= 75) return '#17a2b8';
    return '#28a745';
  }

  strengthLabel(): string {
    const s = this.strength();
    if (s <= 25) return 'ضعيفة جداً';
    if (s <= 50) return 'ضعيفة';
    if (s <= 75) return 'متوسطة';
    return 'قوية';
  }

  submit(): void {
    if (this.form.new1 !== this.form.new2) { this.error.set('كلمتا المرور غير متطابقتين'); return; }
    this.loading.set(true);
    this.error.set('');
    this.auth.changePassword(this.form.old, this.form.new1).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
        setTimeout(() => {
          const role = this.auth.currentUser?.role;
          if (role === 'SUPER_ADMIN') this.router.navigate(['/super-admin/dashboard']);
          else this.router.navigate(['/dashboard']);
        }, 1500);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'فشل تغيير كلمة المرور');
      }
    });
  }
}
