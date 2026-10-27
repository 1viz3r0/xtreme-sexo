import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

export interface DetectionFinding {
  finding_id: string;
  rule_id: string;
  rule_version: string;
  timestamp: number;
  first_seen: number;
  last_seen: number;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  flow_id: string;
  ja4: string;
  category: string;
  severity: string;
  confidence: number;
  title: string;
  description: string;
  evidence: string;
  status: string;
  occurrence_count: number;
}

export interface DetectionSummary {
  total_findings_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  active_count: number;
  resolved_count: number;
}

export interface DetectionRule {
  rule_id: string;
  name: string;
  description: string;
  category: string;
  severity: string;
  confidence: number;
  enabled: boolean;
  rule_version: string;
}

/**
 * Gets recent detection findings
 */
export async function getDetections(limit = 100): Promise<DetectionFinding[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<DetectionFinding[]>('get_detections', { limit });
    } catch (err) {
      console.warn('Failed to get detections:', err);
    }
  }
  return [];
}

/**
 * Gets detection summary statistics
 */
export async function getDetectionSummary(): Promise<DetectionSummary> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<DetectionSummary>('get_detection_summary');
    } catch (err) {
      console.warn('Failed to get detection summary:', err);
    }
  }
  return {
    total_findings_count: 0,
    critical_count: 0,
    high_count: 0,
    medium_count: 0,
    low_count: 0,
    info_count: 0,
    active_count: 0,
    resolved_count: 0,
  };
}

/**
 * Gets specific finding by ID
 */
export async function getDetectionById(findingId: string): Promise<DetectionFinding | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<DetectionFinding | null>('get_detection_by_id', { findingId });
    } catch (err) {
      console.warn('Failed to get detection by ID:', err);
    }
  }
  return null;
}

/**
 * Acknowledges a detection finding
 */
export async function acknowledgeDetection(findingId: string): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<boolean>('acknowledge_detection', { findingId });
    } catch (err) {
      console.warn('Failed to acknowledge detection:', err);
    }
  }
  return false;
}

/**
 * Resolves a detection finding
 */
export async function resolveDetection(findingId: string): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<boolean>('resolve_detection', { findingId });
    } catch (err) {
      console.warn('Failed to resolve detection:', err);
    }
  }
  return false;
}

/**
 * Toggles a rule enabled/disabled state
 */
export async function enableDisableRule(ruleId: string, enabled: boolean): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<boolean>('enable_disable_rule', { ruleId, enabled });
    } catch (err) {
      console.warn('Failed to enable/disable rule:', err);
    }
  }
  return false;
}

/**
 * Lists all detection rules
 */
export async function listRules(): Promise<DetectionRule[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<DetectionRule[]>('list_rules');
    } catch (err) {
      console.warn('Failed to list rules:', err);
    }
  }
  return [];
}

/**
 * Subscribes to detection-created events (real findings from the native detection engine)
 */
export async function subscribeToDetectionEvents(
  callback: (finding: DetectionFinding) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<DetectionFinding>('detection-created', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to detection.created:', err);
    }
  }
  return () => {};
}
