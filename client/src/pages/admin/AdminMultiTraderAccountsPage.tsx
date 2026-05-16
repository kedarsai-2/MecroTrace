import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Eye, RefreshCw, Search, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import AdminForbiddenPage from '@/admin/components/AdminForbiddenPage';
import { useAdminPermissions } from '@/admin/lib/adminPermissions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  multiTraderAccountsApi,
  type MultiTraderAccountRequest,
  type MultiTraderRequestStatus,
} from '@/services/api';

const PAGE_SIZE = 50;

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function StatusBadge({ status }: { status: MultiTraderRequestStatus }) {
  if (status === 'APPROVED') return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">Approved</Badge>;
  if (status === 'REJECTED') return <Badge variant="destructive">Rejected</Badge>;
  return <Badge className="bg-amber-500 text-white hover:bg-amber-500">Pending</Badge>;
}

type RequestGroup = {
  id: string;
  requests: MultiTraderAccountRequest[];
  pendingCount: number;
  approvedCount: number;
  rejectedCount: number;
};

function groupRequests(requests: MultiTraderAccountRequest[]): RequestGroup[] {
  const byGroup = new Map<string, MultiTraderAccountRequest[]>();
  requests.forEach(request => {
    const key = request.request_group_id || `single-${request.id}`;
    byGroup.set(key, [...(byGroup.get(key) ?? []), request]);
  });
  return Array.from(byGroup.entries()).map(([id, groupRequests]) => {
    const sorted = [...groupRequests].sort((a, b) => {
      const ai = a.request_group_index ?? 1;
      const bi = b.request_group_index ?? 1;
      return ai === bi ? a.id - b.id : ai - bi;
    });
    return {
      id,
      requests: sorted,
      pendingCount: sorted.filter(request => request.status === 'PENDING').length,
      approvedCount: sorted.filter(request => request.status === 'APPROVED').length,
      rejectedCount: sorted.filter(request => request.status === 'REJECTED').length,
    };
  });
}

function GroupStatusBadge({ group }: { group: RequestGroup }) {
  if (group.pendingCount === group.requests.length) return <StatusBadge status="PENDING" />;
  if (group.approvedCount === group.requests.length) return <StatusBadge status="APPROVED" />;
  if (group.rejectedCount === group.requests.length) return <StatusBadge status="REJECTED" />;
  return <Badge className="bg-blue-600 text-white hover:bg-blue-600">Partial</Badge>;
}

