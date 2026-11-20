-- ============================================================================
-- CARTELERÍA DIGITAL (DIGITAL SIGNAGE) - ESQUEMA SUPABASE POSTGRESQL + RLS
-- ============================================================================
-- Ejecutar este script en el SQL Editor de tu proyecto Supabase.
-- ============================================================================

-- 1. TABLAS PRINCIPALES
-- ----------------------------------------------------------------------------

create table if not exists public.sucursales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activa boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.usuarios_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('superadmin', 'sucursal')),
  sucursal_id uuid references public.sucursales(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint usuarios_roles_sucursal_check check (
    (rol = 'superadmin' and sucursal_id is null) or
    (rol = 'sucursal' and sucursal_id is not null)
  )
);

create table if not exists public.pantallas (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references public.sucursales(id) on delete cascade,
  nombre text not null default 'TV Sin Vincular',
  codigo_vinculacion text not null unique check (char_length(codigo_vinculacion) = 6),
  resolucion text not null default '1920x1080',
  orientacion text not null default 'horizontal' check (orientacion in ('horizontal', 'vertical')),
  ajuste_media text not null default 'contain' check (ajuste_media in ('contain', 'cover')),
  transicion text not null default 'fade' check (transicion in ('none', 'fade', 'slide', 'zoom')),
  duracion_transicion_ms int not null default 700 check (duracion_transicion_ms between 0 and 5000),
  ultimo_ping timestamptz,
  item_actual_titulo text,
  item_actual_miniatura text,
  estado_red text not null default 'online' check (estado_red in ('online', 'offline_cache')),
  version_playlist int not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  sucursal_id uuid references public.sucursales(id) on delete cascade,
  pantalla_id uuid references public.pantallas(id) on delete cascade,
  titulo text not null,
  tipo text not null check (tipo in ('image', 'video')),
  url_archivo text not null,
  url_miniatura text,
  duracion_seg int not null default 10 check (duracion_seg > 0),
  orden int not null default 0,
  fecha_inicio timestamptz,
  fecha_fin timestamptz,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. ÍNDICES DE RENDIMIENTO
-- ----------------------------------------------------------------------------

create index if not exists idx_usuarios_roles_sucursal
  on public.usuarios_roles(sucursal_id);

create index if not exists idx_pantallas_sucursal
  on public.pantallas(sucursal_id);

create index if not exists idx_pantallas_codigo
  on public.pantallas(codigo_vinculacion);

create index if not exists idx_media_items_sucursal_orden
  on public.media_items(sucursal_id, orden);

create index if not exists idx_media_items_pantalla
  on public.media_items(pantalla_id);

create index if not exists idx_media_items_global_orden
  on public.media_items(orden)
  where sucursal_id is null;

-- 3. TRIGGER PARA INCREMENTAR version_playlist AUTOMÁTICAMENTE
-- ----------------------------------------------------------------------------

create or replace function public.bump_playlist_version()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sucursal_id uuid;
  v_pantalla_id uuid;
begin
  if (tg_op = 'DELETE') then
    v_sucursal_id := old.sucursal_id;
    v_pantalla_id := old.pantalla_id;
  else
    v_sucursal_id := new.sucursal_id;
    v_pantalla_id := new.pantalla_id;
  end if;

  if v_sucursal_id is null then
    -- Contenido Global: actualiza todas las pantallas vinculadas
    update public.pantallas
      set version_playlist = version_playlist + 1
      where sucursal_id is not null;
  elsif v_pantalla_id is not null then
    -- Contenido específico de una pantalla
    update public.pantallas
      set version_playlist = version_playlist + 1
      where id = v_pantalla_id;
  else
    -- Contenido de toda una sucursal
    update public.pantallas
      set version_playlist = version_playlist + 1
      where sucursal_id = v_sucursal_id;
  end if;

  -- Si en un UPDATE cambió de pantalla o sucursal, también bumpear el destino anterior
  if (tg_op = 'UPDATE') and (old.sucursal_id is distinct from new.sucursal_id or old.pantalla_id is distinct from new.pantalla_id) then
    if old.sucursal_id is null then
      update public.pantallas set version_playlist = version_playlist + 1 where sucursal_id is not null;
    elsif old.pantalla_id is not null then
      update public.pantallas set version_playlist = version_playlist + 1 where id = old.pantalla_id;
    else
      update public.pantallas set version_playlist = version_playlist + 1 where sucursal_id = old.sucursal_id;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_media_items_bump_version on public.media_items;
create trigger trg_media_items_bump_version
  after insert or update or delete on public.media_items
  for each row execute function public.bump_playlist_version();

-- 4. FUNCIONES HELPER PARA RLS
-- ----------------------------------------------------------------------------

create or replace function public.is_superadmin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios_roles
    where user_id = auth.uid()
      and rol = 'superadmin'
  );
