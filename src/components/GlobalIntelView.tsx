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
import { refreshWatchtowerEnrichment } from '../services/tauri/intel';
import { getPcapInterfaces, startPacketCapture, stopPacketCapture, type NpcapInterface } from '../services/tauri/capture';
import { captureIsRunning } from '../lib/captureBuddyPresentation';

interface GlobalIntelViewProps {
  selectedNode: LocationNode | null;
  setSelectedNode: (node: LocationNode | null) => void;
  setActiveTab: (tab: TabType) => void;
  openSearchToken?: number;
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
  const [selectedFinding, setSelectedFinding] = useState<string | null>(null);
  const [selectedInterface, setSelectedInterface] = useState('');
  const [captureActionError, setCaptureActionError] = useState<string | null>(null);
  const [captureActionBusy, setCaptureActionBusy] = useState(false);
  const [enrichBusy, setEnrichBusy] = useState(false);
  const [enrichStatus, setEnrichStatus] = useState<string | null>(null);
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
  // cleanup/setup; each effect owns its timer and ignores late results. A read
  // that never settles (for example when a storage path stalls) must not kill
  // live updates permanently: it is raced against a timeout and the next poll
  // starts a fresh request.
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
        const next = await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Snapshot refresh timed out; retrying')), 12_000);
          }),
        ]);
        if (cancelled) return;
        setSnapshot(next as GlobalIntelSnapshot);
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
    const onVisible = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    refreshRef.current = () => { void refresh(); };
    void refresh();
    return () => {
      cancelled = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
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

  // Explicit, user-triggered enrichment of observed public flow endpoints:
  // GeoIP coordinates (provider ipwho.is), a connectivity probe, and threat-feed
  // refresh. Private/reserved addresses are classified locally and never sent
  // anywhere; entries land in the local geoip cache for the next snapshot.
  const handleEnrich = async () => {
    setEnrichBusy(true);
    setEnrichStatus('Resolving observed endpoint locations…');
    try {
      const result = await refreshWatchtowerEnrichment();
      if (!desktopAvailable) return;
      const resolved = result.geoip.filter((entry) => !entry.stale).length;
      const stale = result.geoip.length - resolved;
      const suffix = result.errors.length > 0 ? ` · ${result.errors.length} provider error(s)` : '';
      const summary = result.attempted_ips === 0
        ? 'No public endpoints observed yet — start capture to observe traffic, then resolve again.'
        : `Resolved locations for ${resolved} of ${result.attempted_ips} observed public endpoint(s)${stale > 0 ? `, ${stale} kept from cache` : ''}${suffix}.`;
      setEnrichStatus(summary);
    } catch (error) {
      setEnrichStatus(`Location resolution failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setEnrichBusy(false);
      handleRefresh();
    }
  };

  // Build real globe nodes from GeoIP + threat matches + flow aggregates
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
  const captureRunning = captureIsRunning(metrics?.status ?? captureStatus);
  const captureStopping = metrics?.status === 'STOPPING';
  const avgRtt = summary?.avg_rtt_ms ?? 0;
  const emptyAlertMessage = !desktopAvailable ? 'Alerts unavailable in browser mode'
    : refreshError ? 'Alerts unavailable — snapshot refresh failed'
    : !snapshot ? 'Loading detection snapshot…'
    : !captureRunning ? 'No recorded alerts — capture is not running or unavailable'
    : 'No alerts recorded in this session';

  const recentFindings = detections.slice(0, 5);
  // Contacts show real observations only: geolocated endpoints first, then
  // locally observed devices straight from the devices cache, explicitly
  // labelled "local network" because they never receive invented coordinates.
  const contactList = globeNodes.slice(0, 12);
  const localContacts = globeNodes.length < 12
    ? devices
        .filter((device) => !globeNodes.some((node) => node.id === device.ip))
        .slice(0, 12 - globeNodes.length)
        .map((device) => ({
          id: device.ip,
          name: device.hostname || device.vendor || 'Local device',
          ip: device.ip,
          flows: flowAgg[device.ip]?.flows ?? 0,
          self: device.is_self,
        }))
    : [];
  const globeMessage = !desktopAvailable
    ? 'Browser mode: local endpoints and telemetry are unavailable. Bundled country geography is reference data only.'
    : !snapshot
      ? refreshError ? 'Endpoint snapshot unavailable — refresh failed.' : 'Loading endpoint snapshot…'
      : refreshError
        ? 'Showing the last successful endpoint snapshot; refresh is stale.'
        : globeNodes.length === 0
          ? 'No observed endpoints with coordinates in this session. “Resolve locations” looks up observed public endpoints on demand.'
          : null;
  return (
    <div className="enterprise-overview">
      <header className="enterprise-overview-header">
         <div><p className="enterprise-kicker">NET0ZE / OPERATIONS</p><h1>Overview</h1><p>One calm surface for what this node can actually observe.</p></div>
        <div className="enterprise-overview-actions"><span className={`enterprise-status-chip ${desktopAvailable && !refreshError ? 'is-ready' : ''}`}>{snapshot ? `Snapshot · ${new Date(snapshot.collected_at).toLocaleTimeString()}` : !desktopAvailable ? 'BROWSER MODE · LOCAL TELEMETRY UNAVAILABLE' : refreshError ? 'Snapshot stale' : 'LOADING NATIVE SNAPSHOT'}</span><button type="button" onClick={handleRefresh} disabled={!desktopAvailable || isRefreshing} className="enterprise-secondary-button">{isRefreshing ? 'Refreshing…' : desktopAvailable ? 'Refresh snapshot' : 'Refresh unavailable'}</button></div>
      </header>
      <div className="enterprise-overview-metrics"><div><span>Endpoints</span><strong>{globeNodes.length}</strong><small>Observed with coordinates</small></div><div><span>Active destinations</span><strong>{locationNodes.length}</strong><small>Only while capture is running</small></div><div><span>Findings</span><strong>{snapshot ? sev.total_findings_count : '—'}</strong><small>Loaded session evidence</small></div><div><span>High+</span><strong>{snapshot ? sev.critical_count + sev.high_count : '—'}</strong><small>Not a risk score</small></div><div><span>Connectivity</span><strong>{connState}</strong><small>{avgRtt > 0 ? `${avgRtt.toFixed(1)} ms observed RTT` : 'No RTT reported'}</small></div></div>
      <div className="enterprise-overview-grid">
         <section className="enterprise-map-card" aria-labelledby="map-title"><div className="enterprise-card-heading"><div><p className="enterprise-kicker">01 · OBSERVE</p><h2 id="map-title">Observed geography</h2><p>Observed endpoints and active flows over bundled reference geography.</p></div><div className="enterprise-card-actions"><button type="button" onClick={() => void handleEnrich()} disabled={!desktopAvailable || enrichBusy} aria-label="Resolve endpoint locations" title="Contacts public GeoIP, connectivity and threat-feed providers for observed public endpoints only; local addresses never leave the device" className="enterprise-secondary-button">{enrichBusy ? 'Resolving…' : 'Resolve locations'}</button><button type="button" onClick={() => setIsSearchOpen(true)} aria-label="Search locations" className="enterprise-secondary-button">Search <span>⌘/CTRL+K</span></button><button type="button" onClick={() => setIsAutoRotate(!isAutoRotate)} className="enterprise-secondary-button">Rotation {isAutoRotate ? 'on' : 'off'}</button></div></div><div className="enterprise-map-stage"><Globe3D nodes={globeNodes} selectedNode={selectedNode} selectedCountry={selectedCountry} onSelectNode={(node) => { setSelectedCountry(null); setSelectedNode(node); setIsDetailPanelOpen(true); }} onSelectCountry={(country) => { setSelectedNode(null); setSelectedCountry(country); setIsDetailPanelOpen(true); }} isAutoRotate={isAutoRotate} hub={hubInfo && hasCoordinates(hubInfo) ? { lat: hubInfo.latitude, lng: hubInfo.longitude } : null} captureStatus={captureStatus} captureMetrics={captureMetrics} activeFlows={locationNodes} />{globeMessage && !selectedCountry && <div className="enterprise-map-message" role="status">{globeMessage}</div>}{enrichStatus && <div className="enterprise-map-message" role="status">{enrichStatus}</div>}{isDetailPanelOpen && (selectedNode || selectedCountry) && <CountryDetailPanel node={selectedNode} country={selectedCountry} vector={countryVector} regions={regions} selectedRegion={selectedRegion} onSelectRegion={setSelectedRegion} connectivity={connectivity} stats={selectedCountry ? countryStatsFor(selectedCountry.iso) : null} onClose={() => setIsDetailPanelOpen(false)} topOffset={selectedCountry ? '3.4rem' : '0.75rem'} />}<SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} onSelectGeo={handleSelectGeo} /></div></section>
        <aside className="enterprise-overview-rail" aria-label="Overview controls and signals">
          <section aria-label="CAPTURE CONTROL" className="enterprise-control-card"><div className="enterprise-card-heading"><div><p className="enterprise-kicker">02 · CONTROL</p><h2>Capture control</h2></div><span className={captureRunning ? 'enterprise-state-good' : 'enterprise-muted'}>{captureStatus}</span></div><div className="enterprise-control-row"><select value={selectedInterface} onChange={(e) => setSelectedInterface(e.target.value)} disabled={!desktopAvailable || captureRunning || captureStopping || captureActionBusy} aria-label="Capture interface"><option value="">No interface available</option>{interfaces.map((item) => <option key={item.id} value={item.id}>{item.name || item.id}</option>)}</select><button type="button" onClick={() => void handleCaptureAction()} disabled={!desktopAvailable || captureActionBusy || captureStopping || (!captureRunning && !selectedInterface)} className="enterprise-primary-button">{captureActionBusy ? 'WORKING…' : captureStopping ? 'STOPPING…' : captureRunning ? 'STOP' : 'START'}</button></div>{captureStopping && <p role="status" className="enterprise-help-text">Finishing the previous capture and its final persistence before restart.</p>}{captureActionError && <p className="enterprise-error-text">{captureActionError}</p>}<div className="enterprise-control-metrics"><span><strong>{metrics?.packets_captured ?? '—'}</strong>Packets</span><span><strong>{metrics?.dropped_packets ?? '—'}</strong>Dropped</span><span><strong>{summary?.active_flows_count ?? '—'}</strong>Flows</span></div></section>
          <section className="enterprise-control-card"><div className="enterprise-card-heading"><div><p className="enterprise-kicker">03 · SIGNAL</p><h2>Observed signals</h2></div><span className="enterprise-muted">{threatStatus?.feed_state || 'Unavailable'}</span></div><div className="enterprise-signal-list"><div><span>RTT</span><strong>{avgRtt > 0 ? `${avgRtt.toFixed(1)} ms` : '—'}</strong></div><div><span>Threat feed</span><strong>{threatStatus?.feed_state || '—'}</strong></div><div><span>Scope</span><strong>{snapshot?.scope || 'Local session'}</strong></div></div></section>
          <section className="enterprise-control-card enterprise-contacts-card"><div className="enterprise-card-heading"><div><p className="enterprise-kicker">04 · CONTACTS</p><h2>Observed endpoints</h2></div><span className="enterprise-muted">Select to track</span></div><div className="enterprise-contact-list">{contactList.map((node) => <button type="button" key={node.id} onClick={() => { setSelectedCountry(null); setSelectedNode(node); setIsDetailPanelOpen(true); }}><span>{node.name}</span><small>{node.ip} · {node.activeFlowsCount} flows · {node.threatLevel}</small></button>)}{localContacts.map((device) => <button type="button" key={device.id} disabled title="Locally observed address — no geographic placement is available or invented"><span>{device.name}{device.self ? ' (self)' : ''}</span><small>{device.ip} · local network · {device.flows} flows</small></button>)}{!contactList.length && !localContacts.length && <p className="enterprise-empty">{!desktopAvailable ? 'Native endpoint telemetry unavailable.' : refreshError ? 'Last endpoint snapshot is stale.' : 'No geolocated contacts in this session. “Resolve locations” can look up observed public endpoints.'}</p>}</div></section>
          <section className="enterprise-control-card"><div className="enterprise-card-heading"><div><p className="enterprise-kicker">05 · REVIEW</p><h2>Recent findings</h2></div><button type="button" onClick={() => setActiveTab('watchtower')} className="enterprise-text-button">Watchtower →</button></div><div className="enterprise-finding-list">{recentFindings.length ? recentFindings.map((alert) => <button type="button" key={alert.finding_id} onClick={() => setSelectedFinding(selectedFinding === alert.finding_id ? null : alert.finding_id)}><strong>{alert.severity} · {alert.title}</strong><small>{alert.source_ip} → {alert.destination_ip}</small>{selectedFinding === alert.finding_id && <span>{alert.evidence || 'No evidence text reported.'}</span>}</button>) : <span className="enterprise-empty">{emptyAlertMessage}</span>}</div></section>
        </aside>
      </div>
    </div>
  );
};

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
