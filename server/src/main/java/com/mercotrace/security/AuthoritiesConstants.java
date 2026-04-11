package com.mercotrace.security;

/**
 * Constants for Spring Security authorities.
 */
public final class AuthoritiesConstants {

    public static final String ADMIN = "ROLE_ADMIN";

    public static final String USER = "ROLE_USER";

    public static final String ANONYMOUS = "ROLE_ANONYMOUS";

    /** Auctions module – Sales Pad */
    public static final String AUCTIONS_VIEW = "ROLE_AUCTIONS_VIEW";
    public static final String AUCTIONS_CREATE = "ROLE_AUCTIONS_CREATE";
    public static final String AUCTIONS_EDIT = "ROLE_AUCTIONS_EDIT";
    public static final String AUCTIONS_DELETE = "ROLE_AUCTIONS_DELETE";
    public static final String AUCTIONS_APPROVE = "ROLE_AUCTIONS_APPROVE";

    /** Writer's Pad module */
    public static final String WRITERS_PAD_VIEW = "ROLE_WRITERS_PAD_VIEW";
    public static final String WRITERS_PAD_CREATE = "ROLE_WRITERS_PAD_CREATE";
    public static final String WRITERS_PAD_EDIT = "ROLE_WRITERS_PAD_EDIT";
    public static final String WRITERS_PAD_DELETE = "ROLE_WRITERS_PAD_DELETE";

    /** Weighing module */
    public static final String WEIGHING_VIEW = "ROLE_WEIGHING_VIEW";
    public static final String WEIGHING_CREATE = "ROLE_WEIGHING_CREATE";
    public static final String WEIGHING_EDIT = "ROLE_WEIGHING_EDIT";
    public static final String WEIGHING_DELETE = "ROLE_WEIGHING_DELETE";

    /** Settlement (Puty) module */
    public static final String SETTLEMENTS_VIEW = "ROLE_SETTLEMENTS_VIEW";
    public static final String SETTLEMENTS_CREATE = "ROLE_SETTLEMENTS_CREATE";
    public static final String SETTLEMENTS_EDIT = "ROLE_SETTLEMENTS_EDIT";
    public static final String SETTLEMENTS_DELETE = "ROLE_SETTLEMENTS_DELETE";
    public static final String SETTLEMENTS_APPROVE = "ROLE_SETTLEMENTS_APPROVE";

    /** Contacts module */
    public static final String CONTACTS_VIEW = "ROLE_CONTACTS_VIEW";
    public static final String CONTACTS_CREATE = "ROLE_CONTACTS_CREATE";
    public static final String CONTACTS_EDIT = "ROLE_CONTACTS_EDIT";
    public static final String CONTACTS_DELETE = "ROLE_CONTACTS_DELETE";

    /** Print logs / print hub module */
    public static final String PRINT_LOGS_VIEW = "ROLE_PRINT_LOGS_VIEW";
    public static final String PRINT_LOGS_CREATE = "ROLE_PRINT_LOGS_CREATE";
    public static final String PRINT_LOGS_EDIT = "ROLE_PRINT_LOGS_EDIT";
    public static final String PRINT_LOGS_DELETE = "ROLE_PRINT_LOGS_DELETE";

    /** Commodity Settings module */
    public static final String COMMODITY_SETTINGS_VIEW = "ROLE_COMMODITY_SETTINGS_VIEW";
    public static final String COMMODITY_SETTINGS_CREATE = "ROLE_COMMODITY_SETTINGS_CREATE";
    public static final String COMMODITY_SETTINGS_EDIT = "ROLE_COMMODITY_SETTINGS_EDIT";
    public static final String COMMODITY_SETTINGS_DELETE = "ROLE_COMMODITY_SETTINGS_DELETE";
    public static final String COMMODITY_SETTINGS_APPROVE = "ROLE_COMMODITY_SETTINGS_APPROVE";

    /** Arrivals module */
    public static final String ARRIVALS_VIEW = "ROLE_ARRIVALS_VIEW";
    public static final String ARRIVALS_CREATE = "ROLE_ARRIVALS_CREATE";
    public static final String ARRIVALS_EDIT = "ROLE_ARRIVALS_EDIT";
    public static final String ARRIVALS_DELETE = "ROLE_ARRIVALS_DELETE";
    public static final String ARRIVALS_APPROVE = "ROLE_ARRIVALS_APPROVE";

    /** Billing module */
    public static final String BILLING_VIEW = "ROLE_BILLING_VIEW";
    public static final String BILLING_CREATE = "ROLE_BILLING_CREATE";
    public static final String BILLING_EDIT = "ROLE_BILLING_EDIT";
    public static final String BILLING_DELETE = "ROLE_BILLING_DELETE";
    public static final String BILLING_APPROVE = "ROLE_BILLING_APPROVE";

