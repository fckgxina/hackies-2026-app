-- Migração aditiva e idempotente: papel "visitante" (somente leitura).
-- Também incluída em schema.sql (seção 8). Pode ser executada mais de uma vez.

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
