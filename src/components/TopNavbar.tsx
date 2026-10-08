import React from 'react';
import { Search, User, ShieldCheck, LogOut, PanelLeft, PanelLeftClose, Monitor, Globe } from 'lucide-react';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import { BrandLogo } from './BrandLogo';

interface TopNavbarProps {
  onOpenSearch: () => void;
  onOpenAuth: () => void;
  user: { name: string; email: string; isVerified: boolean; role?: string } | null;
  onLogout: () => void;
  isFullyHidden: boolean;
  setIsFullyHidden: (hidden: boolean) => void;
}

export const TopNavbar: React.FC<TopNavbarProps> = ({
  onOpenSearch, onOpenAuth, user, onLogout, isFullyHidden, setIsFullyHidden,
}) => {
  const isDesktop = isTauriEnvironment();
  return (
    <header className="studio-header" aria-label="NET0ZE application header">
      <div className="studio-header-brand">
        <button type="button" className="studio-icon-button"
          onClick={() => setIsFullyHidden(!isFullyHidden)}
          title={isFullyHidden ? 'Show navigation' : 'Hide navigation'}
          aria-label={isFullyHidden ? 'Show navigation' : 'Hide navigation'}
          aria-expanded={!isFullyHidden} aria-controls="studio-navigation">
          {isFullyHidden ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
        <BrandLogo />
        <span className="studio-design-marker">Studio UI</span>
      </div>
      <button type="button" onClick={onOpenSearch} className="studio-search" aria-label="Search locations">
        <Search size={17} aria-hidden="true" />
        <span>Search locations</span>
      </button>
      <div className="studio-header-actions">
        <span className="studio-runtime" title={isDesktop ? 'Native desktop runtime' : 'Browser preview; native capabilities unavailable'}>
          {isDesktop ? <Monitor size={14} aria-hidden="true" /> : <Globe size={14} aria-hidden="true" />}
          {isDesktop ? 'Native' : 'Browser'}
        </span>
        {user ? (
          <div className="studio-account">
            <ShieldCheck size={17} aria-hidden="true" />
            <div className="studio-account-copy">
              <span className="studio-account-name">{user.name}</span>
              <span className="studio-account-role">{user.role === 'admin' ? 'Admin' : 'Signed in'}</span>
            </div>
            <button type="button" onClick={onLogout} title="Sign out" aria-label="Sign out" className="studio-icon-button">
              <LogOut size={17} />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onOpenAuth} className="studio-sign-in">
            <User size={16} aria-hidden="true" /><span>Sign in</span>
          </button>
        )}
      </div>
    </header>
  );
};
