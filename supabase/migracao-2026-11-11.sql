-- ---------------------------------------------------------------------
-- 7. MIGRAÇÃO 2026-11-11 — documentos com categorias editáveis;
--    solicitações também servem para tarefas (categoria "Tarefa") e podem
--    ser vinculadas a um entregável. Idempotente e aditiva.
-- ---------------------------------------------------------------------
create table if not exists public.categorias_documento (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique check (length(trim(nome)) > 0),
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);
insert into public.categorias_documento (nome, ordem) values
  ('Pesquisa', 1), ('Currículos', 2), ('Competição', 3), ('Entregáveis', 4),
  ('Apresentação', 5), ('Administrativo', 6), ('Outros', 7)
on conflict (nome) do nothing;

alter table public.documentos drop constraint if exists documentos_categoria_check;
update public.documentos set categoria = 'Currículos'  where categoria = 'Equipe';
update public.documentos set categoria = 'Entregáveis' where categoria = 'Entregáveis técnicos';
insert into public.categorias_documento (nome, ordem)
  select distinct categoria, 99 from public.documentos
  where categoria not in (select nome from public.categorias_documento)
on conflict (nome) do nothing;
alter table public.documentos alter column categoria set default 'Outros';
alter table public.documentos drop constraint if exists documentos_categoria_fkey;
alter table public.documentos add constraint documentos_categoria_fkey
  foreign key (categoria) references public.categorias_documento(nome) on update cascade on delete restrict;

alter table public.tickets drop constraint if exists tickets_categoria_check;
alter table public.tickets add constraint tickets_categoria_check
  check (categoria in ('Tarefa','Pesquisa','Modificação','Correção','Nova ideia'));
alter table public.tickets add column if not exists entregavel_id uuid references public.entregaveis(id) on delete set null;

alter table public.categorias_documento enable row level security;
grant select, insert, update, delete on public.categorias_documento to authenticated;
drop policy if exists catdoc_select on public.categorias_documento;
create policy catdoc_select on public.categorias_documento for select to authenticated using (public.e_membro());
drop policy if exists catdoc_insert on public.categorias_documento;
create policy catdoc_insert on public.categorias_documento for insert to authenticated with check (public.e_membro());
drop policy if exists catdoc_update on public.categorias_documento;
create policy catdoc_update on public.categorias_documento for update to authenticated using (public.pode_editar()) with check (public.pode_editar());
drop policy if exists catdoc_delete on public.categorias_documento;
create policy catdoc_delete on public.categorias_documento for delete to authenticated using (public.pode_editar());
drop trigger if exists registrar_historico on public.categorias_documento;
create trigger registrar_historico after insert or update or delete on public.categorias_documento
  for each row execute function public.registrar_historico();

