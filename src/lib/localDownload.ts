import { invoke } from '@tauri-apps/api/core';
import { isTauriEnvironment } from '../services/tauri/isTauri';

export async function downloadTextFile(content: string, mime: string, filename: string): Promise<void> {
  if (isTauriEnvironment()) {
    await invoke('save_download', { filename, content });
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type: `${mime};charset=utf-8` }));
  const link = document.createElement('a'); link.href = url; link.download = filename;
  document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
