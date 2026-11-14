import React, { useRef } from 'react';
import {
  MessageSquare,
  Terminal,
  Cpu,
  Layers,
  GitFork,
  BookOpen,
  FlaskConical,
  Sliders,
  Target,
  Activity,
  Globe2,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  LockKeyhole
} from 'lucide-react';

export type TabType =
  | 'global_intel'
  | 'watchtower'
  | 'conversations'
  | 'system_logs'
  | 'network_engine'
  | 'storyline'
  | 'attack_graph'
  | 'edu_inspector'
  | 'labs'
  | 'ctfs'
  | 'scenario_labs'
  | 'detection_builder'
  | 'ioc_threat'
  | 'user_profile'
  | 'admin_panel';

interface SidebarProps {
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  user: { name: string; email: string; role?: string; isVerified: boolean } | null;
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  isFullyHidden: boolean;
  setIsFullyHidden: (hidden: boolean) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  user,
  isCollapsed,
  setIsCollapsed,
  isFullyHidden,
  setIsFullyHidden
}) => {
  const navRef = useRef<HTMLElement>(null);
  const [additionalToolsOpen, setAdditionalToolsOpen] = React.useState(false);
  const [overviewNotice, setOverviewNotice] = React.useState(false);
  const menuItems: { id: TabType; label: string; icon: React.ReactNode; adminOnly?: boolean; experimental?: boolean }[] = [
    { id: 'watchtower', label: 'Watchtower', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'conversations', label: 'Capture Buddy', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'network_engine', label: 'Scan Buddy', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'system_logs', label: 'Dashboard', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'storyline', label: 'Evidence', icon: <Layers className="w-3.5 h-3.5" />, experimental: true },
    { id: 'attack_graph', label: 'Graph', icon: <GitFork className="w-3.5 h-3.5" />, experimental: true },
    { id: 'edu_inspector', label: 'Field Guide', icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: 'labs', label: 'Labs', icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { id: 'ctfs', label: 'CTFs', icon: <Target className="w-3.5 h-3.5" /> },
    { id: 'detection_builder', label: 'Detections', icon: <Sliders className="w-3.5 h-3.5" />, experimental: true },
    { id: 'ioc_threat', label: 'Threat intel', icon: <Target className="w-3.5 h-3.5" />, experimental: true },
    { id: 'user_profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'admin_panel', label: 'Users', icon: <Users className="w-3.5 h-3.5" />, adminOnly: true }
  ];

  const filteredMenuItems = menuItems.filter((item) => !item.adminOnly || user?.role === 'admin');

  // Overview is an administrator tool pinned under Additional tools. Guests
  // and regular clients always see the muted locked entry (clicking it
  // explains why); signed-in administrators get the functional item. The
  // Overview backend commands enforce the same rule against the persisted
  // session store.
  const isAdmin = user?.role === 'admin';
  // A fresh session identity resets the locked-entry explanation.
  React.useEffect(() => { setOverviewNotice(false); }, [user]);

  const renderItems = (items: typeof menuItems) => items.map((item) => (
    <button
      key={item.id}
      onClick={() => setActiveTab(item.id)}
      aria-current={activeTab === item.id ? 'page' : undefined}
      aria-label={item.label}
      type="button"
      /* Native title tooltips stay in collapsed (icon-only) mode only.
         In the expanded sidebar the label is already visible, and the
         WebKitGTK tooltip popup renders directly over the row below the
         hovered item, where it can swallow a click aimed at that row —
         observed in runtime testing as a navigation click that did
         nothing. */
      title={isCollapsed ? item.label : undefined}
      className={`studio-nav-item ${activeTab === item.id ? 'is-active' : ''}`}
    >
      <span className="studio-nav-icon" aria-hidden="true">{item.icon}</span>
      {!isCollapsed && <span className="truncate">{item.label}</span>}
    </button>
  ));

  if (isFullyHidden) return null;

  return (
    <aside
      id="studio-navigation" aria-label="Workspace navigation"
      className={`studio-sidebar ${isCollapsed ? 'is-collapsed' : ''}`}
    >
      {/* Header Controls */}
      <div className="studio-sidebar-heading">
        {!isCollapsed && (
          <span>Workspace</span>
        )}

        <div className="studio-sidebar-controls">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-label={isCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            type="button" className="studio-icon-button" aria-expanded={!isCollapsed}
          >
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={() => setIsFullyHidden(true)}
            title="Hide navigation"
            aria-label="Hide navigation"
            type="button" className="studio-icon-button"
          >
            <PanelLeftClose className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Navigation List */}
      <nav ref={navRef} className="studio-nav" aria-label="Primary navigation">
        {!isCollapsed && <h2 className="studio-nav-heading">Operations · Monitoring</h2>}
         <div className="studio-nav-group">
           {renderItems(filteredMenuItems.filter(item => !item.experimental && item.id !== 'user_profile' && item.id !== 'admin_panel'))}
         </div>
         <div className="studio-experimental" aria-label="Additional tools">
           <button
             type="button"
             className="studio-experimental-trigger"
             title="Additional tools are locked in the Enterprise build"
             aria-label="Additional tools"
               aria-expanded={additionalToolsOpen}
               aria-controls="additional-tools-locked"
              onClick={() => {
                const next = !additionalToolsOpen;
                setAdditionalToolsOpen(next);
                if (next) navRef.current?.scrollTo({ top: navRef.current.scrollHeight, behavior: 'smooth' });
              }}
           >
             {isCollapsed ? <LockKeyhole size={18} aria-hidden="true" /> : <><LockKeyhole size={14} aria-hidden="true" /><span>Additional tools</span><span className="studio-locked-label">Locked</span></>}
           </button>
           {/* Overview is an administrator tool pinned under Additional tools:
               guests and regular clients always see the muted locked entry and
               clicking it explains why; signed-in administrators get the
               functional navigation item. The backend refuses the Overview
               commands to non-admin sessions as well. */}
           <button
             type="button"
             aria-label="Overview"
             aria-current={isAdmin && activeTab === 'global_intel' ? 'page' : undefined}
             aria-disabled={isAdmin ? undefined : 'true'}
             title={isAdmin && isCollapsed ? 'Overview' : undefined}
             className={`studio-nav-item ${isAdmin && activeTab === 'global_intel' ? 'is-active' : ''} ${isAdmin ? '' : 'is-locked'}`}
             onClick={() => (isAdmin ? setActiveTab('global_intel') : setOverviewNotice(true))}
           >
             <span className="studio-nav-icon" aria-hidden="true"><Globe2 className="w-3.5 h-3.5" /></span>
             {!isCollapsed && <span className="truncate">Overview</span>}
             {!isCollapsed && !isAdmin && <span className="studio-locked-label">Locked</span>}
           </button>
           {overviewNotice && !isAdmin && (
             <p role="status" className="studio-locked-message">Overview is available to administrators only.</p>
           )}
             {additionalToolsOpen && !isCollapsed && <div id="additional-tools-locked" className="studio-experimental-locked" aria-label="Locked additional tools">
              {filteredMenuItems.filter(item => item.experimental).map((item) => (
                <div key={item.id} className="studio-locked-tool" aria-disabled="true">
                  <span className="studio-nav-icon" aria-hidden="true"><LockKeyhole className="w-3.5 h-3.5" /></span>
                  <span>{item.label}</span>
                  <span className="studio-locked-label">Locked</span>
                </div>
              ))}
              <p className="studio-locked-help">These Enterprise tools are intentionally unavailable in this build.</p>
            </div>}
         </div>
        <div className="studio-account-nav">
          {renderItems(filteredMenuItems.filter(item => item.id === 'user_profile' || item.id === 'admin_panel'))}
        </div>
      </nav>

      {/* Profile Widget at Bottom */}
      <div className="studio-sidebar-footer">
        <button
          aria-label="Open profile"
          onClick={() => setActiveTab('user_profile')}
          type="button" className="studio-profile"
        >
          <span className="studio-profile-avatar" aria-hidden="true">
            <User className="w-3.5 h-3.5" />
          </span>

          {!isCollapsed && (
            <span className="studio-profile-copy">
              <span className="studio-account-name">
                {user ? user.name : 'Guest'}
              </span>
              <span className="studio-account-role">
                {user?.role === 'admin' ? 'Admin' : user ? 'Signed in' : 'Signed out'}
              </span>
            </span>
          )}
        </button>
      </div>
    </aside>
  );
};
