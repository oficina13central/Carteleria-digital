'use client';

import { useCallback, useEffect, useState } from 'react';
import type { StorageConfig } from '@/lib/storage/storageManager';

export interface StorageStatusResponse {
  totalBytes: number;
  limitBytes: number;
  usedPercent: number;
  status: 'ok' | 'warning' | 'critical';
  config: StorageConfig;
  totalObjects?: number;
  mediaCount: number;
  orphanCount: number;
}

export interface AutoCleanupNotice {
  deletedMediaCount: number;
  deletedOrphanCount: number;
  freedMb: string;
  percentBefore: number;
  percentAfter: number;
}

export function formatStorageMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(1);
}

export function useStorageStatus() {
  const [statusData, setStatusData] = useState<StorageStatusResponse | null>(null);
  const [autoNotice, setAutoNotice] = useState<AutoCleanupNotice | null>(null);
  const [loading, setLoading] = useState(true);
  const [alertKey, setAlertKey] = useState(0);

  const checkStorage = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/storage?mode=status', { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as StorageStatusResponse;
      setStatusData(data);

      // Si alcanzó o superó el umbral crítico y la limpieza automática está activa, ejecutarla
      if (
        data.usedPercent >= data.config.criticalPercent &&
        data.config.autoCleanupEnabled
      ) {
        const cleanRes = await fetch('/api/admin/storage/cleanup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'auto' }),
        });

        if (cleanRes.ok) {
          const cleanJson = await cleanRes.json();
          if (cleanJson.triggered) {
            setAutoNotice({
              deletedMediaCount: cleanJson.deletedMediaCount,
              deletedOrphanCount: cleanJson.deletedOrphanCount,
              freedMb: formatStorageMb(cleanJson.freedBytes),
              percentBefore: cleanJson.percentBefore,
              percentAfter: cleanJson.percentAfter,
            });
            setAlertKey((k) => k + 1);

            if (cleanJson.summary) {
              setStatusData({
                totalBytes: cleanJson.summary.totalBytes,
                limitBytes: cleanJson.summary.limitBytes,
                usedPercent: cleanJson.summary.usedPercent,
                status: cleanJson.summary.status,
                config: cleanJson.summary.config,
                totalObjects: cleanJson.summary.totalObjects,
                mediaCount: cleanJson.summary.mediaItems?.length ?? data.mediaCount,
                orphanCount: cleanJson.summary.orphanObjects?.length ?? 0,
              });
            }
          }
        }
      }
    } catch {
      // Ignorar errores silenciosamente para no interrumpir la navegación
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    const runCheck = async () => {
      if (!active) return;
      await checkStorage();
    };
    const timer = setTimeout(() => {
      void runCheck();
    }, 0);

    const handler = () => {
      setAlertKey((k) => k + 1);
      void runCheck();
    };
    window.addEventListener('storage-updated', handler);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('storage-updated', handler);
    };
  }, [checkStorage]);

  return {
    statusData,
    autoNotice,
    clearAutoNotice: () => setAutoNotice(null),
    loading,
    alertKey,
  };
}
