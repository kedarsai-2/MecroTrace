import * as React from "react";
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
    stayLabel = "No",
    onBeforeContinue,
  } = options;

  const blocker = useBlocker(when);

  const [localResolver, setLocalResolver] = React.useState<((value: boolean) => void) | null>(null);
  const [saving, setSaving] = React.useState(false);
  const continuingRef = React.useRef(false);

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

  const handleContinue = React.useCallback(async () => {
    continuingRef.current = true;
    if (onBeforeContinue) {
      setSaving(true);
      try {
        const ok = await onBeforeContinue();
        if (!ok) {
          setSaving(false);
          continuingRef.current = false;
          return;
        }
      } catch {
        setSaving(false);
        continuingRef.current = false;
        return;
      }
      setSaving(false);
    }
    if (isRouteBlocked) blocker.proceed();
    else resolveLocal(true);
    // Allow close interactions again after proceed/resolve.
    continuingRef.current = false;
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
            <AlertDialogCancel onClick={handleStay} disabled={saving}>{stayLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleContinue} disabled={saving}>
              {saving ? 'Saving…' : continueLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [isOpen, handleOpenChange, title, description, stayLabel, continueLabel, handleStay, handleContinue, saving]);

  return { confirmIfDirty, UnsavedChangesDialog };
}
