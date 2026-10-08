import React from 'react';
import {
  Globe,
  MessageSquare,
  Terminal,
  Cpu,
  Layers,
  GitFork,
  ShieldAlert,
  FlaskConical,
  Sliders,
  Target,
  Activity,
  User,
  Users,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose
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
  const menuItems: { id: TabType; label: string; icon: React.ReactNode; adminOnly?: boolean; experimental?: boolean }[] = [
    { id: 'global_intel', label: 'Overview', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'watchtower', label: 'Watchtower', icon: <Activity className="w-3.5 h-3.5" /> },
    { id: 'conversations', label: 'Capture Buddy', icon: <MessageSquare className="w-3.5 h-3.5" /> },
    { id: 'network_engine', label: 'Scan Buddy', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'system_logs', label: 'Dashboard', icon: <Terminal className="w-3.5 h-3.5" /> },
    { id: 'storyline', label: 'Evidence', icon: <Layers className="w-3.5 h-3.5" />, experimental: true },
    { id: 'attack_graph', label: 'Graph', icon: <GitFork className="w-3.5 h-3.5" />, experimental: true },
    { id: 'edu_inspector', label: 'Field guide', icon: <ShieldAlert className="w-3.5 h-3.5" />, experimental: true },
    { id: 'labs', label: 'Labs', icon: <FlaskConical className="w-3.5 h-3.5" /> },
    { id: 'detection_builder', label: 'Detections', icon: <Sliders className="w-3.5 h-3.5" />, experimental: true },
    { id: 'ioc_threat', label: 'Threat intel', icon: <Target className="w-3.5 h-3.5" />, experimental: true },
    { id: 'user_profile', label: 'Profile', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'admin_panel', label: 'Users', icon: <Users className="w-3.5 h-3.5" />, adminOnly: true }
  ];

  const filteredMenuItems = menuItems.filter((item) => !item.adminOnly || user?.role === 'admin');

  const renderItems = (items: typeof menuItems) => items.map((item) => (
    <button
      key={item.id}
      onClick={() => setActiveTab(item.id)}
      aria-current={activeTab === item.id ? 'page' : undefined}
      aria-label={item.label}
      type="button"
      title={item.label}
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
      <nav className="studio-nav" aria-label="Primary navigation">
        {!isCollapsed && <h2 className="studio-nav-heading">Monitoring</h2>}
         <div className="studio-nav-group">
           {renderItems(filteredMenuItems.filter(item => !item.experimental && item.id !== 'user_profile' && item.id !== 'admin_panel'))}
         </div>
         <details className="studio-experimental" open={filteredMenuItems.some((item) => item.experimental && item.id === activeTab)}>
           <summary title="Additional tools" aria-label="Additional tools">
             {isCollapsed ? <FlaskConical size={18} aria-hidden="true" /> : 'Additional tools'}
           </summary>
           <div className="studio-nav-group">{renderItems(filteredMenuItems.filter(item => item.experimental))}</div>
         </details>
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
