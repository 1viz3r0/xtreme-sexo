import React, { useEffect, useState } from 'react';
import { Search, X, Globe2, MapPin, Building2 } from 'lucide-react';
import { searchGeoCached, type GeoSearchResult } from '../lib/geoSearch';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectGeo: (result: GeoSearchResult) => void;
}

const KIND_BADGE: Record<GeoSearchResult['kind'], { label: string; cls: string }> = {
  country: { label: 'COUNTRY', cls: 'bg-cyan-950 text-cyan-400 border-cyan-800' },
  region: { label: 'REGION', cls: 'bg-emerald-950 text-emerald-400 border-emerald-800' },
  city: { label: 'CITY', cls: 'bg-amber-950 text-amber-400 border-amber-800' },
};

export const SearchModal: React.FC<SearchModalProps> = ({ isOpen, onClose, onSelectGeo }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setResults([]);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const q = query.trim();
    setResults([]);
    setSearchError(null);
    setSearching(q.length >= 2);
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      void searchGeoCached(q, 12).then((res) => {
        if (cancelled) return;
        setResults(res);
        setSearching(false);
      }, () => {
        if (cancelled) return;
        setSearchError('Geographic search is unavailable. Try again.');
        setSearching(false);
      });
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  if (!isOpen) return null;

  const pick = (r: GeoSearchResult) => {
    onSelectGeo(r);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl cyber-card bg-[#091122] border-cyan-500/50 p-4 shadow-2xl flex flex-col gap-3 font-mono text-xs">
        <div className="relative flex items-center bg-[#050b17] border border-cyan-500/80 rounded px-3 py-2">
          <Search className="w-4 h-4 text-cyan-400 mr-2.5" />
          <input
            type="text"
            autoFocus
            placeholder="Search countries, states/provinces, cities…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results.length > 0) pick(results[0]);
            }}
            className="w-full bg-transparent text-sm text-white placeholder-slate-500 outline-none"
          />
          <button onClick={onClose} className="text-slate-400 hover:text-white ml-2">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1 max-h-80 overflow-y-auto pr-1">
          {query.trim().length < 2 ? (
            <div className="text-center py-8 text-slate-500">
              Type at least 2 characters — suggestions resolve against the bundled geographic dataset
              (Natural Earth 10m + world-countries).
            </div>
          ) : searchError ? (
            <div role="alert" className="text-center py-8 text-amber-300">{searchError}</div>
          ) : searching && results.length === 0 ? (
            <div className="text-center py-8 text-cyan-400 animate-pulse">SEARCHING…</div>
          ) : results.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No geographic match found.</div>
          ) : (
            results.map((r) => {
              const badge = KIND_BADGE[r.kind];
              const sub =
                r.kind === 'region'
                  ? `${r.code ?? ''}${r.code ? ' · ' : ''}${r.country.toUpperCase()}`
                  : r.kind === 'country'
                  ? `Country · ${r.iso2}`
                  : `City · ${r.country.toUpperCase()}`;
              const key = `${r.kind}-${r.kind === 'region' ? (r.code ?? r.name) : r.name}-${
                r.kind === 'country' ? r.iso2 : r.country
              }`;
              return (
                <div
                  key={key}
                  onClick={() => pick(r)}
                  className="flex items-center justify-between p-2.5 rounded bg-[#0d1830] hover:bg-[#15274d] border border-[#1b2f54] cursor-pointer transition-colors group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-500/50 flex items-center justify-center text-cyan-400 shrink-0">
                      {r.kind === 'country' ? (
                        <span className="text-base leading-none">{r.flag ?? '🌐'}</span>
                      ) : r.kind === 'region' ? (
                        <MapPin className="w-4 h-4" />
                      ) : (
                        <Building2 className="w-4 h-4" />
                      )}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="text-white font-bold truncate">{r.name}</span>
                      <span className="text-slate-400 text-[10px] truncate">{sub}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[9px] font-bold border rounded shrink-0 ${badge.cls}`}>
                    {badge.label}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-between text-[10px] text-slate-500 border-t border-[#17243c] pt-2">
          <span className="flex items-center gap-1">
            <Globe2 className="w-3 h-3" /> Offline dataset · Enter selects the top result · ESC closes
          </span>
          <span>NETOZE Geo Search</span>
        </div>
      </div>
    </div>
  );
};

export default SearchModal;
