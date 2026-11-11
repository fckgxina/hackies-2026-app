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

Contagens atuais: Visão geral com 6 atalhos (`cols-6`), 4 indicadores (`cols-4`) e painéis em `cols-2`. Solicitações com 6 indicadores (`cols-6`). Gastos com 8 indicadores (`cols-4`), análise por item em `cols-3`, orçamento em `cols-4` e compras em `cols-2` (5 cards: o último ocupa a linha). Documentos com 4 indicadores (`cols-4`). Entregáveis em `cols-3`.

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

## 5. Cor

- **Paleta: a definir.** As opções estão em avaliação; a escolhida entra como *tokens* em `:root` (claro) e `prefers-color-scheme: dark` (escuro).
- **Papéis fixos:**
  - fundo e superfície;
  - texto principal e secundário;
  - ação (accent);
  - bordas;
  - estados: bom, atenção, sério e crítico.
- **Contraste mínimo:** texto 4,5:1; ícones e controles 3:1. Os estados sempre vêm com texto ou ícone.
- **Gráficos:** séries com paleta validada (`dataviz`), azul #2a78d6 e laranja #eb6834 no tema claro, e azul #3987e5 e laranja #d95926 no escuro.

## 6. Verificação obrigatória

Antes de publicar, rode a checagem de alinhamento no console da aplicação, em 3 larguras (≈1440, ≈768 e 375 px). O script percorre todas as rotas, mede cada fileira de `.cards` e acusa sobra à direita, alturas diferentes, título e detalhe na mesma linha e rolagem horizontal. O resultado precisa ser **zero problemas**.
