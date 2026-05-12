import { useEffect, useMemo, useRef, useState } from 'react';
import { useWindowVirtualizer, measureElement } from '@tanstack/react-virtual';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import BottomNav from '@/components/BottomNav';
import { ArrowLeft, Plus, Search, Phone, User as UserIcon, Users, BookOpen, AlertCircle, Eye, Pencil, Trash2, X, MapPin, Wallet } from 'lucide-react';
import { useDesktopMode } from '@/hooks/use-desktop';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { contactApi } from '@/services/api';
import { ContactApiError } from '@/services/api/contacts';
import type { Contact } from '@/types/models';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { RotateCcw } from 'lucide-react';
import { usePermissions } from '@/lib/permissions';
import ForbiddenPage from '@/components/ForbiddenPage';
import { useAuth } from '@/context/AuthContext';

type ModalMode = 'add' | 'view' | 'edit' | null;

const CONTACTS_QUERY_KEY = ['contacts', 'registry'] as const;
const CONTACTS_STALE_TIME_MS = 2 * 60 * 1000;
const CONTACTS_LOCAL_CACHE_PREFIX = 'mercotrace.contacts.registry';
const EMPTY_CONTACTS: Contact[] = [];

type CachedContactsSnapshot = {
  savedAt: number;
  contacts: Contact[];
};

