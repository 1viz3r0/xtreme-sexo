type Scope = 'session' | 'view' | 'detail';
export type CaptureToken = { lifetime: number; session: number; view: number; detail: number; scope: Scope };

/** Synchronous ownership for work that can outlive a React render or effect. */
export class CaptureWorkflow {
  private mounted = false;
  private lifetime = 0;
  private session = 0;
  private view = 0;
  private detail = 0;
  private action: object | null = null;
  private pollTail: Promise<void> = Promise.resolve();
  sessionId: string | undefined;

  mount() { this.mounted = true; this.lifetime++; }
  unmount() {
    const sessionId = this.sessionId;
    this.mounted = false; this.lifetime++; this.action = null;
    this.setSession(undefined);
    return sessionId;
  }
  setSession(sessionId: string | undefined) {
    this.sessionId = sessionId; this.session++; this.invalidateView();
  }
  invalidateView() { this.view++; this.invalidateDetail(); }
  invalidateDetail() { this.detail++; }
  token(scope: Scope = 'session'): CaptureToken {
    return { lifetime: this.lifetime, session: this.session, view: this.view, detail: this.detail, scope };
  }
  currentLifetime(token: CaptureToken) {
    return this.mounted && token.lifetime === this.lifetime;
  }
  current(token: CaptureToken) {
    return this.currentLifetime(token) && token.session === this.session
      && (token.scope === 'session' || token.view === this.view)
      && (token.scope !== 'detail' || token.detail === this.detail);
  }
  acquireAction() {
    if (!this.mounted || this.action) return null;
    const lease = {};
    this.action = lease;
    return () => { if (this.action === lease) this.action = null; };
  }
  /** One gate survives query-effect restarts; cancelled queued polls never run. */
  serialPoll(current: () => boolean, operation: () => Promise<void>): Promise<void> {
    const work = this.pollTail.then(async () => { if (current()) await operation(); });
    this.pollTail = work.catch(() => {});
    return work;
  }
}