$$;

create or replace function public.get_my_sucursal_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sucursal_id
  from public.usuarios_roles
  where user_id = auth.uid()
    and rol = 'sucursal'
  limit 1;
$$;

-- 5. POLÍTICAS ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

alter table public.sucursales enable row level security;
alter table public.usuarios_roles enable row level security;
alter table public.pantallas enable row level security;
alter table public.media_items enable row level security;

-- SUCURSALES
drop policy if exists "sucursales_superadmin_all" on public.sucursales;
create policy "sucursales_superadmin_all" on public.sucursales
  for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "sucursales_branch_select" on public.sucursales;
create policy "sucursales_branch_select" on public.sucursales
  for select
  to authenticated
  using (id = public.get_my_sucursal_id());

-- USUARIOS_ROLES
drop policy if exists "usuarios_roles_superadmin_all" on public.usuarios_roles;
create policy "usuarios_roles_superadmin_all" on public.usuarios_roles
  for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "usuarios_roles_self_select" on public.usuarios_roles;
create policy "usuarios_roles_self_select" on public.usuarios_roles
  for select
  to authenticated
  using (user_id = auth.uid());

-- PANTALLAS
drop policy if exists "pantallas_superadmin_all" on public.pantallas;
create policy "pantallas_superadmin_all" on public.pantallas
  for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

drop policy if exists "pantallas_branch_all" on public.pantallas;
create policy "pantallas_branch_all" on public.pantallas
  for all
  to authenticated
  using (sucursal_id = public.get_my_sucursal_id())
  with check (sucursal_id = public.get_my_sucursal_id());

-- MEDIA_ITEMS
drop policy if exists "media_items_superadmin_all" on public.media_items;
create policy "media_items_superadmin_all" on public.media_items
  for all
  to authenticated
  using (public.is_superadmin())
  with check (public.is_superadmin());

-- Encargado de sucursal: ve ítems Globales (sucursal_id is null) + los de su sucursal
drop policy if exists "media_items_branch_select" on public.media_items;
create policy "media_items_branch_select" on public.media_items
  for select
  to authenticated
  using (
    sucursal_id is null
    or sucursal_id = public.get_my_sucursal_id()
  );

-- Encargado de sucursal: solo puede crear/editar/borrar ítems locales de su sucursal
drop policy if exists "media_items_branch_insert" on public.media_items;
create policy "media_items_branch_insert" on public.media_items
  for insert
  to authenticated
  with check (
    sucursal_id is not null
    and sucursal_id = public.get_my_sucursal_id()
  );

drop policy if exists "media_items_branch_update" on public.media_items;
create policy "media_items_branch_update" on public.media_items
  for update
  to authenticated
  using (
    sucursal_id is not null
    and sucursal_id = public.get_my_sucursal_id()
  )
  with check (
    sucursal_id is not null
    and sucursal_id = public.get_my_sucursal_id()
  );

drop policy if exists "media_items_branch_delete" on public.media_items;
create policy "media_items_branch_delete" on public.media_items
  for delete
  to authenticated
  using (
    sucursal_id is not null
    and sucursal_id = public.get_my_sucursal_id()
  );

-- 6. FUNCIONES RPC PARA REPRODUCTOR TV BOX Y VINCULACIÓN
-- ----------------------------------------------------------------------------

-- Registra o recupera una pantalla por su código de 6 dígitos (para TV Box sin login)
create or replace function public.register_or_get_screen(p_codigo text)
returns public.pantallas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_codigo));
  v_screen public.pantallas;
begin
  if char_length(v_code) <> 6 then
    raise exception 'El código de vinculación debe tener 6 caracteres';
  end if;

  select * into v_screen
  from public.pantallas
  where codigo_vinculacion = v_code;

  if not found then
    insert into public.pantallas (codigo_vinculacion, nombre)
    values (v_code, 'TV ' || v_code)
    returning * into v_screen;
  end if;

  return v_screen;
end;
$$;

-- Vincula una pantalla (por su código de 6 dígitos) a una sucursal desde el panel Admin
create or replace function public.link_screen_to_branch(
  p_codigo text,
  p_sucursal_id uuid,
  p_nombre text default 'TV Principal',
  p_resolucion text default '1920x1080',
  p_orientacion text default 'horizontal',
  p_ajuste_media text default 'contain',
  p_transicion text default 'fade',
  p_duracion_transicion_ms int default 700
)
returns public.pantallas
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_codigo));
  v_screen public.pantallas;
