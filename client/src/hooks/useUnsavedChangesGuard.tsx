import * as React from "react";
import { Loader2 } from "lucide-react";
import { useBlocker, useBeforeUnload } from "react-router-dom";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type UseUnsavedChangesGuardOptions = {
  when: boolean;
  title?: string;
  description?: string;
  continueLabel?: string;
  stayLabel?: string;
  /** Async callback invoked before proceeding. Return false to abort navigation. */
  onBeforeContinue?: () => Promise<boolean>;
};

const DEFAULT_TITLE = "Progress will be lost";
const DEFAULT_DESCRIPTION =
  "You have unsaved changes. If you leave this screen, your progress will be lost. Do you want to continue?";

export default function useUnsavedChangesGuard(options: UseUnsavedChangesGuardOptions) {
  const {
    when,
    title = DEFAULT_TITLE,
    description = DEFAULT_DESCRIPTION,
    continueLabel = "Yes",
    stayLabel = "Discard",
    onBeforeContinue,
  } = options;

  const blocker = useBlocker(when);

  const [localResolver, setLocalResolver] = React.useState<((value: boolean) => void) | null>(null);
  const [saving, setSaving] = React.useState(false);
  const continuingRef = React.useRef(false);
  const continueInFlightRef = React.useRef(false);

  const isRouteBlocked = blocker.state === "blocked";
  const isOpen = isRouteBlocked || localResolver != null;

  const beforeUnloadCallback = React.useCallback(
    (event: BeforeUnloadEvent) => {
      if (!when) return;
      event.preventDefault();
      event.returnValue = "";
    },
    [when],
  );
  useBeforeUnload(beforeUnloadCallback);

  const confirmIfDirty = React.useCallback((): Promise<boolean> => {
    if (!when) return Promise.resolve(true);
    if (blocker.state === "blocked") return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      setLocalResolver(() => resolve);
    });
  }, [when, blocker.state]);

  const resolveLocal = React.useCallback((value: boolean) => {
    setLocalResolver((prev) => {
      if (prev) prev(value);
      return null;
    });
  }, []);

  const handleStay = React.useCallback(() => {
    if (isRouteBlocked) blocker.reset();
    else resolveLocal(false);
  }, [isRouteBlocked, blocker, resolveLocal]);

  const handleDiscard = React.useCallback(() => {
    if (isRouteBlocked) blocker.proceed();
    else resolveLocal(true);
  }, [isRouteBlocked, blocker, resolveLocal]);

  const handleContinue = React.useCallback(async () => {
    if (continueInFlightRef.current) return;
    continueInFlightRef.current = true;
    continuingRef.current = true;
    const asyncSave = !!onBeforeContinue;
    if (asyncSave) setSaving(true);
    try {
      if (onBeforeContinue) {
        const ok = await onBeforeContinue();
        if (!ok) {
          return;
        }
      }
      if (isRouteBlocked) blocker.proceed();
      else resolveLocal(true);
    } catch {
      /* onBeforeContinue surfaced its own error; stay on dialog */
    } finally {
      if (asyncSave) setSaving(false);
      continuingRef.current = false;
      continueInFlightRef.current = false;
    }
  }, [isRouteBlocked, blocker, resolveLocal, onBeforeContinue]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      // Ignore dialog close events fired by the primary action while continue/save is in progress.
      if (continuingRef.current) return;
      handleStay();
    },
    [handleStay],
  );

  const UnsavedChangesDialog = React.useCallback(() => {
    return (
      <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleDiscard} disabled={saving}>
              {stayLabel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={saving}
              className="gap-2"
              onClick={e => {
                e.preventDefault();
                void handleContinue();
              }}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
                  Saving…
                </>
              ) : (
                continueLabel
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [isOpen, handleOpenChange, title, description, stayLabel, continueLabel, handleDiscard, handleContinue, saving]);

  return { confirmIfDirty, UnsavedChangesDialog };
}
