import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from './isTauri';

export type EduExplanation = {
  field_id: string;
  title: string;
  category: string;
  short_description: string;
  detailed_explanation: string;
  current_value: string;
  interpretation: string;
  status_level: string;
  evidence: string[];
  related_entities: string[];
  analyst_next_steps: string[];
};

/**
 * Gets field explanation from native EduInspector knowledge base
 */
export async function getFieldExplanation(
  fieldId: string,
  currentValue: string
): Promise<EduExplanation | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<EduExplanation>('get_field_explanation', {
        fieldId,
        currentValue,
      });
    } catch (err) {
      console.warn('Failed to get field explanation:', err);
    }
  }
  return null;
}

/**
 * Gets entity explanation from native EduInspector
 */
export async function getEntityExplanation(
  entityType: string,
  entityId: string
): Promise<EduExplanation | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<EduExplanation>('get_entity_explanation', {
        entityType,
        entityId,
      });
    } catch (err) {
      console.warn('Failed to get entity explanation:', err);
    }
  }
  return null;
}

/**
 * Gets detection explanation from native EduInspector
 */
export async function getDetectionExplanation(
  findingId: string
): Promise<EduExplanation | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<EduExplanation | null>('get_detection_explanation', {
        findingId,
      });
    } catch (err) {
      console.warn('Failed to get detection explanation:', err);
    }
  }
  return null;
}

/**
 * Gets JA4 explanation from native EduInspector
 */
export async function getJa4Explanation(
  fingerprint: string
): Promise<EduExplanation | null> {
  if (isTauriEnvironment()) {
    try {
      return await invoke<EduExplanation>('get_ja4_explanation', {
        fingerprint,
      });
    } catch (err) {
      console.warn('Failed to get JA4 explanation:', err);
    }
  }
  return null;
}
