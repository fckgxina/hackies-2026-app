-- =====================================================================
-- HackIES 2026 · D02 — Banco de dados da aplicação de gestão
-- Supabase (PostgreSQL) · Execute este arquivo INTEIRO no SQL Editor
-- do seu projeto Supabase (Dashboard → SQL Editor → New query → Run).
--
-- O script é idempotente: pode ser executado novamente sem apagar dados.
-- Ele cria: tabelas, regras de acesso por linha (RLS), histórico
-- automático de alterações, buckets de arquivos e dados iniciais.
--
-- Papéis:
--   membro  → consulta tudo (exceto documentos restritos), cria registros
--             e edita os que criou ou pelos quais é responsável.
--   editor  → edita e exclui registros operacionais de qualquer pessoa.
--   admin   → tudo + usuários, integrantes, orçamento, backup, exclusão
--             de tickets e documentos restritos.
-- Usuários novos entram INATIVOS: o administrador ativa cada um.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. PERFIS DE USUÁRIO E FUNÇÕES DE PERMISSÃO
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null default '',
  email       text not null default '',
  papel       text not null default 'membro' check (papel in ('admin','editor','membro')),
  ativo       boolean not null default false,
  criado_em   timestamptz not null default now()
);

create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;

create or replace function public.pode_editar() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and ativo and papel in ('admin','editor'));
$$;

create or replace function public.e_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis
                 where id = auth.uid() and ativo and papel = 'admin');
$$;

