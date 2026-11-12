-- Migração aditiva e idempotente: papel "visitante" (somente leitura).
-- Também incluída em schema.sql (seção 8). Pode ser executada mais de uma vez.

-- ---------------------------------------------------------------------
-- 8. MIGRAÇÃO 2026-11-12 — papel "visitante" (somente leitura)
--    Visitante ativo só vê: solicitações (sem comentários), entregáveis e os
--    nomes dos integrantes. Não vê gastos, cotações, contribuições, documentos
--    (nem arquivos), configurações, histórico nem outros usuários, e não grava
--    nada (e_membro() = falso).
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
-- Documentos, versões, categorias de documento e arquivos: somente a equipe
-- (e_membro(); visitante não vê). Repetido aqui para desfazer uma versão
-- anterior desta migração que liberava documentos ao visitante.
drop policy if exists catdoc_select on public.categorias_documento;
create policy catdoc_select on public.categorias_documento for select to authenticated using (public.e_membro());
drop policy if exists documentos_select on public.documentos;
create policy documentos_select on public.documentos for select to authenticated
  using (public.e_membro() and (not restrito or public.pode_editar()));
drop policy if exists versoes_select on public.documento_versoes;
create policy versoes_select on public.documento_versoes for select to authenticated
  using (public.e_membro() and exists (select 1 from public.documentos d where d.id = documento_id));
drop policy if exists hk_docs_select on storage.objects;
create policy hk_docs_select on storage.objects for select to authenticated
  using (bucket_id = 'documentos' and public.e_membro() and exists (
           select 1 from public.documentos d
           where d.id::text = (storage.foldername(name))[1]
             and (not d.restrito or public.pode_editar())));
