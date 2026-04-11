// ============================================================
// Mercotrace Mandi Application — TypeScript Data Models
// Aligned exactly with PostgreSQL Database Schema (All 12 Parts)
// ============================================================

// ── PART 1: Enum Types (matching DB ENUMs) ─────────────────

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type ChargeType = 'PERCENT' | 'FIXED';
export type AppliesTo = 'BUYER' | 'SELLER';
export type FreightMethod = 'BY_WEIGHT' | 'BY_COUNT' | 'LUMPSUM' | 'DIVIDE_BY_WEIGHT';
export type VoucherStatus = 'OPEN' | 'CLOSED';
export type PaymentMode = 'CASH' | 'UPI' | 'BANK';
export type AccountType = 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE';
export type DeductionType = 'GOVT' | 'ROUND_OFF' | 'CUSTOM';

// App-level enums (not in DB but needed for UI)
export type ContactType = 'SELLER' | 'BUYER' | 'BROKER';
export type UserRole = 'SUPER_ADMIN' | 'TRADER' | 'WRITER' | 'CASHIER';

// ── PART 2: Core Control Tables ────────────────────────────

/** 2.1 Traders — Primary business entity */
export interface Trader {
  trader_id: string;
  business_name: string;
  owner_name: string;
  address: string;
  category: string;
  approval_status: ApprovalStatus;
  bill_prefix: string;
  created_at: string;
  updated_at: string;
  /** When admin approved or rejected (ISO). */
  approval_decision_at?: string | null;
  // Extended fields for app functionality (login, registration)
  mobile?: string;
  email?: string;
  city?: string;
  state?: string;
  pin_code?: string;
  gst_number?: string;
  rmc_apmc_code?: string;
  shop_photos?: string[];
  /** When false, trader and staff cannot log in. */
  active?: boolean;
  /** When false, auction uses admin global presets; trader cannot edit preset settings. Omitted/undefined treated as true. */
  preset_enabled?: boolean;
}

/** 2.2 Roles */
export interface Role {
  role_id: string;
  role_name: string;
  created_at: string;
}

/** 2.3 Permissions */
export interface Permission {
  permission_id: string;
  permission_name: string;
  created_at: string;
}

/** 2.4 Role_Permissions */
export interface RolePermission {
  role_permission_id: string;
  role_id: string;
  permission_id: string;
}

/** 2.5 Users */
export interface User {
  user_id: string;
  trader_id: string;
  username: string;
  password_hash?: string;
  is_active: boolean;
  created_at: string;
  // Extended fields for UI
  name?: string;
  role?: UserRole;
  // Spring Security authorities, e.g. ROLE_CONTACTS_VIEW. Populated from backend auth/profile responses.
  authorities?: string[];
}

