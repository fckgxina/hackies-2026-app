# HackIES 2026 · Aplicação de gestão do projeto (D02)

**Endereço:** <https://fckgxina.github.io/hackies-2026-app/> (login com o usuário criado pelo administrador).

Aplicação web (HTML + CSS + JavaScript, sem etapa de build) usada pelos três integrantes para o trabalho operacional do projeto. Os dados ficam num banco **Supabase** compartilhado. O conhecimento técnico e científico continua no vault Obsidian `HACKIES 2026`.

| Recurso | Onde fica |
|---|---|
| Pesquisas, referências, sínteses, matriz de evidências, questões em aberto | Obsidian |
| Decisões técnicas, diário, reuniões, simulações e validações | Obsidian |
| Solicitações (tickets e Kanban), gastos, cotações, contribuições | Aplicação web + Supabase |
| Documentos de qualquer tipo (categorias editáveis, anexos e versões) e entregáveis | Aplicação web + Supabase |
| Painel geral e apresentação HTML | Aplicação web |

## Por que Supabase

- **PostgreSQL relacional:** as somas financeiras, as chaves estrangeiras e as validações ficam no próprio banco.
- **RLS (regras de acesso por linha):** as permissões são aplicadas no servidor, não só na interface.
- **Plano gratuito completo:** inclui autenticação e armazenamento de arquivos (fotos e anexos), sem cartão de crédito.
- **Alternativa avaliada, Firebase:** o Cloud Storage do Firebase exige o plano pago Blaze, e o Firestore (NoSQL) é menos adequado para cálculos financeiros.
- **Limites do plano gratuito:**
  - 500 MB de banco e 1 GB de arquivos;
  - o projeto é **pausado após 1 semana sem uso**. Os dados não se perdem, e o projeto é reativado no painel do Supabase.

Fontes: [preços do Supabase](https://supabase.com/pricing) · [FAQ do Firebase sobre Storage e o plano Blaze](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024).

---

## 1. Configurar o banco (uma vez, cerca de 15 min)

1. **Criar o projeto.** Em <https://supabase.com/dashboard>, crie um projeto gratuito (região: *South America (São Paulo)*). Anote a senha do banco.
2. **Criar a estrutura.** Em **SQL Editor → New query**, cole todo o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) e clique em **Run**. O script cria:
   - as tabelas, as regras de acesso e o histórico automático;
   - os *buckets* de arquivos (`fotos-itens` e `documentos`);
   - os dados iniciais: os três integrantes, as categorias de gasto e os entregáveis com prazo do guia.

   O script pode ser executado de novo sem apagar dados.
3. **Criar os usuários.** Em **Authentication → Users → Add user → Create new user**, crie um usuário para cada integrante, com e-mail e senha inicial, e marque *Auto Confirm User*.
4. **Tornar-se administrador.** No SQL Editor, rode o comando abaixo, trocando o e-mail e o nome:
   ```sql
   update public.perfis set papel = 'admin', ativo = true, nome = 'Seu Nome'
   where email = 'seu-email@exemplo.com';
   ```
5. **Fechar o cadastro público.** Em **Authentication → Sign In / Providers**, desative *Allow new users to sign up*. Mesmo que fique ativo, quem se cadastrar entra **inativo** e não vê nenhum dado.
6. **Conectar a aplicação.** Em **Project Settings → API Keys**, copie a URL do projeto e a chave **publishable** (`sb_publishable_…`). A chave legada *anon* também funciona enquanto existir. Cole as duas em [`js/config.js`](js/config.js):
   ```js
   supabaseUrl: 'https://SEU-PROJETO.supabase.co',
   supabaseAnonKey: 'sb_publishable_...',
   ```
   A chave pública pode ficar no navegador, porque a proteção é feita pelas regras de acesso (RLS). **Nunca** use a chave *secret* nem a *service_role*.
7. **Ativar os colegas.** Abra a aplicação, entre como administrador e, em **Administração**:
   - ative os outros usuários;
   - escolha o papel de cada um;
   - vincule cada usuário ao seu nome de integrante.

## 2. Publicar para a equipe

A aplicação é estática e pode ser publicada em qualquer hospedagem gratuita, por exemplo:

