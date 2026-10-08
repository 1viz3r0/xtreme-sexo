import React, { useEffect, useRef, useState } from 'react';
import { Globe3D } from './Globe3D';
import type { LocationNode, CountryGeo } from './Globe3D';
import { CountryDetailPanel, type CountryStats } from './CountryDetailPanel';
import { SearchModal } from './SearchModal';
import { loadCountryVector, loadAdmin1, type CountryVector, type GeoRegion } from '../lib/geoMap';
import type { GeoSearchResult } from '../lib/geoSearch';
import type { TabType } from './Sidebar';
import { getGlobalIntelSnapshot, type GlobalIntelSnapshot } from '../services/tauri/globalIntel';
import { isTauriEnvironment } from '../services/tauri/isTauri';
import type { GeoIpEntry, ThreatMatchEntry } from '../services/tauri/intel';
import { getPcapInterfaces, startPacketCapture, stopPacketCapture, type NpcapInterface } from '../services/tauri/capture';
import { getDetailedSystemInfo, type DetailedSystemInfo } from '../services/tauri/system';
import { getDetailedNetworkInterfaces, type DetailedAdapterInfo } from '../services/tauri/network';
import { OverviewSummary } from './OverviewSummary';

interface GlobalIntelViewProps {
  selectedNode: LocationNode | null;
  setSelectedNode: (node: LocationNode | null) => void;
  setActiveTab: (tab: TabType) => void;
  openSearchToken?: number;
}

interface FlowRow {
  time: string;
  src: string;
  dst: string;
  protocol: string;
  pkts: string;
  bytes: string;
  status: string;
  location: string;
  risk: string;
}

