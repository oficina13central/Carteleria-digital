import Link from 'next/link';
import { Monitor, ShieldCheck, Tv, WifiOff, Zap } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6">
      <div className="max-w-3xl w-full space-y-8 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-medium">
          <Tv className="w-3.5 h-3.5" />
          Digital Signage Multi-Sucursal
        </div>

        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white">
          Cartelería Digital
        </h1>
        <p className="text-slate-400 text-lg max-w-xl mx-auto">
          Gestiona pantallas comerciales en todas tus sucursales con sincronización en tiempo real,
          compresión multimedia en navegador y reproducción offline resiliente en TV Box Android.
        </p>

        <div className="grid sm:grid-cols-2 gap-4 pt-4">
          <Link
            href="/login"
            className="group flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-indigo-600 hover:bg-indigo-500 transition-colors text-white shadow-lg shadow-indigo-950/50"
          >
            <ShieldCheck className="w-8 h-8" />
            <div>
              <div className="font-semibold text-lg">Panel Administrativo</div>
              <div className="text-xs text-indigo-100/80 mt-0.5">
                Super Admin (Wallboard) y Encargados de Sucursal
              </div>
            </div>
          </Link>

          <Link
            href="/play"
            className="group flex flex-col items-center justify-center gap-3 p-6 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors text-white"
          >
            <Monitor className="w-8 h-8 text-emerald-400" />
            <div>
              <div className="font-semibold text-lg">Reproductor TV Box</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Abrir pantalla completa y obtener código de vinculación
              </div>
            </div>
          </Link>
        </div>

        <div className="grid sm:grid-cols-3 gap-4 pt-6 text-left">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <Zap className="w-5 h-5 text-amber-400 mb-2" />
            <div className="font-medium text-sm text-white">Optimización en Cliente</div>
            <p className="text-xs text-slate-400 mt-1">
              Imágenes a WebP y videos estandarizados a MP4 H.264 antes de subir.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <WifiOff className="w-5 h-5 text-emerald-400 mb-2" />
            <div className="font-medium text-sm text-white">Caché Offline</div>
            <p className="text-xs text-slate-400 mt-1">
              Reproducción continua desde almacenamiento local si se corta internet.
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80">
            <Tv className="w-5 h-5 text-indigo-400 mb-2" />
            <div className="font-medium text-sm text-white">Doble Buffer Fluido</div>
            <p className="text-xs text-slate-400 mt-1">
              Transiciones CSS aceleradas por hardware sin parpadeos en negro.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
