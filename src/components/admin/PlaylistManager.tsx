'use client';

import { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Calendar,
  Clock,
  Film,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Lock,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import type { MediaItem, Pantalla, UserRoleType } from '@/types/database';

interface PlaylistManagerProps {
  items: MediaItem[];
  pantallas?: Pantalla[];
  role: UserRoleType;
  scope: 'global' | 'branch';
  onItemsChanged: (nextItems: MediaItem[]) => void;
}

function toDatetimeLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export function PlaylistManager({
  items,
  pantallas = [],
  role,
  scope,
  onItemsChanged,
}: PlaylistManagerProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const canEditItem = (item: MediaItem) => {
    const isGlobal = item.sucursal_id === null;
    if (isGlobal) {
      return role === 'superadmin' && scope === 'global';
    }
    return true;
  };

  async function handleToggleActive(item: MediaItem) {
    if (!canEditItem(item)) return;
    setBusyId(item.id);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('media_items')
      .update({ activo: !item.activo })
      .eq('id', item.id)
      .select('*')
      .single();

    if (!error && data) {
      onItemsChanged(items.map((i) => (i.id === item.id ? (data as MediaItem) : i)));
    }
    setBusyId(null);
  }

  async function handleDurationChange(item: MediaItem, duracionSeg: number) {
    if (!canEditItem(item)) return;
    const clamped = Math.max(2, Math.min(600, duracionSeg));
    const supabase = createClient();
    const { data, error } = await supabase
      .from('media_items')
      .update({ duracion_seg: clamped })
      .eq('id', item.id)
      .select('*')
      .single();

    if (!error && data) {
      onItemsChanged(items.map((i) => (i.id === item.id ? (data as MediaItem) : i)));
    }
  }

  async function handleScheduleSave(
    item: MediaItem,
    fechaInicioLocal: string,
    fechaFinLocal: string
  ) {
    if (!canEditItem(item)) return;
    setBusyId(item.id);
    const supabase = createClient();
    const { data, error } = await supabase
      .from('media_items')
      .update({
        fecha_inicio: fechaInicioLocal ? new Date(fechaInicioLocal).toISOString() : null,
        fecha_fin: fechaFinLocal ? new Date(fechaFinLocal).toISOString() : null,
      })
      .eq('id', item.id)
      .select('*')
      .single();

    if (!error && data) {
      onItemsChanged(items.map((i) => (i.id === item.id ? (data as MediaItem) : i)));
      setEditingScheduleId(null);
    }
    setBusyId(null);
  }

  async function handleDelete(item: MediaItem) {
    if (!canEditItem(item)) return;
    if (!confirm(`¿Eliminar "${item.titulo}" de la playlist?`)) return;

    setBusyId(item.id);
    const supabase = createClient();
    const { error } = await supabase.from('media_items').delete().eq('id', item.id);

    if (!error) {
      // Intentar limpiar archivo de Storage (best-effort)
      const extractStoragePath = (publicUrl: string | null) => {
        if (!publicUrl) return null;
        const marker = '/storage/v1/object/public/signage-media/';
        const idx = publicUrl.indexOf(marker);
        return idx >= 0 ? publicUrl.slice(idx + marker.length) : null;
      };
      const paths = [
        extractStoragePath(item.url_archivo),
        extractStoragePath(item.url_miniatura),
      ].filter((p): p is string => Boolean(p));

      if (paths.length > 0) {
        await supabase.storage.from('signage-media').remove(paths);
      }

      onItemsChanged(items.filter((i) => i.id !== item.id));
      window.dispatchEvent(new Event('storage-updated'));
    }
    setBusyId(null);
  }

  async function persistOrder(reorderedEditable: MediaItem[]) {
    const supabase = createClient();
    await Promise.all(
      reorderedEditable.map((item, idx) =>
        supabase.from('media_items').update({ orden: idx }).eq('id', item.id)
      )
    );
  }

  async function moveItem(item: MediaItem, direction: -1 | 1) {
    if (!canEditItem(item)) return;
    const editableItems = items.filter((i) => canEditItem(i));
    const fixedItems = items.filter((i) => !canEditItem(i));

    const idx = editableItems.findIndex((i) => i.id === item.id);
    const targetIdx = idx + direction;
    if (idx < 0 || targetIdx < 0 || targetIdx >= editableItems.length) return;

    const nextEditable = [...editableItems];
    const [moved] = nextEditable.splice(idx, 1);
    nextEditable.splice(targetIdx, 0, moved);

    const updatedEditable = nextEditable.map((it, i) => ({ ...it, orden: i }));
    onItemsChanged(
      scope === 'global' ? updatedEditable : [...fixedItems, ...updatedEditable]
    );
    await persistOrder(updatedEditable);
  }

  async function handleDropReorder(targetItem: MediaItem) {
    if (!draggedId || draggedId === targetItem.id) return;
    const draggedItem = items.find((i) => i.id === draggedId);
    if (!draggedItem || !canEditItem(draggedItem) || !canEditItem(targetItem)) {
      setDraggedId(null);
      return;
    }

    const editableItems = items.filter((i) => canEditItem(i));
    const fixedItems = items.filter((i) => !canEditItem(i));

    const fromIdx = editableItems.findIndex((i) => i.id === draggedId);
    const toIdx = editableItems.findIndex((i) => i.id === targetItem.id);
    if (fromIdx < 0 || toIdx < 0) return;

    const nextEditable = [...editableItems];
    const [moved] = nextEditable.splice(fromIdx, 1);
    nextEditable.splice(toIdx, 0, moved);

    const updatedEditable = nextEditable.map((it, i) => ({ ...it, orden: i }));
    onItemsChanged(
      scope === 'global' ? updatedEditable : [...fixedItems, ...updatedEditable]
    );
    setDraggedId(null);
    await persistOrder(updatedEditable);
  }

  if (items.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-10 text-center text-slate-400 text-sm">
        No hay contenido cargado todavía en esta playlist. Sube una imagen o video arriba.
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {items.map((item) => {
        const isGlobal = item.sucursal_id === null;
        const editable = canEditItem(item);
        const screenName = item.pantalla_id
          ? pantallas.find((p) => p.id === item.pantalla_id)?.nombre || 'TV específica'
          : 'Todas las TV';
        const isEditingSchedule = editingScheduleId === item.id;

        return (
          <div
            key={item.id}
            draggable={editable}
            onDragStart={() => editable && setDraggedId(item.id)}
            onDragOver={(e) => {
              if (editable && draggedId) e.preventDefault();
            }}
            onDrop={() => handleDropReorder(item)}
            className={`rounded-2xl border p-3.5 transition-colors ${
              isGlobal
                ? 'bg-amber-950/15 border-amber-500/30'
                : item.activo
                ? 'bg-slate-900 border-slate-800'
                : 'bg-slate-900/50 border-slate-800/60 opacity-65'
            }`}
          >
            <div className="flex flex-wrap items-center gap-3">
              {editable ? (
                <div className="text-slate-500 cursor-grab active:cursor-grabbing">
                  <GripVertical className="w-4 h-4" />
                </div>
              ) : (
                <div className="text-amber-400/80" title="Contenido Global de Casa Central">
                  <Lock className="w-4 h-4" />
                </div>
              )}

              {/* Miniatura */}
              <div className="w-20 h-12 rounded-lg bg-slate-950 border border-slate-800 overflow-hidden shrink-0 flex items-center justify-center">
                {item.url_miniatura ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url_miniatura}
                    alt={item.titulo}
                    className="w-full h-full object-cover"
                  />
                ) : item.tipo === 'video' ? (
                  <Film className="w-5 h-5 text-slate-500" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-slate-500" />
                )}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-[200px]">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm text-white">{item.titulo}</span>

                  {isGlobal ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
                      <Globe className="w-3 h-3" />
                      Global (Casa Central)
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                      Local · {screenName}
                    </span>
                  )}

                  <span className="text-[11px] uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {item.tipo === 'video' ? 'Video MP4' : 'Imagen WebP'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-slate-400">
                  {item.tipo === 'image' && (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {editable ? (
                        <input
                          type="number"
                          min={2}
                          max={600}
                          defaultValue={item.duracion_seg}
                          onBlur={(e) =>
                            handleDurationChange(item, Number(e.target.value) || 10)
                          }
                          className="w-14 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-700 text-white text-xs"
                        />
                      ) : (
                        item.duracion_seg
                      )}
                      seg
                    </span>
                  )}

                  {(item.fecha_inicio || item.fecha_fin) && (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <Calendar className="w-3.5 h-3.5" />
                      {item.fecha_inicio
                        ? new Date(item.fecha_inicio).toLocaleDateString('es-AR')
                        : 'Siempre'}{' '}
                      →{' '}
                      {item.fecha_fin
                        ? new Date(item.fecha_fin).toLocaleDateString('es-AR')
                        : 'Sin fin'}
                    </span>
                  )}
                </div>
              </div>

              {/* Acciones */}
              {editable ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveItem(item, -1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                    title="Subir"
                  >
                    <ArrowUp className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveItem(item, 1)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                    title="Bajar"
                  >
                    <ArrowDown className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingScheduleId(isEditingSchedule ? null : item.id)
                    }
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      isEditingSchedule
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                    title="Programar fechas"
                  >
                    <Calendar className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => handleToggleActive(item)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                      item.activo
                        ? 'text-emerald-400 hover:bg-emerald-500/10'
                        : 'text-amber-400 hover:bg-amber-500/10'
                    }`}
                    title={item.activo ? 'Pausar ítem' : 'Activar ítem'}
                  >
                    {item.activo ? (
                      <Pause className="w-4 h-4" />
                    ) : (
                      <Play className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => handleDelete(item)}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                    title="Eliminar"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <span className="text-xs text-amber-300/80 px-2">
                  Solo Casa Central
                </span>
              )}
            </div>

            {isEditingSchedule && editable && (
              <ScheduleEditor
                initialStart={toDatetimeLocal(item.fecha_inicio)}
                initialEnd={toDatetimeLocal(item.fecha_fin)}
                onCancel={() => setEditingScheduleId(null)}
                onSave={(s, e) => handleScheduleSave(item, s, e)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleEditor({
  initialStart,
  initialEnd,
  onSave,
  onCancel,
}: {
  initialStart: string;
  initialEnd: string;
  onSave: (start: string, end: string) => void;
  onCancel: () => void;
}) {
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);

  return (
    <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap items-end gap-3">
      <div>
        <label className="block text-[11px] text-slate-400 mb-1">Desde</label>
        <input
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
        />
      </div>
      <div>
        <label className="block text-[11px] text-slate-400 mb-1">Hasta</label>
        <input
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
          className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
        />
      </div>
      <button
        type="button"
        onClick={() => onSave(start, end)}
        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium cursor-pointer"
      >
        Guardar vigencia
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white text-xs cursor-pointer"
      >
        Cancelar
      </button>
    </div>
  );
}