    /** Self-Sale module */
    public static final String SELF_SALE_VIEW = "ROLE_SELF_SALE_VIEW";
    public static final String SELF_SALE_CREATE = "ROLE_SELF_SALE_CREATE";
    public static final String SELF_SALE_EDIT = "ROLE_SELF_SALE_EDIT";
    public static final String SELF_SALE_DELETE = "ROLE_SELF_SALE_DELETE";
    public static final String SELF_SALE_APPROVE = "ROLE_SELF_SALE_APPROVE";

    /** Stock Purchase module */
    public static final String STOCK_PURCHASE_VIEW = "ROLE_STOCK_PURCHASE_VIEW";
    public static final String STOCK_PURCHASE_CREATE = "ROLE_STOCK_PURCHASE_CREATE";
    public static final String STOCK_PURCHASE_EDIT = "ROLE_STOCK_PURCHASE_EDIT";
    public static final String STOCK_PURCHASE_DELETE = "ROLE_STOCK_PURCHASE_DELETE";
    public static final String STOCK_PURCHASE_APPROVE = "ROLE_STOCK_PURCHASE_APPROVE";

    /** CDN (Delivery Note) module */
    public static final String CDN_VIEW = "ROLE_CDN_VIEW";
    public static final String CDN_CREATE = "ROLE_CDN_CREATE";
    public static final String CDN_EDIT = "ROLE_CDN_EDIT";
    public static final String CDN_DELETE = "ROLE_CDN_DELETE";
    public static final String CDN_APPROVE = "ROLE_CDN_APPROVE";

    /** Chart of Accounts module */
    public static final String CHART_OF_ACCOUNTS_VIEW = "ROLE_CHART_OF_ACCOUNTS_VIEW";
    public static final String CHART_OF_ACCOUNTS_CREATE = "ROLE_CHART_OF_ACCOUNTS_CREATE";
    public static final String CHART_OF_ACCOUNTS_EDIT = "ROLE_CHART_OF_ACCOUNTS_EDIT";
    public static final String CHART_OF_ACCOUNTS_DELETE = "ROLE_CHART_OF_ACCOUNTS_DELETE";
    public static final String CHART_OF_ACCOUNTS_APPROVE = "ROLE_CHART_OF_ACCOUNTS_APPROVE";

    /** Vouchers & Payments module */
    public static final String VOUCHERS_VIEW = "ROLE_VOUCHERS_VIEW";
    public static final String VOUCHERS_CREATE = "ROLE_VOUCHERS_CREATE";
    public static final String VOUCHERS_EDIT = "ROLE_VOUCHERS_EDIT";
    public static final String VOUCHERS_DELETE = "ROLE_VOUCHERS_DELETE";
    public static final String VOUCHERS_APPROVE = "ROLE_VOUCHERS_APPROVE";

    /** Financial Reports module (read-only) */
    public static final String FINANCIAL_REPORTS_VIEW = "ROLE_FINANCIAL_REPORTS_VIEW";

    /** Operational Reports module (read-only) */
    public static final String REPORTS_VIEW = "ROLE_REPORTS_VIEW";

    /** RBAC Settings module */
    public static final String RBAC_SETTINGS_VIEW = "ROLE_RBAC_SETTINGS_VIEW";
    public static final String RBAC_SETTINGS_CREATE = "ROLE_RBAC_SETTINGS_CREATE";
    public static final String RBAC_SETTINGS_EDIT = "ROLE_RBAC_SETTINGS_EDIT";
    public static final String RBAC_SETTINGS_DELETE = "ROLE_RBAC_SETTINGS_DELETE";
    public static final String RBAC_SETTINGS_APPROVE = "ROLE_RBAC_SETTINGS_APPROVE";

    /** Preset Settings module (Auction margin presets – trader-scoped) */
    public static final String PRESET_SETTINGS_VIEW = "ROLE_PRESET_SETTINGS_VIEW";
    public static final String PRESET_SETTINGS_CREATE = "ROLE_PRESET_SETTINGS_CREATE";
    public static final String PRESET_SETTINGS_EDIT = "ROLE_PRESET_SETTINGS_EDIT";
    public static final String PRESET_SETTINGS_DELETE = "ROLE_PRESET_SETTINGS_DELETE";

    /** Print Settings module (Settlement/Billing page format presets) */
    public static final String PRINT_SETTINGS_VIEW = "ROLE_PRINT_SETTINGS_VIEW";
    public static final String PRINT_SETTINGS_EDIT = "ROLE_PRINT_SETTINGS_EDIT";

    /** Print Templates module */
    public static final String PRINT_TEMPLATES_VIEW = "ROLE_PRINT_TEMPLATES_VIEW";
    public static final String PRINT_TEMPLATES_CREATE = "ROLE_PRINT_TEMPLATES_CREATE";
    public static final String PRINT_TEMPLATES_EDIT = "ROLE_PRINT_TEMPLATES_EDIT";
    public static final String PRINT_TEMPLATES_DELETE = "ROLE_PRINT_TEMPLATES_DELETE";
    public static final String PRINT_TEMPLATES_APPROVE = "ROLE_PRINT_TEMPLATES_APPROVE";

    private AuthoritiesConstants() {}
}
