'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { HardDrive } from 'lucide-react';
import type { UserRoleType } from '@/types/database';
import { formatStorageMb, type StorageStatusResponse } from './useStorageStatus';

interface StorageUsageMonitorProps {
  statusData: StorageStatusResponse | null;
  loading: boolean;
  role: UserRoleType;
}

export function StorageUsageMonitor({
  statusData,
  loading,
  role,
}: StorageUsageMonitorProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (loading && !statusData) {
    return (
      <div
        className="hidden sm:flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs text-slate-400 animate-pulse"
        aria-label="Cargando uso de almacenamiento"
      >
        <HardDrive className="w-3.5 h-3.5" />
        <span>--%</span>
      </div>
    );
  }

  if (!statusData) return null;

  const usedMb = formatStorageMb(statusData.totalBytes);
  const limitMb = statusData.config.limitMb;
  const freeMb = Math.max(0, (statusData.limitBytes - statusData.totalBytes) / (1024 * 1024)).toFixed(1);
  const percent = Math.min(100, Math.max(0, statusData.usedPercent));

  const barColor =
    statusData.status === 'critical'
      ? 'bg-red-500'
      : statusData.status === 'warning'
        ? 'bg-amber-400'
        : 'bg-emerald-500';

  const badgeStyle =
    statusData.status === 'critical'
      ? 'bg-red-500/10 border-red-500/40 text-red-200 hover:bg-red-500/20'
      : statusData.status === 'warning'
        ? 'bg-amber-500/10 border-amber-500/40 text-amber-200 hover:bg-amber-500/20'
        : 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800';

  const iconColor =
    statusData.status === 'critical'
      ? 'text-red-400'
      : statusData.status === 'warning'
        ? 'text-amber-400'
        : 'text-emerald-400';

  const content = (
    <>
      <HardDrive className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
      <div className="flex flex-col gap-0.5 min-w-[92px]">
        <div className="flex items-center justify-between gap-2 text-[11px] leading-none">
          <span className="font-medium tabular-nums">
            {usedMb} / {limitMb} MB
          </span>
          <span className="font-semibold tabular-nums">{statusData.usedPercent}%</span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-slate-900 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${barColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    </>
  );

  const tooltip = `Capacidad Supabase: ${usedMb} MB usados de ${limitMb} MB (${statusData.usedPercent}%). Libre: ${freeMb} MB.`;

  if (role === 'superadmin') {
    return (
      <Link
        href="/admin/storage"
        title={tooltip}
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs transition-colors ${badgeStyle}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={tooltip}
        className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border text-xs transition-colors cursor-pointer ${badgeStyle}`}
      >
        {content}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl bg-slate-900 border border-slate-700 shadow-xl p-3.5 text-xs text-slate-200 z-50 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Uso de almacenamiento</span>
            <span className={`font-semibold ${iconColor}`}>{statusData.usedPercent}%</span>
          </div>

          <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${barColor}`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] text-slate-300">
            <div className="rounded-lg bg-slate-800/70 p-2">
              <div className="text-slate-400">Usado</div>
              <div className="font-semibold text-white tabular-nums">{usedMb} MB</div>
            </div>
            <div className="rounded-lg bg-slate-800/70 p-2">
              <div className="text-slate-400">Disponible</div>
              <div className="font-semibold text-white tabular-nums">{freeMb} MB</div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 space-y-1 border-t border-slate-800 pt-2">
            <div>
              Límite configurado: <span className="text-slate-200">{limitMb} MB</span>
            </div>
            <div>
              Archivos activos: <span className="text-slate-200">{statusData.mediaCount}</span>
              {statusData.orphanCount > 0 && (
                <span className="text-amber-300"> (+{statusData.orphanCount} sin uso)</span>
              )}
            </div>
            <div>
              Alerta en {statusData.config.warningPercent}% · Limpieza auto en{' '}
              {statusData.config.autoCleanupEnabled
                ? `${statusData.config.criticalPercent}%`
                : 'desactivada'}
            </div>
          </div>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Si el uso sube demasiado, podés eliminar videos o fotos antiguos desde tu playlist para liberar espacio.
          </p>
        </div>
      )}
    </div>
  );
}
