# Cartelería Digital (Digital Signage) Multi-Sucursal

Web App completa de Cartelería Digital diseñada para gestionar pantallas en múltiples sucursales comerciales utilizando TV Box Android básicos.

## Stack Tecnológico
- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, Lucide Icons.
- **Backend / DB / Storage / Realtime:** Supabase (Auth, PostgreSQL con RLS, Storage, Realtime).
- **Procesamiento Multimedia en Cliente:**
  - `browser-image-compression`: compresión de imágenes a WebP + generación de miniaturas antes de subir.
  - `@ffmpeg/ffmpeg` (`FFmpeg.wasm`): transcodificación de videos a MP4 (H.264, perfil main, 30fps, escalado a la resolución de la TV) con barra de progreso.
- **Despliegue:** Preparado para Vercel.

## Configuración Rápida

### 1. Base de datos y Storage en Supabase
1. Crea un proyecto en [Supabase](https://supabase.com).
2. Abre el **SQL Editor** y ejecuta el contenido completo de [`supabase/schema.sql`](./supabase/schema.sql).
   Esto creará:
   - Tablas `sucursales`, `usuarios_roles`, `pantallas` y `media_items`.
   - Políticas **Row Level Security (RLS)** para `superadmin` y `sucursal`.
   - Trigger `trg_media_items_bump_version` para incrementar `version_playlist` automáticamente.
   - Funciones RPC `register_or_get_screen`, `link_screen_to_branch`, `get_screen_playlist` y `send_screen_telemetry`.
   - Bucket público `signage-media` con políticas de escritura por rol/sucursal.
   - Publicación Realtime para `pantallas` y `media_items`.

3. Crea tu usuario Super Admin en **Authentication → Users** y asígnale el rol en SQL:
```sql
insert into public.usuarios_roles (user_id, rol, sucursal_id)
values ('TU-USER-UUID', 'superadmin', null);
```

4. Para crear un Encargado de Sucursal:
```sql
insert into public.usuarios_roles (user_id, rol, sucursal_id)
values ('USER-UUID-ENCARGADO', 'sucursal', 'UUID-DE-LA-SUCURSAL');
```

### 2. Variables de Entorno
Copia `.env.example` a `.env.local` y completa tus credenciales de Supabase:
```env
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-de-supabase
```

### 3. Desarrollo Local y Despliegue en Vercel
```bash
npm install
npm run dev
```
Para desplegar en Vercel, conecta el repositorio y configura las mismas variables de entorno (`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`).

## Rutas Principales
- `/login`: Inicio de sesión con redirección automática según rol.
- `/admin/monitoreo`: **Wallboard General** (exclusivo Super Admin) con estado Online / Offline Caché / Desconectada en tiempo real.
- `/admin/global`: Gestión de **Contenido Global / Institucional** (exclusivo Super Admin).
- `/admin/sucursal/[id]`: **Gestor de Sucursal y Pantallas** (vinculación por código de 6 dígitos, configuración de TV y playlist).
- `/play` y `/play/[codigo]`: **Reproductor TV Box** en pantalla completa, doble buffer, transiciones CSS por hardware y caché offline (`Cache API` + `localStorage`).
