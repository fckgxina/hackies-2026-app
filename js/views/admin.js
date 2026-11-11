/* Administração: usuários e permissões, integrantes, histórico (com restauração) e backup. */
(function (HK) {
  'use strict';
  const U = HK.util;

  const TABS = [['', 'Usuários e permissões'], ['integrantes', 'Integrantes'], ['historico', 'Histórico de alterações'], ['backup', 'Backup e exportação']];
  const TABELAS_BACKUP = ['perfis', 'integrantes', 'configuracoes', 'categorias_gasto', 'itens', 'cotacoes', 'contribuicoes', 'entregaveis',
    'documentos', 'documento_versoes', 'tarefas', 'tickets', 'ticket_comentarios', 'historico'];
  const RESTAURAVEIS = ['itens', 'cotacoes', 'contribuicoes', 'entregaveis', 'documentos', 'documento_versoes', 'tarefas', 'tickets', 'categorias_gasto'];
  const st = { tabela: '', usuario: '', acao: '', limite: 150 };

  /* ---------- usuários ---------- */
  async function usuarios(el) {
    const perfis = await HK.db.list('perfis');
    HK.state.perfis = perfis;
    const adm = HK.perm.admin();
    const vinc = (pid) => HK.state.integrantes.find((i) => i.perfil_id === pid);
    el.insertAdjacentHTML('beforeend', `
      ${adm ? '' : '<div class="notice" style="margin-bottom:12px">Somente o administrador altera usuários e permissões.</div>'}
      <div class="table-wrap"><table class="table"><thead><tr><th>Usuário</th><th>E-mail</th><th>Papel</th><th>Ativo</th><th>Integrante vinculado</th></tr></thead><tbody>
        ${perfis.map((p) => { const self = p.id === HK.state.profile.id; const dis = !adm || self ? 'disabled' : ''; const v = vinc(p.id); return `<tr>
          <td>${adm ? `<input type="text" data-nome="${p.id}" value="${U.esc(p.nome)}" aria-label="Nome" style="min-width:150px">` : `<b>${U.esc(p.nome)}</b>`}${self ? ' <small class="muted">(você)</small>' : ''}</td>
          <td>${U.esc(p.email)}</td>
          <td><select data-papel="${p.id}" ${dis} aria-label="Papel">${U.opts(Object.keys(HK.PAPEIS), p.papel, { label: (k) => HK.PAPEIS[k] })}</select></td>
          <td><label class="check"><input type="checkbox" data-ativo="${p.id}" ${p.ativo ? 'checked' : ''} ${dis}> ${p.ativo ? 'ativo' : 'inativo'}</label></td>
          <td><select data-vinc="${p.id}" ${adm ? '' : 'disabled'} aria-label="Integrante vinculado">${U.opts(HK.state.integrantes, v ? v.id : '', { empty: '— nenhum —' })}</select></td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="muted" style="font-size:12px;margin-top:8px">Novos usuários são criados no painel do Supabase (Authentication → Users → Add user) e entram <b>inativos</b> até serem ativados aqui. O vínculo com o integrante define o "responsável" de cada usuário (permite atualizar o que foi atribuído a ele).</p>

      <div class="section-title">O que cada papel pode fazer</div>
      <div class="table-wrap"><table class="table compact"><thead><tr><th>Ação</th><th>Membro</th><th>Editor</th><th>Administrador</th></tr></thead><tbody>
        ${[
          ['Consultar solicitações, gastos, entregáveis e histórico', '✓', '✓', '✓'],
          ['Criar solicitações, itens, cotações, contribuições, documentos e tarefas', '✓', '✓', '✓'],
          ['Editar o que criou ou o que está sob sua responsabilidade', '✓', '✓', '✓'],
          ['Editar e excluir registros de qualquer pessoa', '—', '✓', '✓'],
          ['Editar categorias de gastos', '—', '✓', '✓'],
          ['Ver e marcar documentos restritos', '—', '✓', '✓'],
          ['Excluir solicitações (tickets) e entregáveis', '—', '—', '✓'],
          ['Usuários, papéis, integrantes, orçamento, restauração e backup', '—', '—', '✓'],
        ].map((r) => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join('')}
      </tbody></table></div>
      <p class="muted" style="font-size:12px;margin-top:8px">Estas regras são aplicadas pelo banco de dados (RLS), não apenas pela interface.</p>`);

    if (!adm) return;
    const save = async (fn, ok) => { try { await fn(); U.toast(ok); await HK.loadRefs(); } catch (e) { U.toast(U.errMsg(e), 'error'); } HK.refresh(); };
    el.querySelectorAll('[data-papel]').forEach((s) => s.addEventListener('change', () => save(() => HK.db.update('perfis', s.dataset.papel, { papel: s.value }), 'Papel atualizado.')));
    el.querySelectorAll('[data-ativo]').forEach((c) => c.addEventListener('change', () => save(() => HK.db.update('perfis', c.dataset.ativo, { ativo: c.checked }), c.checked ? 'Usuário ativado.' : 'Usuário desativado.')));
    el.querySelectorAll('[data-nome]').forEach((i) => i.addEventListener('change', () => { if (i.value.trim()) save(() => HK.db.update('perfis', i.dataset.nome, { nome: i.value.trim() }), 'Nome atualizado.'); }));
    el.querySelectorAll('[data-vinc]').forEach((s) => s.addEventListener('change', () => save(async () => {
      const pid = s.dataset.vinc;
      const atual = HK.state.integrantes.find((i) => i.perfil_id === pid);
      if (atual && atual.id !== s.value) await HK.db.update('integrantes', atual.id, { perfil_id: null });
      if (s.value) {
        const alvo = HK.state.integrantes.find((i) => i.id === s.value);
        if (alvo.perfil_id && alvo.perfil_id !== pid && !(await U.confirm(`${alvo.nome} já está vinculado a outro usuário. Substituir?`))) return;
        await HK.db.update('integrantes', s.value, { perfil_id: pid });
      }
    }, 'Vínculo atualizado.')));
  }

  /* ---------- integrantes ---------- */
  function integrantes(el) {
    const adm = HK.perm.admin();
    el.insertAdjacentHTML('beforeend', `
      <div class="table-wrap"><table class="table"><thead><tr><th>Ordem</th><th>Nome</th><th>Usuário vinculado</th><th>Divide os gastos?</th><th>Exceção manual</th></tr></thead><tbody>
        ${HK.integrantesRateio().map((i) => { const acesso = HK.db.mode === 'demo' || HK.temAcesso(i); const orig = HK.state.integrantes.find((x) => x.id === i.id); return `<tr><td style="width:90px">${adm ? `<input type="number" min="1" step="1" data-ordem="${i.id}" value="${i.ordem}" aria-label="Ordem" style="width:70px">` : i.ordem}</td>
          <td>${adm ? `<input type="text" data-inome="${i.id}" value="${U.esc(i.nome)}" aria-label="Nome">` : `<b>${U.esc(i.nome)}</b>`}</td>
          <td>${i.perfil_id ? `${U.esc(HK.perfilNome(i.perfil_id))}${acesso ? '' : ' <span class="tag">inativo</span>'}` : '<span class="muted">nenhum</span>'}</td>
          <td>${i.participa_rateio ? U.chip('Sim', 'good') : U.chip(acesso ? 'Não (exceção manual)' : 'Não (sem login ativo)', 'neutral')}</td>
          <td><label class="check"><input type="checkbox" data-rateio="${i.id}" ${orig.participa_rateio !== false ? '' : 'checked'} ${adm ? '' : 'disabled'}> retirar da divisão</label></td></tr>`; }).join('')}
      </tbody></table></div>
      <p class="muted" style="font-size:12px;margin-top:8px"><b>Regra:</b> dividem os gastos compartilhados os integrantes com <b>login ativo vinculado</b> (aba "Usuários e permissões"). Desativar o acesso de alguém retira essa pessoa da divisão; a exceção manual retira alguém mesmo com acesso.
        A ordem define a quem vão os centavos residuais da divisão (um centavo para cada, a partir do primeiro). Integrantes não são excluídos, para preservar o histórico financeiro.</p>
      ${adm ? `<form id="int-form" style="display:flex;gap:8px;margin-top:12px;max-width:460px"><input type="text" name="nome" placeholder="Novo integrante" aria-label="Novo integrante"><button class="btn" type="submit">${U.icon('plus')} Adicionar</button></form>` : ''}`);
    if (!adm) return;
    const save = async (fn) => { try { await fn(); await HK.loadRefs(); U.toast('Integrante atualizado.'); } catch (e) { U.toast(U.errMsg(e), 'error'); } HK.refresh(); };
    el.querySelectorAll('[data-ordem]').forEach((i) => i.addEventListener('change', () => { const n = parseInt(i.value, 10); if (n > 0) save(() => HK.db.update('integrantes', i.dataset.ordem, { ordem: n })); }));
    el.querySelectorAll('[data-inome]').forEach((i) => i.addEventListener('change', () => { if (i.value.trim()) save(() => HK.db.update('integrantes', i.dataset.inome, { nome: i.value.trim() })); }));
    el.querySelectorAll('[data-rateio]').forEach((c) => c.addEventListener('change', () => save(() => HK.db.update('integrantes', c.dataset.rateio, { participa_rateio: !c.checked }))));
    el.querySelector('#int-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const nome = e.target.nome.value.trim();
      if (nome) save(() => HK.db.insert('integrantes', { nome, ordem: HK.state.integrantes.length + 1 }));
    });
  }

  /* ---------- histórico ---------- */
  async function historico(el) {
    const eq = {};
    if (st.tabela) eq.tabela = st.tabela;
    if (st.acao) eq.acao = st.acao;
    if (st.usuario) eq.usuario_id = st.usuario;
    const rows = await HK.db.list('historico', { eq, limit: st.limite });
    const adm = HK.perm.admin();
    el.insertAdjacentHTML('beforeend', `
      <div class="toolbar"><div class="filters">
        <select data-h="tabela" aria-label="Área">${U.opts(TABELAS_BACKUP.filter((t) => t !== 'historico' && t !== 'ticket_comentarios'), st.tabela, { empty: 'Área: todas', label: (t) => HK.histTabela(t) })}</select>
        <select data-h="acao" aria-label="Ação">${U.opts([['INSERT', 'Criações'], ['UPDATE', 'Alterações'], ['DELETE', 'Exclusões']], st.acao, { empty: 'Ação: todas', value: (x) => x[0], label: (x) => x[1] })}</select>
        <select data-h="usuario" aria-label="Usuário">${U.opts(HK.state.perfis, st.usuario, { empty: 'Usuário: todos', label: (p) => p.nome || p.email })}</select>
      </div><span class="grow"></span><button class="btn" id="h-csv">${U.icon('download')} CSV</button></div>
      ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Quando</th><th>Quem</th><th>O quê</th><th>Detalhes</th>${adm ? '<th class="actions"></th>' : ''}</tr></thead><tbody>
        ${rows.map((h) => { const x = HK.histTexto(h); const pode = adm && RESTAURAVEIS.includes(h.tabela) && h.acao !== 'INSERT'; return `<tr>
          <td class="nowrap">${U.fmtDateTime(h.em)}</td><td>${U.esc(x.quem)}</td><td>${U.esc(x.texto)}</td><td><small>${U.esc(x.detalhe)}</small></td>
          ${adm ? `<td class="actions">${pode ? `<button class="btn btn-sm" data-rest="${h.id}" title="${h.acao === 'DELETE' ? 'Recriar o registro excluído' : 'Voltar aos valores anteriores a esta alteração'}">${U.icon('restore')} ${h.acao === 'DELETE' ? 'Restaurar' : 'Reverter'}</button>` : ''}</td>` : ''}</tr>`; }).join('')}
      </tbody></table></div>
      ${rows.length >= st.limite ? `<button class="btn" id="h-more" style="margin-top:12px">Carregar mais</button>` : ''}` : U.empty('Nenhuma alteração registrada com esses filtros.')}
      <p class="muted" style="font-size:12px;margin-top:8px">O histórico é gravado automaticamente pelo banco (inclusive valores anteriores), não pode ser editado e permite recuperar registros excluídos.</p>`);
    el.querySelectorAll('[data-h]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.h] = s.value; st.limite = 150; HK.refresh(); }));
    const more = el.querySelector('#h-more'); if (more) more.addEventListener('click', () => { st.limite += 150; HK.refresh(); });
    el.querySelector('#h-csv').addEventListener('click', () => U.download(`historico-${U.stamp()}.csv`, U.toCSV(rows, [
      { label: 'Quando', value: (h) => U.fmtDateTime(h.em) }, { label: 'Usuário', value: (h) => h.usuario_nome || '' }, { label: 'Ação', value: (h) => h.acao },
      { label: 'Área', value: (h) => HK.histTabela(h.tabela) }, { label: 'Registro', value: (h) => HK.histRotulo(h) }, { label: 'Mudanças', value: (h) => HK.histMudancas(h).join(' · ') },
    ]), 'text/csv;charset=utf-8'));
    el.querySelectorAll('[data-rest]').forEach((b) => b.addEventListener('click', async () => {
      const h = rows.find((r) => String(r.id) === b.dataset.rest);
      const del = h.acao === 'DELETE';
      if (!(await U.confirm(del ? `Restaurar ${HK.histTabela(h.tabela)} "${HK.histRotulo(h)}" excluído(a) em ${U.fmtDateTime(h.em)}?` : `Reverter ${HK.histTabela(h.tabela)} "${HK.histRotulo(h)}" para os valores anteriores a ${U.fmtDateTime(h.em)}?`, { okLabel: del ? 'Restaurar' : 'Reverter' }))) return;
      try {
        if (del) await HK.db.insert(h.tabela, h.dados_antes);
        else {
          const patch = { ...h.dados_antes };
          ['id', 'criado_em', 'atualizado_em', 'criado_por', 'numero'].forEach((k) => delete patch[k]);
          await HK.db.update(h.tabela, h.registro_id, patch);
        }
        U.toast(del ? 'Registro restaurado.' : 'Alteração revertida.'); await HK.loadRefs(); HK.refresh();
      } catch (e) { U.toast(U.errMsg(e), 'error'); }
    }));
  }

  /* ---------- backup ---------- */
  function backup(el) {
    if (!HK.perm.admin()) { el.insertAdjacentHTML('beforeend', '<div class="notice">Somente o administrador pode gerar backups completos. Cada tela possui exportação CSV dos dados exibidos.</div>'); return; }
    el.insertAdjacentHTML('beforeend', `
      <div class="cards cols-2">
        <div class="card"><div class="card-head">${U.icon('download')}<h3>Backup completo (JSON)</h3></div>
          <p>Baixa todas as tabelas em um único arquivo, incluindo o histórico. Guarde uma cópia periodicamente (por exemplo, ao fim de cada etapa da competição).</p>
          <button class="btn btn-primary" id="b-json">${U.icon('download')} Baixar backup JSON</button></div>
        <div class="card"><div class="card-head">${U.icon('list')}<h3>Tabelas em CSV (para reimportação)</h3></div>
          <p>CSV padrão (vírgula, valores brutos) compatível com o importador do Supabase (Table Editor → Insert → Import data from CSV).</p>
          <div style="display:flex;flex-wrap:wrap;gap:6px">${TABELAS_BACKUP.map((t) => `<button class="btn btn-sm" data-csv="${t}">${t}</button>`).join('')}</div></div>
      </div>
      <div class="notice" style="margin-top:14px">${U.icon('info')} Fotografias e anexos ficam no armazenamento do Supabase (buckets <code>fotos-itens</code> e <code>documentos</code>) e não entram no JSON; o backup guarda os caminhos. Para copiar os arquivos, use o painel do Supabase (Storage).
        Recuperação: registros excluídos podem ser restaurados em "Histórico de alterações"; uma base inteira pode ser recriada executando <code>supabase/schema.sql</code> e importando os CSV.</div>`);
    const listAll = async (t) => (HK.db.listAll ? HK.db.listAll(t) : HK.db.list(t));
    el.querySelector('#b-json').addEventListener('click', async (e) => {
      const b = e.currentTarget; b.disabled = true; b.textContent = 'Gerando…';
      try {
        const out = { gerado_em: new Date().toISOString(), origem: HK.db.mode, tabelas: {} };
        for (const t of TABELAS_BACKUP) out.tabelas[t] = await listAll(t);
        U.download(`hackies2026-backup-${U.stamp()}.json`, JSON.stringify(out, null, 2), 'application/json');
        U.toast('Backup gerado.');
      } catch (err) { U.toast(U.errMsg(err), 'error'); }
      b.disabled = false; b.innerHTML = `${U.icon('download')} Baixar backup JSON`;
    });
    el.querySelectorAll('[data-csv]').forEach((b) => b.addEventListener('click', async () => {
      try {
        const rows = await listAll(b.dataset.csv);
        if (!rows.length) { U.toast('Tabela vazia.', 'info'); return; }
        const cols = Object.keys(rows[0]).map((k) => ({ label: k, value: (r) => (r[k] == null ? '' : typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) }));
        U.download(`${b.dataset.csv}-${U.stamp()}.csv`, U.toCSV(rows, cols, ',').replace(/^﻿/, ''), 'text/csv;charset=utf-8');
      } catch (err) { U.toast(U.errMsg(err), 'error'); }
    }));
  }

  HK.views.admin = {
    async render(el, route, alive) {
      const sub = TABS.some(([k]) => k === route.sub) ? route.sub : '';
      if (!HK.state.perfis.length) HK.state.perfis = await HK.db.list('perfis');
      if (!alive()) return;
      el.innerHTML = `<nav class="tabs" aria-label="Administração">${TABS.map(([k, l]) => `<a href="#/admin${k ? '/' + k : ''}" class="${k === sub ? 'on' : ''}">${l}</a>`).join('')}</nav>`;
      if (sub === 'integrantes') integrantes(el);
      else if (sub === 'historico') await historico(el);
      else if (sub === 'backup') backup(el);
      else await usuarios(el);
    },
  };
})(window.HK = window.HK || {});
