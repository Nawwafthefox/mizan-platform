import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export type Lang = 'ar' | 'en';

export const TRANSLATIONS: Record<string, { ar: string; en: string }> = {
  // ── Navigation ──────────────────────────────────────────────────────────
  overview:         { ar: 'نظرة عامة',           en: 'Overview' },
  branches:         { ar: 'الفروع',               en: 'Branches' },
  regions:          { ar: 'المناطق',              en: 'Regions' },
  employees:        { ar: 'الموظفون',             en: 'Employees' },
  karat:            { ar: 'عيارات الذهب',          en: 'Karat Analysis' },
  mothan:           { ar: 'موطن الذهب',            en: 'External Gold' },
  heatmap:          { ar: 'الخارطة الحرارية',      en: 'Heatmap' },
  comparison:       { ar: 'مقارنة الأيام',         en: 'Day Comparison' },
  upload:           { ar: 'رفع الملفات',           en: 'Upload Files' },
  users:            { ar: 'المستخدمون',            en: 'Users' },
  rates:            { ar: 'أسعار الشراء',          en: 'Purchase Rates' },
  myPerformance:    { ar: 'أدائي',                en: 'My Performance' },
  analytics:        { ar: 'التحليلات',             en: 'Analytics' },
  management:       { ar: 'الإدارة',              en: 'Management' },

  // ── Upload page ─────────────────────────────────────────────────────────
  noData:           { ar: 'لا توجد بيانات',        en: 'No data available' },
  loading:          { ar: 'جاري التحميل...',        en: 'Loading...' },
  records:          { ar: 'سجل',                   en: 'records' },
  duplicatesSkipped:{ ar: 'مكرر تم تخطيه',         en: 'duplicates skipped' },
  allFiles:         { ar: 'جميع الملفات',           en: 'All files' },
  branchSalesFile:  { ar: 'مبيعات الفروع',          en: 'Branch Sales' },
  empSalesFile:     { ar: 'مبيعات الموظفين',        en: 'Employee Sales' },
  purchasesFile:    { ar: 'المشتريات',              en: 'Purchases' },
  mothanFile:       { ar: 'موطن الذهب',             en: 'External Gold' },
  uploadStarted:    { ar: 'بدأ الرفع...',            en: 'Upload started...' },
  parsing:          { ar: 'جاري التحليل',           en: 'Parsing' },
  saving:           { ar: 'جاري الحفظ',             en: 'Saving' },
  deduplicate:      { ar: 'التحقق من التكرار',       en: 'Checking duplicates' },
  filesParallel:    { ar: 'ملفات بالتوازي',          en: 'files in parallel' },
  newRecordsSaved:  { ar: 'سجل جديد تم حفظه',       en: 'new records saved' },
  uploadHistory:    { ar: 'سجل الرفع',              en: 'Upload History' },
  uploadFiles:      { ar: 'رفع الملفات',            en: 'Upload Files' },
  uploadProgress:   { ar: 'تقدم الرفع',             en: 'Upload Progress' },
  uploadSuccess:    { ar: 'تم رفع جميع الملفات بنجاح', en: 'All files uploaded successfully' },
  dropFiles:        { ar: 'اسحب الملفات هنا أو انقر للاختيار', en: 'Drop files here or click to select' },
  supportsFormats:  { ar: 'يدعم .xls و .xlsx — متعدد الملفات', en: 'Supports .xls and .xlsx — multiple files' },
  selected:         { ar: 'محدد',                   en: 'selected' },
  refresh:          { ar: 'تحديث',                  en: 'Refresh' },
  clear:            { ar: 'مسح',                    en: 'Clear' },
  fileType:         { ar: 'النوع',                  en: 'Type' },
  status:           { ar: 'الحالة',                 en: 'Status' },
  savedRecords:     { ar: 'سجلات',                  en: 'Records' },
  date:             { ar: 'التاريخ',                en: 'Date' },
  file:             { ar: 'الملف',                  en: 'File' },
  success:          { ar: 'ناجح',                   en: 'Success' },
  error:            { ar: 'خطأ',                   en: 'Error' },

  // ── Company management ───────────────────────────────────────────────────
  companyName:      { ar: 'اسم الشركة',             en: 'Company Name' },
  adminEmail:       { ar: 'بريد المدير',             en: 'Admin Email' },
  tempPassword:     { ar: 'كلمة مرور مؤقتة',        en: 'Temp Password' },
  generatePassword: { ar: 'توليد',                  en: 'Generate' },
  copyAll:          { ar: 'نسخ الكل',               en: 'Copy All' },

  // ── Subscription tiers ───────────────────────────────────────────────────
  planStarter:      { ar: 'الأساسي',                en: 'Starter' },
  planBusiness:     { ar: 'الأعمال',                en: 'Business' },
  planEnterprise:   { ar: 'المؤسسات',               en: 'Enterprise' },
  planWhiteLabel:   { ar: 'الشريك',                 en: 'White Label' },
  pricingNotSet:    { ar: 'السعر غير محدد',          en: 'Price not set' },
  baseFee:          { ar: 'الرسوم الأساسية',         en: 'Base Fee' },
  perBranch:        { ar: 'لكل فرع',                en: 'Per Branch' },
  setupFee:         { ar: 'رسوم الإعداد',            en: 'Setup Fee' },
  features:         { ar: 'المميزات',               en: 'Features' },
  enabled:          { ar: 'مفعل',                   en: 'Enabled' },
  disabled:         { ar: 'معطل',                   en: 'Disabled' },

  // ── Auth & session ───────────────────────────────────────────────────────
  impersonate:      { ar: 'تصفح كـ',               en: 'Impersonate' },
  endSession:       { ar: 'إنهاء الجلسة',           en: 'End Session' },
  logout:           { ar: 'تسجيل الخروج',           en: 'Sign Out' },
  login:            { ar: 'دخول',                   en: 'Sign In' },
  email:            { ar: 'البريد الإلكتروني',       en: 'Email' },
  password:         { ar: 'كلمة المرور',             en: 'Password' },
  welcome:          { ar: 'مرحباً',                  en: 'Welcome' },
  emailOrUsername:  { ar: 'البريد الإلكتروني / اسم المستخدم', en: 'Email / Username' },

  // ── Analytics ────────────────────────────────────────────────────────────
  goldAnalytics:    { ar: 'منصة تحليلات الذهب',      en: 'Gold Analytics Platform' },
  totalSales:       { ar: 'إجمالي المبيعات',         en: 'Total Sales' },
  totalPurchases:   { ar: 'إجمالي المشتريات',        en: 'Total Purchases' },
  netWeight:        { ar: 'الوزن الصافي',             en: 'Net Weight' },
  netAmount:        { ar: 'الصافي',                   en: 'Net' },
  saleRate:         { ar: 'معدل البيع',              en: 'Sale Rate' },
  purchaseRate:     { ar: 'معدل الشراء',             en: 'Purchase Rate' },
  rateDiff:         { ar: 'فرق المعدل',              en: 'Rate Diff' },
  totalBranches:    { ar: 'إجمالي الفروع',           en: 'Total Branches' },
  totalEmployees:   { ar: 'إجمالي الموظفين',         en: 'Total Employees' },
  invoices:         { ar: 'الفواتير',               en: 'Invoices' },
  sarUnit:          { ar: 'ر.س',                    en: 'SAR' },
  gramsUnit:        { ar: 'جم',                     en: 'g' },
  sarPerGram:       { ar: 'ر.س/جم',                 en: 'SAR/g' },

  // ── Analytics Studio ─────────────────────────────────────────────────────
  analyticsStudio:    { ar: 'استوديو التحليلات',                en: 'Analytics Studio' },
  analyticsStudioSub: { ar: 'لوحة ذكية للصناعة الذهبية السعودية', en: 'Intelligent Saudi Gold Industry Dashboard' },
  financialOverview:  { ar: 'النظرة المالية الشاملة',            en: 'Financial Overview' },
  branchPerformance:  { ar: 'أداء الفروع',                       en: 'Branch Performance' },
  salesAndPurch:      { ar: 'المبيعات والمشتريات',               en: 'Sales & Purchases' },
  salesByRegion:      { ar: 'المبيعات حسب المنطقة',              en: 'Sales by Region' },
  branchRanking:      { ar: 'تصنيف الفروع بفرق المعدل',          en: 'Branch Rate Diff Ranking' },
  regionAnalysis:     { ar: 'تحليل المناطق',                    en: 'Region Analysis' },
  empDetails:         { ar: 'تفاصيل الموظفين',                  en: 'Employee Details' },
  top10sales:         { ar: 'أعلى 10 مبيعاً',                   en: 'Top 10 by Sales' },
  top10diff:          { ar: 'أعلى 10 بفرق المعدل',              en: 'Top 10 by Rate Diff' },
  top10profit:        { ar: 'أعلى 10 بالهامش',                  en: 'Top 10 Profit Margin' },
  salesByKarat:       { ar: 'المبيعات حسب العيار',              en: 'Sales by Karat' },
  karatByBranch:      { ar: 'العيارات حسب الفرع',               en: 'Karat by Branch' },
  moTransactions:     { ar: 'معاملات موطن',                     en: 'Mothan Transactions' },
  smartAlerts:        { ar: 'التنبيهات الذكية',                  en: 'Smart Alerts' },
  noAlerts:           { ar: 'لا توجد تنبيهات — كل شيء طبيعي ✅', en: 'No alerts — all clear ✅' },
  top10branches:      { ar: 'أعلى 10 فروع',                     en: 'Top 10 Branches' },
  mothanTotal:        { ar: 'إجمالي موطن الذهب',                en: 'Total Mothan Gold' },
  weightReceived:     { ar: 'وزن الذهب المستلم',                en: 'Gold Weight Received' },
  avgRate:            { ar: 'متوسط المعدل',                     en: 'Average Rate' },
  totalSalesDesc:     { ar: 'إجمالي المبيعات بعد خصم المرتجعات', en: 'Total sales net of returns' },
  netDesc:            { ar: 'المبيعات − المشتريات الكلية',       en: 'Sales minus total purchases' },
  totalPurchDesc:     { ar: 'مشتريات الفروع + موطن الذهب',      en: 'Branch purchases + Mothan' },
  rateDiffDesc:       { ar: 'معدل البيع المرجّح − معدل الشراء',  en: 'Weighted sale minus purchase rate' },
  negBranchDesc:      { ar: 'فروع تبيع أقل من تكلفة الشراء',   en: 'Branches below purchase cost' },
  topBranchDesc:      { ar: 'أعلى فرع مبيعاً في الفترة',       en: 'Top branch by sales in period' },
  avgInvoiceDesc:     { ar: 'متوسط قيمة الفاتورة الواحدة',      en: 'Average invoice value' },
  returnsDesc:        { ar: 'نسبة المرتجعات من المبيعات',       en: 'Returns as % of total sales' },

  // ── Common ───────────────────────────────────────────────────────────────
  save:             { ar: 'حفظ',                    en: 'Save' },
  cancel:           { ar: 'إلغاء',                  en: 'Cancel' },
  add:              { ar: 'إضافة',                  en: 'Add' },
  edit:             { ar: 'تعديل',                  en: 'Edit' },
  delete:           { ar: 'حذف',                   en: 'Delete' },
  search:           { ar: 'بحث',                    en: 'Search' },
  filter:           { ar: 'تصفية',                  en: 'Filter' },
  all:              { ar: 'الكل',                   en: 'All' },
  close:            { ar: 'إغلاق',                  en: 'Close' },
  confirm:          { ar: 'تأكيد',                  en: 'Confirm' },
  back:             { ar: 'رجوع',                   en: 'Back' },
  next:             { ar: 'التالي',                 en: 'Next' },
  today:            { ar: 'اليوم',                  en: 'Today' },
  last7Days:        { ar: 'آخر 7 أيام',             en: 'Last 7 Days' },
  thisMonth:        { ar: 'هذا الشهر',              en: 'This Month' },
  custom:           { ar: 'مخصص',                   en: 'Custom' },
  from:             { ar: 'من',                     en: 'From' },
  to:               { ar: 'إلى',                    en: 'To' },
};