const AdminMultiTraderAccountsPage = () => {
  const { canAccessModule, can } = useAdminPermissions();
  const canView = canAccessModule('Traders');
  const canApprove = can('Traders', 'Approve');
  const [requests, setRequests] = useState<MultiTraderAccountRequest[]>([]);
  const [status, setStatus] = useState<MultiTraderRequestStatus | 'ALL'>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<RequestGroup | null>(null);
  const [approveTarget, setApproveTarget] = useState<MultiTraderAccountRequest | null>(null);
  const [rejectTarget, setRejectTarget] = useState<MultiTraderAccountRequest | null>(null);
  const [approveGroupTarget, setApproveGroupTarget] = useState<RequestGroup | null>(null);
  const [rejectGroupTarget, setRejectGroupTarget] = useState<RequestGroup | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    try {
      const result = await multiTraderAccountsApi.adminList({ page, size: PAGE_SIZE, status, q: search });
      setRequests(result.requests);
      setTotal(result.total);
    } catch {
      setRequests([]);
      setTotal(0);
      toast.error('Failed to load multi trader requests');
    } finally {
      setLoading(false);
    }
  }, [canView, page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (!canView) return <AdminForbiddenPage moduleName="Traders" />;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const groups = groupRequests(requests);

  const approve = async () => {
    if (!approveTarget && !approveGroupTarget) return;
    setDeciding(true);
    try {
      if (approveGroupTarget) {
        await multiTraderAccountsApi.approveGroup(approveGroupTarget.id, decisionReason);
        toast.success('Request group approved');
      } else if (approveTarget) {
        await multiTraderAccountsApi.approve(approveTarget.id, decisionReason);
        toast.success('Request approved');
      }
      setApproveTarget(null);
      setApproveGroupTarget(null);
      setSelectedGroup(null);
      setDecisionReason('');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to approve request');
    } finally {
      setDeciding(false);
    }
  };

  const reject = async () => {
    if (!rejectTarget && !rejectGroupTarget) return;
    if (!decisionReason.trim()) {
      toast.error('Reject reason is required');
      return;
    }
    setDeciding(true);
    try {
      if (rejectGroupTarget) {
        await multiTraderAccountsApi.rejectGroup(rejectGroupTarget.id, decisionReason.trim());
        toast.success('Request group rejected');
      } else if (rejectTarget) {
        await multiTraderAccountsApi.reject(rejectTarget.id, decisionReason.trim());
        toast.success('Request rejected');
      }
      setRejectTarget(null);
      setRejectGroupTarget(null);
      setSelectedGroup(null);
      setDecisionReason('');
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to reject request');
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">Multi Trader Approval</h1>
          <p className="text-sm text-muted-foreground">{total.toLocaleString()} requests</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} placeholder="Search requests..." className="pl-10" />
        </div>
        <div className="flex gap-2">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(next => (
            <Button
              key={next}
              type="button"
              variant={status === next ? 'default' : 'outline'}
              onClick={() => { setStatus(next); setPage(0); }}
            >
              {next === 'ALL' ? 'All' : next.charAt(0) + next.slice(1).toLowerCase()}
            </Button>
          ))}
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 bg-muted/40">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Requester</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Current trader</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Requested business</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Location</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Request date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase text-muted-foreground">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && groups.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading requests...</td></tr>
              )}
              {!loading && groups.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No requests found</td></tr>
              )}
              {groups.map(group => {
                const first = group.requests[0];
                const isGrouped = group.requests.length > 1;
                return (
                <tr key={group.id} className="border-b border-border/20 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{first.requester_name || first.requester_login || '-'}</p>
                    <p className="text-xs text-muted-foreground">{first.email || first.mobile || '-'}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{first.current_trader_business_name || '-'}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{isGrouped ? `${group.requests.length} mandi requests` : first.business_name}</p>
                    {isGrouped && <p className="mt-1 text-xs text-muted-foreground">{group.requests.map(request => request.business_name).join(', ')}</p>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {isGrouped
                      ? `${group.requests.filter(request => request.city || request.state).length} locations`
                      : [first.city, first.state].filter(Boolean).join(', ') || '-'}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(first.requested_at)}</td>
                  <td className="px-4 py-3"><GroupStatusBadge group={group} /></td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="icon" onClick={() => setSelectedGroup(group)} aria-label="View request">
                        <Eye className="h-4 w-4" />
                      </Button>
                      {group.pendingCount > 0 && canApprove && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { setApproveGroupTarget(group); setDecisionReason(''); }} aria-label="Approve request group">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setRejectGroupTarget(group); setDecisionReason(''); }} aria-label="Reject request group">
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border/30 px-4 py-3 text-sm text-muted-foreground">
          <span>Page {Math.min(page + 1, totalPages)} / {totalPages}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      </section>

      <Dialog open={!!selectedGroup} onOpenChange={open => !open && setSelectedGroup(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {selectedGroup && selectedGroup.requests.length > 1
                ? `${selectedGroup.requests.length} mandi requests`
                : selectedGroup?.requests[0]?.business_name}
            </DialogTitle>
          </DialogHeader>
          {selectedGroup && (
            <div className="space-y-4">
              {selectedGroup.pendingCount > 0 && canApprove && (
                <div className="flex flex-wrap justify-end gap-2">
                  <Button onClick={() => { setApproveGroupTarget(selectedGroup); setDecisionReason(''); }} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    Approve All Pending
                  </Button>
                  <Button variant="destructive" onClick={() => { setRejectGroupTarget(selectedGroup); setDecisionReason(''); }} className="gap-2">
                    <XCircle className="h-4 w-4" />
                    Reject All Pending
                  </Button>
                </div>
              )}
              {selectedGroup.requests.map((request, index) => (
                <section key={request.id} className="rounded-2xl border border-border/50 p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">Mandi {index + 1}</p>
                      <h3 className="text-base font-bold text-foreground">{request.business_name}</h3>
                      <p className="text-sm text-muted-foreground">{request.owner_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={request.status} />
                      {request.status === 'PENDING' && canApprove && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => { setApproveTarget(request); setDecisionReason(''); }} aria-label="Approve request">
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setRejectTarget(request); setDecisionReason(''); }} aria-label="Reject request">
                            <XCircle className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      ['Requester', request.requester_name || request.requester_login],
                      ['Email / Mobile', request.email || request.mobile],
                      ['Current trader', request.current_trader_business_name],
                      ['Shop no', request.shop_no],
                      ['Location', [request.city, request.state, request.pin_code].filter(Boolean).join(', ')],
                      ['Category', request.category],
                      ['GST', request.gst_number],
                      ['RMC/APMC', request.rmc_apmc_code],
                      ['Requested at', formatDate(request.requested_at)],
                      ['Decision at', formatDate(request.decision_at)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-muted/40 p-3">
                        <p className="text-xs uppercase text-muted-foreground">{label}</p>
                        <p className="font-medium text-foreground">{value || '-'}</p>
                      </div>
                    ))}
                    <div className="rounded-xl bg-muted/40 p-3 sm:col-span-2 lg:col-span-3">
                      <p className="text-xs uppercase text-muted-foreground">Address</p>
                      <p className="font-medium text-foreground">{request.address || '-'}</p>
                    </div>
                    {request.description && (
                      <div className="rounded-xl bg-muted/40 p-3 sm:col-span-2 lg:col-span-3">
                        <p className="text-xs uppercase text-muted-foreground">Additional info</p>
                        <p className="font-medium text-foreground">{request.description}</p>
                      </div>
                    )}
                    {request.decision_reason && (
                      <div className="rounded-xl bg-muted/40 p-3 sm:col-span-2 lg:col-span-3">
                        <p className="text-xs uppercase text-muted-foreground">Decision note</p>
                        <p className="font-medium text-foreground">{request.decision_reason}</p>
                      </div>
                    )}
                  </div>
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!approveTarget || !!approveGroupTarget}
        onOpenChange={open => {
          if (!open) {
            setApproveTarget(null);
            setApproveGroupTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>{approveGroupTarget ? 'Approve pending requests' : 'Approve request'}</DialogTitle></DialogHeader>
          <Textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Optional admin note" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setApproveTarget(null); setApproveGroupTarget(null); }}>Cancel</Button>
            <Button onClick={() => void approve()} disabled={deciding} className="gap-2">
              {deciding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Approve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!rejectTarget || !!rejectGroupTarget}
        onOpenChange={open => {
          if (!open) {
            setRejectTarget(null);
            setRejectGroupTarget(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>{rejectGroupTarget ? 'Reject pending requests' : 'Reject request'}</DialogTitle></DialogHeader>
          <Textarea value={decisionReason} onChange={e => setDecisionReason(e.target.value)} placeholder="Required rejection reason" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectGroupTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={() => void reject()} disabled={deciding} className="gap-2">
              {deciding ? <RefreshCw className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminMultiTraderAccountsPage;
