# Padrões de design · Aplicação HackIES 2026

Regras obrigatórias para qualquer tela nova ou alteração. O objetivo é uma interface de **operação** (painel administrativo): leitura rápida, estrutura previsível, tudo alinhado.

## 1. Grade de cards — nenhum card desalinhado

Toda fileira de cards ou indicadores usa **`<div class="cards cols-N">`**, com N = 2, 3, 4 ou 6.

| Classe | Área larga (≥ 900 px) | Média (640–899 px) | Estreita (< 480 px) | Use quando houver |
|---|---|---|---|---|
| `cols-2` | 2 | 2 | 1 (abaixo de 640 px) | 2, 4 ou 6 cards (painéis lado a lado) |
| `cols-3` | 3 | 3 (≥ 720 px) | 1 (abaixo de 720 px) | 3 ou 6 cards |
| `cols-4` | 4 | 2 | 2 | 4 ou 8 indicadores |
| `cols-6` | 6 | 3 | 2 | 6 atalhos ou indicadores |

Regras:

1. **Nunca use `auto-fill`/`auto-fit` com largura mínima** para cards. É isso que cria sobra à direita e card sozinho na linha de baixo.
2. **A quantidade de cards deve dividir o número de colunas** em todas as larguras. Se não dividir, ajuste o conteúdo, juntando ou separando indicadores, antes de mexer no CSS.
3. **Rede de segurança:** se a conta não fechar (listas dinâmicas), o CSS estica o(s) último(s) card(s) até a borda. A fileira sempre fecha nas duas margens.
4. As larguras são medidas na **área de conteúdo** (*container query* em `.view`), não na janela, porque o menu lateral ocupa espaço.
5. Cards da mesma fileira têm **a mesma altura**.

Contagens atuais: Visão geral com 6 atalhos (`cols-6`), 4 indicadores (`cols-4`) e painéis em `cols-2`. Solicitações com 6 indicadores (`cols-6`). Gastos com 8 indicadores (`cols-4`), análise por item em `cols-3`, orçamento em `cols-4` e compras em `cols-2` (5 cards: o último ocupa a linha). Documentos com 4 indicadores (`cols-4`), barra de categorias e lista subdividida por categoria. Entregáveis em `cols-3` (cards com rodapé alinhado: andamento das solicitações + ações).

## 2. Anatomia dos componentes

- **Indicador (KPI)**, via `HK.util.kpi(rótulo, valor, detalhe)`, sempre nesta ordem:
  - **Rótulo**: 1 linha, cortado com "…" e com o texto completo no *tooltip*. No celular pode ocupar 2 linhas, com altura reservada igual em todos.
  - **Valor**: números tabulares.
  - **Detalhe**: 1 linha, sempre presente, mesmo vazio, para alinhar as fileiras.
  - Não monte KPI com HTML próprio.
- **Card de painel** (`.card`): o cabeçalho (`.card-head`) tem ícone, título (h3) e ação opcional à direita, com altura mínima fixa. Assim cards com e sem botão começam o conteúdo na mesma altura.
- **Linha de lista** (`.list li`): elemento à esquerda opcional (tag ou miniatura), bloco central com **título em cima e detalhe embaixo** (nunca na mesma linha) e valor ou status à direita.
- **Título de seção** (`.section-title`): um título de verdade, em frase normal, sem caixa-alta nem rótulo pequeno acima. Tem mais espaço acima (32 px) que abaixo (12 px).
- **Status**: sempre `HK.util.chip(texto)`, com cor de estado mais texto, nunca só cor. O tom de cada status fica na tabela `TONE` em `js/util.js`.

## 2.1 Controles, formulários e tabelas

