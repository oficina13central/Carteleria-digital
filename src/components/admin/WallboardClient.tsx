'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  ExternalLink,
  Filter,
  Monitor,
  Plus,
  RefreshCw,
  Settings,
  Tv,
  WifiOff,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getScreenHealth, type Pantalla, type Sucursal } from '@/types/database';

interface WallboardClientProps {
  initialSucursales: Sucursal[];
  initialPantallas: Pantalla[];
}

function formatLastPing(ultimoPing: string | null, nowMs: number): string {
  if (!ultimoPing) return 'Nunca';
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(ultimoPing).getTime()) / 1000));
  if (diffSec < 60) return `Hace ${diffSec}s`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Hace ${diffMin} min`;
  const diffHours = Math.floor(diffMin / 60);
  return `Hace ${diffHours}h`;
}

export function WallboardClient({
  initialSucursales,
  initialPantallas,
}: WallboardClientProps) {
  const [sucursales, setSucursales] = useState<Sucursal[]>(initialSucursales);
  const [pantallas, setPantallas] = useState<Pantalla[]>(initialPantallas);
  const [statusFilter, setStatusFilter] = useState<'all' | 'problems'>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [refreshing, setRefreshing] = useState(false);

  // Modal nueva sucursal
  const [showNewBranch, setShowNewBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);

  async function fetchLatest() {
    setRefreshing(true);
    const supabase = createClient();
    const [{ data: sucData }, { data: panData }] = await Promise.all([
      supabase.from('sucursales').select('*').order('nombre', { ascending: true }),
      supabase
        .from('pantallas')
        .select('*')
        .not('sucursal_id', 'is', null)
        .order('nombre', { ascending: true }),
    ]);
    if (sucData) setSucursales(sucData as Sucursal[]);
    if (panData) setPantallas(panData as Pantalla[]);
    setNowMs(Date.now());
    setRefreshing(false);
  }

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel('wallboard-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pantallas' },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as Pantalla;
            if (row.sucursal_id) {
              setPantallas((prev) => [...prev.filter((p) => p.id !== row.id), row]);
            }
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as Pantalla;
            setPantallas((prev) => {
              const exists = prev.some((p) => p.id === row.id);
              if (!row.sucursal_id) return prev.filter((p) => p.id !== row.id);
              return exists ? prev.map((p) => (p.id === row.id ? row : p)) : [...prev, row];
            });
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as { id: string };
            setPantallas((prev) => prev.filter((p) => p.id !== oldRow.id));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sucursales' },
        () => {
          fetchLatest();
        }
      )
      .subscribe();

    // Polling de respaldo cada 15 segundos + actualización del reloj relativo
    const interval = setInterval(() => {
      fetchLatest();
    }, 15000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const stats = useMemo(() => {
    let online = 0;
    let offlineCache = 0;
    let disconnected = 0;

    for (const p of pantallas) {
      const h = getScreenHealth(p, nowMs);
      if (h === 'online') online++;
      else if (h === 'offline_cache') offlineCache++;
      else disconnected++;
    }
    return { total: pantallas.length, online, offlineCache, disconnected };
  }, [pantallas, nowMs]);

  const groupedBranches = useMemo(() => {
    return sucursales
      .filter((s) => branchFilter === 'all' || s.id === branchFilter)
      .map((suc) => {
        const tvs = pantallas
          .filter((p) => p.sucursal_id === suc.id)
          .filter((p) => {
            if (statusFilter === 'all') return true;
            return getScreenHealth(p, nowMs) !== 'online';
          });
        return { sucursal: suc, tvs };
      })
      .filter((g) => statusFilter === 'all' || g.tvs.length > 0);
  }, [sucursales, pantallas, branchFilter, statusFilter, nowMs]);

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault();
    if (!newBranchName.trim()) return;
    setCreatingBranch(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('sucursales')
      .insert({ nombre: newBranchName.trim(), activa: true })
      .select('*')
      .single();

    if (!error && data) {
      setSucursales((prev) =>
        [...prev, data as Sucursal].sort((a, b) => a.nombre.localeCompare(b.nombre))
      );
      setNewBranchName('');
      setShowNewBranch(false);
    }
    setCreatingBranch(false);
  }

  return (
    <div className="space-y-6">
      {/* Header + KPIs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Wallboard de Monitoreo</h1>
          <p className="text-sm text-slate-400">
            Estado en tiempo real de todas las pantallas de la red (actualización cada 15s / Realtime)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchLatest}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={() => setShowNewBranch(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Nueva Sucursal
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="text-xs text-slate-400 flex items-center gap-1.5">
            <Tv className="w-4 h-4 text-indigo-400" /> Total Pantallas
          </div>
          <div className="text-2xl font-bold text-white mt-1">{stats.total}</div>
        </div>
        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30">
          <div className="text-xs text-emerald-300 flex items-center gap-1.5">
            <CheckCircle2 className="w-4 h-4" /> Online (&lt; 2 min)
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-1">{stats.online}</div>
        </div>
        <div className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30">
          <div className="text-xs text-amber-300 flex items-center gap-1.5">
            <WifiOff className="w-4 h-4" /> Caché Offline
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-1">{stats.offlineCache}</div>
        </div>
        <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-500/30">
          <div className="text-xs text-rose-300 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" /> Desconectadas
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{stats.disconnected}</div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-slate-900 border border-slate-800">
        <div className="flex items-center gap-1.5 text-xs text-slate-400 px-2">
          <Filter className="w-3.5 h-3.5" />
          Filtros:
        </div>

        <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === 'all'
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Todas
          </button>
          <button
            onClick={() => setStatusFilter('problems')}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
              statusFilter === 'problems'
                ? 'bg-rose-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Con problemas ({stats.offlineCache + stats.disconnected})
          </button>
        </div>

        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">Todas las sucursales ({sucursales.length})</option>
          {sucursales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* Tarjetas agrupadas por sucursal */}
      {groupedBranches.length === 0 ? (
        <div className="p-12 rounded-2xl bg-slate-900 border border-slate-800 text-center text-slate-400 text-sm">
          No hay sucursales o pantallas que coincidan con el filtro seleccionado.
        </div>
      ) : (
        <div className="space-y-6">
          {groupedBranches.map(({ sucursal, tvs }) => (
            <section
              key={sucursal.id}
              className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                  <h2 className="text-lg font-semibold text-white">{sucursal.nombre}</h2>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {tvs.length} {tvs.length === 1 ? 'TV' : 'TVs'}
                  </span>
                </div>
                <Link
                  href={`/admin/sucursal/${sucursal.id}`}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300"
                >
                  <Settings className="w-3.5 h-3.5" />
                  Administrar sucursal
                </Link>
              </div>

              {tvs.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">
                  No hay pantallas vinculadas en esta sucursal aún.
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tvs.map((tv) => {
                    const health = getScreenHealth(tv, nowMs);
                    const statusStyles =
                      health === 'online'
                        ? {
                            dot: 'bg-emerald-400',
                            badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
                            label: 'Online',
                          }
                        : health === 'offline_cache'
                        ? {
                            dot: 'bg-amber-400',
                            badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
                            label: 'Offline (Caché)',
                          }
                        : {
                            dot: 'bg-rose-500',
                            badge: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
                            label: 'Desconectada',
                          };

                    return (
                      <div
                        key={tv.id}
                        className="rounded-xl bg-slate-950 border border-slate-800 overflow-hidden flex flex-col"
                      >
                        {/* Miniatura actual */}
                        <div className="relative h-36 bg-black flex items-center justify-center overflow-hidden">
                          {tv.item_actual_miniatura ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={tv.item_actual_miniatura}
                              alt={tv.item_actual_titulo || tv.nombre}
                              className="w-full h-full object-cover opacity-85"
                            />
                          ) : (
                            <Monitor className="w-10 h-10 text-slate-700" />
                          )}

                          <div
                            className={`absolute top-2.5 left-2.5 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border backdrop-blur ${statusStyles.badge}`}
                          >
                            <span className={`w-2 h-2 rounded-full ${statusStyles.dot}`} />
                            {statusStyles.label}
                          </div>

                          <div className="absolute top-2.5 right-2.5 px-2 py-0.5 rounded bg-black/70 text-[11px] font-mono text-slate-300">
                            {tv.codigo_vinculacion}
                          </div>
                        </div>

                        {/* Detalles */}
                        <div className="p-3.5 flex-1 flex flex-col justify-between gap-3">
                          <div>
                            <div className="font-semibold text-sm text-white flex items-center justify-between gap-2">
                              <span className="truncate">{tv.nombre}</span>
                              <span className="text-[11px] font-normal text-slate-500">
                                {formatLastPing(tv.ultimo_ping, nowMs)}
                              </span>
                            </div>

                            <div className="text-xs text-slate-300 mt-1 truncate">
                              {tv.item_actual_titulo ? (
                                <>Reproduciendo: {tv.item_actual_titulo}</>
                              ) : (
                                <span className="text-slate-500">Sin reporte de ítem actual</span>
                              )}
                            </div>

                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300">
                                {tv.resolucion}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 capitalize">
                                {tv.orientacion}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-300 capitalize">
                                {tv.transicion}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                            <Link
                              href={`/admin/sucursal/${sucursal.id}?pantalla=${tv.id}`}
                              className="flex-1 text-center py-1.5 px-2.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs font-medium transition-colors"
                            >
                              Editar Playlist
                            </Link>
                            <Link
                              href={`/play/${tv.codigo_vinculacion}`}
                              target="_blank"
                              className="inline-flex items-center gap-1 py-1.5 px-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs transition-colors"
                              title="Abrir vista previa del reproductor"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                              Preview
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ))}
        </div>
      )}

      {/* Modal Nueva Sucursal */}
      {showNewBranch && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateBranch}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <h3 className="text-lg font-semibold text-white">Nueva Sucursal</h3>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Nombre de la sucursal
              </label>
              <input
                type="text"
                required
                autoFocus
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="Ej. Sucursal Centro"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewBranch(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={creatingBranch}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium cursor-pointer"
              >
                {creatingBranch ? 'Creando...' : 'Crear Sucursal'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
