import React from 'react';

interface BrandLogoProps {
  platform?: string;
  compact?: boolean;
}

/** Original NET0ZE asset, without redundant runtime/version copy. */
export function BrandLogo({ platform, compact = false }: BrandLogoProps) {
  return (
    <div className="brand-lockup" aria-label={`NET0ZE${platform ? ` ${platform}` : ''}`}>
      <img src="/netoze-icon.png" width={32} height={32} alt="NET0ZE" className="brand-mark studio-brand-mark object-contain" />
      {!compact && (
        <span className="studio-brand-name">NET0ZE</span>
      )}
    </div>
  );
}
