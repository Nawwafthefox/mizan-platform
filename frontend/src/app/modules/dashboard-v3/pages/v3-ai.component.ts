import {
  Component, OnDestroy, AfterViewChecked,
  ElementRef, ViewChild,
  inject, signal, effect,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { Subscription } from 'rxjs';
import { V3AIService } from '../services/v3-ai.service';
import { V3DateRangeService } from '../services/v3-date-range.service';

interface ChatMessage {
  role: 'user' | 'ai';
  text?: string;
  data?: any;
  ts: Date;
  isTyping?: boolean;
}

interface AIFeature {
  key: string;
  label: string;
  icon: string;
  description: string;
}

@Component({
  selector: 'app-v3-ai',
  standalone: true,
  imports: [CommonModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; direction: rtl; }

    /* ── Page header ── */
    .ai-header {
      display: flex; align-items: center; gap: 1rem; margin-bottom: 1.75rem;
    }
    .ai-orb-icon {
      font-size: 2.2rem; line-height: 1;
      filter: drop-shadow(0 0 12px rgba(99,179,255,0.55));
      animation: orbFloat 3s ease-in-out infinite;
    }
    @keyframes orbFloat {
      0%,100% { transform: translateY(0); }
      50%      { transform: translateY(-4px); }
    }
    .ai-title-group { flex: 1; }
    .ai-title {
      font-size: 1.35rem; font-weight: 800; margin: 0;
      background: linear-gradient(135deg, #63b3ff 0%, #c9a84c 60%, #f0e68c 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .ai-subtitle {
      font-size: 0.78rem; color: var(--mizan-text-muted); margin-top: 0.2rem;
    }
    .ai-badge {
      font-size: 0.65rem; font-weight: 800; letter-spacing: 0.1em;
      padding: 0.22rem 0.7rem; border-radius: 20px;
      background: linear-gradient(135deg, #1e3a5f, #2a4a7f);
      border: 1px solid rgba(99,179,255,0.35);
      color: #93c5fd;
      animation: badgePulse 2.5s ease-in-out infinite;
    }
    @keyframes badgePulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(99,179,255,0.25); }
      50%      { box-shadow: 0 0 0 4px rgba(99,179,255,0); }
    }

    /* ── Feature selector ── */
    .feature-tabs {
      display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem;
    }
    .feature-tab {
      display: flex; align-items: center; gap: 0.45rem;
      padding: 0.5rem 1rem; border-radius: 24px;
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
      color: var(--mizan-text-muted); font-size: 0.82rem; font-weight: 600;
      cursor: pointer; font-family: inherit; white-space: nowrap;
      transition: all 0.2s;
    }
    .feature-tab:hover {
      background: rgba(99,179,255,0.08); border-color: rgba(99,179,255,0.3);
      color: #93c5fd;
    }
    .feature-tab.active {
      background: linear-gradient(135deg, rgba(30,58,95,0.7), rgba(42,74,127,0.5));
      border-color: rgba(99,179,255,0.5); color: #93c5fd;
      box-shadow: 0 0 0 3px rgba(99,179,255,0.1), inset 0 0 12px rgba(99,179,255,0.06);
    }
    .feature-icon { font-size: 1rem; }

    /* ── Loading state ── */
    .ai-loading {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; gap: 1rem; padding: 4rem 2rem;
    }
    .ai-loading-orb {
      width: 72px; height: 72px; border-radius: 50%;
      background: linear-gradient(135deg, #1e3a5f, #2a4a7f);
      border: 2px solid rgba(99,179,255,0.35);
      display: flex; align-items: center; justify-content: center;
      font-size: 2rem;
      animation: loadPulse 1.5s ease-in-out infinite;
      box-shadow: 0 0 24px rgba(99,179,255,0.2);
    }
    @keyframes loadPulse {
      0%,100% { transform: scale(1); box-shadow: 0 0 24px rgba(99,179,255,0.2); }
      50%      { transform: scale(1.06); box-shadow: 0 0 36px rgba(99,179,255,0.4); }
    }
    .ai-loading-label {
      font-size: 0.9rem; color: var(--mizan-text-muted); font-weight: 600;
    }
    .ai-dots { display: flex; gap: 0.35rem; }
    .ai-dots span {
      width: 7px; height: 7px; border-radius: 50%;
      background: rgba(99,179,255,0.5);
      animation: dotBounce 1.4s ease-in-out infinite;
    }
    .ai-dots span:nth-child(2) { animation-delay: 0.2s; }
    .ai-dots span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes dotBounce {
      0%,80%,100% { transform: scale(0.6); opacity: 0.4; }
      40%          { transform: scale(1); opacity: 1; }
    }

    /* ── Error state ── */
    .ai-error {
      background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.25);
      border-radius: 12px; padding: 1.5rem; text-align: center; color: #ef4444;
    }
    .ai-error-icon { font-size: 2rem; margin-bottom: 0.5rem; }
    .ai-error-retry {
      margin-top: 1rem; padding: 0.45rem 1.25rem;
      background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3);
      color: #ef4444; border-radius: 20px; cursor: pointer; font-family: inherit;
      font-size: 0.82rem; font-weight: 600;
    }
    .ai-error-retry:hover { background: rgba(239,68,68,0.2); }

    /* ── Response card base ── */
    .ai-card {
      background: var(--mizan-surface);
      border: 1px solid rgba(99,179,255,0.15);
      border-radius: 14px; overflow: hidden; margin-bottom: 1.25rem;
      position: relative;
    }
    .ai-card::before {
      content: ''; position: absolute; inset: 0; border-radius: 14px; padding: 1px;
      background: linear-gradient(135deg, rgba(99,179,255,0.3), rgba(201,168,76,0.15), rgba(99,179,255,0.1));
      -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
      -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
    }
    .ai-card-inner { padding: 1.25rem 1.5rem; }
    .ai-card-header {
      display: flex; align-items: center; gap: 0.6rem;
      margin-bottom: 1rem; padding-bottom: 0.75rem;
      border-bottom: 1px solid rgba(99,179,255,0.1);
    }
    .ai-card-icon { font-size: 1.2rem; }
    .ai-card-title {
      font-size: 0.9rem; font-weight: 700;
      background: linear-gradient(135deg, #93c5fd, #c9a84c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }

    /* ── Overview text ── */
    .ai-overview {
      font-size: 0.92rem; line-height: 1.85; color: var(--mizan-text);
      padding: 0.85rem 1.1rem;
      background: linear-gradient(135deg, rgba(99,179,255,0.05), rgba(201,168,76,0.04));
      border-right: 3px solid rgba(99,179,255,0.4); border-radius: 0 10px 10px 0;
      margin-bottom: 1.25rem;
    }

    /* ── Headline / score row ── */
    .headline-row {
      display: flex; align-items: flex-start; gap: 1rem; margin-bottom: 1rem; flex-wrap: wrap;
    }
    .ai-headline {
      flex: 1; font-size: 1.05rem; font-weight: 700; color: var(--mizan-gold);
      line-height: 1.45;
    }
    .score-badge {
      flex-shrink: 0; display: flex; flex-direction: column; align-items: center;
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
      border-radius: 12px; padding: 0.6rem 1rem;
    }
    .score-num {
      font-size: 1.8rem; font-weight: 900; line-height: 1;
      background: linear-gradient(135deg, #93c5fd, #c9a84c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .score-label { font-size: 0.65rem; color: var(--mizan-text-muted); margin-top: 0.15rem; }

    /* ── Sentiment ── */
    .sentiment-bar {
      display: flex; align-items: center; gap: 0.6rem; margin-bottom: 1rem;
      font-size: 0.8rem; color: var(--mizan-text-muted);
    }
    .sentiment-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      box-shadow: 0 0 8px currentColor;
    }
    .sent-positive { background: var(--mizan-green); color: var(--mizan-green); }
    .sent-neutral  { background: #f59e0b; color: #f59e0b; }
    .sent-negative { background: var(--mizan-danger); color: var(--mizan-danger); }

    /* ── Bullet lists ── */
    .bullet-section { margin-bottom: 1.1rem; }
    .bullet-title {
      font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em;
      text-transform: uppercase; color: var(--mizan-text-muted);
      margin-bottom: 0.55rem;
    }
    .bullet-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
    .bullet-item {
      display: flex; align-items: flex-start; gap: 0.5rem;
      font-size: 0.85rem; line-height: 1.55; color: var(--mizan-text);
    }
    .bullet-dot { flex-shrink: 0; margin-top: 0.45rem; width: 6px; height: 6px; border-radius: 50%; }
    .dot-green  { background: var(--mizan-green); }
    .dot-red    { background: var(--mizan-danger); }
    .dot-gold   { background: var(--mizan-gold); }
    .dot-blue   { background: #93c5fd; }

    /* ── People cards (employees / branches) ── */
    .people-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 0.75rem; margin-bottom: 1rem;
    }
    .people-card {
      background: rgba(255,255,255,0.03); border: 1px solid var(--mizan-border);
      border-radius: 10px; padding: 0.85rem 1rem;
    }
    .people-card.star-card  { border-color: rgba(201,168,76,0.3); background: rgba(201,168,76,0.05); }
    .people-card.warn-card  { border-color: rgba(239,68,68,0.25); background: rgba(239,68,68,0.04); }
    .people-card.green-card { border-color: rgba(34,197,94,0.25); background: rgba(34,197,94,0.04); }
    .people-name { font-size: 0.88rem; font-weight: 700; color: var(--mizan-text); margin-bottom: 0.25rem; }
    .people-sub  { font-size: 0.75rem; color: var(--mizan-text-muted); margin-bottom: 0.4rem; }
    .people-note { font-size: 0.8rem; line-height: 1.5; color: var(--mizan-text); }
    .action-badge {
      display: inline-block; font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.55rem;
      border-radius: 12px; margin-bottom: 0.35rem;
    }
    .action-push     { background: rgba(34,197,94,0.15); color: var(--mizan-green); }
    .action-reduce   { background: rgba(239,68,68,0.12); color: var(--mizan-danger); }
    .action-maintain { background: rgba(245,158,11,0.12); color: #f59e0b; }

    /* ── Karat card ── */
    .karat-best-row {
      display: flex; align-items: center; gap: 1rem; padding: 0.85rem 1.1rem;
      background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.25);
      border-radius: 10px; margin-bottom: 1rem;
    }
    .karat-best-label { font-size: 2rem; font-weight: 900; color: var(--mizan-gold); }
    .karat-best-reason { font-size: 0.83rem; line-height: 1.55; color: var(--mizan-text); }

    /* ── Trend direction ── */
    .trend-pills { display: flex; gap: 0.65rem; flex-wrap: wrap; margin-bottom: 1rem; }
    .trend-pill {
      display: flex; align-items: center; gap: 0.4rem; padding: 0.45rem 0.9rem;
      border-radius: 20px; font-size: 0.82rem; font-weight: 600;
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
    }
    .trend-pill-label { font-size: 0.68rem; color: var(--mizan-text-muted); display: block; }
    .trend-pill-value { font-size: 0.85rem; font-weight: 700; color: var(--mizan-text); }
    .trend-up   { border-color: rgba(34,197,94,0.35); background: rgba(34,197,94,0.06); }
    .trend-down { border-color: rgba(239,68,68,0.35); background: rgba(239,68,68,0.06); }
    .trend-stable { border-color: rgba(245,158,11,0.35); background: rgba(245,158,11,0.06); }
    .dir-icon { font-size: 1.1rem; }

    /* ── Regional insight box ── */
    .insight-box {
      font-size: 0.85rem; line-height: 1.75; color: var(--mizan-text);
      padding: 0.75rem 1rem;
      background: rgba(99,179,255,0.04); border-right: 3px solid rgba(99,179,255,0.3);
      border-radius: 0 8px 8px 0; margin-bottom: 1rem;
    }

    /* ── Employee Advisor tables ── */
    .advisor-section { margin-bottom: 1.5rem; }
    .advisor-header {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.65rem 1rem; border-radius: 10px 10px 0 0;
      font-size: 0.82rem; font-weight: 700;
    }
    .adv-training .advisor-header { background: rgba(239,68,68,0.12); border: 1px solid rgba(239,68,68,0.3); border-bottom: none; color: #f87171; }
    .adv-top      .advisor-header { background: rgba(201,168,76,0.12); border: 1px solid rgba(201,168,76,0.3); border-bottom: none; color: var(--mizan-gold); }
    .adv-watch    .advisor-header { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.3); border-bottom: none; color: #f59e0b; }
    .adv-hiring   .advisor-header { background: rgba(99,179,255,0.12); border: 1px solid rgba(99,179,255,0.3); border-bottom: none; color: #93c5fd; }
    .adv-term     .advisor-header { background: rgba(120,10,10,0.4);   border: 1px solid rgba(239,68,68,0.5); border-bottom: none; color: #fca5a5; }
    .advisor-table-wrap { overflow-x: auto; }
    .advisor-table {
      width: 100%; border-collapse: collapse; font-size: 0.8rem;
    }
    .adv-training .advisor-table { border: 1px solid rgba(239,68,68,0.25); border-radius: 0 0 10px 10px; }
    .adv-top      .advisor-table { border: 1px solid rgba(201,168,76,0.25); border-radius: 0 0 10px 10px; }
    .adv-watch    .advisor-table { border: 1px solid rgba(245,158,11,0.25); border-radius: 0 0 10px 10px; }
    .adv-hiring   .advisor-table { border: 1px solid rgba(99,179,255,0.25); border-radius: 0 0 10px 10px; }
    .adv-term     .advisor-table { border: 1px solid rgba(239,68,68,0.4);   border-radius: 0 0 10px 10px; }
    .advisor-table th {
      text-align: right; padding: 0.5rem 0.75rem;
      font-size: 0.71rem; font-weight: 700; letter-spacing: 0.03em;
      color: var(--mizan-text-muted); background: rgba(255,255,255,0.03);
      border-bottom: 1px solid var(--mizan-border); white-space: nowrap;
    }
    .advisor-table td {
      padding: 0.55rem 0.75rem; vertical-align: top;
      border-bottom: 1px solid rgba(255,255,255,0.04); color: var(--mizan-text);
      line-height: 1.5;
    }
    .advisor-table tr:last-child td { border-bottom: none; }
    .advisor-table tr:hover td { background: rgba(255,255,255,0.02); }
    .urgency-badge {
      display: inline-block; font-size: 0.67rem; font-weight: 700;
      padding: 0.12rem 0.5rem; border-radius: 10px; white-space: nowrap;
    }
    .urgency-high   { background: rgba(239,68,68,0.15); color: #f87171; }
    .urgency-medium { background: rgba(245,158,11,0.15); color: #f59e0b; }
    .urgency-low    { background: rgba(34,197,94,0.12);  color: var(--mizan-green); }
    .adv-summary {
      background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.3);
      border-right: 4px solid var(--mizan-gold); border-radius: 0 12px 12px 0;
      padding: 1.1rem 1.35rem; font-size: 0.9rem; line-height: 1.85;
      color: var(--mizan-text);
    }
    .td-name { font-weight: 600; color: var(--mizan-text); }
    .td-muted { color: var(--mizan-text-muted); font-size: 0.78rem; }

    /* ── Branch Strategy (BCG matrix) ── */
    .bcg-matrix {
      display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;
    }
    @media (max-width: 600px) { .bcg-matrix { grid-template-columns: 1fr; } }
    .bcg-quadrant { border-radius: 12px; overflow: hidden; }
    .bcg-quad-header {
      display: flex; align-items: center; gap: 0.55rem;
      padding: 0.65rem 1rem; font-size: 0.82rem; font-weight: 800;
    }
    .bcg-quad-icon { font-size: 1.15rem; }
    .bcg-quad-label { flex: 1; }
    .bcg-quad-count {
      font-size: 0.7rem; font-weight: 700; padding: 0.15rem 0.5rem;
      border-radius: 10px; background: rgba(0,0,0,0.2);
    }
    /* Star */
    .quad-star .bcg-quad-header { background: rgba(201,168,76,0.2); border: 1px solid rgba(201,168,76,0.4); border-bottom: none; color: var(--mizan-gold); }
    .quad-star { border: 1px solid rgba(201,168,76,0.3); }
    /* Cash Cow */
    .quad-cash .bcg-quad-header { background: rgba(34,197,94,0.12); border: 1px solid rgba(34,197,94,0.3); border-bottom: none; color: var(--mizan-green); }
    .quad-cash { border: 1px solid rgba(34,197,94,0.25); }
    /* Question */
    .quad-question .bcg-quad-header { background: rgba(99,179,255,0.12); border: 1px solid rgba(99,179,255,0.3); border-bottom: none; color: #93c5fd; }
    .quad-question { border: 1px solid rgba(99,179,255,0.25); }
    /* Dog */
    .quad-dog .bcg-quad-header { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-bottom: none; color: #f87171; }
    .quad-dog { border: 1px solid rgba(239,68,68,0.25); }

    .bcg-branch-list { padding: 0.6rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .bcg-branch-card {
      background: rgba(255,255,255,0.03); border-radius: 9px;
      padding: 0.75rem 0.9rem; border: 1px solid rgba(255,255,255,0.06);
      cursor: pointer; transition: background 0.15s;
    }
    .bcg-branch-card:hover { background: rgba(255,255,255,0.06); }
    .bcg-branch-card.selected { background: rgba(255,255,255,0.08); border-color: rgba(255,255,255,0.15); }
    .bcg-branch-name { font-size: 0.85rem; font-weight: 700; color: var(--mizan-text); margin-bottom: 0.15rem; }
    .bcg-branch-meta { font-size: 0.72rem; color: var(--mizan-text-muted); display: flex; gap: 0.75rem; flex-wrap: wrap; }
    .bcg-branch-sar { color: var(--mizan-gold); font-weight: 600; }
    .bcg-branch-rate { color: #93c5fd; }

    /* Detail panel */
    .bcg-detail-panel {
      background: var(--mizan-surface); border-radius: 14px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.08); margin-bottom: 1.25rem;
    }
    .bcg-detail-header {
      padding: 1rem 1.25rem; display: flex; align-items: center; gap: 0.75rem;
    }
    .bcg-detail-header.h-star     { background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.05)); border-bottom: 1px solid rgba(201,168,76,0.25); }
    .bcg-detail-header.h-cash_cow { background: linear-gradient(135deg, rgba(34,197,94,0.12),  rgba(34,197,94,0.04)); border-bottom: 1px solid rgba(34,197,94,0.2); }
    .bcg-detail-header.h-question { background: linear-gradient(135deg, rgba(99,179,255,0.12), rgba(99,179,255,0.04)); border-bottom: 1px solid rgba(99,179,255,0.2); }
    .bcg-detail-header.h-dog      { background: linear-gradient(135deg, rgba(239,68,68,0.1),   rgba(239,68,68,0.03)); border-bottom: 1px solid rgba(239,68,68,0.2); }
    .bcg-detail-icon { font-size: 1.5rem; }
    .bcg-detail-name { font-size: 1rem; font-weight: 800; color: var(--mizan-text); }
    .bcg-detail-region { font-size: 0.75rem; color: var(--mizan-text-muted); margin-top: 0.1rem; }
    .bcg-detail-body { padding: 1rem 1.25rem; }
    .bcg-strategy-box {
      font-size: 0.88rem; font-weight: 700; padding: 0.65rem 1rem;
      border-radius: 8px; margin-bottom: 1rem; line-height: 1.5;
    }
    .bcg-strategy-box.s-star     { background: rgba(201,168,76,0.1); color: var(--mizan-gold); border-right: 3px solid var(--mizan-gold); }
    .bcg-strategy-box.s-cash_cow { background: rgba(34,197,94,0.08); color: var(--mizan-green); border-right: 3px solid var(--mizan-green); }
    .bcg-strategy-box.s-question { background: rgba(99,179,255,0.08); color: #93c5fd; border-right: 3px solid #93c5fd; }
    .bcg-strategy-box.s-dog      { background: rgba(239,68,68,0.08); color: #f87171; border-right: 3px solid #f87171; }
    .bcg-sw-row { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
    @media (max-width: 480px) { .bcg-sw-row { grid-template-columns: 1fr; } }
    .bcg-sw-block { background: rgba(255,255,255,0.03); border-radius: 8px; padding: 0.65rem 0.85rem; }
    .bcg-sw-title { font-size: 0.7rem; font-weight: 700; color: var(--mizan-text-muted); margin-bottom: 0.4rem; letter-spacing: 0.04em; }
    .bcg-sw-item { font-size: 0.79rem; color: var(--mizan-text); line-height: 1.5; display: flex; gap: 0.35rem; align-items: flex-start; }
    .bcg-sw-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; margin-top: 0.45rem; }
    .bcg-actions { margin-bottom: 1rem; }
    .bcg-action-item {
      display: flex; align-items: flex-start; gap: 0.5rem;
      font-size: 0.81rem; color: var(--mizan-text); line-height: 1.55;
      padding: 0.3rem 0;
    }
    .bcg-action-num {
      flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      font-size: 0.65rem; font-weight: 800; background: rgba(255,255,255,0.08);
      color: var(--mizan-text-muted); margin-top: 0.05rem;
    }
    .bcg-impact {
      font-size: 0.82rem; padding: 0.55rem 0.9rem;
      background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.2);
      border-radius: 8px; color: var(--mizan-gold); font-weight: 600;
    }

    /* Regional + Urgent */
    .regional-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem; margin-bottom: 1.25rem;
    }
    .regional-card {
      background: rgba(255,255,255,0.03); border: 1px solid var(--mizan-border);
      border-radius: 10px; padding: 0.8rem 1rem;
    }
    .regional-name { font-size: 0.88rem; font-weight: 700; color: var(--mizan-text); margin-bottom: 0.15rem; }
    .regional-meta { font-size: 0.72rem; color: var(--mizan-text-muted); margin-bottom: 0.45rem; }
    .health-pill {
      display: inline-block; font-size: 0.67rem; font-weight: 700;
      padding: 0.12rem 0.5rem; border-radius: 10px; margin-bottom: 0.4rem;
    }
    .health-strong   { background: rgba(34,197,94,0.12);   color: var(--mizan-green); }
    .health-moderate { background: rgba(245,158,11,0.12);  color: #f59e0b; }
    .health-weak     { background: rgba(239,68,68,0.12);   color: #f87171; }
    .regional-rec { font-size: 0.78rem; line-height: 1.55; color: var(--mizan-text); }

    .urgent-list { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.25rem; }
    .urgent-item {
      display: flex; align-items: flex-start; gap: 0.65rem;
      background: rgba(239,68,68,0.07); border: 1px solid rgba(239,68,68,0.2);
      border-radius: 9px; padding: 0.65rem 0.9rem;
      font-size: 0.84rem; color: var(--mizan-text); line-height: 1.55;
    }
    .urgent-icon { font-size: 1rem; flex-shrink: 0; }

    .forecast-box {
      font-size: 0.9rem; line-height: 1.9; color: var(--mizan-text);
      padding: 1rem 1.25rem;
      background: linear-gradient(135deg, rgba(99,179,255,0.05), rgba(201,168,76,0.04));
      border-right: 4px solid rgba(201,168,76,0.5); border-radius: 0 12px 12px 0;
    }

    /* ── Transfer optimizer ── */
    .transfer-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1rem; margin-bottom: 1.25rem;
    }
    .transfer-card {
      background: rgba(255,255,255,0.03); border: 1px solid rgba(99,179,255,0.2);
      border-radius: 12px; padding: 1rem; position: relative; overflow: hidden;
    }
    .transfer-card::before {
      content: ''; position: absolute; top: 0; right: 0; width: 4px; height: 100%;
      background: linear-gradient(180deg, #63b3ff, #c9a84c);
    }
    .transfer-arrow-row {
      display: flex; align-items: center; gap: 0.6rem; margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }
    .transfer-branch {
      flex: 1; min-width: 0; font-size: 0.82rem; font-weight: 700;
      padding: 0.3rem 0.6rem; border-radius: 8px; text-align: center;
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .transfer-from {
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25);
      color: #f87171;
    }
    .transfer-to {
      background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25);
      color: var(--mizan-green);
    }
    .transfer-arrow-icon {
      font-size: 1.3rem; flex-shrink: 0; color: #93c5fd;
      animation: arrowPulse 1.8s ease-in-out infinite;
    }
    @keyframes arrowPulse {
      0%,100% { transform: translateX(0); opacity: 0.7; }
      50%      { transform: translateX(-3px); opacity: 1; }
    }
    .transfer-emp-name {
      font-size: 0.9rem; font-weight: 700; color: var(--mizan-text); margin-bottom: 0.2rem;
    }
    .transfer-perf {
      font-size: 0.76rem; color: var(--mizan-text-muted); margin-bottom: 0.5rem; line-height: 1.4;
    }
    .transfer-reason {
      font-size: 0.8rem; line-height: 1.55; color: var(--mizan-text); margin-bottom: 0.6rem;
    }
    .transfer-footer {
      display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.4rem;
    }
    .transfer-improvement {
      font-size: 0.78rem; font-weight: 700; color: var(--mizan-green);
      background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.2);
      padding: 0.18rem 0.55rem; border-radius: 10px;
    }
    .confidence-badge {
      font-size: 0.68rem; font-weight: 700; padding: 0.15rem 0.5rem; border-radius: 10px;
    }
    .conf-high   { background: rgba(34,197,94,0.12);   color: var(--mizan-green); }
    .conf-medium { background: rgba(245,158,11,0.12);  color: #f59e0b; }
    .conf-low    { background: rgba(255,255,255,0.07); color: var(--mizan-text-muted); }
    .staffing-tables { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.25rem; }
    @media (max-width: 640px) { .staffing-tables { grid-template-columns: 1fr; } }
    .staffing-block { }
    .staffing-header {
      font-size: 0.8rem; font-weight: 700; padding: 0.55rem 0.9rem;
      border-radius: 10px 10px 0 0;
    }
    .overstaffed-header {
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); border-bottom: none; color: #f87171;
    }
    .understaffed-header {
      background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); border-bottom: none; color: var(--mizan-green);
    }
    .staffing-table {
      width: 100%; border-collapse: collapse; font-size: 0.78rem;
    }
    .overstaffed-block .staffing-table { border: 1px solid rgba(239,68,68,0.2); border-radius: 0 0 10px 10px; }
    .understaffed-block .staffing-table { border: 1px solid rgba(34,197,94,0.2); border-radius: 0 0 10px 10px; }
    .staffing-table th {
      text-align: right; padding: 0.4rem 0.65rem;
      font-size: 0.68rem; font-weight: 700; color: var(--mizan-text-muted);
      background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--mizan-border);
    }
    .staffing-table td {
      padding: 0.45rem 0.65rem; color: var(--mizan-text);
      border-bottom: 1px solid rgba(255,255,255,0.04); line-height: 1.45;
    }
    .staffing-table tr:last-child td { border-bottom: none; }
    .balancing-plan {
      font-size: 0.9rem; line-height: 1.9; color: var(--mizan-text);
      padding: 1rem 1.25rem;
      background: linear-gradient(135deg, rgba(99,179,255,0.05), rgba(201,168,76,0.04));
      border-right: 4px solid rgba(99,179,255,0.4); border-radius: 0 12px 12px 0;
    }

    /* ── Anomaly Detection ── */
    .anomaly-risk-bar {
      display: flex; align-items: center; gap: 1rem; margin-bottom: 1.5rem;
      padding: 0.9rem 1.1rem;
      background: rgba(255,255,255,0.03); border: 1px solid var(--mizan-border);
      border-radius: 12px; flex-wrap: wrap;
    }
    .risk-score-wrap { display: flex; flex-direction: column; align-items: center; }
    .risk-score-num {
      font-size: 2.2rem; font-weight: 900; line-height: 1;
    }
    .risk-score-low    { color: var(--mizan-green); }
    .risk-score-medium { color: #f59e0b; }
    .risk-score-high   { color: var(--mizan-danger); }
    .risk-score-label  { font-size: 0.65rem; color: var(--mizan-text-muted); margin-top: 0.1rem; }
    .risk-summary { flex: 1; font-size: 0.85rem; line-height: 1.65; color: var(--mizan-text); }

    .anomaly-filters {
      display: flex; gap: 0.4rem; flex-wrap: wrap; margin-bottom: 1rem;
    }
    .sev-filter {
      padding: 0.3rem 0.8rem; border-radius: 16px; font-size: 0.75rem; font-weight: 700;
      cursor: pointer; font-family: inherit; border: 1px solid transparent;
      background: rgba(255,255,255,0.04); color: var(--mizan-text-muted);
      transition: all 0.15s;
    }
    .sev-filter:hover { background: rgba(255,255,255,0.08); }
    .sev-filter.active-all      { background: rgba(255,255,255,0.1); color: var(--mizan-text); border-color: rgba(255,255,255,0.15); }
    .sev-filter.active-critical { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }
    .sev-filter.active-high     { background: rgba(245,158,11,0.15); color: #fbbf24; border-color: rgba(245,158,11,0.3); }
    .sev-filter.active-medium   { background: rgba(99,179,255,0.12); color: #93c5fd; border-color: rgba(99,179,255,0.3); }
    .sev-filter.active-low      { background: rgba(34,197,94,0.1);   color: var(--mizan-green); border-color: rgba(34,197,94,0.25); }

    .anomaly-list { display: flex; flex-direction: column; gap: 0.65rem; margin-bottom: 1.5rem; }
    .anomaly-card {
      border-radius: 11px; overflow: hidden;
      border: 1px solid rgba(255,255,255,0.07);
    }
    .anomaly-card-header {
      display: flex; align-items: center; gap: 0.65rem; padding: 0.7rem 1rem;
      cursor: pointer; user-select: none;
    }
    .anomaly-card-header:hover { filter: brightness(1.08); }
    .anom-sev-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
      box-shadow: 0 0 8px currentColor;
    }
    .sev-critical { background: #ef4444; color: #ef4444; }
    .sev-high     { background: #f59e0b; color: #f59e0b; }
    .sev-medium   { background: #93c5fd; color: #93c5fd; }
    .sev-low      { background: var(--mizan-green); color: var(--mizan-green); }

    .anomaly-header-bg-critical { background: rgba(239,68,68,0.1); }
    .anomaly-header-bg-high     { background: rgba(245,158,11,0.08); }
    .anomaly-header-bg-medium   { background: rgba(99,179,255,0.07); }
    .anomaly-header-bg-low      { background: rgba(34,197,94,0.06); }

    .anom-type-badge {
      font-size: 0.64rem; font-weight: 800; padding: 0.12rem 0.5rem; border-radius: 8px;
      text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0;
      background: rgba(255,255,255,0.08); color: var(--mizan-text-muted);
    }
    .anom-desc { flex: 1; font-size: 0.83rem; color: var(--mizan-text); line-height: 1.45; }
    .anom-branch { font-size: 0.72rem; color: var(--mizan-text-muted); white-space: nowrap; }
    .anom-expand-icon { font-size: 0.75rem; color: var(--mizan-text-muted); flex-shrink: 0; transition: transform 0.2s; }
    .anom-expand-icon.open { transform: rotate(180deg); }
    .anom-confidence {
      font-size: 0.67rem; font-weight: 700; padding: 0.1rem 0.45rem; border-radius: 8px;
      background: rgba(255,255,255,0.06); color: var(--mizan-text-muted); flex-shrink: 0;
    }

    .anomaly-card-body {
      padding: 0.75rem 1rem 0.9rem; border-top: 1px solid rgba(255,255,255,0.05);
      background: rgba(0,0,0,0.12);
    }
    .anom-detail-row { display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.5rem; }
    .anom-detail-item { font-size: 0.75rem; }
    .anom-detail-label { color: var(--mizan-text-muted); }
    .anom-detail-value { color: var(--mizan-text); font-weight: 600; }
    .anom-action-box {
      margin-top: 0.5rem; padding: 0.5rem 0.75rem;
      background: rgba(201,168,76,0.07); border-right: 3px solid rgba(201,168,76,0.4);
      border-radius: 0 7px 7px 0; font-size: 0.8rem; color: var(--mizan-text); line-height: 1.55;
    }
    .anom-action-label { font-size: 0.68rem; font-weight: 700; color: var(--mizan-gold); margin-bottom: 0.25rem; }

    .patterns-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(260px,1fr));
      gap: 0.75rem; margin-bottom: 1.25rem;
    }
    .pattern-card {
      background: rgba(99,179,255,0.04); border: 1px solid rgba(99,179,255,0.15);
      border-radius: 10px; padding: 0.85rem 1rem;
    }
    .pattern-type {
      font-size: 0.67rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em;
      color: #93c5fd; margin-bottom: 0.35rem;
    }
    .pattern-scope { font-size: 0.7rem; color: var(--mizan-text-muted); margin-bottom: 0.4rem; }
    .pattern-desc { font-size: 0.82rem; line-height: 1.55; color: var(--mizan-text); margin-bottom: 0.5rem; }
    .pattern-rec { font-size: 0.79rem; line-height: 1.5; color: #93c5fd; }

    .dq-list { display: flex; flex-direction: column; gap: 0.5rem; }
    .dq-card {
      background: rgba(245,158,11,0.05); border: 1px solid rgba(245,158,11,0.2);
      border-radius: 9px; padding: 0.7rem 0.9rem;
    }
    .dq-issue { font-size: 0.82rem; font-weight: 700; color: #fbbf24; margin-bottom: 0.2rem; }
    .dq-details { font-size: 0.79rem; color: var(--mizan-text); line-height: 1.5; margin-bottom: 0.35rem; }
    .dq-action { font-size: 0.76rem; color: var(--mizan-text-muted); }

    /* ── Purchase Intelligence ── */
    .pi-score-row {
      display: flex; align-items: stretch; gap: 1rem; margin-bottom: 1.5rem; flex-wrap: wrap;
    }
    .pi-gauge {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      background: rgba(255,255,255,0.03); border: 1px solid var(--mizan-border);
      border-radius: 14px; padding: 1.1rem 1.5rem; min-width: 130px;
    }
    .pi-gauge-num {
      font-size: 2.8rem; font-weight: 900; line-height: 1;
      background: linear-gradient(135deg, #63b3ff, #c9a84c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .pi-gauge-label { font-size: 0.65rem; color: var(--mizan-text-muted); margin-top: 0.3rem; text-align: center; }
    .pi-interpretation { flex: 1; min-width: 200px; font-size: 0.9rem; line-height: 1.75; color: var(--mizan-text); display: flex; align-items: center; }

    .pi-days-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1.25rem;
    }
    @media (max-width: 500px) { .pi-days-row { grid-template-columns: 1fr; } }
    .pi-days-block { border-radius: 10px; padding: 0.75rem 1rem; }
    .pi-days-block.best-days  { background: rgba(34,197,94,0.07);  border: 1px solid rgba(34,197,94,0.2); }
    .pi-days-block.worst-days { background: rgba(239,68,68,0.07);  border: 1px solid rgba(239,68,68,0.2); }
    .pi-days-title { font-size: 0.75rem; font-weight: 700; margin-bottom: 0.5rem; }
    .best-days  .pi-days-title { color: var(--mizan-green); }
    .worst-days .pi-days-title { color: #f87171; }
    .pi-day-chips { display: flex; gap: 0.4rem; flex-wrap: wrap; }
    .pi-day-chip {
      font-size: 0.78rem; font-weight: 700; padding: 0.2rem 0.65rem;
      border-radius: 12px;
    }
    .best-days  .pi-day-chip { background: rgba(34,197,94,0.12);  color: var(--mizan-green); }
    .worst-days .pi-day-chip { background: rgba(239,68,68,0.12);  color: #f87171; }

    .spread-trend-pill {
      display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.4rem 1rem;
      border-radius: 20px; font-size: 0.82rem; font-weight: 700; margin-bottom: 1.25rem;
    }
    .spread-improving    { background: rgba(34,197,94,0.1);  border: 1px solid rgba(34,197,94,0.3);  color: var(--mizan-green); }
    .spread-stable       { background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); color: #f59e0b; }
    .spread-deteriorating{ background: rgba(239,68,68,0.1);  border: 1px solid rgba(239,68,68,0.3);  color: #f87171; }

    .mothan-box {
      background: linear-gradient(135deg, rgba(99,179,255,0.07), rgba(201,168,76,0.05));
      border: 1px solid rgba(99,179,255,0.2); border-radius: 12px;
      padding: 1rem 1.25rem; margin-bottom: 1.25rem;
    }
    .mothan-rate-row {
      display: flex; gap: 1rem; flex-wrap: wrap; margin-bottom: 0.75rem; align-items: center;
    }
    .mothan-rate-block { text-align: center; }
    .mothan-rate-num {
      font-size: 1.5rem; font-weight: 900;
    }
    .mothan-rate-num.cheaper { color: var(--mizan-green); }
    .mothan-rate-num.pricier { color: #f87171; }
    .mothan-rate-num.neutral { color: var(--mizan-gold); }
    .mothan-rate-label { font-size: 0.65rem; color: var(--mizan-text-muted); }
    .mothan-vs-divider { font-size: 0.8rem; color: var(--mizan-text-muted); align-self: center; }
    .mothan-rec  { font-size: 0.84rem; line-height: 1.6; color: var(--mizan-text); margin-bottom: 0.4rem; }
    .mothan-save { font-size: 0.82rem; font-weight: 700; color: var(--mizan-gold); }

    .efficiency-table-wrap { overflow-x: auto; margin-bottom: 1.25rem; }
    .efficiency-table {
      width: 100%; border-collapse: collapse; font-size: 0.8rem;
    }
    .efficiency-table th {
      text-align: right; padding: 0.5rem 0.75rem;
      font-size: 0.7rem; font-weight: 700; color: var(--mizan-text-muted);
      background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--mizan-border);
      white-space: nowrap;
    }
    .efficiency-table td {
      padding: 0.5rem 0.75rem; vertical-align: middle;
      border-bottom: 1px solid rgba(255,255,255,0.04); color: var(--mizan-text);
    }
    .efficiency-table tr:last-child td { border-bottom: none; }
    .efficiency-table tr:hover td { background: rgba(255,255,255,0.02); }
    .eff-rank {
      width: 24px; height: 24px; border-radius: 50%; display: inline-flex;
      align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 800;
    }
    .rank-top    { background: rgba(201,168,76,0.2); color: var(--mizan-gold); }
    .rank-mid    { background: rgba(255,255,255,0.06); color: var(--mizan-text-muted); }
    .rank-bottom { background: rgba(239,68,68,0.12); color: #f87171; }
    .delta-positive { color: var(--mizan-green); font-weight: 700; }
    .delta-negative { color: #f87171; font-weight: 700; }

    .karat-advice-grid {
      display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 0.75rem; margin-bottom: 1.25rem;
    }
    .karat-advice-card {
      background: rgba(255,255,255,0.03); border: 1px solid var(--mizan-border);
      border-radius: 10px; padding: 0.85rem 1rem;
    }
    .karat-label { font-size: 1.2rem; font-weight: 900; color: var(--mizan-gold); margin-bottom: 0.25rem; }
    .karat-rates { display: flex; gap: 0.75rem; font-size: 0.75rem; margin-bottom: 0.45rem; }
    .karat-rate-item { }
    .karat-rate-key { color: var(--mizan-text-muted); }
    .karat-rate-val { font-weight: 700; color: var(--mizan-text); }
    .demand-pill {
      display: inline-block; font-size: 0.65rem; font-weight: 700; padding: 0.1rem 0.45rem;
      border-radius: 8px; margin-bottom: 0.4rem;
    }
    .demand-high   { background: rgba(34,197,94,0.12);   color: var(--mizan-green); }
    .demand-medium { background: rgba(245,158,11,0.1);   color: #f59e0b; }
    .demand-low    { background: rgba(239,68,68,0.1);    color: #f87171; }
    .karat-advice-text { font-size: 0.8rem; line-height: 1.55; color: var(--mizan-text); }

    .pi-opportunity-box {
      background: linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.04));
      border: 1px solid rgba(201,168,76,0.35); border-right: 4px solid var(--mizan-gold);
      border-radius: 0 12px 12px 0; padding: 1rem 1.25rem; margin-bottom: 1.25rem;
    }
    .pi-opportunity-label { font-size: 0.72rem; font-weight: 800; color: var(--mizan-gold); margin-bottom: 0.35rem; letter-spacing: 0.05em; }
    .pi-opportunity-text { font-size: 0.9rem; line-height: 1.7; color: var(--mizan-text); font-weight: 600; }

    /* ── Risk Assessment ── */
    .risk-company-header {
      display: flex; align-items: center; gap: 1.5rem; margin-bottom: 1.75rem;
      padding: 1.25rem 1.5rem; border-radius: 14px; flex-wrap: wrap;
    }
    .risk-co-low      { background: rgba(34,197,94,0.07);  border: 1px solid rgba(34,197,94,0.25); }
    .risk-co-medium   { background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.25); }
    .risk-co-high     { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.3); }
    .risk-co-critical { background: rgba(120,0,0,0.2);     border: 1px solid rgba(239,68,68,0.5); }

    /* Semicircle gauge */
    .gauge-wrap {
      position: relative; width: 120px; height: 64px; flex-shrink: 0;
    }
    .gauge-svg { width: 120px; height: 64px; overflow: visible; }
    .gauge-track { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 10; stroke-linecap: round; }
    .gauge-fill  { fill: none; stroke-width: 10; stroke-linecap: round;
                   transition: stroke-dasharray 0.6s ease; }
    .gauge-fill-low      { stroke: var(--mizan-green); }
    .gauge-fill-medium   { stroke: #f59e0b; }
    .gauge-fill-high     { stroke: #ef4444; }
    .gauge-fill-critical { stroke: #dc2626; filter: drop-shadow(0 0 6px #dc2626); }
    .gauge-num {
      position: absolute; bottom: -4px; left: 50%; transform: translateX(-50%);
      font-size: 1.4rem; font-weight: 900; line-height: 1;
    }
    .gnum-low      { color: var(--mizan-green); }
    .gnum-medium   { color: #f59e0b; }
    .gnum-high     { color: #ef4444; }
    .gnum-critical { color: #dc2626; }
    .risk-co-info { flex: 1; min-width: 160px; }
    .risk-co-level {
      font-size: 1rem; font-weight: 800; margin-bottom: 0.25rem;
    }
    .rl-low      { color: var(--mizan-green); }
    .rl-medium   { color: #f59e0b; }
    .rl-high     { color: #ef4444; }
    .rl-critical { color: #dc2626; }
    .risk-co-counts { display: flex; gap: 0.65rem; flex-wrap: wrap; }
    .risk-count-badge {
      font-size: 0.72rem; font-weight: 700; padding: 0.18rem 0.6rem;
      border-radius: 10px; white-space: nowrap;
    }
    .rc-critical { background: rgba(220,38,38,0.15); color: #fca5a5; }
    .rc-high     { background: rgba(239,68,68,0.12); color: #f87171; }
    .rc-medium   { background: rgba(245,158,11,0.12); color: #fbbf24; }
    .rc-low      { background: rgba(34,197,94,0.1);   color: var(--mizan-green); }

    /* Top risks / positives */
    .risk-overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem; }
    @media (max-width: 600px) { .risk-overview-grid { grid-template-columns: 1fr; } }
    .risk-overview-block { border-radius: 10px; padding: 0.85rem 1rem; }
    .risk-risks { background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); }
    .risk-positives { background: rgba(34,197,94,0.05); border: 1px solid rgba(34,197,94,0.2); }
    .risk-overview-title { font-size: 0.75rem; font-weight: 800; margin-bottom: 0.55rem; letter-spacing: 0.04em; }
    .risk-risks .risk-overview-title     { color: #f87171; }
    .risk-positives .risk-overview-title { color: var(--mizan-green); }
    .risk-overview-item {
      display: flex; align-items: flex-start; gap: 0.45rem;
      font-size: 0.8rem; line-height: 1.55; color: var(--mizan-text); padding: 0.2rem 0;
    }
    .risk-ov-dot { flex-shrink: 0; margin-top: 0.45rem; width: 5px; height: 5px; border-radius: 50%; }

    /* Branch risk cards */
    .risk-branch-list { display: flex; flex-direction: column; gap: 0.7rem; }
    .risk-branch-card { border-radius: 12px; overflow: hidden; }
    .risk-branch-header {
      display: flex; align-items: center; gap: 0.85rem; padding: 0.75rem 1rem;
      cursor: pointer; user-select: none;
    }
    .rbh-low      { background: rgba(34,197,94,0.06);  border: 1px solid rgba(34,197,94,0.2); border-bottom: none; }
    .rbh-medium   { background: rgba(245,158,11,0.07); border: 1px solid rgba(245,158,11,0.25); border-bottom: none; }
    .rbh-high     { background: rgba(239,68,68,0.08);  border: 1px solid rgba(239,68,68,0.3); border-bottom: none; }
    .rbh-critical { background: rgba(120,0,0,0.2);     border: 1px solid rgba(239,68,68,0.5); border-bottom: none; }
    .risk-branch-gauge { flex-shrink: 0; }
    .mini-gauge-wrap { position: relative; width: 70px; height: 38px; }
    .mini-gauge-svg  { width: 70px; height: 38px; overflow: visible; }
    .mini-gauge-num  {
      position: absolute; bottom: -2px; left: 50%; transform: translateX(-50%);
      font-size: 0.85rem; font-weight: 900;
    }
    .risk-branch-info { flex: 1; min-width: 0; }
    .risk-branch-name { font-size: 0.9rem; font-weight: 700; color: var(--mizan-text); }
    .risk-branch-meta { font-size: 0.72rem; color: var(--mizan-text-muted); }
    .risk-level-badge {
      font-size: 0.67rem; font-weight: 800; padding: 0.12rem 0.5rem; border-radius: 10px; flex-shrink: 0;
    }
    .rlb-low      { background: rgba(34,197,94,0.12);  color: var(--mizan-green); }
    .rlb-medium   { background: rgba(245,158,11,0.12); color: #f59e0b; }
    .rlb-high     { background: rgba(239,68,68,0.12);  color: #f87171; }
    .rlb-critical { background: rgba(120,0,0,0.3);     color: #fca5a5; }
    .risk-expand-icon { font-size: 0.72rem; color: var(--mizan-text-muted); transition: transform 0.2s; }
    .risk-expand-icon.open { transform: rotate(180deg); }

    .risk-branch-body {
      padding: 1rem 1.1rem;
    }
    .rbody-low      { border: 1px solid rgba(34,197,94,0.15); border-top: none; background: rgba(34,197,94,0.02); }
    .rbody-medium   { border: 1px solid rgba(245,158,11,0.2); border-top: none; background: rgba(245,158,11,0.02); }
    .rbody-high     { border: 1px solid rgba(239,68,68,0.25); border-top: none; background: rgba(239,68,68,0.03); }
    .rbody-critical { border: 1px solid rgba(239,68,68,0.4); border-top: none; background: rgba(120,0,0,0.08); }

    .risk-factors-grid { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1rem; }
    .risk-factor-row {
      display: flex; align-items: center; gap: 0.65rem;
    }
    .factor-name { font-size: 0.78rem; color: var(--mizan-text); min-width: 160px; flex-shrink: 0; }
    .factor-bar-track {
      flex: 1; height: 6px; background: rgba(255,255,255,0.07); border-radius: 3px; overflow: hidden;
    }
    .factor-bar-fill {
      height: 100%; border-radius: 3px; transition: width 0.4s ease;
    }
    .fbar-low    { background: var(--mizan-green); }
    .fbar-medium { background: #f59e0b; }
    .fbar-high   { background: #ef4444; }
    .factor-score { font-size: 0.75rem; font-weight: 700; min-width: 28px; text-align: left; }
    .factor-detail { font-size: 0.72rem; color: var(--mizan-text-muted); flex: 1; min-width: 0; }

    .risk-mitigation {
      padding: 0.7rem 0.9rem;
      background: rgba(99,179,255,0.05); border-right: 3px solid rgba(99,179,255,0.4);
      border-radius: 0 8px 8px 0; margin-bottom: 0.6rem;
    }
    .risk-mitigation-label { font-size: 0.68rem; font-weight: 800; color: #93c5fd; margin-bottom: 0.35rem; letter-spacing: 0.04em; }
    .risk-mitigation-text  { font-size: 0.8rem; line-height: 1.65; color: var(--mizan-text); white-space: pre-line; }
    .risk-impact {
      font-size: 0.78rem; font-weight: 600; color: var(--mizan-gold);
      background: rgba(201,168,76,0.07); border: 1px solid rgba(201,168,76,0.2);
      border-radius: 7px; padding: 0.3rem 0.7rem; display: inline-block;
    }

    /* ── Executive Briefing ── */
    .briefing-toolbar {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;
    }
    .briefing-meta { font-size: 0.75rem; color: var(--mizan-text-muted); }
    .briefing-actions { display: flex; gap: 0.5rem; }
    .briefing-btn {
      display: flex; align-items: center; gap: 0.4rem;
      padding: 0.4rem 0.95rem; border-radius: 20px; font-size: 0.78rem;
      font-weight: 700; cursor: pointer; font-family: inherit; transition: all 0.15s;
    }
    .btn-print {
      background: rgba(201,168,76,0.12); border: 1px solid rgba(201,168,76,0.35);
      color: var(--mizan-gold);
    }
    .btn-print:hover { background: rgba(201,168,76,0.2); }
    .btn-email {
      background: rgba(255,255,255,0.04); border: 1px solid var(--mizan-border);
      color: var(--mizan-text-muted); cursor: not-allowed; opacity: 0.55;
    }

    /* Briefing document */
    .briefing-doc {
      background: var(--mizan-surface);
      border: 1px solid rgba(201,168,76,0.2);
      border-radius: 14px; overflow: hidden;
    }
    .briefing-letterhead {
      padding: 1.75rem 2rem 1.25rem;
      background: linear-gradient(135deg, rgba(201,168,76,0.12), rgba(201,168,76,0.04), rgba(99,179,255,0.05));
      border-bottom: 1px solid rgba(201,168,76,0.2);
      text-align: center;
    }
    .briefing-logo-row {
      display: flex; align-items: center; justify-content: center;
      gap: 0.75rem; margin-bottom: 1rem;
    }
    .briefing-logo-icon { font-size: 1.5rem; }
    .briefing-logo-text {
      font-size: 1rem; font-weight: 800; letter-spacing: 0.06em;
      background: linear-gradient(135deg, #c9a84c, #f0d080, #c9a84c);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .briefing-divider {
      width: 60px; height: 2px; margin: 0 auto 1rem;
      background: linear-gradient(90deg, transparent, rgba(201,168,76,0.6), transparent);
    }
    .briefing-title {
      font-size: 1rem; font-weight: 700; color: var(--mizan-text-muted); margin-bottom: 0.6rem;
    }
    .briefing-headline {
      font-size: 1.2rem; font-weight: 800; line-height: 1.5;
      background: linear-gradient(135deg, #fff 0%, #e5c76b 100%);
      -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text;
    }
    .briefing-sentiment-row {
      display: flex; align-items: center; justify-content: center;
      gap: 0.5rem; margin-top: 0.75rem; font-size: 0.78rem; color: var(--mizan-text-muted);
    }
    .bs-dot { width: 8px; height: 8px; border-radius: 50%; }

    .briefing-body { padding: 1.5rem 2rem; }
    .briefing-section { margin-bottom: 1.5rem; }
    .briefing-section:last-child { margin-bottom: 0; }
    .briefing-section-title {
      font-size: 0.88rem; font-weight: 800; margin-bottom: 0.75rem;
      padding-bottom: 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.07);
      color: var(--mizan-text);
    }
    .briefing-bullets { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
    .briefing-bullet {
      display: flex; align-items: flex-start; gap: 0.6rem;
      font-size: 0.88rem; line-height: 1.7; color: var(--mizan-text);
    }
    .briefing-bullet-marker {
      flex-shrink: 0; margin-top: 0.55rem;
      width: 5px; height: 5px; border-radius: 50%; background: var(--mizan-gold);
      box-shadow: 0 0 6px rgba(201,168,76,0.5);
    }

    .briefing-closing {
      margin: 1.5rem 2rem 0;
      padding: 1rem 1.25rem;
      background: linear-gradient(135deg, rgba(99,179,255,0.05), rgba(201,168,76,0.04));
      border-top: 1px solid rgba(201,168,76,0.15);
      border-right: 3px solid rgba(201,168,76,0.4);
      font-size: 0.88rem; line-height: 1.8; color: var(--mizan-text-muted);
      font-style: italic;
    }
    .briefing-footer {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0.85rem 2rem; border-top: 1px solid rgba(255,255,255,0.05);
      background: rgba(0,0,0,0.1); font-size: 0.68rem; color: rgba(255,255,255,0.2);
      flex-wrap: wrap; gap: 0.5rem;
    }

    /* Print styles — activated when .briefing-printing class is added to body */
    @media print {
      :host { background: white !important; color: black !important; direction: rtl; }
      .feature-tabs, .ai-header, .ai-badge, .briefing-toolbar,
      .briefing-btn, .ai-powered, .briefing-footer { display: none !important; }
      .briefing-doc { border: 1px solid #ccc; box-shadow: none; background: white; color: black; }
      .briefing-letterhead { background: #f9f5e8; border-bottom: 1px solid #c9a84c; }
      .briefing-headline, .briefing-logo-text { color: #8b6914 !important; -webkit-text-fill-color: #8b6914 !important; }
      .briefing-section-title { color: #333; border-bottom-color: #ddd; }
      .briefing-bullet { color: #222; }
      .briefing-closing { color: #555; background: #faf7f0; border-right-color: #c9a84c; }
      .briefing-bullet-marker { background: #c9a84c; box-shadow: none; }
    }

    /* ── Smart Action Items ── */
    .actions-kpi-row {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 0.75rem; margin-bottom: 1.5rem;
    }
    .actions-kpi {
      background: rgba(255,255,255,0.03); border: 1px solid var(--mizan-border);
      border-radius: 12px; padding: 0.85rem 1rem; text-align: center;
    }
    .actions-kpi-value {
      font-size: 1.5rem; font-weight: 900; line-height: 1;
      margin-bottom: 0.25rem;
    }
    .kpi-impact { color: var(--mizan-gold); font-size: 1rem; }
    .kpi-critical { color: #ef4444; }
    .kpi-high     { color: #f59e0b; }
    .kpi-medium   { color: #93c5fd; }
    .kpi-low      { color: var(--mizan-green); }
    .actions-kpi-label { font-size: 0.68rem; color: var(--mizan-text-muted); }

    /* Kanban board */
    .kanban-board {
      display: grid; grid-template-columns: repeat(3, 1fr);
      gap: 1rem; align-items: start;
    }
    @media (max-width: 768px) { .kanban-board { grid-template-columns: 1fr; } }

    .kanban-col { border-radius: 12px; overflow: hidden; }
    .kanban-col-header {
      padding: 0.65rem 1rem; font-size: 0.8rem; font-weight: 800;
      display: flex; align-items: center; justify-content: space-between;
    }
    .kcol-critical .kanban-col-header { background: rgba(220,38,38,0.15); border: 1px solid rgba(220,38,38,0.4); border-bottom: none; color: #fca5a5; }
    .kcol-high     .kanban-col-header { background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.35); border-bottom: none; color: #fbbf24; }
    .kcol-medium   .kanban-col-header { background: rgba(99,179,255,0.1);  border: 1px solid rgba(99,179,255,0.3); border-bottom: none; color: #93c5fd; }
    .kanban-col-count {
      font-size: 0.7rem; font-weight: 800; padding: 0.1rem 0.45rem;
      border-radius: 8px; background: rgba(0,0,0,0.2);
    }
    .kanban-col-body {
      padding: 0.5rem; display: flex; flex-direction: column; gap: 0.5rem;
    }
    .kcol-critical .kanban-col-body { border: 1px solid rgba(220,38,38,0.3); border-top: none; border-radius: 0 0 12px 12px; background: rgba(220,38,38,0.03); }
    .kcol-high     .kanban-col-body { border: 1px solid rgba(245,158,11,0.25); border-top: none; border-radius: 0 0 12px 12px; background: rgba(245,158,11,0.02); }
    .kcol-medium   .kanban-col-body { border: 1px solid rgba(99,179,255,0.2); border-top: none; border-radius: 0 0 12px 12px; background: rgba(99,179,255,0.02); }

    /* Action cards */
    .action-card {
      background: rgba(255,255,255,0.04); border-radius: 9px;
      border: 1px solid rgba(255,255,255,0.07);
      cursor: pointer; transition: background 0.15s;
    }
    .action-card:hover { background: rgba(255,255,255,0.07); }
    .action-card-top {
      padding: 0.7rem 0.8rem; display: flex; flex-direction: column; gap: 0.3rem;
    }
    .action-card-meta {
      display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
    }
    .action-id {
      font-size: 0.6rem; font-weight: 800; color: var(--mizan-text-muted);
      background: rgba(255,255,255,0.06); padding: 0.08rem 0.35rem; border-radius: 6px;
    }
    .action-cat-badge {
      font-size: 0.62rem; font-weight: 800; padding: 0.08rem 0.4rem; border-radius: 6px;
    }
    .cat-hr         { background: rgba(168,85,247,0.15); color: #c084fc; }
    .cat-operations { background: rgba(99,179,255,0.12); color: #93c5fd; }
    .cat-finance    { background: rgba(201,168,76,0.15); color: var(--mizan-gold); }
    .cat-risk       { background: rgba(239,68,68,0.12);  color: #f87171; }
    .cat-growth     { background: rgba(34,197,94,0.12);  color: var(--mizan-green); }
    .cat-compliance { background: rgba(245,158,11,0.12); color: #fbbf24; }

    .effort-dot {
      display: flex; align-items: center; gap: 0.2rem;
      font-size: 0.62rem; color: var(--mizan-text-muted);
    }
    .effort-dot span { width: 5px; height: 5px; border-radius: 50%; }
    .effort-low    span { background: var(--mizan-green); }
    .effort-medium span { background: #f59e0b; }
    .effort-high   span { background: #ef4444; }

    .action-title { font-size: 0.82rem; font-weight: 700; color: var(--mizan-text); line-height: 1.4; }
    .action-impact-preview {
      font-size: 0.72rem; font-weight: 700; color: var(--mizan-gold);
    }

    .action-card-body {
      padding: 0.65rem 0.8rem; border-top: 1px solid rgba(255,255,255,0.05);
      background: rgba(0,0,0,0.1); display: flex; flex-direction: column; gap: 0.5rem;
    }
    .action-desc {
      font-size: 0.78rem; line-height: 1.55; color: var(--mizan-text);
    }
    .action-meta-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem;
    }
    .action-meta-item { }
    .action-meta-key { font-size: 0.62rem; color: var(--mizan-text-muted); margin-bottom: 0.1rem; }
    .action-meta-val { font-size: 0.75rem; font-weight: 600; color: var(--mizan-text); line-height: 1.35; }
    .deadline-val  { color: #f59e0b; }
    .impact-val    { color: var(--mizan-gold); font-weight: 700; }

    /* Low-priority list (below kanban) */
    .low-actions-section { margin-top: 1rem; }
    .low-actions-list { display: flex; flex-direction: column; gap: 0.4rem; }
    .low-action-row {
      display: flex; align-items: center; gap: 0.65rem;
      background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05);
      border-radius: 8px; padding: 0.55rem 0.8rem; cursor: pointer;
    }
    .low-action-row:hover { background: rgba(255,255,255,0.04); }
    .low-action-num { font-size: 0.65rem; color: var(--mizan-text-muted); min-width: 20px; }
    .low-action-title { flex: 1; font-size: 0.8rem; color: var(--mizan-text); }
    .low-action-impact { font-size: 0.72rem; color: var(--mizan-text-muted); white-space: nowrap; }

    /* ── Chat Assistant ── */
    .chat-wrapper {
      display: flex; flex-direction: column; height: 72vh; min-height: 480px;
      background: var(--mizan-surface); border: 1px solid rgba(99,179,255,0.15);
      border-radius: 16px; overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.25);
    }
    .chat-messages {
      flex: 1; overflow-y: auto; padding: 1.25rem 1rem;
      display: flex; flex-direction: column; gap: 1.1rem;
      scrollbar-width: thin; scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .chat-messages::-webkit-scrollbar { width: 4px; }
    .chat-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }

    /* Messages */
    .msg-row { display: flex; gap: 0.7rem; align-items: flex-end; }
    .msg-row.user-row { flex-direction: row-reverse; }

    .msg-avatar {
      width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center; font-size: 1.1rem;
      background: linear-gradient(135deg, #1e3a5f, #2a4a7f);
      border: 1px solid rgba(99,179,255,0.3);
    }
    .msg-avatar.user-avatar {
      background: linear-gradient(135deg, rgba(201,168,76,0.3), rgba(201,168,76,0.1));
      border-color: rgba(201,168,76,0.4);
    }

    .msg-bubble {
      max-width: 80%; padding: 0.85rem 1.05rem;
      font-size: 0.875rem; line-height: 1.75; border-radius: 14px;
      position: relative;
    }
    .ai-bubble {
      background: rgba(99,179,255,0.07); border: 1px solid rgba(99,179,255,0.15);
      border-bottom-right-radius: 4px; color: var(--mizan-text);
    }
    .user-bubble {
      background: linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08));
      border: 1px solid rgba(201,168,76,0.25);
      border-bottom-left-radius: 4px; color: var(--mizan-text); text-align: right;
    }

    /* Typing indicator */
    .typing-bubble {
      background: rgba(99,179,255,0.07); border: 1px solid rgba(99,179,255,0.12);
      border-bottom-right-radius: 4px; padding: 0.75rem 1.1rem;
      display: flex; align-items: center; gap: 0.3rem;
    }
    .typing-dot {
      width: 7px; height: 7px; border-radius: 50%; background: rgba(99,179,255,0.6);
      animation: typingBounce 1.3s ease-in-out infinite;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.15s; }
    .typing-dot:nth-child(3) { animation-delay: 0.3s; }
    @keyframes typingBounce {
      0%,60%,100% { transform: translateY(0); opacity: 0.4; }
      30%          { transform: translateY(-6px); opacity: 1; }
    }

    /* Answer text — preserve line breaks */
    .answer-text { white-space: pre-line; }
    .answer-sign { margin-top: 0.5rem; font-size: 0.75rem; color: var(--mizan-gold); font-weight: 700; }

    /* Related metrics pills */
    .related-metrics {
      display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.75rem;
    }
    .metric-pill {
      display: flex; flex-direction: column; align-items: center;
      padding: 0.25rem 0.65rem; border-radius: 10px;
      background: rgba(201,168,76,0.1); border: 1px solid rgba(201,168,76,0.25);
    }
    .metric-pill-val { font-size: 0.78rem; font-weight: 800; color: var(--mizan-gold); }
    .metric-pill-lbl { font-size: 0.62rem; color: var(--mizan-text-muted); }

    /* Suggestion chips */
    .chat-suggestions {
      display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.85rem;
    }
    .suggestion-chip {
      font-size: 0.74rem; font-weight: 600; padding: 0.28rem 0.7rem; border-radius: 16px;
      background: rgba(99,179,255,0.08); border: 1px solid rgba(99,179,255,0.2);
      color: #93c5fd; cursor: pointer; font-family: inherit; transition: all 0.15s;
    }
    .suggestion-chip:hover {
      background: rgba(99,179,255,0.16); border-color: rgba(99,179,255,0.4);
    }

    /* Welcome intro chips (bigger) */
    .welcome-suggestions { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-top: 0.9rem; }
    .welcome-chip {
      font-size: 0.77rem; font-weight: 600; padding: 0.35rem 0.85rem; border-radius: 18px;
      background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
      color: var(--mizan-text-muted); cursor: pointer; font-family: inherit; transition: all 0.15s;
    }
    .welcome-chip:hover {
      background: rgba(99,179,255,0.1); border-color: rgba(99,179,255,0.25); color: #93c5fd;
    }

    /* Timestamp */
    .msg-ts { font-size: 0.6rem; color: rgba(255,255,255,0.2); margin-top: 0.2rem; text-align: left; }
    .user-row .msg-ts { text-align: right; }

    /* Input area */
    .chat-input-row {
      display: flex; align-items: center; gap: 0.5rem;
      padding: 0.85rem 1rem;
      border-top: 1px solid rgba(255,255,255,0.06);
      background: rgba(0,0,0,0.15);
    }
    .chat-input {
      flex: 1; padding: 0.65rem 1rem; border-radius: 22px;
      background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.1);
      color: var(--mizan-text); font-size: 0.87rem; font-family: inherit;
      direction: rtl; outline: none; transition: border-color 0.15s;
    }
    .chat-input::placeholder { color: rgba(255,255,255,0.25); }
    .chat-input:focus { border-color: rgba(99,179,255,0.4); background: rgba(99,179,255,0.05); }
    .chat-send-btn {
      flex-shrink: 0; padding: 0.6rem 1.25rem; border-radius: 22px; font-size: 0.82rem;
      font-weight: 800; cursor: pointer; font-family: inherit; transition: all 0.15s;
      background: linear-gradient(135deg, #1e3a5f, #2a4a7f);
      border: 1px solid rgba(99,179,255,0.4); color: #93c5fd;
    }
    .chat-send-btn:hover:not(:disabled) {
      background: linear-gradient(135deg, #2a4a7f, #3a5a9f);
      box-shadow: 0 0 12px rgba(99,179,255,0.2);
    }
    .chat-send-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .chat-input-hint {
      font-size: 0.62rem; color: rgba(255,255,255,0.18);
      padding: 0.2rem 1rem 0.4rem; text-align: center;
    }

    /* ── Powered by footer ── */
    .ai-powered {
      display: flex; align-items: center; justify-content: center; gap: 0.4rem;
      font-size: 0.7rem; color: rgba(255,255,255,0.2); padding: 0.5rem 0;
    }
  `],
  template: `
    <!-- Header -->
    <div class="ai-header">
      <div class="ai-orb-icon">🤖</div>
      <div class="ai-title-group">
        <h2 class="ai-title">الذكاء الاصطناعي — MIZAN AI</h2>
        <div class="ai-subtitle">تحليل بيانات الذهب باستخدام Gemini 2.0 Flash</div>
      </div>
      <span class="ai-badge">GEMINI 2.0</span>
    </div>

    <!-- Feature tabs -->
    <div class="feature-tabs">
      @for (f of features; track f.key) {
        <button
          class="feature-tab"
          [class.active]="activeFeature() === f.key"
          (click)="selectFeature(f.key)"
        >
          <span class="feature-icon">{{ f.icon }}</span>
          <span>{{ f.label }}</span>
        </button>
      }
    </div>

    <!-- Loading -->
    @if (loading()) {
      <div class="ai-loading">
        <div class="ai-loading-orb">🤖</div>
        <div class="ai-loading-label">الذكاء الاصطناعي يحلل البيانات…</div>
        <div class="ai-dots"><span></span><span></span><span></span></div>
      </div>
    }

    <!-- Error -->
    @if (error() && !loading()) {
      <div class="ai-error">
        <div class="ai-error-icon">⚠️</div>
        <div>{{ error() }}</div>
        <button class="ai-error-retry" (click)="retry()">إعادة المحاولة</button>
      </div>
    }

    <!-- Results -->
    @if (result() && !loading() && !error()) {

      <!-- ── EXECUTIVE ── -->
      @if (activeFeature() === 'executive') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🎯</span>
              <span class="ai-card-title">الملخص التنفيذي</span>
            </div>
            <!-- Headline + Score -->
            <div class="headline-row">
              <div class="ai-headline">{{ result()?.headline }}</div>
              @if (result()?.performanceScore != null) {
                <div class="score-badge">
                  <div class="score-num">{{ result()?.performanceScore }}</div>
                  <div class="score-label">/ 10</div>
                </div>
              }
            </div>
            <!-- Sentiment -->
            @if (result()?.sentiment) {
              <div class="sentiment-bar">
                <span class="sentiment-dot"
                  [class.sent-positive]="result()?.sentiment === 'positive'"
                  [class.sent-neutral]="result()?.sentiment === 'neutral'"
                  [class.sent-negative]="result()?.sentiment === 'negative'">
                </span>
                {{ sentimentLabel(result()?.sentiment) }}
              </div>
            }
            <!-- Overview -->
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Strengths -->
            @if (result()?.strengths?.length) {
              <div class="bullet-section">
                <div class="bullet-title">✅ نقاط القوة</div>
                <ul class="bullet-list">
                  @for (s of result()?.strengths; track $index) {
                    <li class="bullet-item">
                      <span class="bullet-dot dot-green"></span>{{ s }}
                    </li>
                  }
                </ul>
              </div>
            }
            <!-- Risks -->
            @if (result()?.risks?.length) {
              <div class="bullet-section">
                <div class="bullet-title">⚠️ المخاطر</div>
                <ul class="bullet-list">
                  @for (r of result()?.risks; track $index) {
                    <li class="bullet-item">
                      <span class="bullet-dot dot-red"></span>{{ r }}
                    </li>
                  }
                </ul>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item">
                      <span class="bullet-dot dot-gold"></span>{{ r }}
                    </li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── BRANCHES ── -->
      @if (activeFeature() === 'branches') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🏪</span>
              <span class="ai-card-title">تحليل أداء الفروع</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Top Performers -->
            @if (result()?.topPerformers?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🏆 الفروع الرائدة</div>
                <div class="people-grid">
                  @for (p of result()?.topPerformers; track $index) {
                    <div class="people-card green-card">
                      <div class="people-name">{{ p.name }}</div>
                      <div class="people-sub">{{ p.region }}</div>
                      <div class="people-note">{{ p.reason }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Underperformers -->
            @if (result()?.underperformers?.length) {
              <div class="bullet-section">
                <div class="bullet-title">📉 الفروع التي تحتاج دعماً</div>
                <div class="people-grid">
                  @for (u of result()?.underperformers; track $index) {
                    <div class="people-card warn-card">
                      <div class="people-name">{{ u.name }}</div>
                      <div class="people-sub">{{ u.region }}</div>
                      <div class="people-note"><strong>المشكلة:</strong> {{ u.issue }}</div>
                      <div class="people-note" style="margin-top:0.3rem"><strong>الإجراء:</strong> {{ u.action }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Regional -->
            @if (result()?.regionalInsights) {
              <div class="bullet-section">
                <div class="bullet-title">🗺️ رؤى إقليمية</div>
                <div class="insight-box">{{ result()?.regionalInsights }}</div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── EMPLOYEES ── -->
      @if (activeFeature() === 'employees') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">👥</span>
              <span class="ai-card-title">تحليل أداء الموظفين</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Stars -->
            @if (result()?.stars?.length) {
              <div class="bullet-section">
                <div class="bullet-title">⭐ نجوم الفريق</div>
                <div class="people-grid">
                  @for (s of result()?.stars; track $index) {
                    <div class="people-card star-card">
                      <div class="people-name">{{ s.name }}</div>
                      <div class="people-sub">{{ s.branch }}</div>
                      <div class="people-note">{{ s.highlight }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Needs Support -->
            @if (result()?.needsSupport?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🤝 يحتاجون دعماً</div>
                <div class="people-grid">
                  @for (n of result()?.needsSupport; track $index) {
                    <div class="people-card warn-card">
                      <div class="people-name">{{ n.name }}</div>
                      <div class="people-sub">{{ n.branch }}</div>
                      <div class="people-note">{{ n.suggestion }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Team Health -->
            @if (result()?.teamHealth) {
              <div class="bullet-section">
                <div class="bullet-title">💪 صحة الفريق</div>
                <div class="insight-box">{{ result()?.teamHealth }}</div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── KARAT ── -->
      @if (activeFeature() === 'karat') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">⚖️</span>
              <span class="ai-card-title">تحليل ربحية الأعيار</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Best karat -->
            @if (result()?.bestKarat) {
              <div class="karat-best-row">
                <div class="karat-best-label">{{ result()?.bestKarat }}</div>
                <div class="karat-best-reason">{{ result()?.bestKaratReason }}</div>
              </div>
            }
            <!-- Karat insights -->
            @if (result()?.karatInsights?.length) {
              <div class="bullet-section">
                <div class="bullet-title">📊 رؤى تفصيلية لكل عيار</div>
                <div class="people-grid">
                  @for (k of result()?.karatInsights; track $index) {
                    <div class="people-card"
                      [class.green-card]="k.action === 'push'"
                      [class.warn-card]="k.action === 'reduce'"
                      [class.star-card]="k.action === 'maintain'">
                      <div class="people-name">{{ k.karat }}</div>
                      <span class="action-badge"
                        [class.action-push]="k.action === 'push'"
                        [class.action-reduce]="k.action === 'reduce'"
                        [class.action-maintain]="k.action === 'maintain'">
                        {{ actionLabel(k.action) }}
                      </span>
                      <div class="people-note">{{ k.insight }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── DAILY TREND ── -->
      @if (activeFeature() === 'daily-trend') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">📈</span>
              <span class="ai-card-title">تحليل الاتجاه اليومي</span>
            </div>
            <div class="ai-overview">{{ result()?.overview }}</div>
            <!-- Trend pills -->
            <div class="trend-pills">
              @if (result()?.trendDirection) {
                <div class="trend-pill"
                  [class.trend-up]="result()?.trendDirection === 'up'"
                  [class.trend-down]="result()?.trendDirection === 'down'"
                  [class.trend-stable]="result()?.trendDirection === 'stable'">
                  <span class="dir-icon">{{ trendIcon(result()?.trendDirection) }}</span>
                  <div>
                    <span class="trend-pill-label">الاتجاه العام</span>
                    <span class="trend-pill-value">{{ trendLabel(result()?.trendDirection) }}</span>
                  </div>
                </div>
              }
              @if (result()?.peakPeriod) {
                <div class="trend-pill">
                  <span class="dir-icon">🔥</span>
                  <div>
                    <span class="trend-pill-label">فترة الذروة</span>
                    <span class="trend-pill-value">{{ result()?.peakPeriod }}</span>
                  </div>
                </div>
              }
              @if (result()?.slowPeriod) {
                <div class="trend-pill">
                  <span class="dir-icon">🌙</span>
                  <div>
                    <span class="trend-pill-label">الفترة الهادئة</span>
                    <span class="trend-pill-value">{{ result()?.slowPeriod }}</span>
                  </div>
                </div>
              }
            </div>
            <!-- Pattern -->
            @if (result()?.pattern) {
              <div class="bullet-section">
                <div class="bullet-title">🔍 النمط العام</div>
                <div class="insight-box">{{ result()?.pattern }}</div>
              </div>
            }
            <!-- Recommendations -->
            @if (result()?.recommendations?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💡 التوصيات</div>
                <ul class="bullet-list">
                  @for (r of result()?.recommendations; track $index) {
                    <li class="bullet-item"><span class="bullet-dot dot-gold"></span>{{ r }}</li>
                  }
                </ul>
              </div>
            }
          </div>
        </div>
      }

      <!-- ── EMPLOYEE ADVISOR ── -->
      @if (activeFeature() === 'employee-advisor') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🎓</span>
              <span class="ai-card-title">مستشار أداء الموظفين</span>
            </div>

            <!-- Needs Training -->
            @if (result()?.needsTraining?.length) {
              <div class="advisor-section adv-training">
                <div class="advisor-header">🎓 بحاجة لتدريب ({{ result()?.needsTraining?.length }})</div>
                <div class="advisor-table-wrap">
                  <table class="advisor-table">
                    <thead>
                      <tr>
                        <th>الموظف</th><th>الفرع</th><th>معدل البيع</th>
                        <th>متوسط الفرع</th><th>الفجوة</th>
                        <th>اقتراح التدريب</th><th>الأولوية</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (e of result()?.needsTraining; track $index) {
                        <tr>
                          <td><div class="td-name">{{ e.empName }}</div><div class="td-muted">{{ e.empId }}</div></td>
                          <td>{{ e.branch }}</td>
                          <td>{{ e.saleRate | number:'1.0-0' }}</td>
                          <td>{{ e.branchAvg | number:'1.0-0' }}</td>
                          <td style="color:var(--mizan-danger)">{{ e.gap | number:'1.0-0' }}</td>
                          <td>{{ e.suggestedTraining }}</td>
                          <td>
                            <span class="urgency-badge"
                              [class.urgency-high]="e.urgency==='high'"
                              [class.urgency-medium]="e.urgency==='medium'"
                              [class.urgency-low]="e.urgency==='low'">
                              {{ e.urgency === 'high' ? 'عاجل' : e.urgency === 'medium' ? 'متوسط' : 'منخفض' }}
                            </span>
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- Top Performers -->
            @if (result()?.topPerformers?.length) {
              <div class="advisor-section adv-top">
                <div class="advisor-header">🌟 متميزون ({{ result()?.topPerformers?.length }})</div>
                <div class="advisor-table-wrap">
                  <table class="advisor-table">
                    <thead>
                      <tr><th>الموظف</th><th>الفرع</th><th>هامش الربح</th><th>سبب التميز</th><th>التوصية</th></tr>
                    </thead>
                    <tbody>
                      @for (e of result()?.topPerformers; track $index) {
                        <tr>
                          <td><div class="td-name">{{ e.empName }}</div><div class="td-muted">{{ e.empId }}</div></td>
                          <td>{{ e.branch }}</td>
                          <td style="color:var(--mizan-gold);font-weight:600">{{ e.profitMargin | number:'1.0-0' }}</td>
                          <td>{{ e.reason }}</td>
                          <td><span class="urgency-badge urgency-low">{{ e.recommendation }}</span></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- Watch List -->
            @if (result()?.watchList?.length) {
              <div class="advisor-section adv-watch">
                <div class="advisor-header">👁 قائمة المراقبة ({{ result()?.watchList?.length }})</div>
                <div class="advisor-table-wrap">
                  <table class="advisor-table">
                    <thead>
                      <tr><th>الموظف</th><th>الفرع</th><th>المخاوف</th><th>المؤشر</th><th>الإجراء</th><th>المهلة</th></tr>
                    </thead>
                    <tbody>
                      @for (e of result()?.watchList; track $index) {
                        <tr>
                          <td><div class="td-name">{{ e.empName }}</div><div class="td-muted">{{ e.empId }}</div></td>
                          <td>{{ e.branch }}</td>
                          <td>{{ e.concern }}</td>
                          <td><span class="td-muted">{{ e.metric }}</span></td>
                          <td>{{ e.actionNeeded }}</td>
                          <td style="color:#f59e0b;white-space:nowrap">{{ e.deadline }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- Hiring Needed -->
            @if (result()?.hiringNeeded?.length) {
              <div class="advisor-section adv-hiring">
                <div class="advisor-header">📢 بحاجة لتوظيف ({{ result()?.hiringNeeded?.length }} فرع)</div>
                <div class="advisor-table-wrap">
                  <table class="advisor-table">
                    <thead>
                      <tr><th>الفرع</th><th>الموظفون الحاليون</th><th>التوظيف المقترح</th><th>السبب</th><th>المبرر</th></tr>
                    </thead>
                    <tbody>
                      @for (b of result()?.hiringNeeded; track $index) {
                        <tr>
                          <td class="td-name">{{ b.branch }}</td>
                          <td style="text-align:center">{{ b.currentEmployees }}</td>
                          <td style="text-align:center;color:#93c5fd;font-weight:700">+{{ b.suggestedHires }}</td>
                          <td>{{ b.reason }}</td>
                          <td>{{ b.justification }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- Termination Risk -->
            @if (result()?.terminationRisk?.length) {
              <div class="advisor-section adv-term">
                <div class="advisor-header">⚠️ خطر إنهاء الخدمة ({{ result()?.terminationRisk?.length }})</div>
                <div class="advisor-table-wrap">
                  <table class="advisor-table">
                    <thead>
                      <tr><th>الموظف</th><th>الفرع</th><th>مدة الضعف</th><th>السبب</th><th>الفرصة الأخيرة</th></tr>
                    </thead>
                    <tbody>
                      @for (e of result()?.terminationRisk; track $index) {
                        <tr>
                          <td><div class="td-name">{{ e.empName }}</div><div class="td-muted">{{ e.empId }}</div></td>
                          <td>{{ e.branch }}</td>
                          <td style="color:#f87171;white-space:nowrap">{{ e.monthsUnderperforming }} أشهر</td>
                          <td>{{ e.reason }}</td>
                          <td>{{ e.lastChanceAction }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- Summary -->
            @if (result()?.summary) {
              <div class="advisor-section">
                <div class="bullet-title">📝 الملخص التنفيذي</div>
                <div class="adv-summary">{{ result()?.summary }}</div>
              </div>
            }

          </div>
        </div>
      }

      <!-- ── BRANCH STRATEGY (BCG) ── -->
      @if (activeFeature() === 'branch-strategy') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🎯</span>
              <span class="ai-card-title">استراتيجية الفروع — مصفوفة BCG</span>
            </div>

            <!-- BCG Matrix 2×2 -->
            @if (result()?.branchStrategies?.length) {
              <div class="bcg-matrix">
                <!-- STAR quadrant -->
                <div class="bcg-quadrant quad-star">
                  <div class="bcg-quad-header">
                    <span class="bcg-quad-icon">🌟</span>
                    <span class="bcg-quad-label">نجمة — استثمر</span>
                    <span class="bcg-quad-count">{{ branchesOf('star').length }}</span>
                  </div>
                  <div class="bcg-branch-list">
                    @for (b of branchesOf('star'); track b.branchName) {
                      <div class="bcg-branch-card" [class.selected]="selectedBranch()?.branchName === b.branchName" (click)="selectBranch(b)">
                        <div class="bcg-branch-name">{{ b.branchName }}</div>
                        <div class="bcg-branch-meta">
                          <span class="bcg-branch-sar">{{ fmtSar(b.totalSar) }}</span>
                          <span class="bcg-branch-rate">{{ b.diffRate | number:'1.2-2' }} ريال/غ</span>
                          <span>{{ b.region }}</span>
                        </div>
                      </div>
                    }
                    @if (!branchesOf('star').length) {
                      <div style="padding:0.5rem 0.9rem;font-size:0.78rem;color:var(--mizan-text-muted)">لا يوجد</div>
                    }
                  </div>
                </div>

                <!-- CASH COW quadrant -->
                <div class="bcg-quadrant quad-cash">
                  <div class="bcg-quad-header">
                    <span class="bcg-quad-icon">🐄</span>
                    <span class="bcg-quad-label">بقرة نقدية — حسّن</span>
                    <span class="bcg-quad-count">{{ branchesOf('cash_cow').length }}</span>
                  </div>
                  <div class="bcg-branch-list">
                    @for (b of branchesOf('cash_cow'); track b.branchName) {
                      <div class="bcg-branch-card" [class.selected]="selectedBranch()?.branchName === b.branchName" (click)="selectBranch(b)">
                        <div class="bcg-branch-name">{{ b.branchName }}</div>
                        <div class="bcg-branch-meta">
                          <span class="bcg-branch-sar">{{ fmtSar(b.totalSar) }}</span>
                          <span class="bcg-branch-rate">{{ b.diffRate | number:'1.2-2' }} ريال/غ</span>
                          <span>{{ b.region }}</span>
                        </div>
                      </div>
                    }
                    @if (!branchesOf('cash_cow').length) {
                      <div style="padding:0.5rem 0.9rem;font-size:0.78rem;color:var(--mizan-text-muted)">لا يوجد</div>
                    }
                  </div>
                </div>

                <!-- QUESTION MARK quadrant -->
                <div class="bcg-quadrant quad-question">
                  <div class="bcg-quad-header">
                    <span class="bcg-quad-icon">❓</span>
                    <span class="bcg-quad-label">علامة استفهام — انمِ</span>
                    <span class="bcg-quad-count">{{ branchesOf('question').length }}</span>
                  </div>
                  <div class="bcg-branch-list">
                    @for (b of branchesOf('question'); track b.branchName) {
                      <div class="bcg-branch-card" [class.selected]="selectedBranch()?.branchName === b.branchName" (click)="selectBranch(b)">
                        <div class="bcg-branch-name">{{ b.branchName }}</div>
                        <div class="bcg-branch-meta">
                          <span class="bcg-branch-sar">{{ fmtSar(b.totalSar) }}</span>
                          <span class="bcg-branch-rate">{{ b.diffRate | number:'1.2-2' }} ريال/غ</span>
                          <span>{{ b.region }}</span>
                        </div>
                      </div>
                    }
                    @if (!branchesOf('question').length) {
                      <div style="padding:0.5rem 0.9rem;font-size:0.78rem;color:var(--mizan-text-muted)">لا يوجد</div>
                    }
                  </div>
                </div>

                <!-- DOG quadrant -->
                <div class="bcg-quadrant quad-dog">
                  <div class="bcg-quad-header">
                    <span class="bcg-quad-icon">🐕</span>
                    <span class="bcg-quad-label">ضعيف — أصلح أو أغلق</span>
                    <span class="bcg-quad-count">{{ branchesOf('dog').length }}</span>
                  </div>
                  <div class="bcg-branch-list">
                    @for (b of branchesOf('dog'); track b.branchName) {
                      <div class="bcg-branch-card" [class.selected]="selectedBranch()?.branchName === b.branchName" (click)="selectBranch(b)">
                        <div class="bcg-branch-name">{{ b.branchName }}</div>
                        <div class="bcg-branch-meta">
                          <span class="bcg-branch-sar">{{ fmtSar(b.totalSar) }}</span>
                          <span class="bcg-branch-rate">{{ b.diffRate | number:'1.2-2' }} ريال/غ</span>
                          <span>{{ b.region }}</span>
                        </div>
                      </div>
                    }
                    @if (!branchesOf('dog').length) {
                      <div style="padding:0.5rem 0.9rem;font-size:0.78rem;color:var(--mizan-text-muted)">لا يوجد</div>
                    }
                  </div>
                </div>
              </div>

              <!-- Detail panel for selected branch -->
              @if (selectedBranch()) {
                <div class="bcg-detail-panel">
                  <div class="bcg-detail-header" [class]="'bcg-detail-header h-' + selectedBranch()!.classification">
                    <span class="bcg-detail-icon">{{ bcgIcon(selectedBranch()!.classification) }}</span>
                    <div>
                      <div class="bcg-detail-name">{{ selectedBranch()!.branchName }}</div>
                      <div class="bcg-detail-region">{{ selectedBranch()!.region }} · {{ selectedBranch()!.classificationAr }}</div>
                    </div>
                  </div>
                  <div class="bcg-detail-body">
                    <!-- Strategy directive -->
                    <div class="bcg-strategy-box" [class]="'bcg-strategy-box s-' + selectedBranch()!.classification">
                      {{ selectedBranch()!.strategy }}
                    </div>
                    <!-- Strengths & Weaknesses -->
                    <div class="bcg-sw-row">
                      <div class="bcg-sw-block">
                        <div class="bcg-sw-title">✅ نقاط القوة</div>
                        @for (s of selectedBranch()!.strengths; track $index) {
                          <div class="bcg-sw-item">
                            <span class="bcg-sw-dot" style="background:var(--mizan-green)"></span>{{ s }}
                          </div>
                        }
                      </div>
                      <div class="bcg-sw-block">
                        <div class="bcg-sw-title">⚠️ نقاط الضعف</div>
                        @for (w of selectedBranch()!.weaknesses; track $index) {
                          <div class="bcg-sw-item">
                            <span class="bcg-sw-dot" style="background:var(--mizan-danger)"></span>{{ w }}
                          </div>
                        }
                      </div>
                    </div>
                    <!-- Action Items -->
                    <div class="bcg-actions">
                      <div class="bullet-title">📋 الإجراءات المطلوبة</div>
                      @for (a of selectedBranch()!.actionItems; track $index) {
                        <div class="bcg-action-item">
                          <span class="bcg-action-num">{{ $index + 1 }}</span>{{ a }}
                        </div>
                      }
                    </div>
                    <!-- Revenue impact -->
                    @if (selectedBranch()!.revenueImpact) {
                      <div class="bcg-impact">💰 {{ selectedBranch()!.revenueImpact }}</div>
                    }
                  </div>
                </div>
              }
            }

            <!-- Regional Insights -->
            @if (result()?.regionalInsights?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🗺️ رؤى إقليمية</div>
                <div class="regional-grid">
                  @for (r of result()?.regionalInsights; track r.region) {
                    <div class="regional-card">
                      <div class="regional-name">{{ r.region }}</div>
                      <div class="regional-meta">{{ r.totalBranches }} فرع</div>
                      <span class="health-pill"
                        [class.health-strong]="r.overallHealth === 'strong'"
                        [class.health-moderate]="r.overallHealth === 'moderate'"
                        [class.health-weak]="r.overallHealth === 'weak'">
                        {{ r.overallHealth === 'strong' ? 'قوي' : r.overallHealth === 'moderate' ? 'متوسط' : 'ضعيف' }}
                      </span>
                      <div class="regional-rec">{{ r.recommendation }}</div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Urgent Actions -->
            @if (result()?.urgentActions?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🚨 إجراءات عاجلة</div>
                <div class="urgent-list">
                  @for (a of result()?.urgentActions; track $index) {
                    <div class="urgent-item">
                      <span class="urgent-icon">⚡</span>{{ a }}
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Quarterly Forecast -->
            @if (result()?.quarterlyForecast) {
              <div class="bullet-section">
                <div class="bullet-title">📅 التوقعات الفصلية</div>
                <div class="forecast-box">{{ result()?.quarterlyForecast }}</div>
              </div>
            }

          </div>
        </div>
      }

      <!-- ── TRANSFER OPTIMIZER ── -->
      @if (activeFeature() === 'transfer-optimizer') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🔄</span>
              <span class="ai-card-title">محسّن نقل الموظفين</span>
            </div>

            <!-- Suggested Transfers -->
            @if (result()?.suggestedTransfers?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🔄 اقتراحات النقل ({{ result()?.suggestedTransfers?.length }})</div>
                <div class="transfer-grid">
                  @for (t of result()?.suggestedTransfers; track $index) {
                    <div class="transfer-card">
                      <div class="transfer-emp-name">{{ t.empName }}
                        <span class="td-muted" style="font-weight:400;margin-right:0.4rem">{{ t.empId }}</span>
                      </div>
                      <div class="transfer-arrow-row">
                        <div class="transfer-branch transfer-from">{{ t.currentBranch }}</div>
                        <span class="transfer-arrow-icon">←</span>
                        <div class="transfer-branch transfer-to">{{ t.suggestedBranch }}</div>
                      </div>
                      <div class="transfer-perf">{{ t.currentPerformance }}</div>
                      <div class="transfer-reason">{{ t.reason }}</div>
                      <div class="transfer-footer">
                        <span class="transfer-improvement">{{ t.expectedImprovement }}</span>
                        <span class="confidence-badge"
                          [class.conf-high]="t.confidence==='high'"
                          [class.conf-medium]="t.confidence==='medium'"
                          [class.conf-low]="t.confidence==='low'">
                          {{ t.confidence === 'high' ? 'ثقة عالية' : t.confidence === 'medium' ? 'ثقة متوسطة' : 'ثقة منخفضة' }}
                        </span>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Staffing Tables -->
            <div class="staffing-tables">
              <!-- Overstaffed -->
              @if (result()?.overstaffedBranches?.length) {
                <div class="staffing-block overstaffed-block">
                  <div class="staffing-header overstaffed-header">
                    📉 فروع مكتظة بالموظفين ({{ result()?.overstaffedBranches?.length }})
                  </div>
                  <table class="staffing-table">
                    <thead>
                      <tr><th>الفرع</th><th>الموظفون</th><th>مبيعات/موظف</th><th>الاقتراح</th></tr>
                    </thead>
                    <tbody>
                      @for (b of result()?.overstaffedBranches; track $index) {
                        <tr>
                          <td style="font-weight:600">{{ b.branch }}</td>
                          <td style="text-align:center;color:#f87171">{{ b.employees }}</td>
                          <td style="text-align:center">{{ b.salesPerEmp | number:'1.0-0' }}</td>
                          <td style="color:var(--mizan-text-muted);font-size:0.75rem">{{ b.suggestion }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }

              <!-- Understaffed -->
              @if (result()?.understaffedBranches?.length) {
                <div class="staffing-block understaffed-block">
                  <div class="staffing-header understaffed-header">
                    📈 فروع تحتاج موظفين ({{ result()?.understaffedBranches?.length }})
                  </div>
                  <table class="staffing-table">
                    <thead>
                      <tr><th>الفرع</th><th>الموظفون</th><th>مبيعات/موظف</th><th>الاقتراح</th></tr>
                    </thead>
                    <tbody>
                      @for (b of result()?.understaffedBranches; track $index) {
                        <tr>
                          <td style="font-weight:600">{{ b.branch }}</td>
                          <td style="text-align:center;color:var(--mizan-green)">{{ b.employees }}</td>
                          <td style="text-align:center;color:var(--mizan-gold);font-weight:600">{{ b.salesPerEmp | number:'1.0-0' }}</td>
                          <td style="color:var(--mizan-text-muted);font-size:0.75rem">{{ b.suggestion }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>

            <!-- Balancing Plan -->
            @if (result()?.balancingPlan) {
              <div class="bullet-section">
                <div class="bullet-title">📋 خطة التوازن العامة</div>
                <div class="balancing-plan">{{ result()?.balancingPlan }}</div>
              </div>
            }

          </div>
        </div>
      }

      <!-- ── ANOMALY DETECTION ── -->
      @if (activeFeature() === 'anomaly-detection') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🔍</span>
              <span class="ai-card-title">كشف الشذوذات والأنماط المريبة</span>
            </div>

            <!-- Risk Score bar -->
            @if (result()?.riskScore != null) {
              <div class="anomaly-risk-bar">
                <div class="risk-score-wrap">
                  <div class="risk-score-num"
                    [class.risk-score-low]="result()?.riskScore < 30"
                    [class.risk-score-medium]="result()?.riskScore >= 30 && result()?.riskScore < 65"
                    [class.risk-score-high]="result()?.riskScore >= 65">
                    {{ result()?.riskScore }}
                  </div>
                  <div class="risk-score-label">/ 100 مستوى الخطر</div>
                </div>
                <div class="risk-summary">{{ result()?.riskSummary }}</div>
              </div>
            }

            <!-- Severity filter tabs -->
            @if (result()?.anomalies?.length) {
              <div class="anomaly-filters">
                <button class="sev-filter" [class.active-all]="anomalyFilter() === 'all'" (click)="setAnomalyFilter('all')">
                  الكل ({{ result()?.anomalies?.length }})
                </button>
                @if (anomalyCount('critical') > 0) {
                  <button class="sev-filter" [class.active-critical]="anomalyFilter() === 'critical'" (click)="setAnomalyFilter('critical')">
                    🔴 حرج ({{ anomalyCount('critical') }})
                  </button>
                }
                @if (anomalyCount('high') > 0) {
                  <button class="sev-filter" [class.active-high]="anomalyFilter() === 'high'" (click)="setAnomalyFilter('high')">
                    🟠 عالي ({{ anomalyCount('high') }})
                  </button>
                }
                @if (anomalyCount('medium') > 0) {
                  <button class="sev-filter" [class.active-medium]="anomalyFilter() === 'medium'" (click)="setAnomalyFilter('medium')">
                    🔵 متوسط ({{ anomalyCount('medium') }})
                  </button>
                }
                @if (anomalyCount('low') > 0) {
                  <button class="sev-filter" [class.active-low]="anomalyFilter() === 'low'" (click)="setAnomalyFilter('low')">
                    🟢 منخفض ({{ anomalyCount('low') }})
                  </button>
                }
              </div>

              <!-- Anomaly cards -->
              <div class="anomaly-list">
                @for (a of filteredAnomalies(); track $index) {
                  <div class="anomaly-card">
                    <div class="anomaly-card-header"
                      [class]="'anomaly-card-header anomaly-header-bg-' + a.severity"
                      (click)="toggleAnomaly($index)">
                      <span class="anom-sev-dot" [class]="'sev-' + a.severity"></span>
                      <span class="anom-type-badge">{{ anomalyTypeLabel(a.type) }}</span>
                      <span class="anom-desc">{{ a.description }}</span>
                      @if (a.branch) {
                        <span class="anom-branch">{{ a.branch }}</span>
                      }
                      <span class="anom-confidence">{{ (a.confidence * 100) | number:'1.0-0' }}%</span>
                      <span class="anom-expand-icon" [class.open]="isAnomalyOpen($index)">▼</span>
                    </div>
                    @if (isAnomalyOpen($index)) {
                      <div class="anomaly-card-body">
                        <div class="anom-detail-row">
                          @if (a.branch) {
                            <div class="anom-detail-item">
                              <span class="anom-detail-label">الفرع: </span>
                              <span class="anom-detail-value">{{ a.branch }}</span>
                            </div>
                          }
                          @if (a.employee) {
                            <div class="anom-detail-item">
                              <span class="anom-detail-label">الموظف: </span>
                              <span class="anom-detail-value">{{ a.employee }}</span>
                            </div>
                          }
                          @if (a.date) {
                            <div class="anom-detail-item">
                              <span class="anom-detail-label">التاريخ: </span>
                              <span class="anom-detail-value">{{ a.date }}</span>
                            </div>
                          }
                        </div>
                        <div class="anom-action-box">
                          <div class="anom-action-label">💡 الإجراء المطلوب</div>
                          {{ a.action }}
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Patterns -->
            @if (result()?.patterns?.length) {
              <div class="bullet-section">
                <div class="bullet-title">📊 الأنماط المكتشفة ({{ result()?.patterns?.length }})</div>
                <div class="patterns-grid">
                  @for (p of result()?.patterns; track $index) {
                    <div class="pattern-card">
                      <div class="pattern-type">{{ patternTypeLabel(p.type) }}</div>
                      <div class="pattern-scope">{{ patternScopeLabel(p.scope) }}</div>
                      <div class="pattern-desc">{{ p.description }}</div>
                      <div class="pattern-rec">💡 {{ p.recommendation }}</div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Data Quality Issues -->
            @if (result()?.dataQualityIssues?.length) {
              <div class="bullet-section">
                <div class="bullet-title">⚙️ مشاكل جودة البيانات ({{ result()?.dataQualityIssues?.length }})</div>
                <div class="dq-list">
                  @for (d of result()?.dataQualityIssues; track $index) {
                    <div class="dq-card">
                      <div class="dq-issue">{{ d.issue }}</div>
                      <div class="dq-details">{{ d.details }}</div>
                      <div class="dq-action">🔧 {{ d.action }}</div>
                    </div>
                  }
                </div>
              </div>
            }

          </div>
        </div>
      }

      <!-- ── PURCHASE INTELLIGENCE ── -->
      @if (activeFeature() === 'purchase-intelligence') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">💰</span>
              <span class="ai-card-title">ذكاء المشتريات</span>
            </div>

            <!-- Top opportunity -->
            @if (result()?.topOpportunity) {
              <div class="pi-opportunity-box">
                <div class="pi-opportunity-label">🎯 أهم فرصة الآن</div>
                <div class="pi-opportunity-text">{{ result()?.topOpportunity }}</div>
              </div>
            }

            <!-- Score + Interpretation -->
            <div class="pi-score-row">
              <div class="pi-gauge">
                <div class="pi-gauge-num">{{ result()?.purchaseTimingScore }}</div>
                <div class="pi-gauge-label">نقاط كفاءة الشراء<br>من 100</div>
              </div>
              <div class="pi-interpretation">{{ result()?.interpretation }}</div>
            </div>

            <!-- Spread trend pill -->
            @if (result()?.spreadTrend) {
              <div>
                <span class="spread-trend-pill"
                  [class.spread-improving]="result()?.spreadTrend === 'improving'"
                  [class.spread-stable]="result()?.spreadTrend === 'stable'"
                  [class.spread-deteriorating]="result()?.spreadTrend === 'deteriorating'">
                  <span>{{ result()?.spreadTrend === 'improving' ? '📈 الهامش في تحسّن' : result()?.spreadTrend === 'deteriorating' ? '📉 الهامش في تراجع' : '➡️ الهامش مستقر' }}</span>
                </span>
                @if (result()?.spreadTrendReason) {
                  <span style="font-size:0.8rem;color:var(--mizan-text-muted);margin-right:0.5rem">{{ result()?.spreadTrendReason }}</span>
                }
              </div>
            }

            <!-- Best / Worst purchase days -->
            @if (result()?.bestPurchaseDays?.length || result()?.worstPurchaseDays?.length) {
              <div class="pi-days-row">
                <div class="pi-days-block best-days">
                  <div class="pi-days-title">📅 أفضل أيام الشراء</div>
                  <div class="pi-day-chips">
                    @for (d of result()?.bestPurchaseDays; track $index) {
                      <span class="pi-day-chip">{{ d }}</span>
                    }
                  </div>
                </div>
                <div class="pi-days-block worst-days">
                  <div class="pi-days-title">🚫 أسوأ أيام الشراء</div>
                  <div class="pi-day-chips">
                    @for (d of result()?.worstPurchaseDays; track $index) {
                      <span class="pi-day-chip">{{ d }}</span>
                    }
                  </div>
                </div>
              </div>
            }

            <!-- Mothan vs Branch Purchase -->
            @if (result()?.mothanVsBranchPurchase) {
              <div class="bullet-section">
                <div class="bullet-title">⚖️ موطن الذهب مقابل مشتريات الفروع</div>
                <div class="mothan-box">
                  <div class="mothan-rate-row">
                    <div class="mothan-rate-block">
                      <div class="mothan-rate-num"
                        [class.cheaper]="result()?.mothanVsBranchPurchase?.mothanAvgRate < result()?.mothanVsBranchPurchase?.branchPurchAvgRate"
                        [class.pricier]="result()?.mothanVsBranchPurchase?.mothanAvgRate > result()?.mothanVsBranchPurchase?.branchPurchAvgRate"
                        [class.neutral]="result()?.mothanVsBranchPurchase?.mothanAvgRate === result()?.mothanVsBranchPurchase?.branchPurchAvgRate">
                        {{ result()?.mothanVsBranchPurchase?.mothanAvgRate | number:'1.2-2' }}
                      </div>
                      <div class="mothan-rate-label">سعر موطن (ريال/غ)</div>
                    </div>
                    <div class="mothan-vs-divider">مقابل</div>
                    <div class="mothan-rate-block">
                      <div class="mothan-rate-num neutral">{{ result()?.mothanVsBranchPurchase?.branchPurchAvgRate | number:'1.2-2' }}</div>
                      <div class="mothan-rate-label">سعر شراء الفروع (ريال/غ)</div>
                    </div>
                    <div class="mothan-rate-block">
                      <div class="mothan-rate-num" style="color:#93c5fd;font-size:1rem">{{ result()?.mothanVsBranchPurchase?.mothanPct | number:'1.1-1' }}%</div>
                      <div class="mothan-rate-label">نسبة موطن من الشراء</div>
                    </div>
                  </div>
                  <div class="mothan-rec">{{ result()?.mothanVsBranchPurchase?.recommendation }}</div>
                  <div class="mothan-save">💡 {{ result()?.mothanVsBranchPurchase?.potentialSavings }}</div>
                </div>
              </div>
            }

            <!-- Branch Purchase Efficiency Leaderboard -->
            @if (result()?.branchPurchaseEfficiency?.length) {
              <div class="bullet-section">
                <div class="bullet-title">🏆 كفاءة الشراء لكل فرع</div>
                <div class="efficiency-table-wrap">
                  <table class="efficiency-table">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>الفرع</th>
                        <th>المنطقة</th>
                        <th>سعر شراء الفرع</th>
                        <th>متوسط الشركة</th>
                        <th>الفرق</th>
                        <th>الحكم</th>
                        <th>الوفر المقدّر</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (b of result()?.branchPurchaseEfficiency; track $index) {
                        <tr>
                          <td>
                            <span class="eff-rank"
                              [class.rank-top]="$index < 3"
                              [class.rank-bottom]="$index >= result()?.branchPurchaseEfficiency?.length - 3"
                              [class.rank-mid]="$index >= 3 && $index < result()?.branchPurchaseEfficiency?.length - 3">
                              {{ $index + 1 }}
                            </span>
                          </td>
                          <td style="font-weight:600">{{ b.branch }}</td>
                          <td style="color:var(--mizan-text-muted);font-size:0.78rem">{{ b.region }}</td>
                          <td>{{ b.avgPurchRate | number:'1.2-2' }}</td>
                          <td style="color:var(--mizan-text-muted)">{{ b.companyAvg | number:'1.2-2' }}</td>
                          <td>
                            <span [class.delta-positive]="b.delta >= 0" [class.delta-negative]="b.delta < 0">
                              {{ b.delta >= 0 ? '+' : '' }}{{ b.delta | number:'1.2-2' }}
                            </span>
                          </td>
                          <td style="font-size:0.78rem">{{ b.verdict }}</td>
                          <td style="font-size:0.78rem;color:var(--mizan-gold)">{{ b.savingsEstimate }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- Karat Purchase Advice -->
            @if (result()?.karatPurchaseAdvice?.length) {
              <div class="bullet-section">
                <div class="bullet-title">💎 توصيات شراء الأعيار</div>
                <div class="karat-advice-grid">
                  @for (k of result()?.karatPurchaseAdvice; track k.karat) {
                    <div class="karat-advice-card">
                      <div class="karat-label">عيار {{ k.karat }}</div>
                      <div class="karat-rates">
                        <div class="karat-rate-item">
                          <span class="karat-rate-key">شراء: </span>
                          <span class="karat-rate-val">{{ k.currentPurchRate | number:'1.2-2' }}</span>
                        </div>
                        <div class="karat-rate-item">
                          <span class="karat-rate-key">بيع: </span>
                          <span class="karat-rate-val">{{ k.currentSaleRate | number:'1.2-2' }}</span>
                        </div>
                        <div class="karat-rate-item">
                          <span class="karat-rate-key">هامش: </span>
                          <span class="karat-rate-val" style="color:var(--mizan-gold)">{{ k.marginPerGram | number:'1.2-2' }}</span>
                        </div>
                      </div>
                      <span class="demand-pill"
                        [class.demand-high]="k.demandSignal === 'high'"
                        [class.demand-medium]="k.demandSignal === 'medium'"
                        [class.demand-low]="k.demandSignal === 'low'">
                        {{ k.demandSignal === 'high' ? 'طلب مرتفع' : k.demandSignal === 'medium' ? 'طلب متوسط' : 'طلب منخفض' }}
                      </span>
                      <div class="karat-advice-text">{{ k.advice }}</div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- Weekly Budget Suggestion -->
            @if (result()?.weeklyBudgetSuggestion) {
              <div class="bullet-section">
                <div class="bullet-title">📋 اقتراح الميزانية الأسبوعية</div>
                <div class="balancing-plan">{{ result()?.weeklyBudgetSuggestion }}</div>
              </div>
            }

          </div>
        </div>
      }

      <!-- ── RISK ASSESSMENT ── -->
      @if (activeFeature() === 'risk-assessment') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">🛡️</span>
              <span class="ai-card-title">تقييم المخاطر الشامل</span>
            </div>

            <!-- Company-level risk header -->
            @if (result()?.companyRiskScore != null) {
              <div class="risk-company-header" [class]="'risk-company-header risk-co-' + result()?.companyRiskLevel">
                <!-- Semicircle gauge -->
                <div class="gauge-wrap">
                  <svg class="gauge-svg" viewBox="0 0 120 64">
                    <path class="gauge-track" d="M 10 60 A 50 50 0 0 1 110 60" />
                    <path class="gauge-fill"
                      [class]="'gauge-fill gauge-fill-' + result()?.companyRiskLevel"
                      [attr.d]="gaugeArc(result()?.companyRiskScore)"
                      [attr.stroke-dasharray]="gaugeDash(result()?.companyRiskScore)" />
                  </svg>
                  <div class="gauge-num" [class]="'gnum-' + result()?.companyRiskLevel">
                    {{ result()?.companyRiskScore }}
                  </div>
                </div>
                <!-- Risk level + counts -->
                <div class="risk-co-info">
                  <div class="risk-co-level" [class]="'rl-' + result()?.companyRiskLevel">
                    {{ riskLevelLabel(result()?.companyRiskLevel) }}
                  </div>
                  <div class="risk-co-counts">
                    @if (branchCountByLevel('critical') > 0) {
                      <span class="risk-count-badge rc-critical">{{ branchCountByLevel('critical') }} حرج</span>
                    }
                    @if (branchCountByLevel('high') > 0) {
                      <span class="risk-count-badge rc-high">{{ branchCountByLevel('high') }} عالي</span>
                    }
                    @if (branchCountByLevel('medium') > 0) {
                      <span class="risk-count-badge rc-medium">{{ branchCountByLevel('medium') }} متوسط</span>
                    }
                    @if (branchCountByLevel('low') > 0) {
                      <span class="risk-count-badge rc-low">{{ branchCountByLevel('low') }} منخفض</span>
                    }
                  </div>
                </div>
              </div>
            }

            <!-- Top risks + Positive indicators -->
            @if (result()?.topRisks?.length || result()?.positiveIndicators?.length) {
              <div class="risk-overview-grid">
                @if (result()?.topRisks?.length) {
                  <div class="risk-overview-block risk-risks">
                    <div class="risk-overview-title">🚨 أبرز المخاطر</div>
                    @for (r of result()?.topRisks; track $index) {
                      <div class="risk-overview-item">
                        <span class="risk-ov-dot" style="background:var(--mizan-danger)"></span>{{ r }}
                      </div>
                    }
                  </div>
                }
                @if (result()?.positiveIndicators?.length) {
                  <div class="risk-overview-block risk-positives">
                    <div class="risk-overview-title">✅ مؤشرات إيجابية</div>
                    @for (p of result()?.positiveIndicators; track $index) {
                      <div class="risk-overview-item">
                        <span class="risk-ov-dot" style="background:var(--mizan-green)"></span>{{ p }}
                      </div>
                    }
                  </div>
                }
              </div>
            }

            <!-- Branch risk list -->
            @if (result()?.branchRisks?.length) {
              <div class="bullet-title" style="margin-bottom:0.75rem">📋 تفاصيل المخاطر لكل فرع</div>
              <div class="risk-branch-list">
                @for (b of result()?.branchRisks; track b.branchName) {
                  <div class="risk-branch-card">
                    <!-- Header row -->
                    <div class="risk-branch-header"
                      [class]="'risk-branch-header rbh-' + b.riskLevel"
                      (click)="toggleRiskBranch(b.branchName)">
                      <!-- Mini gauge -->
                      <div class="risk-branch-gauge">
                        <div class="mini-gauge-wrap">
                          <svg class="mini-gauge-svg" viewBox="0 0 70 38">
                            <path class="gauge-track" style="stroke-width:7" d="M 6 35 A 29 29 0 0 1 64 35" />
                            <path class="gauge-fill"
                              [class]="'gauge-fill gauge-fill-' + b.riskLevel"
                              style="stroke-width:7"
                              [attr.d]="miniGaugeArc(b.riskScore)"
                              [attr.stroke-dasharray]="miniGaugeDash(b.riskScore)" />
                          </svg>
                          <div class="mini-gauge-num" [class]="'gnum-' + b.riskLevel">{{ b.riskScore }}</div>
                        </div>
                      </div>
                      <!-- Branch info -->
                      <div class="risk-branch-info">
                        <div class="risk-branch-name">{{ b.branchName }}</div>
                        <div class="risk-branch-meta">{{ b.region }} · {{ b.branchCode }}</div>
                      </div>
                      <span class="risk-level-badge" [class]="'rlb-' + b.riskLevel">
                        {{ riskLevelLabel(b.riskLevel) }}
                      </span>
                      <span class="risk-expand-icon" [class.open]="isRiskBranchOpen(b.branchName)">▼</span>
                    </div>

                    <!-- Expandable body -->
                    @if (isRiskBranchOpen(b.branchName)) {
                      <div class="risk-branch-body" [class]="'risk-branch-body rbody-' + b.riskLevel">
                        <!-- Factor bars -->
                        @if (b.factors?.length) {
                          <div class="risk-factors-grid">
                            @for (f of b.factors; track f.factor) {
                              <div class="risk-factor-row">
                                <div class="factor-name">{{ f.factor }}</div>
                                <div class="factor-bar-track">
                                  <div class="factor-bar-fill"
                                    [class]="f.score >= 60 ? 'fbar-high' : f.score >= 35 ? 'fbar-medium' : 'fbar-low'"
                                    [style.width.%]="f.score">
                                  </div>
                                </div>
                                <div class="factor-score" [class]="f.score >= 60 ? 'gnum-high' : f.score >= 35 ? 'gnum-medium' : 'gnum-low'">
                                  {{ f.score }}
                                </div>
                                <div class="factor-detail">{{ f.detail }}</div>
                              </div>
                            }
                          </div>
                        }
                        <!-- Mitigation plan -->
                        @if (b.mitigationPlan) {
                          <div class="risk-mitigation">
                            <div class="risk-mitigation-label">📋 خطة التخفيف</div>
                            <div class="risk-mitigation-text">{{ b.mitigationPlan }}</div>
                          </div>
                        }
                        <!-- Estimated impact -->
                        @if (b.estimatedImpact) {
                          <span class="risk-impact">🎯 {{ b.estimatedImpact }}</span>
                        }
                      </div>
                    }
                  </div>
                }
              </div>
            }

          </div>
        </div>
      }

      <!-- ── EXECUTIVE BRIEFING ── -->
      @if (activeFeature() === 'executive-briefing') {
        <!-- Toolbar -->
        <div class="briefing-toolbar">
          <div class="briefing-meta">
            @if (result()?.generatedAt) {
              تم الإنشاء: {{ formatBriefingDate(result()?.generatedAt) }}
            }
          </div>
          <div class="briefing-actions">
            <button class="briefing-btn btn-print" (click)="printBriefing()">📄 طباعة</button>
            <button class="briefing-btn btn-email" disabled title="قريباً">📧 إرسال</button>
          </div>
        </div>

        <!-- Document -->
        <div class="briefing-doc" id="briefing-print-target">
          <!-- Letterhead -->
          <div class="briefing-letterhead">
            <div class="briefing-logo-row">
              <span class="briefing-logo-icon">⚖️</span>
              <span class="briefing-logo-text">MIZAN — ميزان الذهب</span>
            </div>
            <div class="briefing-divider"></div>
            <div class="briefing-title">{{ result()?.title }}</div>
            <div class="briefing-headline">{{ result()?.headline }}</div>
            @if (result()?.performanceSentiment) {
              <div class="briefing-sentiment-row">
                <span class="bs-dot"
                  [style.background]="result()?.performanceSentiment === 'positive' ? 'var(--mizan-green)' :
                                      result()?.performanceSentiment === 'negative' ? 'var(--mizan-danger)' : '#f59e0b'">
                </span>
                <span>{{ result()?.performanceSentiment === 'positive' ? 'أداء إيجابي' :
                          result()?.performanceSentiment === 'negative' ? 'أداء يحتاج تدخل' : 'أداء مستقر' }}</span>
              </div>
            }
          </div>

          <!-- Sections -->
          <div class="briefing-body">
            @for (sec of result()?.sections; track sec.title) {
              <div class="briefing-section">
                <div class="briefing-section-title">{{ sec.title }}</div>
                <ul class="briefing-bullets">
                  @for (bullet of sec.bullets; track $index) {
                    <li class="briefing-bullet">
                      <span class="briefing-bullet-marker"></span>
                      <span>{{ bullet }}</span>
                    </li>
                  }
                </ul>
              </div>
            }
          </div>

          <!-- Closing note -->
          @if (result()?.closingNote) {
            <div class="briefing-closing">{{ result()?.closingNote }}</div>
          }

          <!-- Doc footer -->
          <div class="briefing-footer">
            <span>MIZAN AI · Gemini 2.0 Flash</span>
            <span>{{ formatBriefingDate(result()?.generatedAt) }}</span>
            <span>سري — للاستخدام الداخلي فقط</span>
          </div>
        </div>
      }

      <!-- ── SMART ACTION ITEMS ── -->
      @if (activeFeature() === 'smart-actions') {
        <div class="ai-card">
          <div class="ai-card-inner">
            <div class="ai-card-header">
              <span class="ai-card-icon">✅</span>
              <span class="ai-card-title">الإجراءات الذكية — قائمة المهام التنفيذية</span>
            </div>

            <!-- KPI row -->
            @if (result()?.impactSummary) {
              <div class="actions-kpi-row">
                <div class="actions-kpi">
                  <div class="actions-kpi-value kpi-impact">{{ result()?.impactSummary?.totalPotentialImpact }}</div>
                  <div class="actions-kpi-label">إجمالي الأثر المتوقع</div>
                </div>
                <div class="actions-kpi">
                  <div class="actions-kpi-value kpi-critical">{{ result()?.impactSummary?.criticalItems }}</div>
                  <div class="actions-kpi-label">إجراءات حرجة</div>
                </div>
                <div class="actions-kpi">
                  <div class="actions-kpi-value kpi-high">{{ result()?.impactSummary?.highItems }}</div>
                  <div class="actions-kpi-label">إجراءات مهمة</div>
                </div>
                <div class="actions-kpi">
                  <div class="actions-kpi-value kpi-medium">{{ result()?.impactSummary?.mediumItems }}</div>
                  <div class="actions-kpi-label">إجراءات متوسطة</div>
                </div>
                @if (result()?.impactSummary?.lowItems > 0) {
                  <div class="actions-kpi">
                    <div class="actions-kpi-value kpi-low">{{ result()?.impactSummary?.lowItems }}</div>
                    <div class="actions-kpi-label">إجراءات للاحقاً</div>
                  </div>
                }
              </div>
            }

            <!-- Kanban board: critical | high | medium -->
            @if (result()?.actions?.length) {
              <div class="kanban-board">

                <!-- Critical column -->
                <div class="kanban-col kcol-critical">
                  <div class="kanban-col-header">
                    <span>🔴 حرج</span>
                    <span class="kanban-col-count">{{ actionsOf('critical').length }}</span>
                  </div>
                  <div class="kanban-col-body">
                    @for (a of actionsOf('critical'); track a.id) {
                      <ng-container *ngTemplateOutlet="actionCard; context: { $implicit: a }"></ng-container>
                    }
                    @if (!actionsOf('critical').length) {
                      <div style="padding:0.75rem;font-size:0.78rem;color:var(--mizan-text-muted);text-align:center">لا يوجد</div>
                    }
                  </div>
                </div>

                <!-- High column -->
                <div class="kanban-col kcol-high">
                  <div class="kanban-col-header">
                    <span>🟠 مهم</span>
                    <span class="kanban-col-count">{{ actionsOf('high').length }}</span>
                  </div>
                  <div class="kanban-col-body">
                    @for (a of actionsOf('high'); track a.id) {
                      <ng-container *ngTemplateOutlet="actionCard; context: { $implicit: a }"></ng-container>
                    }
                    @if (!actionsOf('high').length) {
                      <div style="padding:0.75rem;font-size:0.78rem;color:var(--mizan-text-muted);text-align:center">لا يوجد</div>
                    }
                  </div>
                </div>

                <!-- Medium column -->
                <div class="kanban-col kcol-medium">
                  <div class="kanban-col-header">
                    <span>🔵 متوسط</span>
                    <span class="kanban-col-count">{{ actionsOf('medium').length }}</span>
                  </div>
                  <div class="kanban-col-body">
                    @for (a of actionsOf('medium'); track a.id) {
                      <ng-container *ngTemplateOutlet="actionCard; context: { $implicit: a }"></ng-container>
                    }
                    @if (!actionsOf('medium').length) {
                      <div style="padding:0.75rem;font-size:0.78rem;color:var(--mizan-text-muted);text-align:center">لا يوجد</div>
                    }
                  </div>
                </div>

              </div>

              <!-- Low-priority flat list -->
              @if (actionsOf('low').length) {
                <div class="low-actions-section">
                  <div class="bullet-title" style="margin-bottom:0.6rem">🟢 للاحقاً ({{ actionsOf('low').length }})</div>
                  <div class="low-actions-list">
                    @for (a of actionsOf('low'); track a.id) {
                      <div class="low-action-row" (click)="toggleAction(a.id)">
                        <span class="low-action-num">#{{ a.id }}</span>
                        <span class="action-cat-badge" [class]="'action-cat-badge cat-' + a.category">{{ a.categoryAr }}</span>
                        <span class="low-action-title">{{ a.title }}</span>
                        <span class="low-action-impact">{{ a.expectedImpact }}</span>
                      </div>
                    }
                  </div>
                </div>
              }
            }

          </div>
        </div>

        <!-- Action card template -->
        <ng-template #actionCard let-a>
          <div class="action-card" (click)="toggleAction(a.id)">
            <div class="action-card-top">
              <div class="action-card-meta">
                <span class="action-id">#{{ a.id }}</span>
                <span class="action-cat-badge" [class]="'action-cat-badge cat-' + a.category">{{ a.categoryAr }}</span>
                <span class="effort-dot" [class]="'effort-dot effort-' + a.effort">
                  <span></span>
                  {{ a.effort === 'low' ? 'سهل' : a.effort === 'medium' ? 'متوسط' : 'صعب' }}
                </span>
              </div>
              <div class="action-title">{{ a.title }}</div>
              <div class="action-impact-preview">{{ a.expectedImpact }}</div>
            </div>
            @if (isActionOpen(a.id)) {
              <div class="action-card-body">
                <div class="action-desc">{{ a.description }}</div>
                <div class="action-meta-grid">
                  <div class="action-meta-item">
                    <div class="action-meta-key">المسؤول</div>
                    <div class="action-meta-val">{{ a.owner }}</div>
                  </div>
                  <div class="action-meta-item">
                    <div class="action-meta-key">الموعد النهائي</div>
                    <div class="action-meta-val deadline-val">{{ a.deadline }}</div>
                  </div>
                  <div class="action-meta-item" style="grid-column: 1 / -1">
                    <div class="action-meta-key">الأثر المتوقع</div>
                    <div class="action-meta-val impact-val">{{ a.expectedImpact }}</div>
                  </div>
                </div>
              </div>
            }
          </div>
        </ng-template>
      }

      <!-- ── CHAT ASSISTANT ── -->
      @if (activeFeature() === 'chat') {
        <div class="chat-wrapper">
          <!-- Messages -->
          <div class="chat-messages" #chatContainer>

            <!-- Welcome message -->
            <div class="msg-row">
              <div class="msg-avatar">⚖️</div>
              <div>
                <div class="ai-bubble msg-bubble">
                  مرحباً! أنا <strong>ميزان AI</strong>، مساعدك الذكي لبيانات الذهب.
                  يمكنك سؤالي عن أي شيء — الفروع، الموظفون، المبيعات، الأرباح، المخاطر.
                  <div class="welcome-suggestions">
                    <button class="welcome-chip" (click)="askChat('ما هو أفضل فرع أداءً؟')">ما أفضل فرع؟</button>
                    <button class="welcome-chip" (click)="askChat('من هم الموظفون الذين يحتاجون تدريب؟')">من يحتاج تدريب؟</button>
                    <button class="welcome-chip" (click)="askChat('كيف يمكن تحسين هامش الربح؟')">كيف نحسّن الربح؟</button>
                    <button class="welcome-chip" (click)="askChat('ما هي أبرز المخاطر في الفترة الحالية؟')">ما هي المخاطر؟</button>
                    <button class="welcome-chip" (click)="askChat('قارن بين أعلى 3 فروع مبيعاً')">قارن أعلى الفروع</button>
                    <button class="welcome-chip" (click)="askChat('ما هي الفروع التي تحتاج تدخلاً عاجلاً؟')">فروع تحتاج تدخل</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Chat history -->
            @for (msg of chatMessages(); track $index) {
              @if (msg.role === 'user') {
                <div class="msg-row user-row">
                  <div class="msg-avatar user-avatar">👤</div>
                  <div>
                    <div class="user-bubble msg-bubble">{{ msg.text }}</div>
                    <div class="msg-ts">{{ formatTs(msg.ts) }}</div>
                  </div>
                </div>
              }
              @if (msg.role === 'ai' && !msg.isTyping) {
                <div class="msg-row">
                  <div class="msg-avatar">⚖️</div>
                  <div>
                    <div class="ai-bubble msg-bubble">
                      <div class="answer-text">{{ stripSign(msg.data?.answer) }}</div>
                      @if (msg.data?.answer?.includes('ميزان AI')) {
                        <div class="answer-sign">ميزان AI ⚖️</div>
                      }
                      <!-- Related metrics -->
                      @if (msg.data?.relatedMetrics?.length) {
                        <div class="related-metrics">
                          @for (m of msg.data.relatedMetrics; track $index) {
                            <div class="metric-pill">
                              <span class="metric-pill-val">{{ m.value }}</span>
                              <span class="metric-pill-lbl">{{ m.label }}</span>
                            </div>
                          }
                        </div>
                      }
                      <!-- Follow-up suggestions -->
                      @if (msg.data?.suggestedFollowUps?.length) {
                        <div class="chat-suggestions">
                          @for (q of msg.data.suggestedFollowUps; track $index) {
                            <button class="suggestion-chip" (click)="askChat(q)">{{ q }}</button>
                          }
                        </div>
                      }
                    </div>
                    <div class="msg-ts">{{ formatTs(msg.ts) }}</div>
                  </div>
                </div>
              }
              @if (msg.role === 'ai' && msg.isTyping) {
                <div class="msg-row">
                  <div class="msg-avatar">⚖️</div>
                  <div class="typing-bubble">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                  </div>
                </div>
              }
            }

          </div>

          <!-- Input -->
          <div>
            <div class="chat-input-row">
              <input
                #chatInputEl
                class="chat-input"
                placeholder="اسأل ميزان AI أي سؤال عن بياناتك…"
                (keyup.enter)="sendChat(chatInputEl)"
              />
              <button
                class="chat-send-btn"
                [disabled]="chatLoading()"
                (click)="sendChat(chatInputEl)">
                {{ chatLoading() ? '…' : 'إرسال ⚡' }}
              </button>
            </div>
            <div class="chat-input-hint">اضغط Enter للإرسال · البيانات مشفرة ولا تُحفظ</div>
          </div>
        </div>
      }

      <div class="ai-powered">
        <span>⚡</span>
        <span>Powered by Google Gemini 2.0 Flash · MIZAN AI Engine</span>
      </div>
    }
  `
})
export class V3AIComponent implements OnDestroy, AfterViewChecked {
  private aiSvc     = inject(V3AIService);
  private dateRange = inject(V3DateRangeService);
  private cdr       = inject(ChangeDetectorRef);

  activeFeature  = signal('executive');
  loading        = signal(false);
  error          = signal<string | null>(null);
  result         = signal<any>(null);
  selectedBranch = signal<any>(null);
  anomalyFilter     = signal<string>('all');
  expandedAnomalies = signal<Set<number>>(new Set());
  expandedRiskBranches = signal<Set<string>>(new Set());
  expandedActions      = signal<Set<number>>(new Set());

  // Chat state
  chatMessages  = signal<ChatMessage[]>([]);
  chatLoading   = signal(false);
  private shouldScrollChat = false;

  @ViewChild('chatContainer') private chatContainer!: ElementRef<HTMLDivElement>;

  private sub: Subscription | null = null;

  features: AIFeature[] = [
    { key: 'executive',   label: 'الملخص التنفيذي', icon: '🎯', description: 'نظرة شاملة على الأداء الكلي' },
    { key: 'branches',    label: 'الفروع',           icon: '🏪', description: 'تحليل أداء جميع الفروع' },
    { key: 'employees',   label: 'الموظفون',         icon: '👥', description: 'رؤى حول أداء الفريق' },
    { key: 'karat',       label: 'العيار',            icon: '⚖️', description: 'ربحية الأعيار وتوصيات المخزون' },
    { key: 'daily-trend',      label: 'الاتجاه اليومي',     icon: '📈', description: 'أنماط المبيعات اليومية' },
    { key: 'employee-advisor',   label: 'مستشار الموظفين',  icon: '🎓', description: 'تدريب، ترقية، مراقبة، توظيف' },
    { key: 'transfer-optimizer', label: 'محسّن النقل',        icon: '🔄', description: 'توصيات نقل الموظفين وتوازن الفروع' },
    { key: 'branch-strategy',    label: 'استراتيجية الفروع', icon: '🎯', description: 'تصنيف BCG واستراتيجيات النمو لكل فرع' },
    { key: 'anomaly-detection',    label: 'كشف الشذوذات',       icon: '🔍', description: 'احتيال، أنماط مريبة، مشاكل جودة البيانات' },
    { key: 'purchase-intelligence', label: 'ذكاء المشتريات',   icon: '💰', description: 'كفاءة الشراء، موطن مقابل الفروع، توقيت مثالي' },
    { key: 'risk-assessment',       label: 'تقييم المخاطر',    icon: '🛡️', description: 'مخاطر الاحتيال، المالية، التشغيلية لكل فرع' },
    { key: 'executive-briefing',    label: 'الإحاطة التنفيذية', icon: '📄', description: 'تقرير تنفيذي جاهز للطباعة بالعربية الفصحى' },
    { key: 'smart-actions',         label: 'الإجراءات الذكية',  icon: '✅', description: 'قائمة مهام مرتبة بالأولوية من جميع التحليلات' },
    { key: 'chat',                  label: 'ميزان AI',           icon: '💬', description: 'اسأل أي سؤال عن بياناتك بالعربية' },
  ];

  constructor() {
    effect(() => {
      const from    = this.dateRange.from();
      const to      = this.dateRange.to();
      const feature = this.activeFeature();
      if (from && to) this.load(feature, from, to);
    });
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  ngAfterViewChecked(): void {
    if (this.shouldScrollChat && this.chatContainer?.nativeElement) {
      const el = this.chatContainer.nativeElement;
      el.scrollTop = el.scrollHeight;
      this.shouldScrollChat = false;
    }
  }

  selectFeature(key: string): void {
    if (this.activeFeature() === key) return;
    this.activeFeature.set(key);
    // effect will fire automatically
  }

  retry(): void {
    this.error.set(null);
    this.load(this.activeFeature(), this.dateRange.from(), this.dateRange.to());
  }

  private load(feature: string, from: string, to: string): void {
    this.sub?.unsubscribe();
    this.loading.set(true);
    this.error.set(null);
    this.result.set(null);
    this.selectedBranch.set(null);
    this.anomalyFilter.set('all');
    this.expandedAnomalies.set(new Set());
    this.expandedRiskBranches.set(new Set());
    this.expandedActions.set(new Set());
    this.chatMessages.set([]);
    this.chatLoading.set(false);
    this.cdr.markForCheck();

    this.sub = this.aiSvc.getInsights(feature, from, to).subscribe({
      next: (data) => {
        if (data?.error) {
          this.error.set(data.overview ?? 'حدث خطأ في الذكاء الاصطناعي');
          this.result.set(null);
        } else {
          this.result.set(data);
          this.error.set(null);
        }
        this.loading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.error.set('تعذّر الاتصال بخدمة الذكاء الاصطناعي: ' + (err?.message ?? ''));
        this.loading.set(false);
        this.cdr.markForCheck();
      }
    });
  }

  // ── Template helpers ─────────────────────────────────────────────────────────

  sentimentLabel(s: string): string {
    return s === 'positive' ? 'أداء إيجابي' : s === 'negative' ? 'أداء سلبي' : 'أداء محايد';
  }

  actionLabel(a: string): string {
    return a === 'push' ? '↑ زيادة' : a === 'reduce' ? '↓ تقليل' : '= استمرار';
  }

  trendIcon(d: string): string {
    return d === 'up' ? '↗️' : d === 'down' ? '↘️' : '➡️';
  }

  trendLabel(d: string): string {
    return d === 'up' ? 'تصاعدي' : d === 'down' ? 'تنازلي' : 'مستقر';
  }

  // ── Branch Strategy helpers ─────────────────────────────────────────────────

  branchesOf(cls: string): any[] {
    return (this.result()?.branchStrategies ?? []).filter((b: any) => b.classification === cls);
  }

  selectBranch(b: any): void {
    this.selectedBranch.set(this.selectedBranch()?.branchName === b.branchName ? null : b);
    this.cdr.markForCheck();
  }

  bcgIcon(cls: string): string {
    return cls === 'star' ? '🌟' : cls === 'cash_cow' ? '🐄' : cls === 'question' ? '❓' : '🐕';
  }

  fmtSar(n: number): string {
    if (!n) return '0';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000)     return (n / 1_000).toFixed(0) + 'K';
    return n.toFixed(0);
  }

  // ── Anomaly Detection helpers ─────────────────────────────────────────────

  filteredAnomalies(): any[] {
    const all: any[] = this.result()?.anomalies ?? [];
    const f = this.anomalyFilter();
    return f === 'all' ? all : all.filter((a: any) => a.severity === f);
  }

  anomalyCount(sev: string): number {
    return (this.result()?.anomalies ?? []).filter((a: any) => a.severity === sev).length;
  }

  setAnomalyFilter(f: string): void {
    this.anomalyFilter.set(f);
    this.expandedAnomalies.set(new Set());
    this.cdr.markForCheck();
  }

  toggleAnomaly(i: number): void {
    const s = new Set(this.expandedAnomalies());
    s.has(i) ? s.delete(i) : s.add(i);
    this.expandedAnomalies.set(s);
    this.cdr.markForCheck();
  }

  isAnomalyOpen(i: number): boolean {
    return this.expandedAnomalies().has(i);
  }

  anomalyTypeLabel(type: string): string {
    const map: Record<string, string> = {
      spike: 'ارتفاع مفاجئ', zero_days: 'أيام صفرية', return_pattern: 'نمط مرتجعات',
      purchase_spike: 'ارتفاع شراء', rate_anomaly: 'شذوذ سعر', self_dealing: 'صفقة ذاتية',
      other: 'أخرى'
    };
    return map[type] ?? type;
  }

  patternTypeLabel(type: string): string {
    const map: Record<string, string> = {
      seasonal: 'موسمي', weekly: 'أسبوعي', behavioral: 'سلوكي', structural: 'هيكلي'
    };
    return map[type] ?? type;
  }

  patternScopeLabel(scope: string): string {
    const map: Record<string, string> = {
      'fleet-wide': 'على مستوى الشبكة', regional: 'إقليمي', 'branch-specific': 'خاص بالفرع'
    };
    return map[scope] ?? scope;
  }

  // ── Risk Assessment helpers ───────────────────────────────────────────────

  riskLevelLabel(level: string): string {
    const map: Record<string, string> = {
      low: 'مخاطر منخفضة', medium: 'مخاطر متوسطة',
      high: 'مخاطر عالية', critical: 'مخاطر حرجة'
    };
    return map[level] ?? level;
  }

  branchCountByLevel(level: string): number {
    return (this.result()?.branchRisks ?? []).filter((b: any) => b.riskLevel === level).length;
  }

  toggleRiskBranch(name: string): void {
    const s = new Set(this.expandedRiskBranches());
    s.has(name) ? s.delete(name) : s.add(name);
    this.expandedRiskBranches.set(s);
    this.cdr.markForCheck();
  }

  isRiskBranchOpen(name: string): boolean {
    return this.expandedRiskBranches().has(name);
  }

  // SVG semicircle gauge helpers
  // Arc: centre (60,60), radius 50, from left (10,60) to right (110,60) = 180° sweep
  // dasharray circumference of semicircle = π×50 ≈ 157.08
  private readonly GAUGE_CIRC = Math.PI * 50; // 157.08

  gaugeArc(_score: number): string {
    return 'M 10 60 A 50 50 0 0 1 110 60';
  }

  gaugeDash(score: number): string {
    const filled = Math.max(0, Math.min(100, score ?? 0)) / 100 * this.GAUGE_CIRC;
    return `${filled} ${this.GAUGE_CIRC}`;
  }

  // Mini gauge: centre (35,35), radius 29 → circumference π×29 ≈ 91.11
  private readonly MINI_CIRC = Math.PI * 29; // 91.11

  miniGaugeArc(_score: number): string {
    return 'M 6 35 A 29 29 0 0 1 64 35';
  }

  miniGaugeDash(score: number): string {
    const filled = Math.max(0, Math.min(100, score ?? 0)) / 100 * this.MINI_CIRC;
    return `${filled} ${this.MINI_CIRC}`;
  }

  // ── Executive Briefing helpers ────────────────────────────────────────────

  formatBriefingDate(iso: string): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ar-SA', {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch { return iso; }
  }

  printBriefing(): void {
    window.print();
  }

  // ── Smart Actions helpers ─────────────────────────────────────────────────

  actionsOf(priority: string): any[] {
    return (this.result()?.actions ?? []).filter((a: any) => a.priority === priority);
  }

  toggleAction(id: number): void {
    const s = new Set(this.expandedActions());
    s.has(id) ? s.delete(id) : s.add(id);
    this.expandedActions.set(s);
    this.cdr.markForCheck();
  }

  isActionOpen(id: number): boolean {
    return this.expandedActions().has(id);
  }

  // ── Chat Assistant helpers ─────────────────────────────────────────────────

  askChat(question: string): void {
    // Create a fake input element to reuse sendChat logic
    const fake = { value: question } as HTMLInputElement;
    this.sendChat(fake);
  }

  sendChat(inputEl: HTMLInputElement): void {
    const question = inputEl.value.trim();
    if (!question || this.chatLoading()) return;
    inputEl.value = '';

    // Append user message
    this.chatMessages.update(msgs => [
      ...msgs,
      { role: 'user', text: question, ts: new Date() }
    ]);

    // Append typing indicator
    this.chatMessages.update(msgs => [
      ...msgs,
      { role: 'ai', isTyping: true, ts: new Date() }
    ]);

    this.chatLoading.set(true);
    this.shouldScrollChat = true;
    this.cdr.markForCheck();

    const from = this.dateRange.from();
    const to   = this.dateRange.to();

    this.aiSvc.chat(question, from, to).subscribe({
      next: (data) => {
        // Replace typing indicator with real answer
        this.chatMessages.update(msgs => {
          const copy = [...msgs];
          let idx = -1;
          for (let i = copy.length - 1; i >= 0; i--) { if (copy[i].isTyping) { idx = i; break; } }
          if (idx >= 0) copy[idx] = { role: 'ai', data, ts: new Date() };
          return copy;
        });
        this.chatLoading.set(false);
        this.shouldScrollChat = true;
        this.cdr.markForCheck();
      },
      error: () => {
        this.chatMessages.update(msgs => {
          const copy = [...msgs];
          let idx = -1;
          for (let i = copy.length - 1; i >= 0; i--) { if (copy[i].isTyping) { idx = i; break; } }
          if (idx >= 0) copy[idx] = {
            role: 'ai',
            data: {
              answer: 'عذراً، حدث خطأ أثناء معالجة سؤالك. يرجى المحاولة مرة أخرى.\n\nميزان AI ⚖️',
              relatedMetrics: [], suggestedFollowUps: []
            },
            ts: new Date()
          };
          return copy;
        });
        this.chatLoading.set(false);
        this.shouldScrollChat = true;
        this.cdr.markForCheck();
      }
    });
  }

  formatTs(d: Date): string {
    return d.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' });
  }

  stripSign(answer: string): string {
    if (!answer) return '';
    return answer.replace(/ميزان AI\s*⚖️?/g, '').trimEnd();
  }
}
