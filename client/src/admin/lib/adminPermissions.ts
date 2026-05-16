import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useAdminAuth } from '@/context/AdminAuthContext';
import { ADMIN_AVAILABLE_MODULES, AdminModuleKey } from '@/admin/types/rbac';
import type { ModulePermissions } from '@/types/rbac';

type FeatureMap = Record<string, string>;
type ModuleFeatureAuthorityMap = Record<string, FeatureMap>;

const normalize = (value: string) => value.trim().toLowerCase();

/** Seven modules, 1:1 with sidebar. Keys match ADMIN_AVAILABLE_MODULES. */
export const ADMIN_MODULE_FEATURE_TO_AUTHORITY: ModuleFeatureAuthorityMap = {
  [normalize('Dashboard')]: {
    view: 'ROLE_ADMIN_DASHBOARD',
  },
  [normalize('Traders')]: {
    view: 'ROLE_ADMIN_TRADERS_VIEW',
    approve: 'ROLE_ADMIN_TRADERS_APPROVE',
  },
  [normalize('Categories')]: {
    view: 'ROLE_ADMIN_CATEGORIES_VIEW',
    create: 'ROLE_ADMIN_CATEGORIES_CREATE',
    edit: 'ROLE_ADMIN_CATEGORIES_EDIT',
    delete: 'ROLE_ADMIN_CATEGORIES_DELETE',
  },
  [normalize('Commodities')]: {
    view: 'ROLE_ADMIN_COMMODITIES_VIEW',
  },
  [normalize('Contacts')]: {
    view: 'ROLE_ADMIN_CONTACTS_VIEW',
  },
  [normalize('Reports')]: {
    view: 'ROLE_ADMIN_REPORTS_VIEW',
  },
  [normalize('Settings')]: {
    view: 'ROLE_ADMIN_SETTINGS_VIEW',
    'manage rbac': 'ROLE_ADMIN_SETTINGS_RBAC_EDIT',
  },
};

const hasAuthority = (authorities: Set<string>, authority?: string | null) => {
  if (!authority) return false;
  if (authorities.has('ROLE_SUPER_ADMIN') || authorities.has('SUPER_ADMIN')) {
    return true;
  }
  return authorities.has(authority);
};

export function adminModulePermissionsToAuthorities(perms: ModulePermissions): string[] {
  const out = new Set<string>();

  Object.entries(ADMIN_AVAILABLE_MODULES).forEach(([moduleLabel, features]) => {
    const modPerm = perms[moduleLabel];
    if (!modPerm || !modPerm.enabled) return;

    const moduleKey = normalize(moduleLabel);
    const featureMap = ADMIN_MODULE_FEATURE_TO_AUTHORITY[moduleKey];
    if (!featureMap) return;

    features.forEach(featureLabel => {
      if (!modPerm.features?.[featureLabel]) return;
      const authority = featureMap[normalize(featureLabel)];
      if (authority) out.add(authority);
    });
  });

  return Array.from(out);
}

export function authoritiesToAdminModulePermissions(
  authorities: string[] | null | undefined
): ModulePermissions {
  const perms: ModulePermissions = {};

  Object.entries(ADMIN_AVAILABLE_MODULES).forEach(([moduleLabel, features]) => {
    perms[moduleLabel] = {
      enabled: false,
      features: Object.fromEntries(features.map(f => [f, false])),
    };
  });

  const authoritySet = new Set(authorities ?? []);

  Object.entries(ADMIN_AVAILABLE_MODULES).forEach(([moduleLabel, features]) => {
    const moduleKey = normalize(moduleLabel);
    const featureMap = ADMIN_MODULE_FEATURE_TO_AUTHORITY[moduleKey];
    if (!featureMap) return;

    features.forEach(featureLabel => {
      const authority = featureMap[normalize(featureLabel)];
      if (authority && authoritySet.has(authority)) {
        perms[moduleLabel].enabled = true;
        perms[moduleLabel].features[featureLabel] = true;
      }
    });
  });

  return perms;
}

export function canAccessAdminModuleWithAuthorities(
  authorities: Set<string>,
  module: AdminModuleKey
): boolean {
  const moduleKey = normalize(module);
  const featureMap = ADMIN_MODULE_FEATURE_TO_AUTHORITY[moduleKey];
  if (!featureMap) {
    return false;
  }
  return Object.values(featureMap).some(a => hasAuthority(authorities, a));
}

export function canAdminWithAuthorities(
  authorities: Set<string>,
  module: AdminModuleKey,
  feature: string
): boolean {
  const moduleKey = normalize(module);
  const featureKey = normalize(feature);
  const featureMap = ADMIN_MODULE_FEATURE_TO_AUTHORITY[moduleKey];
  if (!featureMap) {
    return false;
  }
  const authority = featureMap[featureKey];
  return hasAuthority(authorities, authority);
}

/** All 7 RBAC module keys. Sidebar items map 1:1 to these. */
const ADMIN_MODULE_KEYS: AdminModuleKey[] = [
  'Dashboard',
  'Traders',
  'Categories',
  'Commodities',
  'Contacts',
  'Reports',
  'Settings',
];

export function hasAnyAdminModule(authorities: Set<string>): boolean {
  return ADMIN_MODULE_KEYS.some((mod) =>
    canAccessAdminModuleWithAuthorities(authorities, mod)
  );
}

/** Route → single module key (1:1). Used for page guards and sidebar. */
export function getAdminModuleKeyForRoute(pathname: string): AdminModuleKey | null {
  if (pathname === '/admin' || pathname === '/admin/') return 'Dashboard';
  if (pathname.startsWith('/admin/multi-trader-accounts')) return 'Traders';
  if (pathname.startsWith('/admin/traders')) return 'Traders';
  if (pathname.startsWith('/admin/categories')) return 'Categories';
  if (pathname.startsWith('/admin/commodities')) return 'Commodities';
  if (pathname.startsWith('/admin/contacts')) return 'Contacts';
  if (pathname.startsWith('/admin/reports')) return 'Reports';
  if (pathname.startsWith('/admin/settings')) return 'Settings';
  return null;
}

export function useAdminPermissions() {
  const { user } = useAdminAuth();
  const location = useLocation();

  const authorities = useMemo(() => {
    const raw = (user as any)?.authorities as string[] | undefined;
    return new Set(raw ?? []);
  }, [user]);

  const canAccessModule = (module: AdminModuleKey) =>
    canAccessAdminModuleWithAuthorities(authorities, module);

  const can = (module: AdminModuleKey, feature: string) =>
    canAdminWithAuthorities(authorities, module, feature);

  const currentModule = useMemo(
    () => getAdminModuleKeyForRoute(location.pathname),
    [location.pathname]
  );

  const hasAnyModule = useMemo(
    () => hasAnyAdminModule(authorities),
    [authorities]
  );

  return {
    authorities,
    canAccessModule,
    can,
    currentModule,
    hasAnyModule,
  };
}
