import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

export interface GraphNode {
  node_id: string;
  node_type: string;
  label: string;
  properties: string;
  first_seen: number;
  last_seen: number;
}

export interface GraphEdge {
  edge_id: string;
  source_node: string;
  destination_node: string;
  relationship: string;
  first_seen: number;
  last_seen: number;
  confidence: number;
  evidence_ref: string;
}

export interface StorylineEvent {
  event_id: string;
  timestamp: number;
  event_type: string;
  description: string;
  source_entity: string;
  target_entity: string;
}

export interface AttackStoryline {
  storyline_id: string;
  title: string;
  first_seen: number;
  last_seen: number;
  involved_hosts: string[];
  involved_flows: string[];
  involved_findings: string[];
  ja4_observations: string[];
  confidence: number;
  severity: string;
  status: string;
  timeline: StorylineEvent[];
  evidence: string;
}

export interface AttackGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/**
 * Gets attack graph topology
 */
export async function getAttackGraph(): Promise<AttackGraph> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<AttackGraph>('get_attack_graph');
    } catch (err) {
      console.warn('Failed to get attack graph:', err);
    }
  }
  return { nodes: [], edges: [] };
}

/**
 * Gets attack storylines
 */
export async function getStorylines(): Promise<AttackStoryline[]> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<AttackStoryline[]>('get_storylines');
    } catch (err) {
      console.warn('Failed to get storylines:', err);
    }
  }
  return [];
}

/**
 * Gets specific storyline by ID
 */
export async function getStorylineById(storylineId: string): Promise<AttackStoryline | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<AttackStoryline | null>('get_storyline_by_id', { storylineId });
    } catch (err) {
      console.warn('Failed to get storyline by ID:', err);
    }
  }
  return null;
}

/**
 * Subscribes to graph-updated events (real attack graph snapshots from the native engine)
 */
export async function subscribeToGraphEvents(
  callback: (graph: AttackGraph) => void
): Promise<() => void> {
  if (isTauriEnvironment()) {
    try {
      const { listen } = await import('@tauri-apps/api/event');
      return await listen<AttackGraph>('graph-updated', (e) => callback(e.payload));
    } catch (err) {
      console.warn('Failed to listen to graph.updated:', err);
    }
  }
  return () => {};
}
