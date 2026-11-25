'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Film,
  HardDrive,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type {
  BucketObjectInfo,
  EnrichedMediaItem,
  StorageConfig,
  StorageSummary,
} from '@/lib/storage/storageManager';

interface StorageManagerClientProps {
  initialSummary: StorageSummary;
}

type FilterMode = 'all' | 'video' | 'image' | 'expired_inactive' | 'orphans';
type SortMode = 'oldest' | 'largest' | 'newest';

function formatMb(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StorageManagerClient({ initialSummary }: StorageManagerClientProps) {
  const [summary, setSummary] = useState<StorageSummary>(initialSummary);
  const [config, setConfig] = useState<StorageConfig>(initialSummary.config);

  const [filter, setFilter] = useState<FilterMode>('all');
  const [sort, setSort] = useState<SortMode>('oldest');
  const [selectedMediaIds, setSelectedMediaIds] = useState<Set<string>>(new Set());
  const [selectedOrphanPaths, setSelectedOrphanPaths] = useState<Set<string>>(new Set());

  const [refreshing, setRefreshing] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  async function refreshSummary() {
    setRefreshing(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/storage', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al actualizar');
      setSummary(data);
      setConfig(data.config);
      window.dispatchEvent(new Event('storage-updated'));
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al consultar Storage',
      });
    } finally {
      setRefreshing(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/storage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al guardar configuración');
      setConfig(data.config);
      await refreshSummary();
      setFeedback({
        type: 'success',
        text: 'Configuración de umbrales y limpieza automática guardada.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al guardar',
      });
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRunCleanup() {
    if (
      !confirm(
        `¿Ejecutar la limpieza automática ahora hasta bajar al ${config.targetSafePercent}% seguro?\nSe eliminarán primero archivos huérfanos, luego vencidos/inactivos y finalmente los más antiguos.`
      )
    ) {
      return;
    }

    setCleaning(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/storage/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'manual',
          targetPercent: config.targetSafePercent,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error en limpieza');

      if (data.summary) {
        setSummary(data.summary);
        setConfig(data.summary.config);
      }
      setSelectedMediaIds(new Set());
      setSelectedOrphanPaths(new Set());
      window.dispatchEvent(new Event('storage-updated'));

      if (data.triggered) {
        setFeedback({
          type: 'success',
          text: `Limpieza completada: ${data.deletedMediaCount} medios y ${data.deletedOrphanCount} huérfanos eliminados (${formatMb(data.freedBytes)} MB liberados). Uso actual: ${data.percentAfter}%.`,
        });
      } else {
        setFeedback({
          type: 'success',
          text: data.reason || 'El almacenamiento ya está dentro del porcentaje seguro.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al limpiar',
      });
    } finally {
      setCleaning(false);
    }
  }

  async function handleDeleteSelected() {
    const mediaIds = Array.from(selectedMediaIds);
    const orphanPaths = Array.from(selectedOrphanPaths);
    const totalCount = mediaIds.length + orphanPaths.length;
    if (totalCount === 0) return;

    if (
      !confirm(
        `¿Eliminar permanentemente ${totalCount} elemento(s) seleccionado(s) de Supabase Storage y de las playlists?`
      )
    ) {
      return;
    }

    setDeleting(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/storage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaItemIds: mediaIds, orphanPaths }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al eliminar');

      if (data.summary) {
        setSummary(data.summary);
        setConfig(data.summary.config);
      }
      setSelectedMediaIds(new Set());
      setSelectedOrphanPaths(new Set());
      window.dispatchEvent(new Event('storage-updated'));

      setFeedback({
        type: 'success',
        text: `Se eliminaron ${data.deletedMediaCount + data.deletedOrphanCount} elementos (${formatMb(data.freedBytes)} MB liberados).`,
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        text: err instanceof Error ? err.message : 'Error al eliminar elementos',
      });
    } finally {
      setDeleting(false);
    }
  }

  const filteredMedia = useMemo(() => {
    let list = [...summary.mediaItems];
    if (filter === 'video') {
      list = list.filter((m) => m.tipo === 'video');
    } else if (filter === 'image') {
      list = list.filter((m) => m.tipo === 'image');
    } else if (filter === 'expired_inactive') {
      list = list.filter((m) => m.isExpired || !m.activo);
    } else if (filter === 'orphans') {
      return [];
    }

    list.sort((a, b) => {
      if (sort === 'largest') return b.sizeBytes - a.sizeBytes;
      if (sort === 'newest') {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return list;
  }, [summary.mediaItems, filter, sort]);

  const sortedOrphans = useMemo(() => {
    const list = [...summary.orphanObjects];
    list.sort((a, b) => {
      if (sort === 'largest') return b.size - a.size;
      const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sort === 'newest' ? tB - tA : tA - tB;
    });
    return list;
  }, [summary.orphanObjects, sort]);

  const selectedBytes = useMemo(() => {
    let total = 0;
    for (const m of summary.mediaItems) {
      if (selectedMediaIds.has(m.id)) total += m.sizeBytes;
    }
    for (const o of summary.orphanObjects) {
      if (selectedOrphanPaths.has(o.path)) total += o.size;
    }
    return total;
  }, [summary.mediaItems, summary.orphanObjects, selectedMediaIds, selectedOrphanPaths]);

  function toggleMediaSelection(id: string) {
    setSelectedMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleOrphanSelection(path: string) {
    setSelectedOrphanPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectOldestTen() {
    const oldest = [...summary.mediaItems]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(0, 10)
      .map((m) => m.id);
    setSelectedMediaIds(new Set(oldest));
    setFilter('all');
    setSort('oldest');
  }

  function selectExpiredOrInactive() {
    const ids = summary.mediaItems
      .filter((m) => m.isExpired || !m.activo)
      .map((m) => m.id);
    setSelectedMediaIds(new Set(ids));
    setFilter('expired_inactive');
  }

  function selectAllOrphans() {
    setSelectedOrphanPaths(new Set(summary.orphanObjects.map((o) => o.path)));
    setFilter('orphans');
  }

  const barPercent = Math.min(100, Math.max(0, summary.usedPercent));
  const statusColor =
    summary.status === 'critical'
      ? 'bg-red-500'
      : summary.status === 'warning'
        ? 'bg-amber-500'
        : 'bg-emerald-500';

  const statusBadge =
    summary.status === 'critical' ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/15 text-red-300 border border-red-500/30">
        <AlertTriangle className="w-3.5 h-3.5" />
        Crítico (&ge; {summary.config.criticalPercent}%)
      </span>
    ) : summary.status === 'warning' ? (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
        <AlertTriangle className="w-3.5 h-3.5" />
        Alerta (&ge; {summary.config.warningPercent}%)
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
        <ShieldCheck className="w-3.5 h-3.5" />
        Saludable
      </span>
    );

  const totalVideos = summary.mediaItems.filter((m) => m.tipo === 'video').length;
  const totalImages = summary.mediaItems.filter((m) => m.tipo === 'image').length;

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <HardDrive className="w-6 h-6 text-indigo-400" />
            Almacenamiento y Limpieza (Supabase Storage)
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Controlá el uso del bucket <code className="text-slate-300">signage-media</code>, recibí
            avisos al {summary.config.warningPercent}% y automatizá la limpieza al llegar al{' '}
            {summary.config.criticalPercent}%.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={refreshSummary}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={handleRunCleanup}
            disabled={cleaning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {cleaning ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            Limpiar hasta {config.targetSafePercent}%
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm ${
            feedback.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
              : 'bg-red-950/60 border-red-500/40 text-red-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Tarjeta principal de uso */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-sm text-slate-400">Uso actual de Supabase Storage</div>
            <div className="flex items-baseline gap-3 mt-1">
              <span className="text-3xl font-bold text-white">{summary.usedPercent}%</span>
              <span className="text-sm text-slate-400">
                {formatMb(summary.totalBytes)} MB de {summary.config.limitMb} MB
              </span>
            </div>
          </div>
          {statusBadge}
        </div>

        {/* Barra de progreso con marcadores 80% y 95% */}
        <div className="relative pt-2 pb-4">
          <div className="h-4 w-full bg-slate-800 rounded-full overflow-hidden relative">
            <div
              className={`h-full ${statusColor} transition-all duration-500`}
              style={{ width: `${barPercent}%` }}
            />
          </div>

          {/* Marcador Warning (80%) */}
          <div
            className="absolute top-1 bottom-3 w-0.5 bg-amber-400/80"
            style={{ left: `${summary.config.warningPercent}%` }}
          >
            <span className="absolute top-5 -translate-x-1/2 text-[11px] font-medium text-amber-400 whitespace-nowrap">
              Aviso {summary.config.warningPercent}%
            </span>
          </div>

          {/* Marcador Critical (95%) */}
          <div
            className="absolute top-1 bottom-3 w-0.5 bg-red-400/90"
            style={{ left: `${summary.config.criticalPercent}%` }}
          >
            <span className="absolute top-5 -translate-x-1/2 text-[11px] font-medium text-red-400 whitespace-nowrap">
              Auto {summary.config.criticalPercent}%
            </span>
          </div>
        </div>

        {/* Métricas rápidas */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">Medios en Playlists</div>
            <div className="text-xl font-semibold text-white mt-0.5">
              {summary.mediaItems.length}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {totalVideos} videos · {totalImages} imágenes
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">Archivos Huérfanos</div>
            <div className="text-xl font-semibold text-white mt-0.5">
              {summary.orphanObjects.length}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {formatMb(summary.orphanObjects.reduce((acc, o) => acc + o.size, 0))} MB sin uso
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">Porcentaje Seguro</div>
            <div className="text-xl font-semibold text-emerald-400 mt-0.5">
              {summary.config.targetSafePercent}%
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              Objetivo de limpieza automática
            </div>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 rounded-xl p-3.5">
            <div className="text-xs text-slate-400">Última Limpieza</div>
            <div className="text-sm font-semibold text-white mt-1">
              {summary.config.lastCleanup
                ? `${formatMb(summary.config.lastCleanup.freedBytes)} MB liberados`
                : 'Sin ejecuciones'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {summary.config.lastCleanup
                ? formatDate(summary.config.lastCleanup.at)
                : 'Se activará al llegar al ' + summary.config.criticalPercent + '%'}
            </div>
          </div>
        </div>
      </div>

      {/* Configuración de umbrales */}
      <form
        onSubmit={handleSaveConfig}
        className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Reglas de Alerta y Limpieza Automática
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Cuando se alcance el umbral crítico, el sistema eliminará archivos huérfanos, medios
              vencidos/inactivos y los más antiguos hasta alcanzar el porcentaje seguro.
            </p>
          </div>

          <label className="inline-flex items-center gap-2.5 text-sm text-slate-200 cursor-pointer">
            <input
              type="checkbox"
              checked={config.autoCleanupEnabled}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, autoCleanupEnabled: e.target.checked }))
              }
              className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
            />
            Limpieza automática activa
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Límite del plan (MB)
            </label>
            <input
              type="number"
              min={50}
              value={config.limitMb}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, limitMb: Number(e.target.value) || 1024 }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[11px] text-slate-500">Plan Free Supabase = 1024 MB</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Umbral de aviso (%)
            </label>
            <input
              type="number"
              min={10}
              max={95}
              value={config.warningPercent}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, warningPercent: Number(e.target.value) || 80 }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[11px] text-slate-500">Muestra alerta en el panel</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Umbral crítico auto-limpieza (%)
            </label>
            <input
              type="number"
              min={20}
              max={100}
              value={config.criticalPercent}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, criticalPercent: Number(e.target.value) || 95 }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[11px] text-slate-500">Dispara limpieza automática</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Porcentaje seguro objetivo (%)
            </label>
            <input
              type="number"
              min={10}
              max={85}
              value={config.targetSafePercent}
              onChange={(e) =>
                setConfig((prev) => ({
                  ...prev,
                  targetSafePercent: Number(e.target.value) || 65,
                }))
              }
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
            />
            <span className="text-[11px] text-slate-500">Hasta dónde reduce el uso</span>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={savingConfig}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            {savingConfig ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Guardar configuración
          </button>
        </div>
      </form>

      {/* Gestor de archivos antiguos / manual */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">
              Archivos Almacenados (Borrado Manual)
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Seleccioná imágenes o videos antiguos para liberar espacio manualmente.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={selectExpiredOrInactive}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
            >
              Seleccionar vencidos/inactivos
            </button>
            <button
              type="button"
              onClick={selectOldestTen}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer"
            >
              Seleccionar 10 más antiguos
            </button>
            {summary.orphanObjects.length > 0 && (
              <button
                type="button"
                onClick={selectAllOrphans}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-xs font-medium text-amber-300 transition-colors cursor-pointer"
              >
                Seleccionar {summary.orphanObjects.length} huérfanos
              </button>
            )}
          </div>
        </div>

        {/* Filtros y botón de borrado */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['all', `Todos (${summary.mediaItems.length})`],
                ['video', `Videos (${totalVideos})`],
                ['image', `Imágenes (${totalImages})`],
                ['expired_inactive', 'Vencidos / Inactivos'],
                ['orphans', `Huérfanos (${summary.orphanObjects.length})`],
              ] as [FilterMode, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  filter === key
                    ? 'bg-indigo-600 text-white'
                    : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortMode)}
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="oldest">Más antiguos primero</option>
              <option value="largest">Más pesados primero</option>
              <option value="newest">Más recientes primero</option>
            </select>

            {(selectedMediaIds.size > 0 || selectedOrphanPaths.size > 0) && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                disabled={deleting}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {deleting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Eliminar ({selectedMediaIds.size + selectedOrphanPaths.size} ·{' '}
                {formatMb(selectedBytes)} MB)
              </button>
            )}
          </div>
        </div>

        {/* Tabla */}
        {filter === 'orphans' ? (
          sortedOrphans.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">
              No hay archivos huérfanos en el bucket.
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-800 rounded-xl">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-950 text-xs text-slate-400 uppercase">
                  <tr>
                    <th className="p-3 w-10"></th>
                    <th className="p-3">Ruta en Storage</th>
                    <th className="p-3">Tamaño</th>
                    <th className="p-3">Creado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {sortedOrphans.map((orphan: BucketObjectInfo) => {
                    const checked = selectedOrphanPaths.has(orphan.path);
                    return (
                      <tr
                        key={orphan.path}
                        onClick={() => toggleOrphanSelection(orphan.path)}
                        className={`cursor-pointer transition-colors ${
                          checked ? 'bg-indigo-950/40' : 'hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {}}
                            className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600"
                          />
                        </td>
                        <td className="p-3 font-mono text-xs text-slate-300 break-all">
                          {orphan.path}
                        </td>
                        <td className="p-3 text-slate-300 whitespace-nowrap">
                          {formatMb(orphan.size)} MB
                        </td>
                        <td className="p-3 text-slate-400 text-xs whitespace-nowrap">
                          {formatDate(orphan.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : filteredMedia.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-500">
            No hay elementos para mostrar con este filtro.
          </div>
        ) : (
          <div className="overflow-x-auto border border-slate-800 rounded-xl">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-950 text-xs text-slate-400 uppercase">
                <tr>
                  <th className="p-3 w-10"></th>
                  <th className="p-3">Archivo</th>
                  <th className="p-3">Ámbito</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3">Tamaño</th>
                  <th className="p-3">Subido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                {filteredMedia.map((item: EnrichedMediaItem) => {
                  const checked = selectedMediaIds.has(item.id);
                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleMediaSelection(item.id)}
                      className={`cursor-pointer transition-colors ${
                        checked ? 'bg-indigo-950/40' : 'hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600"
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {item.url_miniatura ? (
                            <img
                              src={item.url_miniatura}
                              alt={item.titulo}
                              className="w-12 h-8 object-cover rounded bg-slate-800 shrink-0"
                            />
                          ) : (
                            <div className="w-12 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                              {item.tipo === 'video' ? (
                                <Film className="w-4 h-4 text-slate-400" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-slate-400" />
                              )}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-white line-clamp-1">{item.titulo}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-1.5">
                              {item.tipo === 'video' ? (
                                <Film className="w-3 h-3 text-indigo-400" />
                              ) : (
                                <ImageIcon className="w-3 h-3 text-emerald-400" />
                              )}
                              {item.tipo === 'video' ? 'Video MP4' : 'Imagen WebP'}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="p-3 text-xs text-slate-300">
                        {item.sucursalNombre ? item.sucursalNombre : 'Global (Casa Central)'}
                      </td>
                      <td className="p-3">
                        {item.isExpired ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Vencido
                          </span>
                        ) : !item.activo ? (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-slate-700 text-slate-300">
                            Inactivo
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Activo
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-slate-200 font-medium whitespace-nowrap">
                        {formatMb(item.sizeBytes)} MB
                      </td>
                      <td className="p-3 text-xs text-slate-400 whitespace-nowrap">
                        {formatDate(item.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