/** 2.6 User_Roles */
export interface UserRole_Mapping {
  user_role_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

/** 2.7 Business_Categories */
export interface BusinessCategory {
  category_id: string;
  category_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── PART 3: Master Tables ──────────────────────────────────

/** 3.1 Commodities */
export interface Commodity {
  commodity_id: string;
  trader_id: string;
  commodity_name: string;
  created_at: string;
}

/** 3.2 Commodity_Configurations */
export interface CommodityConfiguration {
  config_id: string;
  commodity_id: string;
  rate_per_unit: number;
  min_weight: number;
  max_weight: number;
  govt_deduction_enabled: boolean;
  roundoff_enabled: boolean;
  commission_percent: number;
  user_fee_percent: number;
  hsn_code: string;
  created_at: string;
  // Extended config fields stored in commodity_config (nullable in DB)
  weighing_charge?: number;
  bill_prefix?: string;
  hamali_enabled?: boolean;
  gst_rate?: number;
  /** Optional intra-state component (percent). */
  sgst_rate?: number;
  /** Optional intra-state component (percent). */
  cgst_rate?: number;
  /** Optional inter-state component (percent). */
  igst_rate?: number;
  weighing_threshold?: number;
}

/** 3.3 Deduction_Rules */
export interface DeductionRule {
  deduction_rule_id: string;
  commodity_id: string;
  min_weight: number;
  max_weight: number;
  deduction_value: number;
  created_at: string;
}

/** 3.4 Hamali_Slabs */
export interface HamaliSlab {
  slab_id: string;
  commodity_id: string;
  threshold_weight: number;
  fixed_rate: number;
  per_kg_rate: number;
  created_at: string;
}

/** 3.5 Dynamic_Charges */
export interface DynamicCharge {
  charge_id: string;
  trader_id: string;
  charge_name: string;
  charge_type: ChargeType;
  value: number;
  created_at: string;
}

/** 3.6 Charge_Mappings */
export interface ChargeMapping {
  charge_mapping_id: string;
  charge_id: string;
  applies_to: AppliesTo;
}

// ── PART 4: Contact & Ledger Tables ────────────────────────

/** 4.1 Contacts */
export interface Contact {
  contact_id: string;
  trader_id: string;
  name: string;
  phone: string;
  mark: string;
  address: string;
  created_at: string;
  // App-level fields
  opening_balance?: number;
  current_balance?: number;
  email?: string;
  can_login?: boolean;
  /** True when row is a portal self-signup contact shown in registry after first use with this trader. */
  portal_signup_linked?: boolean;
}

/** 4.2 Ledgers (Chart of Accounts) */
export interface Ledger {
  ledger_id: string;
  trader_id: string;
  contact_id?: string;
  ledger_name: string;
  account_type: AccountType;
  created_at: string;
}

/** 4.3 Ledger_Entries (Journal Header) */
export interface LedgerEntry {
  entry_id: string;
  trader_id: string;
  reference_type: string;
  reference_id: string;
  entry_date: string;
  created_by?: string;
}

/** 4.4 Ledger_Lines */
export interface LedgerLine {
  ledger_line_id: string;
  entry_id: string;
  ledger_id: string;
  debit: number;
  credit: number;
}

/** 4.5 Advances */
export interface Advance {
  advance_id: string;
  trader_id: string;
  contact_id: string;
  amount: number;
  reference_type: string;
  reference_id: string;
  created_at: string;
}

// ── PART 5: Arrivals & Logistics ───────────────────────────

/** 5.1 Vehicles */
export interface Vehicle {
  vehicle_id: string;
  trader_id: string;
  vehicle_number: string;
  arrival_datetime: string;
  created_by?: string;
  created_at: string;
}

/** 5.2 Vehicle_Weights */
export interface VehicleWeight {
  vehicle_weight_id: string;
  vehicle_id: string;
  loaded_weight: number;
  empty_weight: number;
  deducted_weight: number;
  net_weight: number;
  recorded_by?: string;
  recorded_at: string;
}

/** 5.3 Sellers_In_Vehicle */
export interface SellerInVehicle {
  seller_vehicle_id: string;
  vehicle_id: string;
  contact_id: string;
  broker_id?: string;
}

/** 5.4 Lots */
export interface Lot {
  lot_id: string;
  seller_vehicle_id: string;
  commodity_id: string;
  lot_name: string;
  bag_count: number;
  seller_serial_no: number;
  created_at: string;
  // Denormalized for UI convenience
  commodity_name?: string;
  seller_name?: string;
}

/** 5.5 Freight_Calculations */
export interface FreightCalculation {
  freight_id: string;
  vehicle_id: string;
  method: FreightMethod;
  rate: number;
  total_amount: number;
  no_rental: boolean;
  advance_paid: number;
  created_at: string;
}

/** 5.6 Freight_Distribution */
export interface FreightDistribution {
  freight_distribution_id: string;
  freight_id: string;
  lot_id: string;
  allocated_amount: number;
}

// ── PART 6: Auction Tables ─────────────────────────────────

/** 6.1 Auctions (Session Header) */
export interface Auction {
  auction_id: string;
  lot_id: string;
  auction_datetime: string;
  conducted_by?: string;
  // Denormalized for UI
  lot_name?: string;
  commodity_name?: string;
  seller_name?: string;
}

/** 6.2 Auction_Entries (Partial Sales) */
export interface AuctionEntry {
  auction_entry_id: string;
  auction_id: string;
  buyer_id?: string;
  bid_rate: number;
  preset_margin: number;
  seller_rate: number;
  buyer_rate: number;
  quantity: number;
  is_self_sale: boolean;
  created_at: string;
  // Denormalized for UI
  buyer_name?: string;
  buyer_mark?: string;
}

/** 6.3 Presets (Trader-level Margin Presets) */
export interface Preset {
  preset_id: string;
  trader_id: string;
  preset_value: number;
  created_at: string;
}

/** 6.4 Token_Advances */
export interface TokenAdvance {
  token_advance_id: string;
  auction_entry_id: string;
  amount: number;
  created_at: string;
}

/** 6.5 Self_Sale */
export interface SelfSale {
  self_sale_id: string;
  auction_entry_id: string;
  reason: string;
  created_at: string;
}

/** 6.6 Scribble_Pad */
export interface ScribblePadEntry {
  scribble_id: string;
  auction_id: string;
  initials: string;
  quantity: number;
  created_at: string;
}

// ── PART 7: Weighing Tables ────────────────────────────────

/** 7.1 Weighing_Sessions */
export interface WeighingSession {
  session_id: string;
  lot_id: string;
  original_weight: number;
  net_weight: number;
  manual_entry: boolean;
  created_at: string;
}

/** 7.2 Bag_Weights */
export interface BagWeight {
  bag_weight_id: string;
  session_id: string;
  bag_number: number;
  weight: number;
  recorded_at: string;
}

/** 7.3 Weight_Deductions */
export interface WeightDeduction {
  weight_deduction_id: string;
  session_id: string;
  deduction_type: DeductionType;
  deduction_value: number;
  created_at: string;
}

/** 7.4 Net_Weight_Summary */
export interface NetWeightSummary {
  summary_id: string;
  session_id: string;
  total_bags: number;
  total_original_weight: number;
  total_deduction: number;
  final_net_weight: number;
  created_at: string;
}

// ── PART 8: Settlement Tables (Puty) ───────────────────────

/** 8.1 Puty (Seller Settlement Header) */
export interface Puty {
  puty_id: string;
  trader_id: string;
  seller_id: string;
  puty_date: string;
  gross_amount: number;
  total_deductions: number;
  net_payable: number;
  created_by?: string;
}

/** 8.2 Puty_Rate_Clusters */
export interface PutyRateCluster {
  cluster_id: string;
  puty_id: string;
  rate: number;
  quantity: number;
  amount: number;
}

/** 8.3 Puty_Deductions */
export interface PutyDeduction {
  deduction_id: string;
  puty_id: string;
  deduction_type: string;
  amount: number;
  editable: boolean;
}

// ── PART 9: Billing Tables (Buyer Side) ────────────────────

/** 9.1 Sales_Bills */
export interface SalesBill {
  bill_id: string;
  trader_id: string;
  buyer_id: string;
  bill_number: string;
  bill_date: string;
  total_amount: number;
  created_by?: string;
}

/** 9.2 Bill_Items */
export interface BillItem {
  bill_item_id: string;
  bill_id: string;
  commodity_id: string;
  lot_id?: string;
  quantity: number;
  weight: number;
  rate: number;
  amount: number;
}

/** 9.3 Bill_Charges */
export interface BillCharge {
  bill_charge_id: string;
  bill_id: string;
  charge_name: string;
  charge_amount: number;
}

/** 9.4 Bill_Taxes */
export interface BillTax {
  bill_tax_id: string;
  bill_item_id: string;
  commission_percent: number;
  commission_amount: number;
  user_fee_percent: number;
  user_fee_amount: number;
  hsn_code: string;
}

// ── PART 10: Financial Tables ──────────────────────────────

/** 10.1 Vouchers */
export interface Voucher {
  voucher_id: string;
  trader_id: string;
  reference_type: string;
  reference_id: string;
  amount: number;
  status: VoucherStatus;
  created_at: string;
}

/** 10.2 Voucher_Items */
export interface VoucherItem {
  voucher_item_id: string;
  voucher_id: string;
  ledger_id: string;
  debit: number;
  credit: number;
}

/** 10.3 Payments */
export interface Payment {
  payment_id: string;
  voucher_id: string;
  payment_mode: PaymentMode;
  amount: number;
  payment_date: string;
}

/** 10.4 Brokerage_Accumulation */
export interface BrokerageAccumulation {
  brokerage_id: string;
  trader_id: string;
  broker_id: string;
  reference_type: string;
  reference_id: string;
  amount: number;
  accumulated_date: string;
}

// ── PART 11: Reporting Support ─────────────────────────────

/** 11.1 Daily_Serials */
export interface DailySerial {
  serial_id: string;
  trader_id: string;
  serial_date: string;
  seller_serial: number;
  lot_serial: number;
}

/** 11.2 Print_Log */
export interface PrintLog {
  print_log_id: string;
  trader_id: string;
  reference_type: string;
  reference_id: string;
  print_type: string;
  printed_at: string;
  printed_by?: string;
}

// ── PART 12: Audit Tables ──────────────────────────────────

/** 12.1 Edit_Log */
export interface EditLog {
  edit_id: string;
  trader_id: string;
  user_id: string;
  reference_type: string;
  reference_id: string;
  field_name: string;
  old_value: string;
  new_value: string;
  edited_at: string;
}

/** 12.2 Weight_Audit */
export interface WeightAudit {
  weight_audit_id: string;
  session_id: string;
  original_weight: number;
  net_weight: number;
  manual_flag: boolean;
  audited_at: string;
}

/** 12.3 Voucher_Status_Log */
export interface VoucherStatusLog {
  voucher_status_log_id: string;
  voucher_id: string;
  old_status: VoucherStatus;
  new_status: VoucherStatus;
  changed_at: string;
  changed_by?: string;
}

// ── App-level Auth State (frontend session only, no tokens) ─────────────────

export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  trader: Trader | null;
}

// ── Reports (App-level summary) ────────────────────────────

export interface DailySummary {
  date: string;
  totalArrivals: number;
  totalLots: number;
  totalAuctions: number;
  totalBills: number;
  totalRevenue: number;
  totalCollected: number;
  totalPending: number;
}
