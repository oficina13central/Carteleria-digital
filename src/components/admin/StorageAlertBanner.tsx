'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, HardDrive, Sparkles, X } from 'lucide-react';
import type { UserRoleType } from '@/types/database';
import {
  formatStorageMb,
  type AutoCleanupNotice,
  type StorageStatusResponse,
} from './useStorageStatus';

interface StorageAlertBannerProps {
  role: UserRoleType;
  statusData: StorageStatusResponse | null;
  autoNotice: AutoCleanupNotice | null;
  onClearAutoNotice: () => void;
  alertKey: number;
}

export function StorageAlertBanner({
  role,
  statusData,
  autoNotice,
  onClearAutoNotice,
  alertKey,
}: StorageAlertBannerProps) {
  const [dismissedKey, setDismissedKey] = useState<number | null>(null);
  const dismissed = dismissedKey === alertKey;

  if (dismissed) return null;

  // Mostrar aviso si se acaba de ejecutar la limpieza automática
  if (autoNotice) {
    return (
      <div className="bg-emerald-950/80 border-b border-emerald-500/40 text-emerald-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 text-xs sm:text-sm">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              <strong>Limpieza automática ejecutada:</strong> el Storage superó el límite crítico (
              {autoNotice.percentBefore}%). Se eliminaron{' '}
              {autoNotice.deletedMediaCount + autoNotice.deletedOrphanCount} archivos antiguos (
              {autoNotice.freedMb} MB liberados) y bajó a <strong>{autoNotice.percentAfter}%</strong>.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {role === 'superadmin' && (
              <Link
                href="/admin/storage"
                className="px-2.5 py-1 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Ver detalles
              </Link>
            )}
            <button
              onClick={onClearAutoNotice}
              className="p-1 text-emerald-300 hover:text-white cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!statusData || statusData.status === 'ok') {
    return null;
  }

  const isCritical = statusData.status === 'critical';

  return (
    <div
      className={`border-b ${
        isCritical
          ? 'bg-red-950/85 border-red-500/40 text-red-100'
          : 'bg-amber-950/80 border-amber-500/40 text-amber-100'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm">
        <div className="flex items-center gap-2.5">
          <AlertTriangle
            className={`w-4 h-4 shrink-0 ${isCritical ? 'text-red-400' : 'text-amber-400'}`}
          />
          <span>
            <strong>
              {isCritical
                ? `¡Almacenamiento crítico (${statusData.usedPercent}%)!`
                : `Aviso de almacenamiento (${statusData.usedPercent}%):`}
            </strong>{' '}
            Se están usando {formatStorageMb(statusData.totalBytes)} MB de {statusData.config.limitMb} MB en
            Supabase Storage.{' '}
            {isCritical
              ? 'Liberá espacio de inmediato o activá la limpieza automática.'
              : `Al llegar al ${statusData.config.criticalPercent}% se limpiarán automáticamente los archivos más antiguos. Se recomienda borrar imágenes y videos viejos.`}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {role === 'superadmin' && (
            <Link
              href="/admin/storage"
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium text-white transition-colors ${
                isCritical ? 'bg-red-600 hover:bg-red-500' : 'bg-amber-600 hover:bg-amber-500'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              Gestionar Storage
            </Link>
          )}
          <button
            onClick={() => setDismissedKey(alertKey)}
            className="p-1 opacity-75 hover:opacity-100 cursor-pointer"
            aria-label="Ocultar aviso"
          >
            <CheckCircle2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