export const GlobalIntelView: React.FC<GlobalIntelViewProps> = ({
  selectedNode,
  setSelectedNode,
  setActiveTab,
  openSearchToken
}) => {
  const [isAutoRotate, setIsAutoRotate] = useState<boolean>(true);
  const [snapshot, setSnapshot] = useState<GlobalIntelSnapshot | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const desktopAvailable = isTauriEnvironment();
  const flows = snapshot?.flows ?? [];
  const summary = snapshot?.flow_summary ?? null;
  const metrics = snapshot?.capture ?? null;
  const detSummary = snapshot?.detection_summary ?? null;
  const detections = snapshot?.detections ?? [];
  const connectivity = snapshot?.connectivity ?? null;
  const threatStatus = snapshot?.threat_intel ?? null;
  const geoip = snapshot?.geoip ?? [];
  const threatMatches = snapshot?.threat_matches ?? [];
  const devices = snapshot?.devices ?? [];
  const [isDetailPanelOpen, setIsDetailPanelOpen] = useState<boolean>(false);
  const [selectedCountry, setSelectedCountry] = useState<CountryGeo | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [interfaces, setInterfaces] = useState<NpcapInterface[]>([]);
  const [systemInfo, setSystemInfo] = useState<DetailedSystemInfo | null>(null);
  const [networkInfo, setNetworkInfo] = useState<DetailedAdapterInfo[] | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [selectedInterface, setSelectedInterface] = useState('');
  const [captureActionError, setCaptureActionError] = useState<string | null>(null);
  const [captureActionBusy, setCaptureActionBusy] = useState(false);
  const refreshRef = useRef<() => void>(() => {});
  const inFlightRef = useRef<Promise<GlobalIntelSnapshot> | null>(null);
  const captureStatus = !desktopAvailable || !snapshot ? 'UNAVAILABLE'
    : refreshError ? 'STALE'
    : snapshot.capture_availability.state !== 'AVAILABLE' ? 'UNAVAILABLE' : metrics!.status;
  const captureMetrics = metrics ? { ...metrics, status: captureStatus } : {
    packets_per_sec: 0,
    bytes_per_sec: 0,
    packets_captured: 0,
    bytes_captured: 0,
    status: 'UNAVAILABLE',
  };

  const [selectedRegion, setSelectedRegion] = useState<GeoRegion | null>(null);
  const [countryVector, setCountryVector] = useState<CountryVector | null>(null);
  const [regions, setRegions] = useState<GeoRegion[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState<boolean>(false);

  // Navbar search button opens the geo search modal.
  useEffect(() => {
    if (openSearchToken && openSearchToken > 0) setIsSearchOpen(true);
  }, [openSearchToken]);

  // Load world-countries metadata + Natural Earth admin1 regions for the selected country.
  useEffect(() => {
    let cancelled = false;
    if (!selectedCountry) {
      setCountryVector(null);
      setRegions([]);
      setSelectedRegion(null);
      return;
    }
    setCountryVector(null);
    setRegions([]);
    setSelectedRegion(null);
    (async () => {
      try {
        const [v, rs] = await Promise.all([loadCountryVector(selectedCountry.iso), loadAdmin1(selectedCountry.iso)]);
        if (cancelled) return;
        setCountryVector(v);
        setRegions(rs);
      } catch {
        if (cancelled) return;
        setCountryVector(null);
        setRegions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedCountry]);

  // Global hotkeys: Ctrl/Cmd+K opens geo search; Escape closes it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen((open) => !open);
      } else if (e.key === 'Escape' && isSearchOpen) {
        setIsSearchOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isSearchOpen]);

  const handleSelectGeo = (result: GeoSearchResult) => {
    const fromSearch = (iso2: string, name: string, lat: number, lng: number, fl?: string | null) => {
      const c: CountryGeo = { name, iso: iso2, lat, lng, fl: fl ?? undefined };
      setSelectedNode(null);
      setSelectedCountry(c);
      setIsDetailPanelOpen(true);
    };
    if (result.kind === 'country') {
      fromSearch(result.iso2, result.name, result.lat, result.lng, result.flag);
    } else if (result.kind === 'region') {
      fromSearch(result.country, result.name, result.lat, result.lng);
    } else {
      fromSearch(result.country, result.name, result.lat, result.lng);
    }
  };

  // One local-only read loop. Reuse a pending request across StrictMode effect
  // cleanup/setup; each effect owns its timer and ignores late results.
  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = async () => {
      if (cancelled || refreshing || document.visibilityState === 'hidden') return;
      refreshing = true;
      clearTimeout(timer);
      setIsRefreshing(true);
      try {
        const request = inFlightRef.current ?? getGlobalIntelSnapshot(100);
        inFlightRef.current = request;
        const next = await request;
        if (cancelled) return;
        setSnapshot(next);
        setRefreshError(null);
      } catch (error) {
        if (!cancelled) {
          setRefreshError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        inFlightRef.current = null;
        refreshing = false;
        if (!cancelled) {
          setIsRefreshing(false);
          timer = setTimeout(() => { void refresh(); }, 3000);
        }
      }
    };
    refreshRef.current = () => { void refresh(); };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      refreshRef.current = () => {};
    };
  }, [desktopAvailable]);

  const handleRefresh = () => refreshRef.current();

  useEffect(() => {
    if (!desktopAvailable) return;
    getPcapInterfaces().then((items) => {
      setInterfaces(items);
      setSelectedInterface((current) => current || items.find((item) => !item.is_loopback)?.id || items[0]?.id || '');
    }).catch((error) => setCaptureActionError(error instanceof Error ? error.message : String(error)));
  }, [desktopAvailable]);

  // One bounded passive host read; never scans, captures, or calls external GeoIP.
  useEffect(() => {
    if (!desktopAvailable) return;
    let cancelled = false;
    Promise.all([getDetailedSystemInfo(), getDetailedNetworkInterfaces()]).then(([system, network]) => {
      if (!cancelled) { setSystemInfo(system); setNetworkInfo(network); }
    }).catch(() => { if (!cancelled) setNetworkInfo(null); });
    return () => { cancelled = true; };
  }, [desktopAvailable]);

  const handleCaptureAction = async () => {
    setCaptureActionBusy(true);
    setCaptureActionError(null);
    try {
      if (captureRunning) await stopPacketCapture();
      else if (selectedInterface) await startPacketCapture(selectedInterface);
      else throw new Error('No capture interface is available');
      handleRefresh();
    } catch (error) {
      setCaptureActionError(error instanceof Error ? error.message : String(error));
    } finally {
      setCaptureActionBusy(false);
    }
  };

  // Build real globe nodes from GeoIP + threat matches + flow aggregates
  const geoByIp = new Map(geoip.map((g) => [g.ip, g]));
  const threatByIp = new Map<string, ThreatMatchEntry>();
  for (const match of threatMatches) {
    const prior = threatByIp.get(match.ip);
    if (!prior || severityRank(match.severity) > severityRank(prior.severity)) threatByIp.set(match.ip, match);
  }
  const flowAgg: Record<string, { pkts: number; flows: number; rtt: number; severity: string }> = {};
  for (const f of flows) {
    for (const key of new Set([f.src_ip, f.dst_ip])) {
      const agg = (flowAgg[key] = flowAgg[key] || { pkts: 0, flows: 0, rtt: 0, severity: 'INFO' });
      agg.pkts += f.packet_count;
      agg.flows += 1;
      if (f.rtt_ms > 0) agg.rtt = f.rtt_ms;
      if (severityRank(f.severity) > severityRank(agg.severity)) agg.severity = f.severity;
    }
  }

  const globeNodes: LocationNode[] = geoip
    .filter(hasCoordinates)
    .map((g) => {
      const threat = threatByIp.get(g.ip);
      const agg = flowAgg[g.ip];
      const severity = highestSeverity(threat?.severity, agg?.severity);
      const status = nodeSeverity(severity);
      return {
        id: g.ip,
        name: `${g.city}, ${g.country}`,
        country: g.country,
        lat: g.latitude,
        lng: g.longitude,
        pkts: agg ? `${agg.pkts} pkt` : '0 pkt',
        rtt: agg && agg.rtt > 0 ? `RTT ${agg.rtt}ms` : 'RTT n/a',
        status,
        color: severity === 'UNKNOWN' ? '#94a3b8' : status === 'critical' ? '#ff3355' : status === 'high' ? '#ff9900' : status === 'medium' ? '#fbbf24' : '#00e676',
        activeFlowsCount: agg?.flows ?? 0,
        threatLevel: severity,
        ip: g.ip,
      };
    });

  // A hub is available only when a cached self-device IP has real coordinates.
  const hubInfo = geoip.find((g) => hasCoordinates(g) && devices.some((d) => d.is_self && d.ip === g.ip)) ?? null;
  const selfNode: LocationNode | null =
    hubInfo && hasCoordinates(hubInfo)
      ? {
          id: hubInfo.ip,
          name: `${hubInfo.city ?? 'Local'}, ${hubInfo.country ?? 'THIS NET0ZE NODE'} (SELF)`,
          country: hubInfo.country ?? '',
          lat: hubInfo.latitude,
          lng: hubInfo.longitude,
          pkts: metrics && metrics.packets_captured > 0 ? `${metrics.packets_captured.toLocaleString()} pkt` : '0 pkt',
          rtt: connectivity?.latency_ms != null ? `RTT ${connectivity.latency_ms}ms` : 'RTT n/a',
          status: 'low',
          color: '#00d4ff',
          activeFlowsCount: summary?.active_flows_count ?? 0,
          threatLevel: 'SELF',
          ip: hubInfo.ip,
        }
      : null;
  if (selfNode) {
    const index = globeNodes.findIndex((node) => node.id === selfNode.id);
    if (index >= 0) globeNodes.splice(index, 1);
    globeNodes.unshift(selfNode);
  }
  const locationNodes = captureIsRunning(captureStatus)
    ? globeNodes.filter((node) => node.id !== selfNode?.id && node.activeFlowsCount > 0)
    : [];

  // Real per-country aggregation from observed flows + GeoIP + threat matches
  const countryStatsFor = (iso: string): CountryStats | null => {
    const ips = new Set<string>();
    const sources = new Set<string>();
    let resolvedAt = 0;
    for (const g of geoip) {
      if (g.country_code !== iso) continue;
      ips.add(g.ip);
      sources.add(g.source);
      if (g.resolved_at > resolvedAt) resolvedAt = g.resolved_at;
    }
    if (ips.size === 0) return null;
    let flowsN = 0;
    let packets = 0;
    let bytes = 0;
    let rttSum = 0;
    let rttN = 0;
    const remoteIps = new Set<string>();
    for (const f of flows) {
      if (!ips.has(f.dst_ip) && !ips.has(f.src_ip)) continue;
      flowsN += 1;
      packets += f.packet_count;
      bytes += f.total_bytes;
      if (f.rtt_ms > 0) {
        rttSum += f.rtt_ms;
        rttN += 1;
      }
      if (ips.has(f.dst_ip)) remoteIps.add(f.dst_ip);
      if (ips.has(f.src_ip)) remoteIps.add(f.src_ip);
    }
    const sevs = threatMatches.filter((t) => ips.has(t.ip)).map((t) => t.severity.toUpperCase());
    const topSev = sevs.length ? [...sevs].sort((a, b) => severityRank(b) - severityRank(a))[0] : null;
    return {
      flows: flowsN,
      packets,
      bytes,
      rttMs: rttN > 0 ? rttSum / rttN : null,
      threatMatches: sevs.length,
      topSeverity: topSev,
      remoteIps: [...remoteIps].slice(0, 5),
      sources: [...sources],
      resolvedAt: resolvedAt || null,
      updatedAt: snapshot ? Date.parse(snapshot.collected_at) : 0,
    };
  };

  const displayedFlows: FlowRow[] = flows.slice(0, 50).map((f) => {
    const ts = new Date(f.ts_end);
    const location = geoByIp.get(f.dst_ip);
    const threat = threatByIp.get(f.dst_ip);
    return {
      time: ts.toLocaleTimeString(),
      src: `${f.src_ip}:${f.src_port}`,
      dst: `${f.dst_ip}:${f.dst_port}`,
      protocol: f.protocol,
      pkts: f.packet_count.toString(),
      bytes: formatBytes(f.total_bytes),
      status: f.tcp_state,
      location: location ? `${location.city}, ${location.country}` : 'Unresolved',
      risk: highestSeverity(threat?.severity, threatByIp.get(f.src_ip)?.severity, f.severity),
    };
  });

  const sev = detSummary ?? {
    total_findings_count: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    info_count: 0,
    active_count: 0,
    resolved_count: 0,
  };

  const connState = refreshError ? 'STALE' : connectivity?.state || 'UNAVAILABLE';
  const captureRunning = captureIsRunning(captureStatus);
  const avgRtt = summary?.avg_rtt_ms ?? 0;
  const emptyAlertMessage = !desktopAvailable ? 'Alerts unavailable in browser mode'
    : refreshError ? 'Alerts unavailable — snapshot refresh failed'
    : !snapshot ? 'Loading detection snapshot…'
    : !captureRunning ? 'No recorded alerts — capture is not running or unavailable'
    : 'No alerts recorded in this session';

  const recentFindings = detections.slice(0, 5);
  const globeMessage = !desktopAvailable
    ? 'Browser mode: local endpoints and telemetry are unavailable. Bundled country geography is reference data only.'
    : !snapshot
      ? refreshError ? 'Endpoint snapshot unavailable — refresh failed.' : 'Loading endpoint snapshot…'
      : refreshError
        ? 'Showing the last successful endpoint snapshot; refresh is stale.'
        : globeNodes.length === 0
          ? 'No observed endpoints with coordinates in this session.'
          : null;
  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-[#060913] text-slate-200">
      <OverviewSummary system={systemInfo} interfaces={networkInfo} snapshot={snapshot} unavailable={!desktopAvailable ? 'Native desktop required' : refreshError ? 'Snapshot stale' : null} onNavigate={setActiveTab} />
      <div className="mx-3 mt-2 rounded border border-[#17243c] bg-[#081022] px-3 py-2 text-[10px] font-mono text-slate-500" role="status">
         {snapshot ? `Current-session snapshot • ${new Date(snapshot.collected_at).toLocaleTimeString()}` : !desktopAvailable ? 'Browser mode — local telemetry unavailable' : refreshError ? 'Snapshot unavailable — refresh failed' : 'Loading current-session snapshot…'}
         {refreshError && <span className="ml-2 text-amber-400">last successful snapshot is stale</span>}
         <button onClick={handleRefresh} disabled={!desktopAvailable || isRefreshing} className="float-right text-slate-200 hover:underline disabled:cursor-not-allowed disabled:opacity-50">{isRefreshing ? 'Refreshing…' : desktopAvailable ? 'Refresh' : 'Refresh unavailable'}</button>
      </div>
      <div className="grid grid-cols-12 gap-3 p-3 flex-1 min-h-[560px]">
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          <div className="cyber-card p-3 flex flex-col gap-2">
            <div className="flex items-center justify-between"><b className="text-[10px] tracking-wider text-slate-400">CAPTURE</b><span className={`text-[10px] ${captureRunning ? 'text-emerald-400' : 'text-slate-400'}`}>{captureStatus}</span></div>
            <div className="flex gap-1.5"><select value={selectedInterface} onChange={(e) => setSelectedInterface(e.target.value)} disabled={!desktopAvailable || captureRunning || captureActionBusy} aria-label="Capture interface" className="min-w-0 flex-1 rounded border border-[#292929] bg-[#141414] px-2 py-1 text-[10px] font-mono"><option value="">No interface available</option>{interfaces.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select><button onClick={() => void handleCaptureAction()} disabled={!desktopAvailable || captureActionBusy || (!captureRunning && !selectedInterface)} className="rounded border border-[#525252] px-2 py-1 text-[10px] text-slate-200 hover:bg-[#252525] disabled:opacity-40">{captureActionBusy ? 'WORKING…' : captureRunning ? 'STOP' : 'START'}</button></div>
            {captureActionError && <div className="text-[10px] text-rose-300">{captureActionError}</div>}
            <div className="grid grid-cols-3 gap-1 border-t border-[#17243c] pt-2 text-center"><span>Packets<br/><b className="text-cyan-400">{metrics?.packets_captured ?? 0}</b></span><span>Dropped<br/><b className="text-amber-400">{metrics?.dropped_packets ?? 0}</b></span><span>Flows<br/><b className="text-emerald-400">{summary?.active_flows_count ?? 0}</b></span></div>
            <details className="text-[10px] text-slate-500"><summary>Capture permissions</summary><p className="mt-1">Select an active adapter. Wi-Fi monitor mode is only needed for 802.11 management frames; permissions may be required by the OS.</p></details>
          </div>
          <div className="cyber-card p-3"><b className="text-[10px] tracking-wider text-slate-400">OBSERVED DEVICES</b><div className="mt-2 text-xl font-bold">{snapshot ? devices.length : 'Unavailable'}</div><div className="text-[10px] text-slate-500">Cached observations; no discovery scan performed.</div></div>
          <div className="cyber-card p-3"><b className="text-[10px] tracking-wider text-slate-400">CONNECTIVITY</b><div className="mt-2 text-lg font-bold">{avgRtt > 0 ? `${avgRtt.toFixed(1)}ms RTT` : 'Unavailable'}</div><div className="text-[10px] text-slate-500">{connState} • {connectivity?.source || 'source unavailable'}</div></div>
        </div>
        <div className="col-span-12 lg:col-span-6 cyber-card relative flex flex-col overflow-hidden min-h-[460px]">
           <div className="p-3 border-b border-[#17243c] flex items-center justify-between"><div><b className="text-xs font-mono text-white">Endpoint map</b><p className="mt-1 text-[10px] text-slate-500">Observed endpoints only; country and city shapes are bundled reference geography.</p></div><button onClick={() => setIsAutoRotate(!isAutoRotate)} className="rounded border border-[#525252] px-2 py-1 text-[10px] text-slate-200 hover:bg-[#252525]">AUTO-ROTATE: {isAutoRotate ? 'ON' : 'OFF'}</button></div>
           <div className="flex-1 relative"><Globe3D nodes={globeNodes} selectedNode={selectedNode} selectedCountry={selectedCountry} onSelectNode={(node) => { setSelectedCountry(null); setSelectedNode(node); setIsDetailPanelOpen(true); }} onSelectCountry={(country) => { setSelectedNode(null); setSelectedCountry(country); setIsDetailPanelOpen(true); }} isAutoRotate={isAutoRotate} hub={hubInfo && hasCoordinates(hubInfo) ? { lat: hubInfo.latitude, lng: hubInfo.longitude } : null} captureStatus={captureStatus} captureMetrics={captureMetrics} activeFlows={locationNodes} />
              {globeMessage && !selectedCountry && <div className="absolute inset-x-0 top-16 z-10 flex justify-center pointer-events-none"><div role="status" className="max-w-md bg-black/70 px-4 py-2 rounded border border-[#525252] text-center text-[11px] text-slate-400">{globeMessage}</div></div>}
            {isDetailPanelOpen && (selectedNode || selectedCountry) && <CountryDetailPanel node={selectedNode} country={selectedCountry} vector={countryVector} regions={regions} selectedRegion={selectedRegion} onSelectRegion={setSelectedRegion} connectivity={connectivity} stats={selectedCountry ? countryStatsFor(selectedCountry.iso) : null} onClose={() => setIsDetailPanelOpen(false)} topOffset={selectedCountry ? '3.4rem' : '0.75rem'} />}
            <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSelectGeo={handleSelectGeo} />
          </div>
        </div>
        <div className="col-span-12 lg:col-span-3 flex flex-col gap-3">
          <div className="cyber-card p-3"><div className="flex justify-between"><b className="text-[10px] tracking-wider text-slate-400">Findings</b><span className="text-[10px] text-slate-500">current session</span></div><div className="mt-2 grid grid-cols-2 gap-2 text-[11px]"><span>Total <b>{snapshot ? sev.total_findings_count : 'Unavailable'}</b></span><span>Active <b>{snapshot ? sev.active_count : 'Unavailable'}</b></span><span>High+ <b>{snapshot ? sev.critical_count + sev.high_count : 'Unavailable'}</b></span><span>Resolved <b>{snapshot ? sev.resolved_count : 'Unavailable'}</b></span></div></div>
           <div className="cyber-card p-3"><b className="text-[10px] tracking-wider text-slate-400">RECENT FINDINGS</b><div className="mt-2 flex flex-col gap-1">{recentFindings.length ? recentFindings.map((alert) => <button key={alert.finding_id} onClick={() => setSelectedFinding(selectedFinding === alert.finding_id ? null : alert.finding_id)} className="rounded border border-[#525252] bg-[#141414] p-2 text-left text-[10px] hover:bg-[#252525]"><span className="text-slate-200">{alert.severity} · {alert.title}</span><span className="block text-slate-500">{alert.source_ip} → {alert.destination_ip}</span>{selectedFinding === alert.finding_id && <span className="mt-1 block text-slate-300">Evidence: {alert.evidence || 'No evidence text reported.'}</span>}</button>) : <span className="text-slate-500">{emptyAlertMessage}</span>}</div></div>
          <div className="cyber-card p-3 text-[10px] text-slate-500"><b className="text-slate-400">THREAT INTEL</b><div className="mt-2">{threatStatus?.feed_state || 'UNAVAILABLE'} • {threatStatus?.match_count ?? 'Unavailable'} observed matches</div><div>No ATT&CK coverage score is inferred from these counts.</div></div>
        </div>
      </div>
       <div className="p-3 pt-0"><div className="cyber-card p-3"><div className="flex items-center justify-between border-b border-[#17243c] pb-2"><b className="text-xs">CURRENT-SESSION FLOWS</b><button onClick={() => setActiveTab('conversations')} className="text-xs text-slate-200 hover:underline">View in Capture Buddy →</button></div><div className="overflow-x-auto"><table className="w-full text-left cyber-table"><thead><tr><th>Time</th><th>Source</th><th>Destination</th><th>Protocol</th><th>Packets</th><th>Bytes</th><th>Status</th><th>Location</th><th>Severity</th></tr></thead><tbody>{displayedFlows.length ? displayedFlows.map((row, idx) => <tr key={idx}><td>{row.time}</td><td className="text-cyan-400">{row.src}</td><td>{row.dst}</td><td>{row.protocol}</td><td>{row.pkts}</td><td>{row.bytes}</td><td>{row.status}</td><td>{row.location}</td><td>{row.risk}</td></tr>) : <tr><td colSpan={9} className="py-6 text-center text-slate-500">{!desktopAvailable ? 'Flow telemetry unavailable' : refreshError ? 'Flow snapshot stale' : 'No observed flows in this session'}</td></tr>}</tbody></table></div></div></div>
    </div>
  );
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function hasCoordinates(entry: GeoIpEntry): entry is GeoIpEntry & { latitude: number; longitude: number } {
  return entry.latitude != null && entry.longitude != null
    && Number.isFinite(entry.latitude) && Number.isFinite(entry.longitude)
    && Math.abs(entry.latitude) <= 90 && Math.abs(entry.longitude) <= 180;
}

function severityRank(severity?: string): number {
  const ranks: Record<string, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1, INFO: 0 };
  return ranks[severity?.toUpperCase() ?? ''] ?? -1;
}

function highestSeverity(...severities: (string | undefined)[]): string {
  return severities.reduce<string>((top, value) => severityRank(value) > severityRank(top) ? value!.toUpperCase() : top, 'UNKNOWN');
}

function nodeSeverity(severity: string): LocationNode['status'] {
  switch (severity.toUpperCase()) {
    case 'CRITICAL': return 'critical';
    case 'HIGH': return 'high';
    case 'MEDIUM': return 'medium';
    default: return 'low';
  }
}

/** Capture engines have used both RUNNING and LIVE for the active state. */
export function captureIsRunning(status: string): boolean {
  return status === 'RUNNING' || status === 'LIVE';
}
