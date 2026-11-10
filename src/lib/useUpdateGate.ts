import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  subscribeToInstallProgress,
  subscribeToUpdateStatus,
  updateGateCheckNow,
  updateGateInstall,
  updateGateOpenDataFolder,
  updateGateStatus,
  updatePresentation,
  type InstallProgress,
  type UpdateGateStatus,
  type UpdatePresentation,
} from '../services/tauri/updateGate';

/**
 * One shared frame for both update surfaces (banner + gate overlay).
 *
 * Goal-state semantics (fail-open by design):
 * - The gate overlay is driven by previously-authenticated cached policy and
 *   renders instantly on boot — it never waits for network.
 * - Only the transient "checking…" banner honours the 15 s boot timeout;
 *   after that the UI stops waiting and degrades to the stale frame. The
 *   gate itself is unaffected by connectivity.
 */
const CHECK_TIMEOUT_MS = 15_000;

export interface UpdateGateUi {
  status: UpdateGateStatus | null;
  presentation: UpdatePresentation;
  progress: InstallProgress | null;
  installing: boolean;
  installError: string | null;
  checkNow: () => void;
  install: (event: React.MouseEvent) => void;
  openDataFolder: () => void;
}

export function useUpdateGate(): UpdateGateUi {
  const [status, setStatus] = useState<UpdateGateStatus | null>(null);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setTimedOut(true), CHECK_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    const disposers: Array<() => void> = [];
    void (async () => {
      const initial = await updateGateStatus();
      if (alive && initial) setStatus(initial);
      const unStatus = await subscribeToUpdateStatus((next) => {
        if (alive) setStatus(next);
      });
      const unProgress = await subscribeToInstallProgress((next) => {
        if (alive) setProgress(next);
      });
      if (alive) {
        disposers.push(unStatus, unProgress);
      } else {
        unStatus();
        unProgress();
      }
    })();
    return () => {
      alive = false;
      disposers.forEach((dispose) => dispose());
    };
  }, []);

  const checkNow = useCallback(() => {
    void updateGateCheckNow();
  }, []);

  const install = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setInstallError(null);
    void updateGateInstall().catch((err: unknown) => {
      setInstallError(err instanceof Error ? err.message : String(err));
    });
  }, []);

  const openDataFolder = useCallback(() => {
    void updateGateOpenDataFolder();
  }, []);

  const presentation = useMemo(
    () => updatePresentation(status, timedOut),
    [status, timedOut]
  );

  return {
    status,
    presentation,
    progress,
    installing: status?.install_in_progress ?? false,
    installError,
    checkNow,
    install,
    openDataFolder,
  };
}
