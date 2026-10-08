import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createLifecycle, liveDataNeeds, mergeRecent, startSerialPolling } from './lib/appLifecycle';
import { TopNavbar } from './components/TopNavbar';
import { Sidebar } from './components/Sidebar';
import type { TabType } from './components/Sidebar';
import { CaptureBuddy } from './components/CaptureBuddy';
import { SystemLogs } from './components/SystemLogs';
import type { LocationNode } from './components/Globe3D';
import { authSession, authLogout } from './services/tauri/auth';
import { getActiveFlows } from './services/tauri/flows';
import { getDetections } from './services/tauri/detections';
import { getAttackGraph, subscribeToGraphEvents } from './services/tauri/graph';
import { subscribeToFlowStream } from './services/tauri/flows';
import type { FlowRecord } from './services/tauri/flows';
import type { DetectionFinding } from './services/tauri/detections';
import type { AttackGraph } from './services/tauri/graph';

const GlobalIntelView = lazy(() => import('./components/GlobalIntelView').then((module) => ({ default: module.GlobalIntelView })));
const StorylineInspector = lazy(() => import('./components/StorylineInspector').then((module) => ({ default: module.StorylineInspector })));
const EvidencePanel = lazy(() => import('./components/EvidencePanel').then((module) => ({ default: module.EvidencePanel })));
const AttackGraphPanel = lazy(() => import('./components/AttackGraph').then((module) => ({ default: module.AttackGraph })));
const EduInspectorModal = lazy(() => import('./components/EduInspectorModal').then((module) => ({ default: module.EduInspectorModal })));
const ScenarioLabs = lazy(() => import('./components/ScenarioLabs').then((module) => ({ default: module.ScenarioLabs })));
const DetectionBuilder = lazy(() => import('./components/DetectionBuilder').then((module) => ({ default: module.DetectionBuilder })));
const AuditAndIOCs = lazy(() => import('./components/AuditAndIOCs').then((module) => ({ default: module.AuditAndIOCs })));
const ScanBuddy = lazy(() => import('./components/ScanBuddy').then((module) => ({ default: module.ScanBuddy })));
const UserProfileView = lazy(() => import('./components/UserProfileView').then((module) => ({ default: module.UserProfileView })));
const AdminPanelView = lazy(() => import('./components/AdminPanelView').then((module) => ({ default: module.AdminPanelView })));
const AuthModal = lazy(() => import('./components/AuthModal').then((module) => ({ default: module.AuthModal })));
const Watchtower = lazy(() => import('./components/Watchtower').then((module) => ({ default: module.Watchtower })));

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('conversations');
  const [selectedNode, setSelectedNode] = useState<LocationNode | null>(null);
  const [searchOpenToken, setSearchOpenToken] = useState<number>(0);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);
  const [hasOpenedAuth, setHasOpenedAuth] = useState(false);
  const openAuth = () => { setHasOpenedAuth(true); setIsAuthOpen(true); };

  // Sidebar Slide States
  const [isCollapsed, setIsCollapsed] = useState<boolean>(false);
  const [isFullyHidden, setIsFullyHidden] = useState<boolean>(false);

  // User Auth State
  const [user, setUser] = useState<{ id?: string; name: string; email: string; role?: string; isVerified: boolean } | null>(null);

  // Restore persisted local session on startup (backend-validated)
  useEffect(() => {
    const stored = localStorage.getItem('netoze_token');
    if (!stored) return;
    let cancelled = false;
    authSession(stored)
      .then((u) => {
        if (cancelled) return;
        if (u) {
          setUser({ id: u.id, name: u.name, email: u.email, role: u.role, isVerified: true });
        } else {
          localStorage.removeItem('netoze_token');
        }
      })
      .catch(() => {
        if (cancelled) return;
        localStorage.removeItem('netoze_token');
      });
    return () => { cancelled = true; };
  }, []);

  // Live Data States
  const [flows, setFlows] = useState<FlowRecord[]>([]);
  const [events, setEvents] = useState<DetectionFinding[]>([]);
  const [selectedFlowId] = useState<string | null>(null);
  const [selectedField, setSelectedField] = useState<string | null>(null);
  const [graphData, setGraphData] = useState<AttackGraph>({ nodes: [], edges: [] });

  const pollGate = useRef({ busy: false });
  const [pageVisible, setPageVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const updateVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener('visibilitychange', updateVisibility);
    return () => document.removeEventListener('visibilitychange', updateVisibility);
  }, []);

  useEffect(() => {
    // Watchtower is the consolidated live view, so it consumes all existing
    // streams/snapshots without introducing a second polling lifecycle.
    const needs = activeTab === 'watchtower'
      ? { flows: true, detections: true, graph: true }
      : liveDataNeeds(activeTab);
    if (!pageVisible || !needs.flows) return;
    const lifecycle = createLifecycle();
    let streamRevision = 0;
    let graphRevision = 0;
    let pendingFlows: FlowRecord[] = [];
    let streamTimer: ReturnType<typeof setTimeout> | undefined;

    // Batch streamed records rather than scheduling a React update per packet flow.
    void lifecycle.own(subscribeToFlowStream(lifecycle.guard((flow: FlowRecord) => {
      streamRevision += 1;
      pendingFlows = mergeRecent(pendingFlows, [flow]);
      if (streamTimer === undefined) {
        streamTimer = setTimeout(() => {
          streamTimer = undefined;
          if (!lifecycle.active) return;
          const batch = pendingFlows;
          pendingFlows = [];
          setFlows((previous) => mergeRecent(previous, batch));
        }, 100);
      }
    })));
    if (needs.graph) {
      void lifecycle.own(subscribeToGraphEvents(lifecycle.guard((graph: AttackGraph) => {
        graphRevision += 1;
        setGraphData(graph);
      })));
    }

    const stopPolling = startSerialPolling(async () => {
      const revision = streamRevision;
      const graphSnapshotRevision = graphRevision;
      const [flowData, detections, graph] = await Promise.allSettled([
        getActiveFlows(100),
        needs.detections ? getDetections(100) : Promise.resolve(null),
        needs.graph ? getAttackGraph() : Promise.resolve(null),
      ]);
      if (!lifecycle.active) return;
      // Do not overwrite events that arrived while the snapshot was in flight.
      if (revision === streamRevision && flowData.status === 'fulfilled') setFlows(mergeRecent([], flowData.value));
      if (detections.status === 'fulfilled' && detections.value) setEvents(detections.value);
      if (graphSnapshotRevision === graphRevision && graph.status === 'fulfilled' && graph.value) setGraphData(graph.value);
    }, pollGate.current, 5000);

    return () => {
      lifecycle.dispose();
      stopPolling();
      clearTimeout(streamTimer);
    };
  }, [activeTab, pageVisible]);

  // Escape dismisses overlays (geo shortcuts live in GlobalIntelView).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsAuthOpen(false);
        setSelectedField(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleLogout = () => {
    const stored = localStorage.getItem('netoze_token');
    if (stored) void authLogout(stored).catch(() => {});
    localStorage.removeItem('netoze_token');
    setUser(null);
    setActiveTab('user_profile');
  };

  const selectedFlow = flows.find((f) => f.flow_id === selectedFlowId) || flows[0] || null;
  const graphForPanel = useMemo(() => {
    if (activeTab !== 'attack_graph') return { nodes: [], edges: [] };
    const severityRank: Record<string, number> = { CRITICAL: 5, HIGH: 4, MEDIUM: 3, LOW: 2, INFO: 1 };
    const severities = new Map<string, string>();
    for (const flow of flows) {
      if (!flow.severity || flow.severity === 'UNKNOWN') continue;
      for (const ip of [flow.src_ip, flow.dst_ip]) {
        const current = severities.get(ip);
        if (!current || (severityRank[flow.severity] ?? 0) > (severityRank[current] ?? 0)) {
          severities.set(ip, flow.severity);
        }
      }
    }
    const hostSeverity = (ip: string) => severities.get(ip) || 'INFO';
    return {
      nodes: graphData.nodes.map((n) => ({
        id: n.node_id,
        label: n.label,
        type: n.node_type,
        max_severity: hostSeverity(n.node_id),
      })),
      edges: graphData.edges.map((e) => ({
        id: e.edge_id,
        source: e.source_node,
        target: e.destination_node,
        protocol: e.relationship,
        count: 1,
        max_severity: hostSeverity(e.destination_node),
        threat_score: Math.round(e.confidence * 100),
      })),
    };
  }, [activeTab, flows, graphData]);
  const rawEvent = events.find((e) => e.finding_id === selectedFlowId) || events[0] || null;
  const selectedEvent = rawEvent
    ? {
        ...rawEvent,
        storyline_summary: rawEvent.description,
        technical_explanation: rawEvent.evidence,
        mitre_attack: [],
        suggested_actions: [],
        educational_insight: undefined,
      }
    : null;

  return (
    <div className="studio-shell">
      {/* Top Navbar */}
      <TopNavbar
        onOpenSearch={() => { setActiveTab('global_intel'); setSearchOpenToken((t) => t + 1); }}
        onOpenAuth={openAuth}
        user={user}
        onLogout={handleLogout}
        isFullyHidden={isFullyHidden}
        setIsFullyHidden={setIsFullyHidden}
      />

      {/* Main Body: Left Sidebar + Active View Workspace */}
      <div className="studio-body">
        {/* Left Sidebar Navigation */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          user={user}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          isFullyHidden={isFullyHidden}
          setIsFullyHidden={setIsFullyHidden}
        />

        {/* View Routing Workspace */}
        <main id="studio-workspace" aria-label="Workspace" className="studio-workspace">
          <Suspense fallback={<div role="status" className="p-4 text-sm text-slate-400">Loading view…</div>}>
          {activeTab === 'global_intel' && (
            <GlobalIntelView
              selectedNode={selectedNode}
              setSelectedNode={setSelectedNode}
              setActiveTab={setActiveTab}
              openSearchToken={searchOpenToken}
            />
          )}

           {activeTab === 'conversations' && (
            <div className="studio-page">
              <CaptureBuddy />
            </div>
           )}

           {activeTab === 'watchtower' && (
             <div className="studio-page">
               <Watchtower flows={flows} events={events} graph={graphData} />
             </div>
           )}

          {activeTab === 'storyline' && (
            <div className="flex-1 p-4 overflow-y-auto grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StorylineInspector
                event={selectedEvent}
                onInspectField={(f) => setSelectedField(f)}
              />
              <EvidencePanel
                flow={selectedFlow}
                onInspectField={(f) => setSelectedField(f)}
              />
            </div>
          )}

          {activeTab === 'attack_graph' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <AttackGraphPanel graphData={graphForPanel} flows={flows} />
            </div>
          )}

          {activeTab === 'network_engine' && (
            <div className="studio-page">
              <ScanBuddy />
            </div>
          )}

          {activeTab === 'system_logs' && (
            <div className="studio-page studio-host-page">
              <SystemLogs />
            </div>
          )}

          {activeTab === 'edu_inspector' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <EduInspectorModal
                selectedField={selectedField || 'ja4'}
                onClose={() => setSelectedField(null)}
              />
            </div>
          )}

          {(activeTab === 'labs' || activeTab === 'scenario_labs') && (
            <ScenarioLabs />
          )}

          {activeTab === 'detection_builder' && (
            <DetectionBuilder />
          )}

          {activeTab === 'ioc_threat' && (
            <div className="flex-1 p-4 overflow-y-auto">
              <AuditAndIOCs />
            </div>
          )}

          {activeTab === 'user_profile' && (
            <UserProfileView
              user={user}
              onOpenAuth={openAuth}
              onLogout={handleLogout}
              setActiveTab={setActiveTab}
            />
          )}

          {activeTab === 'admin_panel' && (
            <AdminPanelView />
          )}
          </Suspense>
        </main>
      </div>

      <Suspense fallback={<div role="status" className="fixed bottom-4 right-4 text-sm text-slate-400">Loading…</div>}>
      {/* Field Inspection Modal Overlay */}
      {selectedField && activeTab !== 'edu_inspector' && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <EduInspectorModal
              selectedField={selectedField}
              onClose={() => setSelectedField(null)}
            />
          </div>
        </div>
      )}

      {/* Login & Sign Up Authentication Modal */}
      {hasOpenedAuth && <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onLoginSuccess={(userData) => {
          setUser(userData);
          if (userData.role === 'admin') setActiveTab('global_intel');
          else setActiveTab('user_profile');
        }}
      />}
      </Suspense>
    </div>
  );
};

export default App;
