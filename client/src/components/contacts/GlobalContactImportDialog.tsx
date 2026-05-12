import { BookOpen, Phone, User as UserIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Contact } from '@/types/models';

type GlobalContactImportDialogProps = {
  open: boolean;
  contact: Contact | null;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

const GlobalContactImportDialog = ({
  open,
  contact,
  loading = false,
  onCancel,
  onConfirm,
}: GlobalContactImportDialogProps) => (
  <Dialog open={open} onOpenChange={nextOpen => { if (!nextOpen && !loading) onCancel(); }}>
    <DialogContent
      className="z-[121] max-w-sm rounded-2xl"
      overlayClassName="z-[120]"
      hideCloseButton={loading}
    >
      <DialogHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15">
            <BookOpen className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-left">
            <DialogTitle>Import global contact?</DialogTitle>
            <DialogDescription>
              This mobile already belongs to a global contact.
            </DialogDescription>
          </div>
        </div>
      </DialogHeader>

      {contact ? (
        <div className="rounded-xl border border-border/60 bg-muted/30 p-3">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-sm font-bold">
              {(contact.mark || contact.name || '?').trim().charAt(0).toUpperCase() || '?'}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {contact.name || 'Global contact'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {contact.phone ? (
                  <span className="inline-flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {contact.phone}
                  </span>
                ) : null}
                {contact.mark ? (
                  <span className="inline-flex items-center gap-1">
                    <UserIcon className="h-3 w-3" />
                    {contact.mark}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <p className="text-sm text-muted-foreground">
        Importing will map this contact to your trader list and make it visible in contact search next time.
      </p>

      <DialogFooter className="gap-2 sm:gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button type="button" onClick={onConfirm} disabled={loading}>
          {loading ? 'Importing...' : 'Import'}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export default GlobalContactImportDialog;
