import React, { createContext, useContext } from 'react';
import { useUpdateGate, type UpdateGateUi } from './useUpdateGate';

/**
 * One shared update-gate frame for the whole window.
 *
 * `UpdateBanner` and `UpdateGateOverlay` mount as siblings inside the
 * workspace. Previously each mounted its own `useUpdateGate()`, which meant
 * two status listeners, two progress listeners and two `update_gate_status`
 * calls racing on every check — the duplicate listener/polling the update
 * gate requirements forbid. The provider runs the frame once and shares it;
 * each surface still decides independently whether its presentation kind
 * should render anything.
 */
const UpdateGateContext = createContext<UpdateGateUi | null>(null);

export function UpdateGateProvider({ children }: { children: React.ReactNode }) {
  const state = useUpdateGate();
  return <UpdateGateContext.Provider value={state}>{children}</UpdateGateContext.Provider>;
}

/** Consume the shared frame. Must be used inside `UpdateGateProvider`. */
export function useSharedUpdateGate(): UpdateGateUi {
  const value = useContext(UpdateGateContext);
  if (!value) {
    throw new Error('useSharedUpdateGate must be used inside an UpdateGateProvider');
  }
  return value;
}