- **GitHub Pages:** suba a pasta `app-web/` num repositório **privado ou público** e ative *Settings → Pages*. Repositório público não expõe dados: os dados estão no Supabase, protegidos por login e RLS.
- **Netlify Drop** (<https://app.netlify.com/drop>): arraste a pasta `app-web/`.
- **Cloudflare Pages.**

Depois de publicar, cadastre o endereço em **Supabase → Authentication → URL Configuration**, em *Site URL* e *Redirect URLs*. Isso é necessário para o link de redefinição de senha funcionar.

Uso local: abra `app-web/index.html` diretamente no navegador ou rode `python -m http.server 5173 --directory app-web`.

## 3. Modo demonstração

Enquanto `js/config.js` estiver vazio, a aplicação mostra a tela de configuração e oferece um **modo demonstração**, com uma faixa amarela de aviso permanente.

- Os dados do modo demonstração ficam **somente naquele navegador**, não são compartilhados e podem ser perdidos.
- Ele serve apenas para conhecer as telas. Não registre dados reais nele.

## 4. O que cada área faz

| Área | Funcionalidades |
|---|---|
| **Visão geral** | Solicitações pendentes, gastos realizados e planejados, valor individual estimado, próximos prazos (de todas as áreas), situação dos entregáveis e últimas atualizações |
| **Solicitações** | Cadastro (Tarefa, Pesquisa, Modificação, Correção, Nova ideia), vínculo opcional a um entregável, e Kanban com 5 colunas, em que arrastar o cartão muda o status.<br>• Concluir exige o resumo da solução; "Não realizada" exige justificativa.<br>• Comentários, responsável, prazo e filtros por categoria, solicitante, prioridade, status e área.<br>• Vínculos com o tópico no Obsidian, a decisão (DEC-xxx) e um documento.<br>• Histórico por ticket, exportação CSV e "Copiar resumo (Markdown)" para colar no Obsidian. |
| **Gastos** | Itens com foto (prévia antes de salvar), link de compra, fornecedor, status e subtotal automático.<br>• Cotações por item: destaque do menor preço e do menor total com frete, sem escolher automaticamente.<br>• Contribuições individuais e acerto entre os integrantes.<br>• Painel com indicadores, alertas e análises por categoria, por item, por orçamento, de compras e por integrante.<br>• Categorias editáveis, orçamento, CSV e resumo em Markdown. |
| **Documentos** | Qualquer documento da equipe, em **categorias editáveis** (Pesquisa, Currículos, Competição, Entregáveis, Apresentação, Administrativo, Outros…), com barra de filtro por categoria e lista subdividida.<br>• **Anexar** já no cadastro; na lista, **Visualizar** (PDF e imagem abrem no navegador) e **Baixar** o arquivo atual.<br>• Versões (V0.1 → V0.2 → V1.0…), responsável, prazo, status e vínculo a entregável.<br>• Documentos **restritos**, visíveis só a editores e administradores. |
| **Entregáveis** | Entregáveis oficiais com prazo e status. O trabalho de cada um é pedido em **Solicitações** (categoria "Tarefa", vinculada ao entregável); o card mostra solicitações abertas e concluídas e os documentos vinculados. |
| **Apresentação** | Visualizador 3D da garrafa de alimentação (Three.js 0.170.0, carregado só nesta aba): rotação, zoom, carcaça completa/transparente/aberta/corte, vista explodida, lista de componentes, seleção por clique com ficha técnica, "Ver funcionamento" (animação conceitual) e "Acompanhar fluxo de energia". Modelo em `assets/3d/garrafa-alimentacao.glb`, metadados em `assets/3d/components.json`; o `.blend` e o script do modelo ficam em `modelo-3d/`, fora do site. O antigo `apresentacao.html` (13 slides) segue guardado, sem link. |
| **Administração** | Usuários e papéis, integrantes (ordem e participação no rateio), histórico completo com **Restaurar/Reverter**, e backup em JSON e CSV. |

### Regras dos cálculos financeiros

Todos os valores são guardados em centavos inteiros, por isso não há erro de arredondamento.

- **Subtotal** = valor unitário × quantidade. A quantidade aceita frações, por exemplo 2,5 m.
- **Totais:**
  - **Estimado:** todos os itens que não estão cancelados.
  - **Realizado:** itens com status Comprado, Pago ou Recebido. Itens apenas planejados **não** entram.
  - **Pago:** itens com data de pagamento registrada.
  - **Previsto:** itens com status Planejado, Em cotação ou Aguardando compra.
- **Valor individual** = total compartilhado ÷ número de integrantes do rateio. Entram no rateio os integrantes com **login ativo vinculado**, hoje os 3. Desativar o acesso de alguém tira essa pessoa da divisão; o administrador também pode retirar alguém manualmente.
  - Quando a divisão não fecha em centavos, as sobras vão uma a uma, na ordem fixa dos integrantes, para que a soma das partes seja **exatamente** o total.
  - Um item "não compartilhado" fica inteiro com o responsável.
- **Contribuições** registram quem já pagou. Elas **não alteram** a divisão igualitária: geram o saldo de cada um (falta ou pagou a mais) e as transferências sugeridas para o acerto.
- **Pagamento de item:** ao marcar um item como pago, a aplicação pode registrar automaticamente a contribuição de quem pagou.

Os testes ficam em [`tests/finance.test.js`](tests/finance.test.js) e rodam com `node tests/finance.test.js`.

## 5. Permissões

| Ação | Visitante | Membro | Editor | Admin |
|---|:-:|:-:|:-:|:-:|
| Consultar solicitações e comentários, entregáveis, gastos (itens, cotações, contribuições, fotos, orçamento) e documentos (exceto os restritos) | ✓ | ✓ | ✓ | ✓ |
| Consultar o histórico de alterações e os perfis dos usuários | | ✓ | ✓ | ✓ |
| Criar solicitações, itens, cotações, contribuições, documentos, tarefas | | ✓ | ✓ | ✓ |
| Editar o que criou ou o que está sob sua responsabilidade | | ✓ | ✓ | ✓ |
| Editar e excluir registros de qualquer pessoa; editar categorias; documentos restritos | | | ✓ | ✓ |
| Excluir tickets e entregáveis; usuários, integrantes, orçamento, restauração, backup | | | | ✓ |

**Visitante** (papel criado em 12/11/2026, migração `supabase/migracao-2026-11-12-visitante.sql`): conta só de leitura. Vê tudo o que a equipe vê, menos o histórico de alterações, os perfis dos usuários e a Administração. Não tem integrante vinculado, fica fora da divisão de gastos e não pode ser escolhido como solicitante. Não grava nada: o banco recusa qualquer inserção, alteração ou exclusão (RLS: `e_leitor()` lê, `e_membro()` grava). A divisão de gastos que o visitante vê vem da função `integrantes_com_acesso()`, que devolve só os IDs dos integrantes com login ativo, sem e-mail nem papel. Para criar um visitante: Authentication → Users → Add user e, em Administração, marque o papel "Visitante" e ative.

As regras ficam no banco (RLS em `schema.sql`) e a interface só as reflete. Todas as alterações são gravadas automaticamente na tabela `historico`, com o usuário, a data e os valores antes e depois.

## 6. Backup e recuperação

- **Registro excluído por engano:** em Administração → Histórico, clique em **Restaurar**. Para desfazer uma alteração, use **Reverter**.
- **Backup completo:** em Administração → Backup, baixe o JSON com todas as tabelas. Recomenda-se fazer isso ao fim de cada etapa.
- **Reimportação:** baixe o CSV de cada tabela e importe no Supabase (Table Editor → Import data from CSV).
- **Fotos e anexos:** ficam nos buckets do Supabase Storage. O backup JSON guarda apenas os caminhos dos arquivos.
- **Plano gratuito:** não oferece backups automáticos para download. Por isso o backup manual periódico é importante.

## 7. Estrutura

```text
app-web/
├── index.html            casca da aplicação
├── apresentacao.html     apresentação do projeto
├── css/styles.css        estilo (claro/escuro automático)
├── js/config.js          ← URL e chave pública do Supabase
├── js/util.js            formatação, modais, CSV, imagens
├── js/finance.js         cálculos financeiros (funções puras, testadas)
├── js/data.js            acesso ao Supabase + modo demonstração
├── js/app.js             login, permissões, navegação, histórico legível
├── js/views/*.js         uma tela por arquivo
├── supabase/schema.sql   banco: tabelas, RLS, gatilhos, storage, dados iniciais
└── tests/finance.test.js testes dos cálculos
```

## 8. Limitações conhecidas

- **Testado no Supabase real em 11/11/2026:** login, bloqueio de acesso anônimo, cadastro público desligado, criação de ticket e item, envio e leitura de foto, regras de conclusão e histórico.
- **Kanban no celular:** arrastar cartões funciona com mouse. No celular, abra o cartão e altere o campo Status.
- **Sem notificações:** a aplicação não envia avisos por e-mail ou push.
- **Sem sincronização com o Obsidian:** a ligação é feita por links `obsidian://` e pelos botões "Copiar resumo (Markdown)".
