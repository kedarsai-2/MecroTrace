export interface Role {
  id: string;
  name: string;
  description?: string | null;
  permissions: ModulePermissions;
  created_at: string;
  updated_at: string;
}

export interface ModulePermissions {
  [moduleName: string]: {
    enabled: boolean;
    features: { [featureName: string]: boolean };
  };
}

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  mobile: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  assigned_by: string | null;
  created_at: string;
}

export const AVAILABLE_MODULES: Record<string, string[]> = {
  // 1. Home (dashboard surface; UI-only, no dedicated authorities)
  'Home': ['View'],

  // 2. Contacts
  'Contacts': ['View', 'Create', 'Edit', 'Delete'],

  // 3. Commodity Settings
  'Commodity Settings': ['View', 'Create', 'Edit', 'Delete'],

  // 4. Arrivals
  'Arrivals': ['View', 'Create'],

  // 5. Auctions / Sales
  'Auctions / Sales': ['View', 'Create', 'Edit', 'Delete', 'Approve'],

  // 6. Weighing
  'Weighing': ['View', 'Create'],

  // 7. Writer's Pad
  "Writer's Pad": ['View', 'Create', 'Edit'],

  // 8. Print Hub (navigation / print logs)
  'Print Hub': ['View', 'Create'],

  // 9. Self-Sale
  'Self-Sale': ['View', 'Create'],

  // 10. Stock Purchase
  'Stock Purchase': ['View', 'Create'],

  // 11. CDN (Consignment Dispatch Notes)
  'CDN': ['View', 'Create'],

  // 12. Settlement
  'Settlement': ['View', 'Create', 'Edit'],

  // 13. Billing
  'Billing': ['View', 'Create'],

  // 14. Chart of Accounts
  'Chart of Accounts': ['View', 'Create'],

  // 15. Vouchers & Payments
  'Vouchers & Payments': ['View', 'Create', 'Approve'],

  // 16. Financial Reports
  'Financial Reports': ['View'],

  // 17. Print Templates
  'Print Templates': ['View'],

  // 18. Reports
  'Reports': ['View'],

  // 19. Settings (trader RBAC surface)
  'Settings': ['View', 'Manage Roles', 'Manage Users'],

  // 20. Preset Settings (Auction margin presets – trader-scoped)
  'Preset Settings': ['View', 'Create', 'Edit', 'Delete'],
  'Print Settings': ['View', 'Edit'],
};
