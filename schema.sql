-- GOJO TECH · esquema de Supabase. Pégalo completo en SQL Editor y ejecútalo.
create extension if not exists pgcrypto;

-- ADMINISTRADORES (tabla sin policies: nadie la lee desde la API) ------------
create table public.admins (user_id uuid primary key references auth.users on delete cascade);
alter table public.admins enable row level security;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- PRODUCTOS -----------------------------------------------------------------
create table public.forros (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  imagen_path text not null,                      -- ruta en Supabase Storage
  precio numeric(12,2) not null check (precio >= 0),
  estado text not null default 'activo' check (estado in ('activo','inactivo')),
  created_at timestamptz not null default now()
);
create table public.pins (like public.forros including all);

-- PEDIDOS -------------------------------------------------------------------
create table public.pedidos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,                    -- lo genera el trigger
  tipo text not null check (tipo in ('Forro','Pin')),
  producto text not null,
  producto_id uuid,
  nombre text not null check (length(trim(nombre)) > 0),
  telefono text not null check (length(trim(telefono)) > 0),
  imagen_path text,
  precio numeric(12,2),
  estado text not null default 'Pendiente'
    check (estado in ('Pendiente','Pedido aceptado','Pedido rechazado','Cancelado')),
  owner_id uuid not null default auth.uid() references auth.users on delete cascade,
  created_at timestamptz not null default now()
);

-- Al CREAR: el servidor fija dueño, estado, código único y precio (el cliente no puede manipularlos)
create or replace function public.pedidos_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; c text;
begin
  new.owner_id := auth.uid(); new.estado := 'Pendiente'; new.created_at := now();
  if new.producto_id is not null then
    if new.tipo = 'Forro' then select imagen_path, precio into r from forros where id = new.producto_id and estado = 'activo';
    else select imagen_path, precio into r from pins where id = new.producto_id and estado = 'activo'; end if;
    if not found then raise exception 'Producto no disponible'; end if;
    new.imagen_path := r.imagen_path; new.precio := r.precio;
  else
    new.precio := null;
    if new.imagen_path is not null and new.imagen_path not like 'pedidos/' || auth.uid()::text || '/%' then
      raise exception 'Imagen no permitida'; end if;
  end if;
  loop
    c := 'GT-' || upper(substr(encode(gen_random_bytes(5), 'hex'), 1, 8));
    exit when not exists (select 1 from pedidos where codigo = c);
  end loop;
  new.codigo := c; return new;
end $$;
create trigger pedidos_bi before insert on public.pedidos for each row execute function public.pedidos_before_insert();

-- Al ACTUALIZAR: campos protegidos + reglas por rol
create or replace function public.pedidos_before_update() returns trigger
language plpgsql as $$
begin
  if new.id <> old.id or new.codigo <> old.codigo or new.tipo <> old.tipo or new.producto <> old.producto
     or new.producto_id is distinct from old.producto_id or new.precio is distinct from old.precio
     or new.owner_id <> old.owner_id or new.created_at <> old.created_at then
    raise exception 'Campos protegidos'; end if;
  if public.is_admin() then
    if old.estado = 'Cancelado' or new.estado not in ('Pendiente','Pedido aceptado','Pedido rechazado')
       or new.nombre <> old.nombre or new.telefono <> old.telefono or new.imagen_path is distinct from old.imagen_path then
      raise exception 'Cambio no permitido para el administrador'; end if;
  else
    if old.estado <> 'Pendiente' then raise exception 'Solo se puede modificar mientras está pendiente'; end if;
    if new.estado not in ('Pendiente','Cancelado') then raise exception 'Estado no permitido'; end if;
    if new.imagen_path is distinct from old.imagen_path
       and (old.producto_id is not null or new.imagen_path not like 'pedidos/' || auth.uid()::text || '/%') then
      raise exception 'Imagen no permitida'; end if;
  end if;
  return new;
end $$;
create trigger pedidos_bu before update on public.pedidos for each row execute function public.pedidos_before_update();

-- ROW LEVEL SECURITY --------------------------------------------------------
-- Productos: todos leen los activos; SOLO administradores crean, editan y borran.
do $$ declare t text; begin foreach t in array array['forros','pins'] loop
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy %I on public.%I for select to anon, authenticated using (estado = ''activo'' or public.is_admin())', t||'_select', t);
  execute format('create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t||'_admin', t);
end loop; end $$;

-- Pedidos: cada usuario ve/crea/modifica SOLO los suyos; el admin ve y gestiona todos. Nadie puede borrar (sin policy DELETE).
alter table public.pedidos enable row level security;
create policy pedidos_select on public.pedidos for select to authenticated using (owner_id = auth.uid() or public.is_admin());
create policy pedidos_insert on public.pedidos for insert to authenticated with check (owner_id = auth.uid());
create policy pedidos_update on public.pedidos for update to authenticated
  using (owner_id = auth.uid() or public.is_admin()) with check (owner_id = auth.uid() or public.is_admin());

-- STORAGE -------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('gojo-images', 'gojo-images', true) on conflict (id) do nothing;
create policy gojo_read on storage.objects for select using (bucket_id = 'gojo-images');
create policy gojo_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'gojo-images' and (
    name like 'pedidos/' || auth.uid()::text || '/%'          -- cada usuario sube solo a su carpeta
    or (name like 'productos/%' and public.is_admin())));      -- solo admin sube productos
create policy gojo_delete on storage.objects for delete to authenticated using (bucket_id = 'gojo-images' and public.is_admin());

-- TIEMPO REAL ---------------------------------------------------------------
alter publication supabase_realtime add table public.forros, public.pins, public.pedidos;

-- CREAR AL ADMINISTRADOR (después de crear su usuario en Authentication > Users):
-- insert into public.admins (user_id) select id from auth.users where email = 'TU-CORREO@ejemplo.com';
