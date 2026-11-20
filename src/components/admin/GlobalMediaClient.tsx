'use client';

import { useState } from 'react';
import { Globe } from 'lucide-react';
import { MediaUploader } from './MediaUploader';
import { PlaylistManager } from './PlaylistManager';
import type { MediaItem } from '@/types/database';

interface GlobalMediaClientProps {
  initialItems: MediaItem[];
}

export function GlobalMediaClient({ initialItems }: GlobalMediaClientProps) {
  const [items, setItems] = useState<MediaItem[]>(initialItems);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
          <Globe className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">
            Contenido Global / Institucional (Casa Central)
          </h1>
          <p className="text-sm text-slate-400">
            Todo ítem publicado aquí se inyecta automáticamente en las playlists de todas las
            pantallas de la red y no puede ser eliminado por los encargados de sucursal.
          </p>
        </div>
      </div>

      <MediaUploader
        sucursalId={null}
        nextOrder={items.length}
        defaultResolution="1920x1080"
        onUploaded={(newItem) => setItems((prev) => [...prev, newItem])}
      />

      <div>
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider mb-3">
          Playlist Global ({items.length})
        </h2>
        <PlaylistManager
          items={items}
          role="superadmin"
          scope="global"
          onItemsChanged={setItems}
        />
      </div>
    </div>
  );
}