-- Cria o perfil automaticamente quando um usuário é criado no Supabase Auth.
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, coalesce(new.email, ''),
          coalesce(new.raw_user_meta_data->>'nome', split_part(coalesce(new.email,''), '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.criar_perfil();

-- Função genérica para manter "atualizado_em".
create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 2. TABELAS OPERACIONAIS
-- ---------------------------------------------------------------------
create table if not exists public.integrantes (
  id                uuid primary key default gen_random_uuid(),
  nome              text not null unique,
  ordem             int  not null default 0,
  perfil_id         uuid references public.perfis(id) on delete set null,
  participa_rateio  boolean not null default true,
  criado_em         timestamptz not null default now()
);

create table if not exists public.configuracoes (
  chave          text primary key,
  valor          jsonb,
  atualizado_em  timestamptz not null default now()
);

create table if not exists public.categorias_gasto (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null unique check (length(trim(nome)) > 0),
  ordem      int not null default 0,
  criado_em  timestamptz not null default now()
);

create table if not exists public.itens (
  id                       uuid primary key default gen_random_uuid(),
  nome                     text not null check (length(trim(nome)) > 0),
  descricao                text,
  categoria_id             uuid not null references public.categorias_gasto(id) on delete restrict,
  valor_unitario_centavos  bigint not null default 0 check (valor_unitario_centavos >= 0),
  quantidade               numeric(12,3) not null default 1 check (quantidade > 0),
  foto_path                text,
  link_compra              text,
  fornecedor               text,
  responsavel_id           uuid references public.integrantes(id) on delete set null,
  status                   text not null default 'Planejado' check (status in
                             ('Planejado','Em cotação','Aguardando compra','Comprado','Pago','Recebido','Cancelado')),
  compartilhado            boolean not null default true,
  comprado_em              date,
  pago_em                  date,
  pago_por_id              uuid references public.integrantes(id) on delete set null,
  recebido_em              date,
  observacoes              text,
  criado_por               uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now(),
  constraint item_pago_requer_dados
    check (status <> 'Pago' or (pago_em is not null and pago_por_id is not null)),
  constraint item_nao_compartilhado_requer_responsavel
    check (compartilhado or responsavel_id is not null)
);

create table if not exists public.cotacoes (
  id                       uuid primary key default gen_random_uuid(),
  item_id                  uuid not null references public.itens(id) on delete cascade,
  loja                     text not null check (length(trim(loja)) > 0),
  preco_unitario_centavos  bigint not null check (preco_unitario_centavos >= 0),
  frete_centavos           bigint check (frete_centavos >= 0),
  prazo_dias               int check (prazo_dias >= 0),
  link                     text,
  reputacao                text,
  garantia                 text,
  disponibilidade          text,
  especificacoes           text,
  observacoes              text,
  criado_por               uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em                timestamptz not null default now(),
  atualizado_em            timestamptz not null default now()
);

create table if not exists public.contribuicoes (
  id              uuid primary key default gen_random_uuid(),
  integrante_id   uuid not null references public.integrantes(id) on delete restrict,
  valor_centavos  bigint not null check (valor_centavos > 0),
  data            date not null default current_date,
  item_id         uuid references public.itens(id) on delete set null,
  observacao      text,
  criado_por      uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.entregaveis (
  id              uuid primary key default gen_random_uuid(),
  nome            text not null check (length(trim(nome)) > 0),
  etapa           text,
  descricao       text,
  prazo           date,
  responsavel_id  uuid references public.integrantes(id) on delete set null,
  status          text not null default 'Não iniciado' check (status in
                    ('Não iniciado','Em andamento','Em revisão','Concluído','Enviado')),
  observacoes     text,
  criado_por      uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.documentos (
  id                    uuid primary key default gen_random_uuid(),
  nome                  text not null check (length(trim(nome)) > 0),
  categoria             text not null default 'Outros' check (categoria in
                          ('Equipe','Competição','Entregáveis técnicos','Apresentação','Outros')),
  responsavel_id        uuid references public.integrantes(id) on delete set null,
  solicitante           text,
  data_solicitacao      date,
  prazo                 date,
  status                text not null default 'Não solicitado' check (status in
                          ('Não solicitado','Solicitado','Em preparação','Em revisão',
                           'Pronto para envio','Enviado','Aprovado','Pendente de correção')),
  versao_atual          text,
  data_envio            date,
  localizacao           text,
  observacoes           text,
  entregavel_id         uuid references public.entregaveis(id) on delete set null,
  vinculado_competicao  boolean not null default false,
  restrito              boolean not null default false,
  criado_por            uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now()
);

create table if not exists public.documento_versoes (
  id               uuid primary key default gen_random_uuid(),
  documento_id     uuid not null references public.documentos(id) on delete cascade,
  versao           text not null check (length(trim(versao)) > 0),
  arquivo_path     text,
  arquivo_nome     text,
  arquivo_tamanho  bigint,
  link             text,
  notas            text,
  criado_por       uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em        timestamptz not null default now(),
  constraint versao_tem_arquivo_ou_link check (arquivo_path is not null or link is not null)
);

create table if not exists public.tarefas (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null check (length(trim(titulo)) > 0),
  descricao       text,
  responsavel_id  uuid references public.integrantes(id) on delete set null,
  prazo           date,
  prioridade      text not null default 'Média' check (prioridade in ('Baixa','Média','Alta','Urgente')),
  status          text not null default 'A fazer' check (status in ('A fazer','Em andamento','Concluída','Bloqueada')),
  entregavel_id   uuid references public.entregaveis(id) on delete set null,
  criado_por      uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create table if not exists public.tickets (
  id                     uuid primary key default gen_random_uuid(),
  numero                 bigint generated by default as identity unique,
  titulo                 text not null check (length(trim(titulo)) > 0),
  categoria              text not null check (categoria in ('Tarefa','Pesquisa','Modificação','Correção','Nova ideia')),
  entregavel_id          uuid references public.entregaveis(id) on delete set null,
  descricao              text not null default '',
  justificativa          text,
  resultado_esperado     text,
  solicitante_id         uuid references public.integrantes(id) on delete set null,
  responsavel_id         uuid references public.integrantes(id) on delete set null,
  prioridade             text not null default 'Média' check (prioridade in ('Baixa','Média','Alta','Urgente')),
  status                 text not null default 'Nova' check (status in
                           ('Nova','Em análise','Em andamento','Concluída','Não realizada')),
  area                   text,
  prazo                  date,
  link_obsidian          text,
  decisao_ref            text,
  documento_id           uuid references public.documentos(id) on delete set null,
  observacoes            text,
  resumo_solucao         text,
  motivo_nao_realizacao  text,
  data_conclusao         date,
  criado_por             uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em              timestamptz not null default now(),
  atualizado_em          timestamptz not null default now(),
  constraint ticket_concluido_requer_resumo
    check (status <> 'Concluída' or length(trim(coalesce(resumo_solucao,''))) > 0),
  constraint ticket_nao_realizado_requer_motivo
    check (status <> 'Não realizada' or length(trim(coalesce(motivo_nao_realizacao,''))) > 0)
);

create table if not exists public.ticket_comentarios (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  texto      text not null check (length(trim(texto)) > 0),
  autor_id   uuid default auth.uid() references public.perfis(id) on delete set null,
  criado_em  timestamptz not null default now()
);

-- Histórico de alterações (preenchido somente por gatilho).
create table if not exists public.historico (
  id            bigint generated always as identity primary key,
  tabela        text not null,
  registro_id   text,
  acao          text not null check (acao in ('INSERT','UPDATE','DELETE')),
  usuario_id    uuid,
  usuario_nome  text,
  em            timestamptz not null default now(),
  dados_antes   jsonb,
  dados_depois  jsonb
);
create index if not exists historico_em_idx on public.historico (em desc);
create index if not exists historico_registro_idx on public.historico (tabela, registro_id);

-- ---------------------------------------------------------------------
-- 3. GATILHOS: atualizado_em e histórico
-- ---------------------------------------------------------------------
create or replace function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_nome text;
  v_reg  jsonb;
begin
  select nome into v_nome from public.perfis where id = auth.uid();
  v_reg := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  insert into public.historico (tabela, registro_id, acao, usuario_id, usuario_nome, dados_antes, dados_depois)
  values (tg_table_name,
          coalesce(v_reg->>'id', v_reg->>'chave'),
          tg_op,
          auth.uid(),
          v_nome,
          case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['itens','cotacoes','contribuicoes','entregaveis','documentos','tarefas','tickets','configuracoes']
  loop
    execute format('drop trigger if exists tocar_atualizado_em on public.%I', t);
    execute format('create trigger tocar_atualizado_em before update on public.%I
                    for each row execute function public.tocar_atualizado_em()', t);
  end loop;

  foreach t in array array['itens','cotacoes','contribuicoes','entregaveis','documentos','documento_versoes',
                           'tarefas','tickets','categorias_gasto','configuracoes','integrantes','perfis']
  loop
    execute format('drop trigger if exists registrar_historico on public.%I', t);
    execute format('create trigger registrar_historico after insert or update or delete on public.%I
                    for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 3b. PRIVILÉGIOS DA API
--     Necessário quando o projeto foi criado com "Automatically expose new
--     tables" desativado (recomendação do Supabase). Somente usuários
--     autenticados recebem acesso; o visitante anônimo ("anon") não recebe
--     nenhum privilégio nas tabelas. O que cada usuário vê/altera continua
--     sendo decidido pelas regras RLS abaixo.
-- ---------------------------------------------------------------------
grant usage on schema public to authenticated;
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- ---------------------------------------------------------------------
-- 4. REGRAS DE ACESSO POR LINHA (RLS)
--    Nenhuma política para "anon": nada é público.
-- ---------------------------------------------------------------------
alter table public.perfis             enable row level security;
alter table public.integrantes        enable row level security;
alter table public.configuracoes      enable row level security;
alter table public.categorias_gasto   enable row level security;
alter table public.itens              enable row level security;
alter table public.cotacoes           enable row level security;
alter table public.contribuicoes      enable row level security;
alter table public.entregaveis        enable row level security;
alter table public.documentos         enable row level security;
alter table public.documento_versoes  enable row level security;
alter table public.tarefas            enable row level security;
alter table public.tickets            enable row level security;
alter table public.ticket_comentarios enable row level security;
alter table public.historico          enable row level security;

-- Responsável vinculado: integrante cujo perfil é o usuário atual.
create or replace function public.e_responsavel(p_integrante uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_integrante is not null and exists (
    select 1 from public.integrantes where id = p_integrante and perfil_id = auth.uid());
$$;
grant execute on function public.e_responsavel(uuid) to authenticated;

-- perfis
drop policy if exists perfis_select on public.perfis;
create policy perfis_select on public.perfis for select to authenticated
  using (public.e_membro() or id = auth.uid());
drop policy if exists perfis_update on public.perfis;
create policy perfis_update on public.perfis for update to authenticated
  using (public.e_admin()) with check (public.e_admin());

-- integrantes / configurações (somente admin altera)
drop policy if exists integrantes_select on public.integrantes;
create policy integrantes_select on public.integrantes for select to authenticated using (public.e_membro());
drop policy if exists integrantes_write on public.integrantes;
create policy integrantes_write on public.integrantes for all to authenticated
  using (public.e_admin()) with check (public.e_admin());

drop policy if exists configuracoes_select on public.configuracoes;
create policy configuracoes_select on public.configuracoes for select to authenticated using (public.e_membro());
drop policy if exists configuracoes_write on public.configuracoes;
create policy configuracoes_write on public.configuracoes for all to authenticated
  using (public.e_admin()) with check (public.e_admin());

-- categorias de gasto (editor/admin)
drop policy if exists categorias_select on public.categorias_gasto;
create policy categorias_select on public.categorias_gasto for select to authenticated using (public.e_membro());
drop policy if exists categorias_write on public.categorias_gasto;
create policy categorias_write on public.categorias_gasto for all to authenticated
  using (public.pode_editar()) with check (public.pode_editar());

-- Padrão "registro operacional": todos leem; membros criam; dono, responsável
-- vinculado ou editor altera; editor exclui.
-- itens
drop policy if exists itens_select on public.itens;
create policy itens_select on public.itens for select to authenticated using (public.e_membro());
drop policy if exists itens_insert on public.itens;
create policy itens_insert on public.itens for insert to authenticated
  with check (public.e_membro() and (criado_por = auth.uid() or public.e_admin()));
drop policy if exists itens_update on public.itens;
create policy itens_update on public.itens for update to authenticated
  using (public.pode_editar() or (public.e_membro() and (criado_por = auth.uid() or public.e_responsavel(responsavel_id))))
  with check (public.e_membro());
drop policy if exists itens_delete on public.itens;
create policy itens_delete on public.itens for delete to authenticated using (public.pode_editar());

-- cotações
drop policy if exists cotacoes_select on public.cotacoes;
create policy cotacoes_select on public.cotacoes for select to authenticated using (public.e_membro());
drop policy if exists cotacoes_insert on public.cotacoes;
create policy cotacoes_insert on public.cotacoes for insert to authenticated
  with check (public.e_membro() and (criado_por = auth.uid() or public.e_admin()));
drop policy if exists cotacoes_update on public.cotacoes;
create policy cotacoes_update on public.cotacoes for update to authenticated
  using (public.pode_editar() or (public.e_membro() and criado_por = auth.uid())) with check (public.e_membro());
drop policy if exists cotacoes_delete on public.cotacoes;
create policy cotacoes_delete on public.cotacoes for delete to authenticated
  using (public.pode_editar() or (public.e_membro() and criado_por = auth.uid()));

-- contribuições
drop policy if exists contribuicoes_select on public.contribuicoes;
create policy contribuicoes_select on public.contribuicoes for select to authenticated using (public.e_membro());
drop policy if exists contribuicoes_insert on public.contribuicoes;
create policy contribuicoes_insert on public.contribuicoes for insert to authenticated
  with check (public.e_membro() and (criado_por = auth.uid() or public.e_admin()));
drop policy if exists contribuicoes_update on public.contribuicoes;
create policy contribuicoes_update on public.contribuicoes for update to authenticated
  using (public.pode_editar() or (public.e_membro() and criado_por = auth.uid())) with check (public.e_membro());
drop policy if exists contribuicoes_delete on public.contribuicoes;
create policy contribuicoes_delete on public.contribuicoes for delete to authenticated
  using (public.pode_editar() or (public.e_membro() and criado_por = auth.uid()));

-- entregáveis (editor cria; responsável vinculado atualiza; admin exclui)
drop policy if exists entregaveis_select on public.entregaveis;
create policy entregaveis_select on public.entregaveis for select to authenticated using (public.e_membro());
drop policy if exists entregaveis_insert on public.entregaveis;
create policy entregaveis_insert on public.entregaveis for insert to authenticated with check (public.pode_editar());
drop policy if exists entregaveis_update on public.entregaveis;
create policy entregaveis_update on public.entregaveis for update to authenticated
  using (public.pode_editar() or (public.e_membro() and public.e_responsavel(responsavel_id))) with check (public.e_membro());
drop policy if exists entregaveis_delete on public.entregaveis;
create policy entregaveis_delete on public.entregaveis for delete to authenticated using (public.e_admin());

-- documentos (restritos: somente editor/admin)
drop policy if exists documentos_select on public.documentos;
create policy documentos_select on public.documentos for select to authenticated
  using (public.e_membro() and (not restrito or public.pode_editar()));
drop policy if exists documentos_insert on public.documentos;
create policy documentos_insert on public.documentos for insert to authenticated
  with check (public.e_membro() and (criado_por = auth.uid() or public.e_admin()) and (not restrito or public.pode_editar()));
drop policy if exists documentos_update on public.documentos;
create policy documentos_update on public.documentos for update to authenticated
  using (public.pode_editar() or (public.e_membro() and not restrito and (criado_por = auth.uid() or public.e_responsavel(responsavel_id))))
  with check (public.e_membro() and (not restrito or public.pode_editar()));
drop policy if exists documentos_delete on public.documentos;
create policy documentos_delete on public.documentos for delete to authenticated using (public.pode_editar());

drop policy if exists versoes_select on public.documento_versoes;
create policy versoes_select on public.documento_versoes for select to authenticated
  using (public.e_membro() and exists (select 1 from public.documentos d where d.id = documento_id));
drop policy if exists versoes_insert on public.documento_versoes;
create policy versoes_insert on public.documento_versoes for insert to authenticated
  with check (public.e_membro() and (criado_por = auth.uid() or public.e_admin())
              and exists (select 1 from public.documentos d where d.id = documento_id));
drop policy if exists versoes_delete on public.documento_versoes;
create policy versoes_delete on public.documento_versoes for delete to authenticated using (public.pode_editar());

-- tarefas
drop policy if exists tarefas_select on public.tarefas;
create policy tarefas_select on public.tarefas for select to authenticated using (public.e_membro());
drop policy if exists tarefas_insert on public.tarefas;
create policy tarefas_insert on public.tarefas for insert to authenticated
  with check (public.e_membro() and (criado_por = auth.uid() or public.e_admin()));
drop policy if exists tarefas_update on public.tarefas;
create policy tarefas_update on public.tarefas for update to authenticated
  using (public.pode_editar() or (public.e_membro() and (criado_por = auth.uid() or public.e_responsavel(responsavel_id))))
  with check (public.e_membro());
drop policy if exists tarefas_delete on public.tarefas;
create policy tarefas_delete on public.tarefas for delete to authenticated
  using (public.pode_editar() or (public.e_membro() and criado_por = auth.uid()));

-- tickets (nunca apagar: só admin pode excluir; use "Não realizada")
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated using (public.e_membro());
drop policy if exists tickets_insert on public.tickets;
create policy tickets_insert on public.tickets for insert to authenticated
  with check (public.e_membro() and (criado_por = auth.uid() or public.e_admin()));
drop policy if exists tickets_update on public.tickets;
create policy tickets_update on public.tickets for update to authenticated
  using (public.pode_editar() or (public.e_membro() and (criado_por = auth.uid() or public.e_responsavel(responsavel_id))))
  with check (public.e_membro());
drop policy if exists tickets_delete on public.tickets;
create policy tickets_delete on public.tickets for delete to authenticated using (public.e_admin());

drop policy if exists comentarios_select on public.ticket_comentarios;
create policy comentarios_select on public.ticket_comentarios for select to authenticated using (public.e_membro());
drop policy if exists comentarios_insert on public.ticket_comentarios;
create policy comentarios_insert on public.ticket_comentarios for insert to authenticated
  with check (public.e_membro() and autor_id = auth.uid());
drop policy if exists comentarios_delete on public.ticket_comentarios;
create policy comentarios_delete on public.ticket_comentarios for delete to authenticated
  using (public.e_admin() or (public.e_membro() and autor_id = auth.uid()));

-- histórico: somente leitura; esconde alterações de documentos restritos
drop policy if exists historico_select on public.historico;
create policy historico_select on public.historico for select to authenticated
  using (public.e_membro() and (public.pode_editar() or not (
           coalesce((dados_depois->>'restrito')::boolean, false)
        or coalesce((dados_antes->>'restrito')::boolean, false)
        or (tabela = 'documento_versoes' and not exists (
              select 1 from public.documentos d
              where d.id::text = coalesce(dados_depois->>'documento_id', dados_antes->>'documento_id')))
  )));

-- ---------------------------------------------------------------------
-- 5. ARMAZENAMENTO DE ARQUIVOS (privado; acesso por URL assinada)
--    fotos-itens: <item_id>/<arquivo>.jpg     (até 5 MB)
--    documentos:  <documento_id>/<arquivo>    (até 25 MB)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-itens', 'fotos-itens', false, 5242880, array['image/jpeg','image/png','image/webp']),
       ('documentos',  'documentos',  false, 26214400, null)
on conflict (id) do nothing;

drop policy if exists hk_fotos_select on storage.objects;
create policy hk_fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos-itens' and public.e_membro());
drop policy if exists hk_fotos_insert on storage.objects;
create policy hk_fotos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos-itens' and public.e_membro());
drop policy if exists hk_fotos_delete on storage.objects;
create policy hk_fotos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'fotos-itens' and public.pode_editar());

drop policy if exists hk_docs_select on storage.objects;
create policy hk_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.e_membro() and exists (
           select 1 from public.documentos d
           where d.id::text = (storage.foldername(name))[1]
             and (not d.restrito or public.pode_editar())));
drop policy if exists hk_docs_insert on storage.objects;
create policy hk_docs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'documentos' and public.e_membro() and exists (
           select 1 from public.documentos d
           where d.id::text = (storage.foldername(name))[1]
             and (not d.restrito or public.pode_editar())));
drop policy if exists hk_docs_delete on storage.objects;
create policy hk_docs_delete on storage.objects for delete to authenticated
  using (bucket_id = 'documentos' and public.pode_editar());

-- ---------------------------------------------------------------------
-- 6. DADOS INICIAIS (não sobrescreve nada que já exista)
-- ---------------------------------------------------------------------
insert into public.integrantes (nome, ordem) values
  ('Willyans Chen', 1), ('Cauã Peixoto', 2), ('Spencer S. Garcia', 3)
on conflict (nome) do nothing;

insert into public.categorias_gasto (nome, ordem) values
  ('Eletrônica de potência', 1), ('Componentes eletrônicos', 2), ('Cabos e conectores', 3),
  ('Estrutura e materiais mecânicos', 4), ('Instrumentação e medição', 5), ('Ferramentas', 6), ('Outros', 7)
on conflict (nome) do nothing;

insert into public.configuracoes (chave, valor) values ('orcamento_centavos', 'null'::jsonb)
on conflict (chave) do nothing;

-- Entregáveis conforme o guia "Desafios e Premiações" v1.1 (p. 2).
-- Formatos, horários e links: edital (arts. 26–29) e grupo oficial da HACKIES.
insert into public.entregaveis (nome, etapa, descricao, prazo, status)
select * from (values
  ('Documento de Ideação', 'Etapa 1 (on-line)',
   'Material obrigatório (guia v1.1, p. 2; edital arts. 26–29). Formato a confirmar no edital/grupo oficial.',
   date '2026-11-14', 'Não iniciado'),
  ('Vídeo Explicativo da Solução e/ou Protótipo', 'Etapa 1 (on-line)',
   'Material obrigatório (guia v1.1, p. 2; edital arts. 26–29). Protótipo físico não é obrigatório.',
   date '2026-11-14', 'Não iniciado'),
  ('Pitch da apresentação final', 'Etapa 2 (presencial)',
   'Até 5 minutos + perguntas da banca, no IFF Campus Macaé, para as 10 equipes classificadas (guia v1.1, p. 2).',
   date '2026-12-03', 'Não iniciado')
) as v(nome, etapa, descricao, prazo, status)
where not exists (select 1 from public.entregaveis);

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
  ('Apresentação', 5), ('Administrativo', 6), ('Outros', 7), ('Descartados', 8)
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

-- ---------------------------------------------------------------------
-- 8. MIGRAÇÃO 2026-11-12 — papel "visitante" (somente leitura)
--    Visitante ativo VÊ tudo o que a equipe vê (solicitações e comentários,
--    entregáveis, documentos não restritos e arquivos, gastos, cotações,
--    contribuições, categorias, orçamento e fotos), MENOS o histórico de
--    alterações e os dados de outros usuários (perfis). Não grava nada:
--    e_membro() = falso para o visitante. Não entra na divisão de gastos
--    (não é integrante).
-- ---------------------------------------------------------------------
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check
  check (papel in ('admin','editor','membro','visitante'));

create or replace function public.e_membro() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo and papel <> 'visitante');
$$;

create or replace function public.e_leitor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.perfis where id = auth.uid() and ativo);
$$;
grant execute on function public.e_leitor() to authenticated;

drop policy if exists integrantes_select on public.integrantes;
create policy integrantes_select on public.integrantes for select to authenticated using (public.e_leitor());
drop policy if exists entregaveis_select on public.entregaveis;
create policy entregaveis_select on public.entregaveis for select to authenticated using (public.e_leitor());
drop policy if exists tickets_select on public.tickets;
create policy tickets_select on public.tickets for select to authenticated using (public.e_leitor());
drop policy if exists comentarios_select on public.ticket_comentarios;
create policy comentarios_select on public.ticket_comentarios for select to authenticated using (public.e_leitor());
-- gastos (somente leitura para o visitante)
drop policy if exists configuracoes_select on public.configuracoes;
create policy configuracoes_select on public.configuracoes for select to authenticated using (public.e_leitor());
drop policy if exists categorias_select on public.categorias_gasto;
create policy categorias_select on public.categorias_gasto for select to authenticated using (public.e_leitor());
drop policy if exists itens_select on public.itens;
create policy itens_select on public.itens for select to authenticated using (public.e_leitor());
drop policy if exists cotacoes_select on public.cotacoes;
create policy cotacoes_select on public.cotacoes for select to authenticated using (public.e_leitor());
drop policy if exists contribuicoes_select on public.contribuicoes;
create policy contribuicoes_select on public.contribuicoes for select to authenticated using (public.e_leitor());
drop policy if exists hk_fotos_select on storage.objects;
create policy hk_fotos_select on storage.objects for select to authenticated
  using (bucket_id = 'fotos-itens' and public.e_leitor());
-- documentos (restritos continuam só para editor/admin)
drop policy if exists catdoc_select on public.categorias_documento;
create policy catdoc_select on public.categorias_documento for select to authenticated using (public.e_leitor());
drop policy if exists documentos_select on public.documentos;
create policy documentos_select on public.documentos for select to authenticated
  using (public.e_leitor() and (not restrito or public.pode_editar()));
drop policy if exists versoes_select on public.documento_versoes;
create policy versoes_select on public.documento_versoes for select to authenticated
  using (public.e_leitor() and exists (select 1 from public.documentos d where d.id = documento_id));
drop policy if exists hk_docs_select on storage.objects;
create policy hk_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.e_leitor() and exists (
           select 1 from public.documentos d
           where d.id::text = (storage.foldername(name))[1]
             and (not d.restrito or public.pode_editar())));
-- Quem entra na divisão de gastos: integrantes com login ativo vinculado (não visitante).
-- O visitante não lê os perfis da equipe; esta função devolve só os IDs dos integrantes,
-- sem e-mail nem papel, para a tela de gastos mostrar a mesma divisão que a equipe vê.
create or replace function public.integrantes_com_acesso()
returns table (integrante_id uuid)
language sql stable security definer set search_path = public as $$
  select i.id from public.integrantes i
  join public.perfis p on p.id = i.perfil_id
  where p.ativo and p.papel <> 'visitante' and public.e_leitor();
$$;
revoke all on function public.integrantes_com_acesso() from public, anon;
grant execute on function public.integrantes_com_acesso() to authenticated;

-- =====================================================================
-- DEPOIS DE EXECUTAR:
-- 1) Authentication → Users → "Add user" para cada integrante
--    (marque "Auto Confirm User").
-- 2) Torne-se administrador (troque o e-mail):
--      update public.perfis set papel = 'admin', ativo = true, nome = 'Seu Nome'
--      where email = 'seu-email@exemplo.com';
-- 3) Na aplicação → Administração: ative os demais usuários e vincule
--    cada usuário ao seu nome de integrante.
-- 4) Authentication → Sign In / Providers: desative "Allow new users to sign up".
-- =====================================================================