begin
  if not (public.is_superadmin() or public.get_my_sucursal_id() = p_sucursal_id) then
    raise exception 'No tienes permisos para vincular pantallas a esta sucursal';
  end if;

  if char_length(v_code) <> 6 then
    raise exception 'El código de vinculación debe tener 6 caracteres';
  end if;

  insert into public.pantallas (
    codigo_vinculacion,
    sucursal_id,
    nombre,
    resolucion,
    orientacion,
    ajuste_media,
    transicion,
    duracion_transicion_ms,
    version_playlist
  )
  values (
    v_code,
    p_sucursal_id,
    coalesce(nullif(trim(p_nombre), ''), 'TV ' || v_code),
    p_resolucion,
    p_orientacion,
    p_ajuste_media,
    p_transicion,
    p_duracion_transicion_ms,
    1
  )
  on conflict (codigo_vinculacion) do update set
    sucursal_id = excluded.sucursal_id,
    nombre = excluded.nombre,
    resolucion = excluded.resolucion,
    orientacion = excluded.orientacion,
    ajuste_media = excluded.ajuste_media,
    transicion = excluded.transicion,
    duracion_transicion_ms = excluded.duracion_transicion_ms,
    version_playlist = public.pantallas.version_playlist + 1
  returning * into v_screen;

  return v_screen;
end;
$$;

-- Obtiene la configuración de la pantalla y su playlist (Global + Local)
create or replace function public.get_screen_playlist(p_codigo text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_codigo));
  v_screen public.pantallas;
  v_items jsonb;
begin
  select * into v_screen
  from public.pantallas
  where codigo_vinculacion = v_code;

  if not found then
    return null;
  end if;

  if v_screen.sucursal_id is null then
    return jsonb_build_object(
      'screen', to_jsonb(v_screen),
      'items', '[]'::jsonb
    );
  end if;

  select coalesce(jsonb_agg(to_jsonb(m) order by (m.sucursal_id is not null) asc, m.orden asc, m.created_at asc), '[]'::jsonb)
  into v_items
  from public.media_items m
  where m.activo = true
    and (
      m.sucursal_id is null
      or (
        m.sucursal_id = v_screen.sucursal_id
        and (m.pantalla_id is null or m.pantalla_id = v_screen.id)
      )
    );

  return jsonb_build_object(
    'screen', to_jsonb(v_screen),
    'items', v_items
  );
end;
$$;

-- Envía telemetría silenciosa desde el TV Box
create or replace function public.send_screen_telemetry(
  p_codigo text,
  p_titulo text,
  p_miniatura text,
  p_estado_red text default 'online'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(p_codigo));
begin
  update public.pantallas
  set
    ultimo_ping = now(),
    item_actual_titulo = p_titulo,
    item_actual_miniatura = p_miniatura,
    estado_red = case when p_estado_red in ('online', 'offline_cache') then p_estado_red else 'online' end
  where codigo_vinculacion = v_code;
end;
$$;

grant execute on function public.register_or_get_screen(text) to anon, authenticated;
grant execute on function public.get_screen_playlist(text) to anon, authenticated;
grant execute on function public.send_screen_telemetry(text, text, text, text) to anon, authenticated;
grant execute on function public.link_screen_to_branch(text, uuid, text, text, text, text, text, int) to authenticated;

-- 7. SUPABASE STORAGE (BUCKET Y POLÍTICAS)
-- ----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'signage-media',
  'signage-media',
  true,
  104857600, -- 100 MB máximo por archivo
  array['image/webp', 'image/jpeg', 'image/png', 'video/mp4']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 104857600;

-- Lectura pública (necesaria para descarga y caché en TV Box)
drop policy if exists "signage_media_public_read" on storage.objects;
create policy "signage_media_public_read" on storage.objects
  for select
  to public
  using (bucket_id = 'signage-media');

-- Superadmin puede subir, actualizar y borrar cualquier archivo
drop policy if exists "signage_media_superadmin_write" on storage.objects;
create policy "signage_media_superadmin_write" on storage.objects
  for all
  to authenticated
  using (bucket_id = 'signage-media' and public.is_superadmin())
  with check (bucket_id = 'signage-media' and public.is_superadmin());

-- Encargado de sucursal solo puede escribir/borrar en su carpeta: sucursales/<sucursal_id>/...
drop policy if exists "signage_media_branch_insert" on storage.objects;
create policy "signage_media_branch_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'signage-media'
    and (storage.foldername(name))[1] = 'sucursales'
    and (storage.foldername(name))[2] = public.get_my_sucursal_id()::text
  );

drop policy if exists "signage_media_branch_delete" on storage.objects;
create policy "signage_media_branch_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'signage-media'
    and (storage.foldername(name))[1] = 'sucursales'
    and (storage.foldername(name))[2] = public.get_my_sucursal_id()::text
  );

-- 8. REALTIME
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pantallas'
  ) then
    alter publication supabase_realtime add table public.pantallas;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'media_items'
  ) then
    alter publication supabase_realtime add table public.media_items;
  end if;
end $$;
