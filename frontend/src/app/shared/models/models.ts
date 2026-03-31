// ─── Generic ─────────────────────────────────────────────────
export interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
  timestamp?: string;
}

// ─── Auth ─────────────────────────────────────────────────────
export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  role: string;
  tenantId?: string;
  branchCodes?: string[];
  allowedRegions?: string[];
  linkedEmployeeId?: string;
  active: boolean;
  mustChangePassword: boolean;
  preferredLang?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  tokenType: string;
}

// ─── Dashboard ────────────────────────────────────────────────
export interface DashboardSummary {
  totalWeightSold: number;
  totalRevenue: number;
  totalPurchases: number;
  avgSaleRate: number;
  avgPurchaseRate: number;
  branchCount: number;
  employeeCount: number;
  topBranch?: string;
}

export interface BranchSummary {
  branchCode: string;
  branchName: string;
  region: string;
  totalWeightSold: number;
  totalRevenue: number;
  totalPurchases: number;
  avgSaleRate: number;
  avgPurchaseRate: number;
  netWeight: number;
  saleRate: number;
  purchaseRate: number;
  diffRate: number;
}

export interface RegionSummary {
  region: string;
  totalWeightSold: number;
  totalRevenue: number;
  branchCount: number;
  avgSaleRate: number;
}

export interface EmployeeSummary {
  employeeId: string;
  employeeName: string;
  branchCode: string;
  branchName: string;
  totalWeightSold: number;
  totalRevenue: number;
  transactions: number;
  avgSaleRate: number;
}

export interface KaratBreakdown {
  karat18Weight: number;
  karat21Weight: number;
  karat22Weight: number;
  karat24Weight: number;
  totalWeight: number;
}

export interface MothanSummary {
  totalGoldGrams: number;
  transactionCount: number;
  branches: { branchCode: string; branchName: string; goldGrams: number }[];
}

export interface BranchPurchaseRate {
  id?: string;
  tenantId?: string;
  branchCode: string;
  branchName: string;
  purchaseRate: number;
  updatedAt?: string;
}

// ─── Upload ───────────────────────────────────────────────────
export interface UploadLog {
  id: string;
  tenantId: string;
  uploadedBy: string;
  fileName: string;
  fileType: string;
  status: string;
  recordsInserted: number;
  duplicatesSkipped: number;
  errorMessage?: string;
  createdAt: string;
}

export interface UploadProgress {
  uploadId: string;
  fileName: string;
  status: 'PENDING' | 'PROCESSING' | 'DONE' | 'ERROR';
  percent: number;
  message?: string;
}

// ─── Tenant / Super-admin ─────────────────────────────────────
export interface Tenant {
  id: string;
  tenantId: string;
  companyName: string;
  companyNameAr?: string;
  companyNameEn?: string;
  planTier: string;
  subscriptionStatus?: string;
  subscriptionTierId?: string;
  active: boolean;
  suspended: boolean;
  createdAt: string;
  adminEmail?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface SubscriptionTier {
  id: string;
  tierKey: string;
  displayName: string;
  displayNameAr?: string;
  monthlyPrice: number;
  annualPrice: number;
  maxBranches: number;
  maxUsers: number;
  active: boolean;
}

export interface SuperAdminStats {
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  totalUsers: number;
}