function readCachedContacts(cacheKey: string | null): CachedContactsSnapshot | null {
  if (!cacheKey || typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(cacheKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedContactsSnapshot;
    if (!Array.isArray(parsed.contacts)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedContacts(cacheKey: string | null, contacts: Contact[]) {
  if (!cacheKey || typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(cacheKey, JSON.stringify({ savedAt: Date.now(), contacts }));
  } catch {
    // Cache is best-effort; ignore quota/private-mode failures.
  }
}

/** Single letter for avatar tiles (full mark/name overflows small boxes). */
function contactAvatarInitial(contact: Pick<Contact, 'name' | 'mark'>): string {
  const mark = contact.mark?.trim();
  if (mark) return mark.charAt(0).toUpperCase();
  const name = contact.name?.trim();
  if (name) return name.charAt(0).toUpperCase();
  return '?';
}

const ContactsPage = () => {
  const navigate = useNavigate();
  const isDesktop = useDesktopMode();
  const { trader, user } = useAuth();
  const { canAccessModule, can } = usePermissions();
  const canView = canAccessModule('Contacts');
  const canCreate = can('Contacts', 'Create');
  const canEdit = can('Contacts', 'Edit');
  const canDelete = can('Contacts', 'Delete');
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', mark: '', address: '', enablePortal: true });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [restorePendingPhone, setRestorePendingPhone] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const contactsCacheKey = useMemo(() => {
    const ownerId = trader?.trader_id || user?.trader_id;
    return ownerId ? `${CONTACTS_LOCAL_CACHE_PREFIX}.${ownerId}` : null;
  }, [trader?.trader_id, user?.trader_id]);

  const contactsQuery = useQuery({
    queryKey: CONTACTS_QUERY_KEY,
    queryFn: () => contactApi.list({ scope: 'registry' }),
    enabled: canView,
    staleTime: CONTACTS_STALE_TIME_MS,
    refetchOnMount: 'always',
    placeholderData: previousData => previousData,
    initialData: () => readCachedContacts(contactsCacheKey)?.contacts,
    initialDataUpdatedAt: () => readCachedContacts(contactsCacheKey)?.savedAt,
  });

  const contacts = contactsQuery.data ?? EMPTY_CONTACTS;
  const contactsCountText = `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`;
  const isLoadingInitial = contactsQuery.isLoading && contacts.length === 0;
  const isRefreshing = contactsQuery.isFetching && !isLoadingInitial;
  const error = contactsQuery.error;

  const invalidateContacts = () => {
    void queryClient.invalidateQueries({ queryKey: CONTACTS_QUERY_KEY });
  };

  const updateContactsCache = (updater: (prev: Contact[]) => Contact[]) => {
    queryClient.setQueryData<Contact[]>(CONTACTS_QUERY_KEY, prev => updater(prev ?? []));
  };

  useEffect(() => {
    if (contactsQuery.data) {
      writeCachedContacts(contactsCacheKey, contactsQuery.data);
    }
  }, [contactsCacheKey, contactsQuery.data]);

  useEffect(() => {
    if (!modalMode || typeof window === 'undefined') return;

    const scrollY = window.scrollY;
    const { documentElement, body } = document;
    const previousHtmlOverflow = documentElement.style.overflow;
    const previousHtmlOverscrollBehavior = documentElement.style.overscrollBehavior;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPosition = body.style.position;
    const previousBodyTop = body.style.top;
    const previousBodyWidth = body.style.width;
    const previousBodyOverscrollBehavior = body.style.overscrollBehavior;

    documentElement.style.overflow = 'hidden';
    documentElement.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.width = '100%';
    body.style.overscrollBehavior = 'none';

    return () => {
      documentElement.style.overflow = previousHtmlOverflow;
      documentElement.style.overscrollBehavior = previousHtmlOverscrollBehavior;
      body.style.overflow = previousBodyOverflow;
      body.style.position = previousBodyPosition;
      body.style.top = previousBodyTop;
      body.style.width = previousBodyWidth;
      body.style.overscrollBehavior = previousBodyOverscrollBehavior;
      window.scrollTo(0, scrollY);
    };
  }, [modalMode]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return contacts;
    return contacts.filter(c => (
      c.name?.toLowerCase().includes(q) ||
      c.phone?.includes(q) ||
      c.mark?.toLowerCase().includes(q)
    ));
  }, [contacts, search]);

  const desktopVirtualizer = useWindowVirtualizer({
    count: isDesktop ? filtered.length : 0,
    estimateSize: () => 64,
    overscan: 12,
    measureElement,
    getItemKey: index => filtered[index]?.contact_id ?? index,
    enabled: isDesktop && filtered.length > 0,
  });

  const mobileVirtualizer = useWindowVirtualizer({
    count: isDesktop ? 0 : filtered.length,
    estimateSize: () => 116,
    overscan: 10,
    measureElement,
    getItemKey: index => filtered[index]?.contact_id ?? index,
    enabled: !isDesktop && filtered.length > 0,
  });

  const openAdd = () => {
    if (!canCreate) {
      toast.error('You do not have permission to create contacts.');
      return;
    }
    setFormData({ name: '', phone: '', mark: '', address: '', enablePortal: true });
    setErrors({});
    setModalMode('add');
  };

  const openView = (c: Contact) => {
    setSelectedContact(c);
    setModalMode('view');
  };

  const openEdit = (c: Contact) => {
    if (c.portal_signup_linked) {
      toast.error('This participant manages their profile via portal signup.');
      return;
    }
    if (!canEdit) {
      toast.error('You do not have permission to edit contacts.');
      return;
    }
    setSelectedContact(c);
    setFormData({
      name: c.name,
      phone: c.phone,
      mark: c.mark || '',
      address: c.address || '',
      enablePortal: !!c.can_login,
    });
    setErrors({});
    setModalMode('edit');
  };

  const closeModal = () => {
    setModalMode(null);
    setSelectedContact(null);
    setErrors({});
  };

  const validateForm = (isEdit = false): boolean => {
    const errs: Record<string, string> = {};
    if (!formData.name.trim()) errs.name = 'Name is required';
    if (!formData.phone.trim()) {
      errs.phone = 'Phone number is required';
    } else if (!/^[6-9]\d{9}$/.test(formData.phone.trim())) {
      errs.phone = 'Enter a valid 10-digit mobile number';
    } else if (contacts.some(c => c.phone === formData.phone.trim() && (!isEdit || c.contact_id !== selectedContact?.contact_id))) {
      errs.phone = 'This phone number is already registered';
    }
    // Mark uniqueness per trader (case-insensitive)
    if (formData.mark.trim()) {
      const markLower = formData.mark.trim().toLowerCase();
      const hasDuplicate = contacts.some(
        c => c.mark && c.mark.toLowerCase() === markLower && (!isEdit || c.contact_id !== selectedContact?.contact_id)
      );
      if (hasDuplicate) errs.mark = 'This mark is already in use by another contact';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAdd = async () => {
    if (!canCreate) {
      toast.error('You do not have permission to create contacts.');
      return;
    }
    if (!validateForm()) return;
    try {
      const imported = await contactApi.importPortalContactByPhone(formData.phone.trim());
      if (imported) {
        updateContactsCache(prev => prev.some(c => c.contact_id === imported.contact_id) ? prev : [...prev, imported]);
        invalidateContacts();
        closeModal();
        toast.success('This mobile belongs to a global contact. Imported to your contact list.');
        return;
      }
      const created = await contactApi.create({
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        mark: formData.mark.trim().toUpperCase(),
        address: formData.address.trim(),
        trader_id: '',
        can_login: formData.enablePortal,
      });
      updateContactsCache(prev => [...prev, created]);
      invalidateContacts();
      closeModal();
      toast.success(`✅ ${created.name} registered`);
    } catch (err) {
      if (err instanceof ContactApiError && err.errorKey === 'phoneexistsinactive') {
        setRestorePendingPhone(formData.phone.trim());
        closeModal();
        return;
      }
      if (err instanceof ContactApiError && err.errorKey === 'markexists') {
        setErrors(prev => ({ ...prev, mark: err.message }));
        return;
      }
      console.error('Add contact error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to register contact');
    }
  };

  const handleRestoreContact = async () => {
    if (!restorePendingPhone || !canEdit) return;
    try {
      const existing = await contactApi.getByPhone(restorePendingPhone);
      if (!existing) {
        toast.error('Contact no longer found');
        setRestorePendingPhone(null);
        return;
      }
      await contactApi.restore(existing.contact_id);
      setRestorePendingPhone(null);
      invalidateContacts();
      toast.success(`Contact with phone ${restorePendingPhone} restored. You can use it again.`);
    } catch (err) {
      console.error('Restore contact error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to restore contact');
    }
  };

  const handleEdit = async () => {
    if (!canEdit) {
      toast.error('You do not have permission to edit contacts.');
      return;
    }
    if (!selectedContact || !validateForm(true)) return;
    try {
      const updated = await contactApi.update(selectedContact.contact_id, {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        mark: formData.mark.trim().toUpperCase(),
        address: formData.address.trim(),
        can_login: formData.enablePortal,
      });
      updateContactsCache(prev => prev.map(c => c.contact_id === updated.contact_id ? updated : c));
      invalidateContacts();
      closeModal();
      toast.success(`✏️ ${updated.name} updated successfully`);
    } catch (err) {
      if (err instanceof ContactApiError && err.errorKey === 'markexists') {
        setErrors(prev => ({ ...prev, mark: err.message }));
        return;
      }
      console.error('Edit contact error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to update contact');
    }
  };

  const handleDelete = async (contactId: string) => {
    if (!canDelete) {
      toast.error('You do not have permission to delete contacts.');
      return;
    }
    const contact = contacts.find(c => c.contact_id === contactId);
    try {
      await contactApi.remove(contactId);
      updateContactsCache(prev => prev.filter(c => c.contact_id !== contactId));
      invalidateContacts();
      setDeleteConfirm(null);
      toast.success(`🗑️ ${contact?.name || 'Contact'} deleted`);
    } catch (err) {
      console.error('Delete contact error:', err);
      toast.error('Failed to delete contact');
    }
  };

  if (!canView) {
    return <ForbiddenPage moduleName="Contacts" />;
  }

  const showEmptyState = !isLoadingInitial && !error && filtered.length === 0;
  const emptyTitle = search.trim()
    ? 'No contacts found'
    : 'No contacts yet';
  const emptyHint = search.trim()
    ? 'Try a different search or add a new contact'
    : 'Add a contact to build your registry';
  const statusText = error
    ? 'Unable to load contacts'
    : isLoadingInitial
      ? 'Loading contacts...'
      : isRefreshing
        ? 'Refreshing...'
        : null;

  return (
    <div className="min-h-[100dvh] bg-gradient-to-b from-background via-background to-emerald-50/20 dark:to-emerald-950/10 pb-28 lg:pb-6">
      {/* Mobile Header */}
      {!isDesktop && (
        <div className="bg-gradient-to-br from-emerald-400 via-green-500 to-teal-500 pt-[max(2rem,env(safe-area-inset-top))] pb-6 px-4 rounded-b-3xl mb-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2)_0%,transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.2)_0%,transparent_40%)]" />
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(6)].map((_, i) => (
              <motion.div key={i} className="absolute w-1.5 h-1.5 bg-white/40 rounded-full"
                style={{ left: `${10 + Math.random() * 80}%`, top: `${10 + Math.random() * 80}%` }}
                animate={{ y: [-10, 10], opacity: [0.2, 0.6, 0.2] }}
                transition={{ duration: 2 + Math.random() * 2, repeat: Infinity, delay: Math.random() * 2 }} />
            ))}
          </div>
          <div className="relative z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button onClick={() => navigate('/home')} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center">
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div>
                  <h1 className="text-xl font-bold text-white">Contacts</h1>
                  <p className="text-white/70 text-xs">{contactsCountText}{statusText ? ` · ${statusText}` : ''}</p>
                </div>
              </div>
              <button onClick={openAdd} className="w-10 h-10 rounded-full bg-white/20 backdrop-blur flex items-center justify-center hover:bg-white/30 transition-colors">
                <Plus className="w-5 h-5 text-white" />
              </button>
            </div>
            <div className="relative mt-4">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/50" />
              <input ref={searchRef} placeholder="Search by name, phone, or mark…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-white/20 backdrop-blur text-white placeholder:text-white/50 text-sm border border-white/10 focus:outline-none focus:border-white/30" />
            </div>
          </div>
        </div>
      )}

      {/* Desktop Toolbar */}
      {isDesktop && (
        <div className="px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Contact Registry</h3>
              <p className="text-xs text-muted-foreground">{contactsCountText}{statusText ? ` · ${statusText}` : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input ref={searchRef} placeholder="Search by name, phone, or mark…" value={search} onChange={e => setSearch(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-xl bg-muted/50 text-foreground text-sm border border-border focus:outline-none focus:border-primary/50" />
            </div>
            <button onClick={openAdd} className="h-10 px-5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm flex items-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-xl transition-all">
              <Plus className="w-4 h-4" /> Add Contact
            </button>
          </div>
        </div>
      )}

      {/* Info Banner */}
      <div className={cn("mb-3", isDesktop ? "px-8" : "px-4")}>
        <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 px-3 py-2 flex items-start gap-2">
          <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
          <p className="text-xs text-emerald-700 dark:text-emerald-400">
            Contacts include trader-added records and portal contacts mapped to this trader after transaction use.
          </p>
        </div>
      </div>

      {/* Desktop Table View */}
      {isDesktop ? (
        <div className="px-8">
          <div className="glass-card rounded-2xl overflow-hidden border border-border/30 shadow-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent">
                  <th className="text-left px-5 py-3.5 font-bold text-foreground text-xs uppercase tracking-wider">Name</th>
                  <th className="text-left px-5 py-3.5 font-bold text-foreground text-xs uppercase tracking-wider">Phone</th>
                  <th className="text-left px-5 py-3.5 font-bold text-foreground text-xs uppercase tracking-wider">Mark</th>
                  <th className="text-left px-5 py-3.5 font-bold text-foreground text-xs uppercase tracking-wider">Address</th>
                  <th className="text-right px-5 py-3.5 font-bold text-foreground text-xs uppercase tracking-wider">Balance</th>
                  <th className="text-center px-5 py-3.5 font-bold text-foreground text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingInitial && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">Loading contacts...</p>
                    </td>
                  </tr>
                )}
                {error && !isLoadingInitial && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <AlertCircle className="w-8 h-8 text-destructive/70 mx-auto mb-3" />
                      <p className="text-muted-foreground font-medium">Unable to load contacts</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">{error instanceof Error ? error.message : 'Please try again'}</p>
                    </td>
                  </tr>
                )}
                {!isLoadingInitial && !error && (() => {
                  const virtualRows = desktopVirtualizer.getVirtualItems();
                  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
                  const paddingBottom =
                    virtualRows.length > 0
                      ? desktopVirtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
                      : 0;
                  return (
                    <>
                      {paddingTop > 0 && (
                        <tr aria-hidden>
                          <td colSpan={6} style={{ height: paddingTop, padding: 0, border: 0 }} />
                        </tr>
                      )}
                      {virtualRows.map(virtualRow => {
                        const c = filtered[virtualRow.index];
                        if (!c) return null;
                        return (
                  <tr
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={desktopVirtualizer.measureElement}
                    className={cn(
                    "border-t border-border/20 hover:bg-muted/40 transition-all cursor-default group",
                    virtualRow.index % 2 === 0 ? 'bg-emerald-500/[0.02] dark:bg-emerald-500/[0.03]' : ''
                  )}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm text-white text-xs font-bold shrink-0 overflow-hidden">
                          {contactAvatarInitial(c)}
                        </div>
                        <span className="font-semibold text-foreground group-hover:text-primary transition-colors">{c.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground font-medium">{c.phone}</td>
                    <td className="px-5 py-3.5">
                      {c.mark && <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-emerald-500/10 to-teal-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-bold border border-emerald-500/15">{c.mark}</span>}
                    </td>
                    <td className="px-5 py-3.5 text-muted-foreground text-xs max-w-[200px] truncate">
                      <div className="flex flex-col gap-0.5">
                        <span className="truncate">{c.address || '—'}</span>
                        {c.portal_signup_linked && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            Joined via portal (added when used)
                          </span>
                        )}
                        {!c.portal_signup_linked && c.can_login && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                            Portal enabled
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <span className={cn('font-bold tabular-nums', (c.current_balance ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                        ₹{Math.abs(c.current_balance ?? 0).toLocaleString()}
                      </span>
                      <span className="text-[10px] text-muted-foreground ml-1">{(c.current_balance ?? 0) >= 0 ? 'Dr' : 'Cr'}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => openView(c)} className="p-2 rounded-lg hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors" title="View">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openEdit(c)}
                          className="p-2 rounded-lg hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors disabled:opacity-40"
                          title={c.portal_signup_linked ? 'Managed via participant portal' : 'Edit'}
                          disabled={!!c.portal_signup_linked}
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (c.portal_signup_linked) {
                              toast.error('Remove is not available for portal participants from this list.');
                              return;
                            }
                            setDeleteConfirm(c.contact_id);
                          }}
                          className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors disabled:opacity-40"
                          title={c.portal_signup_linked ? 'Cannot delete portal participant here' : 'Delete'}
                          disabled={!!c.portal_signup_linked}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                        );
                      })}
                      {paddingBottom > 0 && (
                        <tr aria-hidden>
                          <td colSpan={6} style={{ height: paddingBottom, padding: 0, border: 0 }} />
                        </tr>
                      )}
                    </>
                  );
                })()}
                {showEmptyState && (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 flex items-center justify-center mx-auto mb-3 border border-emerald-500/15">
                        <UserIcon className="w-7 h-7 text-muted-foreground/40" />
                      </div>
                      <p className="text-muted-foreground font-medium">{emptyTitle}</p>
                      <p className="text-xs text-muted-foreground/60 mt-1">{emptyHint}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Mobile Card View */
        <div className="px-4">
          {isLoadingInitial && (
            <div className="glass-card rounded-2xl p-8 text-center">
              <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Loading contacts...</p>
            </div>
          )}
          {error && !isLoadingInitial && (
            <div className="glass-card rounded-2xl p-8 text-center">
              <AlertCircle className="w-10 h-10 text-destructive/60 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Unable to load contacts</p>
              <p className="text-sm text-muted-foreground/70 mt-1">{error instanceof Error ? error.message : 'Please try again'}</p>
            </div>
          )}
          {!isLoadingInitial && !error && filtered.length > 0 && (
            <div className="relative w-full" style={{ height: mobileVirtualizer.getTotalSize() }}>
              {mobileVirtualizer.getVirtualItems().map(virtualRow => {
                const c = filtered[virtualRow.index];
                if (!c) return null;
                return (
                  <div
                    key={virtualRow.key}
                    data-index={virtualRow.index}
                    ref={mobileVirtualizer.measureElement}
                    className="absolute left-0 top-0 w-full pb-2"
                    style={{ transform: `translateY(${virtualRow.start}px)` }}
                  >
            <motion.div initial={false}
              className="glass-card rounded-2xl p-3 group hover:shadow-lg transition-all">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20 relative overflow-hidden shrink-0">
                  <span className="text-white font-bold text-sm relative z-10 leading-none">{contactAvatarInitial(c)}</span>
                  <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.3)_0%,transparent_50%)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{c.name}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                    <Phone className="w-3 h-3 shrink-0" />
                    <span>{c.phone}</span>
                    {c.mark && <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">{c.mark}</span>}
                    {c.portal_signup_linked && (
                      <span className="px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">Portal</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className={cn('text-sm font-semibold tabular-nums', (c.current_balance ?? 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive')}>
                    ₹{Math.abs(c.current_balance ?? 0).toLocaleString()}
                  </p>
                  <p className="text-[10px] text-muted-foreground">{(c.current_balance ?? 0) >= 0 ? 'Receivable' : 'Payable'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 pl-[52px]">
                <button onClick={() => openView(c)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 hover:shadow-md transition-all active:scale-95">
                  <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">View</span>
                </button>
                <button
                  onClick={() => openEdit(c)}
                  disabled={!!c.portal_signup_linked}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/10 border border-amber-500/20 hover:shadow-md transition-all active:scale-95 disabled:opacity-40"
                >
                  <Pencil className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Edit</span>
                </button>
                <button
                  onClick={() => {
                    if (c.portal_signup_linked) {
                      toast.error('Remove is not available for portal participants from this list.');
                      return;
                    }
                    setDeleteConfirm(c.contact_id);
                  }}
                  disabled={!!c.portal_signup_linked}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-br from-red-500/10 to-rose-500/10 border border-red-500/20 hover:shadow-md transition-all active:scale-95 disabled:opacity-40"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                  <span className="text-[11px] font-medium text-red-500 dark:text-red-400">Delete</span>
                </button>
              </div>
            </motion.div>
                  </div>
                );
              })}
            </div>
          )}
          {showEmptyState && (
            <div className="glass-card rounded-2xl p-8 text-center">
              <UserIcon className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">{emptyTitle}</p>
              <p className="text-sm text-muted-foreground/70 mt-1">{emptyHint}</p>
            </div>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm px-6"
            onClick={e => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-sm bg-card rounded-2xl p-5 shadow-2xl border border-border/50">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 to-rose-500/20 border border-red-500/20 flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-7 h-7 text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-center text-foreground mb-1">Delete Contact?</h3>
                <p className="text-sm text-center text-muted-foreground mb-5">
                This will remove <strong>{contacts.find(c => c.contact_id === deleteConfirm)?.name}</strong> from the list. You can restore later by adding the same phone again.
              </p>
              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setDeleteConfirm(null)} className="flex-1 h-12 rounded-xl">Cancel</Button>
                <Button onClick={() => handleDelete(deleteConfirm)} className="flex-1 h-12 rounded-xl bg-gradient-to-r from-red-500 to-rose-500 text-white hover:from-red-600 hover:to-rose-600">
                  Delete
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Restore previously removed contact (same phone exists but inactive) */}
      <Dialog open={!!restorePendingPhone} onOpenChange={(open) => { if (!open) setRestorePendingPhone(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
                <RotateCcw className="w-5 h-5 text-primary" />
              </div>
              <DialogTitle>Restore contact?</DialogTitle>
            </div>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            A contact with phone <strong>{restorePendingPhone}</strong> was previously removed. Restore it to use again instead of creating a new one?
          </p>
          {!canEdit && (
            <p className="text-xs text-amber-600 dark:text-amber-400">You need Edit permission to restore.</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestorePendingPhone(null)}>Cancel</Button>
            <Button onClick={handleRestoreContact} disabled={!canEdit}>Restore</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View / Add / Edit Dialog */}
      <AnimatePresence>
        {modalMode && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[60] flex items-center justify-center overscroll-none bg-black/50 px-4 py-[max(1rem,env(safe-area-inset-top))] backdrop-blur-sm sm:px-6"
            onClick={e => { if (e.target === e.currentTarget) closeModal(); }}>
            <motion.div initial={{ scale: 0.96, opacity: 0, y: 16 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.96, opacity: 0, y: 16 }} transition={{ type: 'spring', damping: 30 }}
              className="w-full max-w-lg rounded-3xl p-5 space-y-4 max-h-[min(85dvh,720px)] overflow-y-auto overscroll-contain shadow-2xl border border-border/30"
              style={{ background: 'var(--glass-bg)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)' }}
              
              onClick={e => e.stopPropagation()}>

              {/* VIEW MODE */}
              {modalMode === 'view' && selectedContact && (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-foreground">Contact Details</h3>
                    <button onClick={closeModal} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div className="rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 p-5 text-white relative overflow-hidden">
                    <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.15)_0%,transparent_50%)]" />
                    <div className="relative z-10 flex items-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center border border-white/30 overflow-hidden">
                        <span className="text-2xl font-bold leading-none">{contactAvatarInitial(selectedContact)}</span>
                      </div>
                      <div>
                        <h2 className="text-xl font-bold">{selectedContact.name}</h2>
                        <div className="flex items-center gap-1.5 mt-1 text-white/80 text-sm">
                          <Phone className="w-3.5 h-3.5" />
                          <span>{selectedContact.phone}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedContact.mark && (
                      <div className="glass-card rounded-xl p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 flex items-center justify-center">
                          <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Mark / Alias</p>
                          <p className="text-sm font-semibold text-foreground">{selectedContact.mark}</p>
                        </div>
                      </div>
                    )}
                    {selectedContact.address && (
                      <div className="glass-card rounded-xl p-3 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/20 flex items-center justify-center">
                          <MapPin className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Address</p>
                          <p className="text-sm font-semibold text-foreground">{selectedContact.address}</p>
                        </div>
                      </div>
                    )}
                    <div className="glass-card rounded-xl p-3 flex items-center gap-3">
                      <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center border",
                        (selectedContact.current_balance ?? 0) >= 0
                          ? "bg-gradient-to-br from-emerald-500/10 to-green-500/10 border-emerald-500/20"
                          : "bg-gradient-to-br from-red-500/10 to-rose-500/10 border-red-500/20"
                      )}>
                        <span className="text-sm font-bold">₹</span>
                      </div>
                      <div>
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Balance</p>
                        <p className={cn("text-sm font-semibold", (selectedContact.current_balance ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")}>
                          ₹{Math.abs(selectedContact.current_balance ?? 0).toLocaleString()} {(selectedContact.current_balance ?? 0) >= 0 ? 'Receivable' : 'Payable'}
                        </p>
                      </div>
                    </div>
                    {selectedContact.portal_signup_linked && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                        This entry is shared from portal signup and was added to your registry when used in an arrival or auction. Profile edits are done by the participant in their portal.
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col gap-3 pt-2">
                    <Button
                      onClick={() => { const id = selectedContact.contact_id; closeModal(); navigate(`/contact-ledger/${id}`); }}
                      variant="outline"
                      className="h-12 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 flex items-center justify-center gap-2"
                    >
                      <Wallet className="w-4 h-4" /> View Ledgers
                    </Button>
                    <div className="flex gap-3">
                      <Button
                        onClick={() => { const sc = selectedContact; closeModal(); setTimeout(() => openEdit(sc), 150); }}
                        disabled={!!selectedContact.portal_signup_linked}
                        className="flex-1 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 shadow-lg shadow-amber-500/20 disabled:opacity-40"
                      >
                        <Pencil className="w-4 h-4 mr-2" /> Edit
                      </Button>
                      <Button
                        onClick={() => {
                          if (selectedContact.portal_signup_linked) {
                            toast.error('Remove is not available for portal participants from this list.');
                            return;
                          }
                          const id = selectedContact.contact_id;
                          closeModal();
                          setTimeout(() => setDeleteConfirm(id), 150);
                        }}
                        disabled={!!selectedContact.portal_signup_linked}
                        variant="outline"
                        className="flex-1 h-12 rounded-xl border-red-500/30 text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {/* ADD / EDIT MODE */}
              {(modalMode === 'add' || modalMode === 'edit') && (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-bold text-foreground">{modalMode === 'add' ? 'Register Contact' : 'Edit Contact'}</h3>
                    <button onClick={closeModal} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Full Name *</label>
                    <Input placeholder="e.g., Ramesh Kumar" value={formData.name}
                      onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                      className={cn("h-12 rounded-xl", errors.name && "border-destructive")} />
                    {errors.name && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.name}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Phone Number * <span className="text-emerald-500 font-normal">(Primary ID)</span></label>
                    <Input placeholder="e.g., 9876543210" value={formData.phone}
                      onChange={e => setFormData(p => ({ ...p, phone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      className={cn("h-12 rounded-xl", errors.phone && "border-destructive")}
                      type="tel" maxLength={10} />
                    {errors.phone && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.phone}</p>}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Mark <span className="text-muted-foreground/60 font-normal">(Short Code)</span></label>
                    <Input placeholder="e.g., VT, ML, AB" value={formData.mark}
                      onChange={e => setFormData(p => ({ ...p, mark: e.target.value.toUpperCase().slice(0, 4) }))}
                      className={cn("h-12 rounded-xl", errors.mark && "border-destructive")} maxLength={4} />
                    {errors.mark && <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.mark}</p>}
                    {!errors.mark && <p className="text-[10px] text-muted-foreground mt-1">Used for quick auto-complete in transaction screens</p>}
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Address</label>
                    <Input placeholder="e.g., Village Pune, Market Yard" value={formData.address}
                      onChange={e => setFormData(p => ({ ...p, address: e.target.value }))}
                      className="h-12 rounded-xl" />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="enable-portal-login"
                      type="checkbox"
                      className="w-4 h-4 rounded border border-emerald-500"
                      checked={formData.enablePortal}
                      onChange={e => setFormData(p => ({ ...p, enablePortal: e.target.checked }))}
                      disabled
                    />
                    <label htmlFor="enable-portal-login" className="text-xs text-muted-foreground">
                      Contact Portal login enabled by default
                    </label>
                  </div>

                  {modalMode === 'add' && (
                    <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/30 px-3 py-2 flex items-start gap-2">
                      <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-emerald-700 dark:text-emerald-400">Contact registered. A receivable ledger is created automatically.</p>
                    </div>
                  )}

                  <Button onClick={modalMode === 'add' ? handleAdd : handleEdit}
                    className="w-full h-14 rounded-xl text-lg font-semibold bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-xl shadow-emerald-500/20 hover:from-emerald-600 hover:to-teal-600">
                    {modalMode === 'add' ? 'Register Contact' : 'Save Changes'}
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomNav />
    </div>
  );
};

export default ContactsPage;
