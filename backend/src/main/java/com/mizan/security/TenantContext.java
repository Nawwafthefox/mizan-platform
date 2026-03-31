package com.mizan.security;

public class TenantContext {
    private static final ThreadLocal<String> tenantIdHolder = new ThreadLocal<>();
    private static final ThreadLocal<String> roleHolder = new ThreadLocal<>();

    public static void set(String tenantId, String role) {
        tenantIdHolder.set(tenantId);
        roleHolder.set(role);
    }
    public static String getTenantId() { return tenantIdHolder.get(); }
    public static String getRole() { return roleHolder.get(); }
    public static boolean isSuperAdmin() { return "SUPER_ADMIN".equals(roleHolder.get()); }
    public static void clear() { tenantIdHolder.remove(); roleHolder.remove(); }
}