@Injectable({ providedIn: 'root' })
export class I18nService {
  private _lang = signal<Lang>('ar');

  /** Readonly signal — read in templates to trigger reactive re-renders. */
  readonly lang = this._lang.asReadonly();

  constructor(private http: HttpClient) {
    const saved = localStorage.getItem('mizan_lang') as Lang | null;
    if (saved === 'en' || saved === 'ar') {
      this._lang.set(saved);
    }
    this.applyToDOM(this._lang());
  }

  isAr(): boolean { return this._lang() === 'ar'; }

  toggle(): void {
    this.setLang(this._lang() === 'ar' ? 'en' : 'ar');
  }

  setLang(lang: Lang): void {
    this._lang.set(lang);
    localStorage.setItem('mizan_lang', lang);
    this.applyToDOM(lang);
    // Persist to backend silently (optional — non-critical)
    this.http.put(`${environment.apiUrl}/auth/me/language`, { language: lang.toUpperCase() })
      .subscribe({ error: () => {} });
  }

  /** Translate a key. Returns key itself if not found (safe fallback). */
  t(key: string): string {
    const entry = TRANSLATIONS[key];
    if (!entry) return key;
    return entry[this._lang()] ?? entry.ar ?? key;
  }

  private applyToDOM(lang: Lang): void {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.style.setProperty(
      '--font-primary',
      lang === 'ar' ? "'IBM Plex Sans Arabic', sans-serif" : "'IBM Plex Sans', sans-serif"
    );
  }
}
