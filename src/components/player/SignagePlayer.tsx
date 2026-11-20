'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  loadLocalPlaylistSnapshot,
  saveLocalPlaylistSnapshot,
  syncMediaToCacheAndGetBlobUrls,
} from '@/lib/player/offlineCache';
import {
  isMediaItemScheduledNow,
  type EstadoRed,
  type MediaItem,
  type Pantalla,
} from '@/types/database';

interface SignagePlayerProps {
  codigo: string;
}

export function SignagePlayer({ codigo }: SignagePlayerProps) {
  const cleanCode = codigo.trim().toUpperCase();

  const [screen, setScreen] = useState<Pantalla | null>(null);
  const [allItems, setAllItems] = useState<MediaItem[]>([]);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});
  const blobUrlsRef = useRef<Record<string, string>>({});
  const lastVersionRef = useRef<number>(-1);
  const [networkState, setNetworkState] = useState<EstadoRed>('online');

  // Doble buffer: capa 0 y capa 1
  const [activeLayer, setActiveLayer] = useState<0 | 1>(0);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPortraitRotated, setIsPortraitRotated] = useState(false);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const videoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([
    null,
    null,
  ]);
  const advanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ítems vigentes en el instante actual
  const activeItems = useMemo(() => {
    return allItems.filter((item) => isMediaItemScheduledNow(item, nowMs));
  }, [allItems, nowMs]);

  const currentItem =
    activeItems.length > 0 ? activeItems[currentIndex % activeItems.length] : null;
  const nextItem =
    activeItems.length > 1
      ? activeItems[(currentIndex + 1) % activeItems.length]
      : currentItem;

  // Asignación de ítem por capa para evitar recargas innecesarias
  const layer0Item = activeLayer === 0 ? currentItem : nextItem;
  const layer1Item = activeLayer === 1 ? currentItem : nextItem;

  // Detectar si el TV Box está en landscape pero la pantalla configurada es vertical
  useEffect(() => {
    function checkOrientation() {
      if (screen?.orientacion === 'vertical') {
        setIsPortraitRotated(window.innerWidth > window.innerHeight);
      } else {
        setIsPortraitRotated(false);
      }
    }
    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    return () => window.removeEventListener('resize', checkOrientation);
  }, [screen?.orientacion]);

  const sendTelemetry = useCallback(
    async (item: MediaItem | null, net: EstadoRed) => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      try {
        const supabase = createClient();
        await supabase.rpc('send_screen_telemetry', {
          p_codigo: cleanCode,
          p_titulo: item?.titulo ?? null,
          p_miniatura: item?.url_miniatura ?? null,
          p_estado_red: net,
        });
      } catch {
        // Telemetría silenciosa: nunca interrumpir reproducción
      }
    },
    [cleanCode]
  );

  const syncPlaylist = useCallback(async () => {
    try {
      const supabase = createClient();

      // Registrar o recuperar pantalla
      const { data: regScreen } = await supabase.rpc('register_or_get_screen', {
        p_codigo: cleanCode,
      });

      if (regScreen) {
        setScreen(regScreen as Pantalla);
      }

      const { data: payload, error } = await supabase.rpc('get_screen_playlist', {
        p_codigo: cleanCode,
      });

      if (error || !payload) {
        throw new Error(error?.message || 'Sin respuesta de playlist');
      }

      const remoteScreen = payload.screen as Pantalla;
      const remoteItems = (payload.items as MediaItem[]) || [];

      if (
        lastVersionRef.current !== remoteScreen.version_playlist ||
        Object.keys(blobUrlsRef.current).length === 0
      ) {
        setScreen(remoteScreen);
        setAllItems(remoteItems);
        saveLocalPlaylistSnapshot(cleanCode, remoteScreen, remoteItems);

        const { blobUrls: nextMap, usedOfflineFallback } =
          await syncMediaToCacheAndGetBlobUrls(remoteItems, blobUrlsRef.current);
        blobUrlsRef.current = nextMap;
        setBlobUrls(nextMap);
        lastVersionRef.current = remoteScreen.version_playlist;
        setNetworkState(usedOfflineFallback ? 'offline_cache' : 'online');
      } else {
        setNetworkState('online');
      }
    } catch {
      // Corte de internet o fallo de red: usar snapshot local + Cache API
      setNetworkState('offline_cache');
      const snapshot = loadLocalPlaylistSnapshot(cleanCode);
      if (snapshot) {
        setScreen(snapshot.screen);
        setAllItems(snapshot.items);
        const { blobUrls: cachedMap } = await syncMediaToCacheAndGetBlobUrls(
          snapshot.items,
          blobUrlsRef.current
        );
        blobUrlsRef.current = cachedMap;
        setBlobUrls(cachedMap);
      }
    }
  }, [cleanCode]);

  // Carga inicial + Realtime + Polling cada 30s
  useEffect(() => {
    const initTimer = setTimeout(() => {
      void syncPlaylist();
    }, 0);

    const supabase = createClient();
    const channel = supabase
      .channel(`player-${cleanCode}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'pantallas',
          filter: `codigo_vinculacion=eq.${cleanCode}`,
        },
        () => {
          void syncPlaylist();
        }
      )
      .subscribe();

    const pollInterval = setInterval(() => {
      setNowMs(Date.now());
      void syncPlaylist();
    }, 30000);

    const handleOnline = () => void syncPlaylist();
    const handleOffline = () => setNetworkState('offline_cache');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearTimeout(initTimer);
      clearInterval(pollInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      supabase.removeChannel(channel);
    };
  }, [cleanCode, syncPlaylist]);

  // Si no está vinculada, hacer polling rápido cada 5s para vinculación instantánea
  useEffect(() => {
    if (screen && screen.sucursal_id !== null) return;
    const fastPoll = setInterval(() => {
      syncPlaylist();
    }, 5000);
    return () => clearInterval(fastPoll);
  }, [screen, syncPlaylist]);

  const advanceToNext = useCallback(() => {
    if (activeItems.length <= 1) return;
    setCurrentIndex((prev) => (prev + 1) % activeItems.length);
    setActiveLayer((prev) => (prev === 0 ? 1 : 0));
  }, [activeItems.length]);

  const playbackKey = currentItem
    ? `${currentItem.id}:${currentIndex}:${activeLayer}`
    : null;
  const itemTipo = currentItem?.tipo ?? null;
  const itemDuracion = currentItem?.duracion_seg ?? 10;

  // Telemetría al cambiar de ítem
  useEffect(() => {
    if (!currentItem || !screen?.sucursal_id) return;
    sendTelemetry(currentItem, networkState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentItem?.id, networkState, screen?.sucursal_id]);

  // Control de reproducción del ítem actual (imágenes por timer, videos por onEnded + fallback)
  useEffect(() => {
    if (advanceTimerRef.current) {
      clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = null;
    }

    if (!playbackKey || !itemTipo) return;

    if (itemTipo === 'video') {
      const activeVideo = videoRefs.current[activeLayer];
      const preloadVideo = videoRefs.current[activeLayer === 0 ? 1 : 0];

      if (preloadVideo) {
        preloadVideo.pause();
        preloadVideo.currentTime = 0;
      }

      if (activeVideo) {
        activeVideo.currentTime = 0;
        activeVideo.play().catch(() => {
          // Si el navegador bloquea o falla el codec, avanzar tras breve espera
          advanceTimerRef.current = setTimeout(() => {
            advanceToNext();
          }, 2000);
        });
      }

      // Fallback de seguridad por si un video queda colgado (máx 10 min)
      advanceTimerRef.current = setTimeout(() => {
        advanceToNext();
      }, 10 * 60 * 1000);
    } else {
      const durationMs = Math.max(2, itemDuracion) * 1000;
      advanceTimerRef.current = setTimeout(() => {
        advanceToNext();
      }, durationMs);
    }

    return () => {
      if (advanceTimerRef.current) {
        clearTimeout(advanceTimerRef.current);
      }
    };
  }, [playbackKey, activeLayer, itemTipo, itemDuracion, advanceToNext]);

  // Telemetría periódica cada 60 segundos
  useEffect(() => {
    if (!screen?.sucursal_id) return;
    const telemetryInterval = setInterval(() => {
      sendTelemetry(currentItem, networkState);
    }, 60000);
    return () => clearInterval(telemetryInterval);
  }, [screen?.sucursal_id, currentItem, networkState, sendTelemetry]);

  // Limpiar Blob URLs al desmontar
  useEffect(() => {
    return () => {
      Object.values(blobUrlsRef.current).forEach((u) => {
        if (u.startsWith('blob:')) URL.revokeObjectURL(u);
      });
    };
  }, []);

  // Pantalla sin vincular: mostrar código de 6 dígitos en grande
  if (!screen || screen.sucursal_id === null) {
    return (
      <div className="w-screen h-screen bg-black text-white flex flex-col items-center justify-center p-8 select-none cursor-none overflow-hidden">
        <div className="text-sm uppercase tracking-[0.35em] text-slate-400 mb-6">
          Vincular Pantalla
        </div>
        <div className="px-10 py-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl">
          <div className="text-6xl sm:text-8xl font-mono font-bold tracking-[0.25em] text-white pl-[0.25em]">
            {cleanCode}
          </div>
        </div>
        <p className="mt-8 text-slate-400 text-base text-center max-w-md">
          Ingresa este código de 6 caracteres en el panel administrativo de tu sucursal para
          comenzar la reproducción automática.
        </p>
      </div>
    );
  }

  // Pantalla vinculada pero sin ítems activos
  if (!currentItem) {
    return (
      <div className="w-screen h-screen bg-black text-slate-600 flex flex-col items-center justify-center select-none cursor-none overflow-hidden">
        <div className="text-sm font-mono tracking-widest uppercase">
          {screen.nombre} · Sin contenido activo
        </div>
      </div>
    );
  }

  const transitionMs = screen.transicion === 'none' ? 0 : screen.duracion_transicion_ms ?? 700;
  const fitClass = screen.ajuste_media === 'cover' ? 'object-cover' : 'object-contain';

  const renderLayer = (layerIdx: 0 | 1, item: MediaItem | null) => {
    if (!item) return null;
    const isActive = activeLayer === layerIdx;
    const src = blobUrls[item.url_archivo] || item.url_archivo;

    let transitionStyle: React.CSSProperties = {
      transitionProperty: 'opacity, transform',
      transitionDuration: `${transitionMs}ms`,
      transitionTimingFunction: 'ease-in-out',
    };

    if (screen.transicion === 'none') {
      transitionStyle = { transition: 'none' };
    }

    let stateClass = '';
    if (screen.transicion === 'slide') {
      stateClass = isActive
        ? 'opacity-100 translate-x-0 z-20'
        : 'opacity-0 translate-x-full z-10 pointer-events-none';
    } else {
      stateClass = isActive
        ? 'opacity-100 z-20'
        : 'opacity-0 z-10 pointer-events-none';
    }

    const useKenBurns =
      isActive && screen.transicion === 'zoom' && item.tipo === 'image';

    return (
      <div
        key={`layer-${layerIdx}`}
        style={transitionStyle}
        className={`signage-layer absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden ${stateClass}`}
      >
        {item.tipo === 'video' ? (
          <video
            ref={(el) => {
              videoRefs.current[layerIdx] = el;
            }}
            src={src}
            muted
            playsInline
            preload="auto"
            loop={activeItems.length === 1}
            onEnded={() => {
              if (isActive && activeItems.length > 1) {
                advanceToNext();
              }
            }}
            onError={() => {
              if (isActive && activeItems.length > 1) {
                advanceToNext();
              }
            }}
            className={`w-full h-full ${fitClass}`}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={item.titulo}
            className={`w-full h-full ${fitClass} ${
              useKenBurns ? 'animate-ken-burns' : ''
            }`}
          />
        )}
      </div>
    );
  };

  return (
    <div className="w-screen h-screen bg-black overflow-hidden select-none cursor-none relative flex items-center justify-center">
      <div
        className="relative bg-black overflow-hidden"
        style={
          isPortraitRotated
            ? {
                width: '100vh',
                height: '100vw',
                transform: 'rotate(90deg)',
                transformOrigin: 'center center',
                flexShrink: 0,
              }
            : {
                width: '100vw',
                height: '100vh',
              }
        }
      >
        {renderLayer(0, layer0Item)}
        {renderLayer(1, layer1Item)}
      </div>
    </div>
  );
}
