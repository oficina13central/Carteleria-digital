'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Check,
  ExternalLink,
  Monitor,
  Plus,
  Save,
  Settings2,
  Trash2,
  Tv,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  getScreenHealth,
  type AjusteMedia,
  type MediaItem,
  type Orientacion,
  type Pantalla,
  type Sucursal,
  type Transicion,
  type UserRoleType,
} from '@/types/database';
import { MediaUploader } from './MediaUploader';
import { PlaylistManager } from './PlaylistManager';

interface BranchManagerClientProps {
  sucursal: Sucursal;
  initialPantallas: Pantalla[];
  initialMediaItems: MediaItem[];
  role: UserRoleType;
  initialSelectedPantallaId?: string;
}

const RESOLUTIONS = [
  '1920x1080',
  '1366x768',
  '1280x720',
  '3840x2160',
  '1080x1920',
  '720x1280',
];

export function BranchManagerClient({
  sucursal,
  initialPantallas,
  initialMediaItems,
  role,
  initialSelectedPantallaId,
}: BranchManagerClientProps) {
  const [pantallas, setPantallas] = useState<Pantalla[]>(initialPantallas);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>(initialMediaItems);
  const [selectedPantallaId, setSelectedPantallaId] = useState<string>(
    initialSelectedPantallaId || 'all'
  );

  // Modal vincular pantalla
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const [linkName, setLinkName] = useState('TV Mostrador');
  const [linkRes, setLinkRes] = useState('1920x1080');
  const [linkOrient, setLinkOrient] = useState<Orientacion>('horizontal');
  const [linkFit, setLinkFit] = useState<AjusteMedia>('contain');
  const [linkTrans, setLinkTrans] = useState<Transicion>('fade');
  const linkTransMs = 700;
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  // Configuración de TV seleccionada
  const selectedPantalla = useMemo(
    () => pantallas.find((p) => p.id === selectedPantallaId) || null,
    [pantallas, selectedPantallaId]
  );

  const [savingConfig, setSavingConfig] = useState(false);
  const [savedConfigOk, setSavedConfigOk] = useState(false);

  const visiblePlaylistItems = useMemo(() => {
    return mediaItems.filter((item) => {
      if (item.sucursal_id === null) return true; // Global siempre visible
      if (selectedPantallaId === 'all') return true;
      return item.pantalla_id === null || item.pantalla_id === selectedPantallaId;
    });
  }, [mediaItems, selectedPantallaId]);

  async function handleLinkScreen(e: React.FormEvent) {
    e.preventDefault();
    const cleanCode = linkCode.trim().toUpperCase();
    if (cleanCode.length !== 6) {
      setLinkError('El código debe tener exactamente 6 caracteres.');
      return;
    }

    setLinking(true);
    setLinkError(null);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('link_screen_to_branch', {
      p_codigo: cleanCode,
      p_sucursal_id: sucursal.id,
      p_nombre: linkName.trim() || `TV ${cleanCode}`,
      p_resolucion: linkRes,
      p_orientacion: linkOrient,
      p_ajuste_media: linkFit,
      p_transicion: linkTrans,
      p_duracion_transicion_ms: linkTransMs,
    });

    if (error) {
      setLinkError(error.message);
      setLinking(false);
      return;
    }

    const linked = data as Pantalla;
    setPantallas((prev) => {
      const exists = prev.some((p) => p.id === linked.id);
      return exists ? prev.map((p) => (p.id === linked.id ? linked : p)) : [...prev, linked];
    });
    setSelectedPantallaId(linked.id);
    setLinkCode('');
    setShowLinkModal(false);
    setLinking(false);
  }

  async function handleSaveScreenConfig(updated: Pantalla) {
    setSavingConfig(true);
    setSavedConfigOk(false);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('pantallas')
      .update({
        nombre: updated.nombre,
        resolucion: updated.resolucion,
        orientacion: updated.orientacion,
        ajuste_media: updated.ajuste_media,
        transicion: updated.transicion,
        duracion_transicion_ms: updated.duracion_transicion_ms,
        version_playlist: updated.version_playlist + 1,
      })
      .eq('id', updated.id)
      .select('*')
      .single();

    if (!error && data) {
      setPantallas((prev) => prev.map((p) => (p.id === updated.id ? (data as Pantalla) : p)));
      setSavedConfigOk(true);
      setTimeout(() => setSavedConfigOk(false), 2500);
    }
    setSavingConfig(false);
  }

  async function handleDeleteScreen(screen: Pantalla) {
    if (!confirm(`¿Desvincular y eliminar "${screen.nombre}" (${screen.codigo_vinculacion})?`)) {
      return;
    }
    const supabase = createClient();
    const { error } = await supabase.from('pantallas').delete().eq('id', screen.id);
    if (!error) {
      setPantallas((prev) => prev.filter((p) => p.id !== screen.id));
      if (selectedPantallaId === screen.id) setSelectedPantallaId('all');
    }
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">{sucursal.nombre}</h1>
          <p className="text-sm text-slate-400">
            Administra las pantallas vinculadas y la playlist de contenido local.
          </p>
        </div>

        <button
          onClick={() => setShowLinkModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Vincular Pantalla (Código 6 dígitos)
        </button>
      </div>

      {/* Selector de Pantallas */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedPantallaId('all')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
            selectedPantallaId === 'all'
              ? 'bg-indigo-600 border-indigo-500 text-white'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Monitor className="w-4 h-4" />
          Todas las TV ({pantallas.length})
        </button>

        {pantallas.map((tv) => {
          const health = getScreenHealth(tv);
          const dotColor =
            health === 'online'
              ? 'bg-emerald-400'
              : health === 'offline_cache'
              ? 'bg-amber-400'
              : 'bg-rose-500';

          return (
            <button
              key={tv.id}
              onClick={() => setSelectedPantallaId(tv.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                selectedPantallaId === tv.id
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
              <span>{tv.nombre}</span>
              <span className="text-[11px] opacity-75 font-mono">({tv.codigo_vinculacion})</span>
            </button>
          );
        })}
      </div>

      {/* Panel de Configuración de la TV seleccionada */}
      {selectedPantalla && (
        <ScreenConfigCard
          key={selectedPantalla.id}
          screen={selectedPantalla}
          saving={savingConfig}
          savedOk={savedConfigOk}
          onSave={handleSaveScreenConfig}
          onDelete={() => handleDeleteScreen(selectedPantalla)}
        />
      )}

      {/* Subida de Media */}
      <MediaUploader
        sucursalId={sucursal.id}
        pantallas={pantallas}
        defaultPantallaId={selectedPantalla ? selectedPantalla.id : null}
        defaultResolution={selectedPantalla?.resolucion || '1920x1080'}
        nextOrder={mediaItems.filter((i) => i.sucursal_id !== null).length}
        onUploaded={(newItem) => setMediaItems((prev) => [...prev, newItem])}
      />

      {/* Playlist */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Playlist Activa ({visiblePlaylistItems.length} ítems)
          </h2>
          <span className="text-xs text-slate-500">
            Arrastra o usa las flechas para ordenar el contenido local
          </span>
        </div>

        <PlaylistManager
          items={visiblePlaylistItems}
          pantallas={pantallas}
          role={role}
          scope="branch"
          onItemsChanged={(updatedSubset) => {
            setMediaItems((prev) => {
              const subsetMap = new Map(updatedSubset.map((i) => [i.id, i]));
              const deletedIds = new Set(
                visiblePlaylistItems
                  .filter((old) => !subsetMap.has(old.id))
                  .map((old) => old.id)
              );
              const merged = prev
                .filter((p) => !deletedIds.has(p.id))
                .map((p) => subsetMap.get(p.id) || p);
              return merged.sort((a, b) => {
                if ((a.sucursal_id === null) !== (b.sucursal_id === null)) {
                  return a.sucursal_id === null ? -1 : 1;
                }
                return a.orden - b.orden;
              });
            });
          }}
        />
      </div>

      {/* Modal Vincular Pantalla */}
      {showLinkModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleLinkScreen}
            className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-2.5">
              <Tv className="w-5 h-5 text-indigo-400" />
              <h3 className="text-lg font-semibold text-white">Vincular Nueva Pantalla</h3>
            </div>
            <p className="text-xs text-slate-400">
              Abre <code className="text-indigo-300">/play</code> en el navegador del TV Box e
              ingresa el código de 6 caracteres que aparece en pantalla.
            </p>

            {linkError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                {linkError}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Código de 6 dígitos
                </label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={linkCode}
                  onChange={(e) => setLinkCode(e.target.value.toUpperCase())}
                  placeholder="EJ: A7K9P2"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono uppercase tracking-widest text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Nombre de la TV
                </label>
                <input
                  type="text"
                  required
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  placeholder="TV Mostrador"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Resolución nativa
                </label>
                <select
                  value={linkRes}
                  onChange={(e) => setLinkRes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  {RESOLUTIONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Orientación
                </label>
                <select
                  value={linkOrient}
                  onChange={(e) => setLinkOrient(e.target.value as Orientacion)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="horizontal">Horizontal (Landscape)</option>
                  <option value="vertical">Vertical (Portrait)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Ajuste de imagen/video
                </label>
                <select
                  value={linkFit}
                  onChange={(e) => setLinkFit(e.target.value as AjusteMedia)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="contain">Contain (mostrar completo)</option>
                  <option value="cover">Cover (llenar pantalla)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Transición
                </label>
                <select
                  value={linkTrans}
                  onChange={(e) => setLinkTrans(e.target.value as Transicion)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
                >
                  <option value="fade">Fade (Suave)</option>
                  <option value="slide">Slide (Deslizar)</option>
                  <option value="zoom">Zoom (Ken Burns)</option>
                  <option value="none">Sin transición</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={linking}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium cursor-pointer"
              >
                {linking ? 'Vinculando...' : 'Vincular Pantalla'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function ScreenConfigCard({
  screen,
  saving,
  savedOk,
  onSave,
  onDelete,
}: {
  screen: Pantalla;
  saving: boolean;
  savedOk: boolean;
  onSave: (updated: Pantalla) => void;
  onDelete: () => void;
}) {
  const [form, setForm] = useState<Pantalla>(screen);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Settings2 className="w-5 h-5 text-indigo-400" />
          <h3 className="text-base font-semibold text-white">
            Configuración de {screen.nombre}
          </h3>
          <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300">
            Código: {screen.codigo_vinculacion}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/play/${screen.codigo_vinculacion}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Abrir Reproductor
          </Link>
          <button
            type="button"
            onClick={onDelete}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs transition-colors cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Desvincular
          </button>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="lg:col-span-2">
          <label className="block text-xs text-slate-400 mb-1">Nombre</label>
          <input
            type="text"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Resolución</label>
          <select
            value={form.resolucion}
            onChange={(e) => setForm({ ...form, resolucion: e.target.value })}
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          >
            {RESOLUTIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Orientación</label>
          <select
            value={form.orientacion}
            onChange={(e) =>
              setForm({ ...form, orientacion: e.target.value as Orientacion })
            }
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          >
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Ajuste</label>
          <select
            value={form.ajuste_media}
            onChange={(e) =>
              setForm({ ...form, ajuste_media: e.target.value as AjusteMedia })
            }
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          >
            <option value="contain">Contain</option>
            <option value="cover">Cover</option>
          </select>
        </div>

        <div>
          <label className="block text-xs text-slate-400 mb-1">Transición</label>
          <select
            value={form.transicion}
            onChange={(e) =>
              setForm({ ...form, transicion: e.target.value as Transicion })
            }
            className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white"
          >
            <option value="fade">Fade</option>
            <option value="slide">Slide</option>
            <option value="zoom">Zoom</option>
            <option value="none">Ninguna</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span>Duración transición (ms):</span>
          <input
            type="number"
            min={0}
            max={3000}
            step={100}
            value={form.duracion_transicion_ms}
            onChange={(e) =>
              setForm({
                ...form,
                duracion_transicion_ms: Number(e.target.value) || 700,
              })
            }
            className="w-20 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-white text-xs"
          />
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={() => onSave(form)}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition-colors cursor-pointer"
        >
          {savedOk ? <Check className="w-4 h-4 text-emerald-300" /> : <Save className="w-4 h-4" />}
          {savedOk ? 'Guardado' : saving ? 'Guardando...' : 'Guardar Configuración'}
        </button>
      </div>
    </div>
  );
}
