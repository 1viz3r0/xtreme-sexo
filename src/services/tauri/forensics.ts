import { isTauriEnvironment } from './isTauri';

export interface QueryValidationResult {
  is_valid: boolean;
  is_read_only: boolean;
  statement_type: string;
  error_message: string | null;
}

export interface ForensicColumnMeta {
  name: string;
  data_type: string;
}

export interface ForensicTableSchema {
  table_name: string;
  description: string;
  columns: ForensicColumnMeta[];
}

export interface ForensicTemplate {
  template_id: string;
  title: string;
  description: string;
  category: string;
  sql: string;
}

export interface ForensicQueryResult {
  execution_time_ms: number;
  row_count: number;
  columns: string[];
  rows: string[][];
  truncated: boolean;
}

export interface SavedForensicQuery {
  query_id: string;
  name: string;
  description: string;
  sql: string;
  created_at: string;
}

/**
 * Executes a read-only forensic SQL query against local DuckDB / SQLite database
 */
export async function executeForensicQuery(
  sqlQuery: string,
  maxRows: number = 1000
): Promise<ForensicQueryResult> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ForensicQueryResult>('execute_forensic_query', {
        sqlQuery,
        maxRows,
      });
    } catch (err: any) {
      throw new Error(err.toString());
    }
  }
  throw new Error('Local queries require the desktop application.');
}

/**
 * Validates whether an SQL query is strictly READ-ONLY
 */
export async function validateForensicQuery(
  sqlQuery: string
): Promise<QueryValidationResult> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<QueryValidationResult>('validate_forensic_query', {
        sqlQuery,
      });
    } catch (err: any) {
      return {
        is_valid: false,
        is_read_only: false,
        statement_type: 'ERROR',
        error_message: err.toString(),
      };
    }
  }
  return {
    is_valid: false,
    is_read_only: false,
    statement_type: 'UNAVAILABLE',
    error_message: 'Validation requires the desktop application.',
  };
}

/**
 * Gets database schema metadata
 */
export async function getForensicSchema(): Promise<ForensicTableSchema[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ForensicTableSchema[]>('get_forensic_schema');
    } catch (err) {
      console.warn('Failed to get forensic schema:', err);
    }
  }
  return [];
}

/**
 * Gets prebuilt forensic query templates
 */
export async function getForensicTemplates(): Promise<ForensicTemplate[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<ForensicTemplate[]>('get_forensic_templates');
    } catch (err) {
      console.warn('Failed to get forensic templates:', err);
    }
  }
  return [];
}

/**
 * Gets saved queries
 */
export async function getSavedQueries(): Promise<SavedForensicQuery[]> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<SavedForensicQuery[]>('get_saved_queries');
    } catch (err) {
      console.warn('Failed to get saved queries:', err);
    }
  }
  return [];
}

/**
 * Saves a forensic query
 */
export async function saveForensicQuery(
  name: string,
  description: string,
  sql: string
): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      return await invoke<boolean>('save_forensic_query', {
        name,
        description,
        sql,
      });
    } catch (err) {
      console.warn('Failed to save forensic query:', err);
    }
  }
  return false;
}
