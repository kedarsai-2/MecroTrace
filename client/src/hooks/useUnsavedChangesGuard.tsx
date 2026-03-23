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
  continueLabel?: string; // yes
  stayLabel?: string; // no
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
  } = options;

  const blocker = useBlocker(when);

  const [localResolver, setLocalResolver] = React.useState<((value: boolean) => void) | null>(null);

  // Keep the dialog open if we're blocked for a route navigation.
  const isRouteBlocked = blocker.state === "blocked";
  const isOpen = isRouteBlocked || localResolver != null;

  const beforeUnloadCallback = React.useCallback(
    (event: BeforeUnloadEvent) => {
      if (!when) return;
      // Native browser confirmation prompt (cannot be styled).
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

  const handleContinue = React.useCallback(() => {
    if (isRouteBlocked) blocker.proceed();
    else resolveLocal(true);
  }, [isRouteBlocked, blocker, resolveLocal]);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      if (nextOpen) return;
      // Treat dismissals (Escape / overlay dismissal) as "stay".
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
            <AlertDialogCancel onClick={handleStay}>{stayLabel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleContinue}>{continueLabel}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }, [isOpen, handleOpenChange, title, description, stayLabel, continueLabel, handleStay, handleContinue]);

  return { confirmIfDirty, UnsavedChangesDialog };
}