- **Altura única de controle** (`--h-control`, 36 px): campos, seletores, botões e grupos de botões. Numa mesma linha, todos têm a mesma altura e o mesmo centro.
- **Campo + botão** na mesma linha usa `.inline-row`: o botão alinha com o **campo**, e a ajuda e o erro ficam **embaixo** da linha, nunca ao lado do botão.
- **Tabelas:** coluna numérica tem título **e** valores à direita (`th.right` e `td.right`); texto fica à esquerda. Título e valor de uma coluna nunca divergem.
- **Barra de categorias** (`.cat-bar`): "Todos" + uma pílula por categoria com contagem, mais "Categorias" para gerenciar. Rola na horizontal no celular.

## 3. Espaçamento

Use somente a escala de base 4: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32, `--s7` 48 px.

- Entre cards de uma grade: `--s4`.
- Entre grupos e seções: `--s6`.
- Dentro de um card: `--s4` e `--s5`.

## 4. Tipografia

- Fonte do sistema (Segoe UI, SF, Roboto).
- Tamanhos:
  - título da página: 18 px;
  - título de seção: 15 px, semibold;
  - título de card: 14,5 px;
  - texto: 14 px;
  - detalhes: 12–12,5 px.
- Valores e datas usam números tabulares (`.num`).

## 5. Cor — paleta "Alta tensão" (escolhida em 11/11/2026)

Grafite industrial com **âmbar de energia**. O âmbar é **exclusivo da ação**: botões principais, item ativo do menu, marca, foco e links. Os tokens ficam em `css/styles.css`, em `:root` para o modo claro e em `prefers-color-scheme: dark` para o escuro.

| Papel | Claro | Escuro | Regra |
|---|---|---|---|
| Fundo / card | #f4f4f5 / #ffffff | #111113 / #1a1a1d | — |
| Texto / secundário / auxiliar | #18181b / #52525b / #6b6b73 | #ededee / #a8a8ad / #8b8b92 | ≥ 4,5:1 |
| `--accent` (preenchimento de ação) | #f5b301 | #f5b301 | sempre com `--accent-ink` (#1a1300) por cima |
| `--accent-text` (ação como texto, foco) | #8a5a00 | #f5b301 | nunca use `--accent` como cor de texto |
| Atenção | laranja #a34a07 | #fb923c | não usa âmbar, para não confundir com ação |
| Sério / crítico | #be123c / #b42323 | #fb7185 / #f87171 | — |
| Informação / sucesso | #1d5fb0 / #087a08 | #8cc4ff / #5fd35f | — |

- **Contraste verificado nos dois modos:** 736 textos em 12 telas, 0 falhas. Texto ≥ 4,5:1; ícones e foco ≥ 3:1.
- **Estados:** sempre com texto ou ícone, nunca só a cor.
- **Gráficos:** séries com paleta validada (`dataviz`), azul #2a78d6 e laranja #eb6834 no tema claro, e azul #3987e5 e laranja #d95926 no escuro.

## 5.1 Menu lateral

- **PC com mouse (≥ 861 px):** o menu fica recolhido num trilho de 64 px, só com ícones, e **abre ao passar o mouse** ou ao receber foco pelo teclado, **por cima do conteúdo**, sem empurrar a página.
- **Tablet, celular e telas de toque:** o menu fica escondido e abre pelo botão ☰ como gaveta; toque fora para fechar.
- **Largura:** o conteúdo é fluido (sem largura máxima) e termina na mesma margem do cabeçalho em qualquer zoom.
- **Item sem conteúdo:** fica no menu com a etiqueta "Em breve" e, ao clicar, mostra um aviso. Hoje isso vale para a Apresentação; o arquivo `apresentacao.html` está guardado, sem link.

## 6. Verificação obrigatória

Antes de publicar, rode as checagens de alinhamento, responsividade e contraste no console da aplicação. Use pelo menos 1920, 1366 e 1024 px (PC), 768 px (tablet) e 414 e 360 px (celular), nos modos claro e escuro. O script percorre todas as rotas, mede cada fileira de `.cards` e acusa sobra à direita, alturas diferentes, título e detalhe na mesma linha e rolagem horizontal. O resultado precisa ser **zero problemas**.
