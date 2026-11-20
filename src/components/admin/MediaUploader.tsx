'use client';

import { useRef, useState } from 'react';
import {
  CheckCircle2,
  Film,
  Image as ImageIcon,
  Loader2,
  UploadCloud,
  X,
} from 'lucide-react';
import { processAndUploadMedia } from '@/lib/media/uploadMedia';
import type { MediaItem, Pantalla } from '@/types/database';

interface MediaUploaderProps {
  sucursalId: string | null; // null = Global (Casa Central)
  pantallas?: Pantalla[];
  defaultPantallaId?: string | null;
  defaultResolution?: string;
  nextOrder: number;
  onUploaded: (item: MediaItem) => void;
}

export function MediaUploader({
  sucursalId,
  pantallas = [],
  defaultPantallaId = null,
  defaultResolution = '1920x1080',
  nextOrder,
  onUploaded,
}: MediaUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [titulo, setTitulo] = useState('');
  const [duracionSeg, setDuracionSeg] = useState(10);
  const [pantallaId, setPantallaId] = useState<string>(defaultPantallaId || '');
  const [fechaInicio, setFechaInicio] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [keepAudio, setKeepAudio] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedScreen = pantallas.find((p) => p.id === pantallaId);
  const targetResolution = selectedScreen?.resolucion || defaultResolution;

  const isVideoFile =
    selectedFile &&
    (selectedFile.type.startsWith('video/') ||
      /\.(mp4|mov|avi|webm|mkv)$/i.test(selectedFile.name));

  function handleFilePicked(file: File | undefined) {
    if (!file) return;
    setError(null);
    setSelectedFile(file);
    setTitulo(file.name.replace(/\.[^/.]+$/, ''));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    handleFilePicked(file);
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedFile) return;

    setUploading(true);
    setProgress(2);
    setStage('Preparando archivo...');
    setError(null);

    try {
      const created = await processAndUploadMedia({
        file: selectedFile,
        titulo,
        sucursalId,
        pantallaId: pantallaId || null,
        targetResolution,
        duracionSeg,
        orden: nextOrder,
        fechaInicio: fechaInicio ? new Date(fechaInicio).toISOString() : null,
        fechaFin: fechaFin ? new Date(fechaFin).toISOString() : null,
        keepAudio,
        onProgress: (percent, st) => {
          setProgress(percent);
          setStage(st);
        },
      });

      onUploaded(created);
      setSelectedFile(null);
      setTitulo('');
      setFechaInicio('');
      setFechaFin('');
      setProgress(0);
      setStage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al procesar o subir el archivo.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-white">
            {sucursalId ? 'Subir Contenido Local' : 'Subir Contenido Global (Casa Central)'}
          </h3>
          <p className="text-xs text-slate-400">
            Imágenes se comprimen a WebP y videos a MP4 H.264 ({targetResolution}) en tu navegador.
          </p>
        </div>
      </div>

      {!selectedFile ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-indigo-400 bg-indigo-500/10'
              : 'border-slate-700 hover:border-slate-500 bg-slate-950/60'
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,video/mp4,video/quicktime,video/x-msvideo,video/webm,.avi,.mov,.mp4"
            className="hidden"
            onChange={(e) => handleFilePicked(e.target.files?.[0])}
          />
          <UploadCloud className="w-10 h-10 text-indigo-400 mx-auto mb-3" />
          <p className="text-sm font-medium text-white">
            Arrastra una imagen o video aquí, o haz clic para seleccionar
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Soporta PNG, JPG, WebP, MP4, MOV, AVI · Optimización automática antes de subir
          </p>
        </div>
      ) : (
        <form onSubmit={handleUpload} className="space-y-4">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-indigo-500/15 text-indigo-400 shrink-0">
                {isVideoFile ? <Film className="w-5 h-5" /> : <ImageIcon className="w-5 h-5" />}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-medium text-white truncate">{selectedFile.name}</div>
                <div className="text-xs text-slate-400">
                  {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB ·{' '}
                  {isVideoFile ? 'Se convertirá a MP4 H.264' : 'Se comprimirá a WebP'}
                </div>
              </div>
            </div>
            {!uploading && (
              <button
                type="button"
                onClick={() => setSelectedFile(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">Título</label>
              <input
                type="text"
                required
                disabled={uploading}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {!isVideoFile ? (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Duración en pantalla (seg)
                </label>
                <input
                  type="number"
                  min={2}
                  max={300}
                  disabled={uploading}
                  value={duracionSeg}
                  onChange={(e) => setDuracionSeg(Number(e.target.value) || 10)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            ) : (
              <div className="flex items-end pb-2">
                <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={uploading}
                    checked={keepAudio}
                    onChange={(e) => setKeepAudio(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-950 text-indigo-600"
                  />
                  Conservar pista de audio (AAC)
                </label>
              </div>
            )}

            {sucursalId && pantallas.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Pantalla destino
                </label>
                <select
                  disabled={uploading}
                  value={pantallaId}
                  onChange={(e) => setPantallaId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Todas las TV de esta sucursal</option>
                  {pantallas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nombre} ({p.resolucion})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Vigencia desde (opcional)
              </label>
              <input
                type="datetime-local"
                disabled={uploading}
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Vigencia hasta (opcional)
              </label>
              <input
                type="datetime-local"
                disabled={uploading}
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {uploading && (
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-indigo-300 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {stage}
                </span>
                <span className="text-slate-300 font-mono">{progress}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={uploading}
              onClick={() => setSelectedFile(null)}
              className="px-4 py-2 rounded-xl text-sm text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={uploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-sm font-medium transition-colors cursor-pointer"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Procesando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Optimizar y Subir
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
