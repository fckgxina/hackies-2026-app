-- Migração de DADOS (não faz parte do schema.sql): categoria "Descartados"
-- e mudança das 5 pesquisas feitas pela equipe para ela.
-- Pedido de Willyans Chen em 12/11/2026. Pode ser executada mais de uma vez.
-- Como executar: Supabase → SQL Editor → colar este arquivo → Run.
--
-- O que NÃO muda: o conteúdo, as versões, os arquivos, o status e o vínculo com
-- o entregável. A apostila da Oceaneering continua em "Pesquisa" (material recebido,
-- não pesquisa da equipe). O conhecimento dessas pesquisas continua no vault Obsidian.

-- 1) Categoria no fim da lista (a interface também a mantém sempre por último).
insert into public.categorias_documento (nome, ordem)
select 'Descartados', coalesce(max(ordem), 0) + 1 from public.categorias_documento
on conflict (nome) do nothing;

-- 2) As 5 pesquisas da equipe (relatórios "Pesquisa — ..."): buck, arquiteturas
--    eficientes, umbilical, rota CC → CA → CC e soluções melhores.
update public.documentos set categoria = 'Descartados'
where categoria = 'Pesquisa'
  and (id in ('9f25ab16-a601-4188-a464-592b70125589',   -- Conversor buck (step-down)
              'e1af90f7-603c-4f3b-a9de-ded5093df8b5',   -- Arquiteturas eficientes 600 V → 15 V
              '34112b13-7e3d-4a9b-b42e-d9bf84f1ddab',   -- Umbilical de ROV
              'd8aad23b-2613-43ef-a5b9-af577fb8fc65',   -- Rota CC → CA → transformador → CC
              '4610df8a-58d0-4187-bd8b-a81eb4651299')   -- Soluções melhores e comparação
       or nome like 'Pesquisa — %');

-- 3) Conferência: deve listar as 5 pesquisas em "Descartados".
select categoria, nome, status from public.documentos
where categoria in ('Pesquisa', 'Descartados')
order by categoria, nome;
