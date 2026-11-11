/* Central de Solicitações (tickets + Kanban). */
(function (HK) {
  'use strict';
  const U = HK.util;

  const STATUS = ['Nova', 'Em análise', 'Em andamento', 'Concluída', 'Não realizada'];
  const COLS = { 'Nova': 'Novas solicitações', 'Em análise': 'Em análise', 'Em andamento': 'Em andamento', 'Concluída': 'Concluídas', 'Não realizada': 'Não realizadas' };
  const CATEGORIAS = ['Pesquisa', 'Modificação', 'Correção', 'Nova ideia'];
  const PRIORIDADES = ['Baixa', 'Média', 'Alta', 'Urgente'];
  const AREAS = ['Pesquisa', 'Desenvolvimento', 'Apresentação', 'Documentos e entregáveis', 'Gastos', 'Aplicação web', 'Outros'];
  const PRIO_ORD = { Urgente: 0, Alta: 1, 'Média': 2, Baixa: 3 };

  const st = { filtros: { categoria: '', solicitante: '', prioridade: '', status: '', area: '', q: '' }, modo: null };
  let cache = { tickets: [], comentarios: [], documentos: [] };

  const modo = () => st.modo || (() => { try { return localStorage.getItem('hk_tk_modo') || 'kanban'; } catch (e) { return 'kanban'; } })();

  function filtrar(list) {
    const f = st.filtros, q = U.normalize(f.q);
    return list.filter((t) =>
      (!f.categoria || t.categoria === f.categoria) && (!f.solicitante || t.solicitante_id === f.solicitante) &&
      (!f.prioridade || t.prioridade === f.prioridade) && (!f.status || t.status === f.status) && (!f.area || t.area === f.area) &&
      (!q || U.normalize(`${HK.ticketId(t.numero)} ${t.titulo} ${t.descricao}`).includes(q)));
  }

  async function load() {
    const [tickets, comentarios, documentos] = await Promise.all([HK.db.list('tickets'), HK.db.list('ticket_comentarios'), HK.db.list('documentos')]);
    cache = { tickets, comentarios, documentos };
  }

  /* ---------- mudança de status (com exigências) ---------- */
  async function mudarStatus(t, novo) {
    if (t.status === novo) return false;
    if (!HK.perm.canEdit(t)) { U.toast('Você não tem permissão para alterar esta solicitação.', 'error'); return false; }
    const patch = { status: novo };
    if (novo === 'Concluída') {
      const r = await U.promptText(`Concluir ${HK.ticketId(t.numero)}`, 'Resumo da solução (obrigatório)', { value: t.resumo_solucao, required: true, okLabel: 'Concluir' });
      if (r == null) return false;
      patch.resumo_solucao = r; patch.data_conclusao = t.data_conclusao || U.todayISO();
    } else if (novo === 'Não realizada') {
      const r = await U.promptText(`Não realizar ${HK.ticketId(t.numero)}`, 'Justificativa (obrigatória)', { value: t.motivo_nao_realizacao, required: true, okLabel: 'Confirmar' });
      if (r == null) return false;
      patch.motivo_nao_realizacao = r; patch.data_conclusao = t.data_conclusao || U.todayISO();
    } else {
      patch.data_conclusao = null;
    }
    await HK.db.update('tickets', t.id, patch);
    U.toast(`${HK.ticketId(t.numero)} → ${novo}`);
    return true;
  }

  /* ---------- formulário (novo / edição) ---------- */
  function formHTML(t, editavel) {
    const dis = editavel ? '' : 'disabled';
    const v = t || { prioridade: 'Média', categoria: '', solicitante_id: HK.state.me ? HK.state.me.id : '' };
    return `<form class="form" novalidate>
      ${U.field('Título', `<input type="text" name="titulo" required maxlength="160" value="${U.esc(v.titulo)}" ${dis}>`, { req: true, full: true })}
      ${U.field('Categoria', `<select name="categoria" required ${dis}>${U.opts(CATEGORIAS, v.categoria, { empty: '— selecione —' })}</select>`, { req: true })}
      ${U.field('Prioridade', `<select name="prioridade" required ${dis}>${U.opts(PRIORIDADES, v.prioridade)}</select>`, { req: true })}
      ${U.field('Solicitante', `<select name="solicitante_id" required ${dis}>${HK.integranteOpts(v.solicitante_id)}</select>`, { req: true })}
      ${U.field('Área relacionada', `<select name="area" ${dis}>${U.opts(AREAS, v.area, { empty: '—' })}</select>`)}
      ${U.field('Descrição detalhada', `<textarea name="descricao" rows="4" required ${dis}>${U.esc(v.descricao)}</textarea>`, { req: true, full: true })}
      ${U.field('Justificativa', `<textarea name="justificativa" rows="2" ${dis}>${U.esc(v.justificativa)}</textarea>`, { full: true })}
      ${U.field('Resultado esperado', `<textarea name="resultado_esperado" rows="2" ${dis}>${U.esc(v.resultado_esperado)}</textarea>`, { full: true })}
      <div class="form-section">Acompanhamento</div>
      ${t ? U.field('Status', `<select name="status" ${dis}>${U.opts(STATUS, v.status)}</select>`) : ''}
      ${U.field('Responsável', `<select name="responsavel_id" ${dis}>${HK.integranteOpts(v.responsavel_id, '— a definir —')}</select>`)}
      ${U.field('Prazo', `<input type="date" name="prazo" value="${U.esc(v.prazo || '')}" ${dis}>`)}
      ${U.field('Link do tópico no Obsidian', `<input type="text" name="link_obsidian" placeholder="obsidian://… ou 01 - Pesquisa/…" value="${U.esc(v.link_obsidian)}" ${dis}>`, { hint: 'No Obsidian: botão direito na nota → "Copiar URL do Obsidian". Também aceita o caminho da nota.' })}
      ${U.field('Decisão técnica vinculada', `<input type="text" name="decisao_ref" placeholder="ex.: DEC-002" value="${U.esc(v.decisao_ref)}" ${dis}>`, { hint: 'ID do Histórico de Decisões (Obsidian).' })}
      ${U.field('Documento vinculado', `<select name="documento_id" ${dis}>${U.opts(cache.documentos, v.documento_id, { empty: '— nenhum —' })}</select>`)}
      ${t ? U.field('Observações', `<textarea name="observacoes" rows="2" ${dis}>${U.esc(v.observacoes)}</textarea>`, { full: true }) : ''}
      ${t ? `<div class="form-section">Encerramento</div>
        ${U.field('Resumo da solução', `<textarea name="resumo_solucao" rows="3" ${dis}>${U.esc(v.resumo_solucao)}</textarea>`, { full: true, hint: 'Obrigatório para concluir.' })}
        ${U.field('Justificativa de não realização', `<textarea name="motivo_nao_realizacao" rows="2" ${dis}>${U.esc(v.motivo_nao_realizacao)}</textarea>`, { full: true, hint: 'Obrigatória para "Não realizada".' })}
        ${U.field('Data de conclusão', `<input type="date" name="data_conclusao" value="${U.esc(v.data_conclusao || '')}" ${dis}>`)}` : ''}
    </form>`;
  }

  const limpar = (v) => {
    const o = { ...v };
    ['solicitante_id', 'responsavel_id', 'documento_id', 'prazo', 'data_conclusao', 'area'].forEach((k) => { if (k in o && !o[k]) o[k] = null; });
    return o;
  };
  const validar = (v) => {
    const e = {};
    if (v.status === 'Concluída' && !v.resumo_solucao) e.resumo_solucao = 'Informe o resumo da solução para concluir.';
    if (v.status === 'Não realizada' && !v.motivo_nao_realizacao) e.motivo_nao_realizacao = 'Informe a justificativa.';
    return e;
  };

  function novo() {
    const m = U.modal({
      title: 'Nova solicitação', size: 'lg', body: formHTML(null, true),
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Registrar solicitação</button>',
    });
    U.bindForm(m, async (v) => {
      const row = await HK.db.insert('tickets', limpar({ ...v, status: 'Nova' }));
      m.close();
      U.toast(`${HK.ticketId(row.numero)} registrada.`);
      HK.refresh();
    });
  }

  function markdown(t) {
    const L = [`### ${HK.ticketId(t.numero)} — ${t.titulo}`, '',
      `- **Categoria:** ${t.categoria} · **Prioridade:** ${t.prioridade} · **Status:** ${t.status}`,
      `- **Solicitante:** ${HK.nome(t.solicitante_id)} · **Responsável:** ${HK.nome(t.responsavel_id)}`,
      `- **Criada em:** ${U.fmtDate(U.isoFromTimestamp(t.criado_em))}${t.data_conclusao ? ` · **Encerrada em:** ${U.fmtDate(t.data_conclusao)}` : ''}`];
    if (t.link_obsidian) L.push(`- **Tópico:** ${t.link_obsidian}`);
    if (t.decisao_ref) L.push(`- **Decisão:** ${t.decisao_ref}`);
    L.push('', `**Descrição:** ${t.descricao || '—'}`);
    if (t.resultado_esperado) L.push('', `**Resultado esperado:** ${t.resultado_esperado}`);
    if (t.resumo_solucao) L.push('', `**Resumo da solução:** ${t.resumo_solucao}`);
    if (t.motivo_nao_realizacao) L.push('', `**Justificativa de não realização:** ${t.motivo_nao_realizacao}`);
    return L.join('\n') + '\n';
  }

  async function detalhe(id) {
    const t = cache.tickets.find((x) => x.id === id);
    if (!t) { U.toast('Solicitação não encontrada.', 'error'); return; }
    const editavel = HK.perm.canEdit(t);
    const coms = cache.comentarios.filter((c) => c.ticket_id === t.id);
    const hist = await HK.db.list('historico', { eq: { tabela: 'tickets', registro_id: t.id }, limit: 30 }).catch(() => []);
    const obs = HK.obsidianHref(t.link_obsidian);
    const m = U.modal({
      title: `${HK.ticketId(t.numero)} · ${t.titulo}`, size: 'lg',
      body: `<dl class="detail-grid">
          <div><dt>Status</dt><dd>${U.chip(t.status)}</dd></div>
          <div><dt>Prioridade</dt><dd>${U.chip(t.prioridade)}</dd></div>
          <div><dt>Criada em</dt><dd>${U.fmtDateTime(t.criado_em)}</dd></div>
          <div><dt>Registrada por</dt><dd>${U.esc(HK.perfilNome(t.criado_por))}</dd></div>
          ${obs ? `<div><dt>Tópico no Obsidian</dt><dd><a href="${U.esc(obs)}">${U.icon('external')} Abrir no Obsidian</a></dd></div>` : ''}
        </dl>
        ${editavel ? '' : '<div class="notice" style="margin-bottom:12px">Somente leitura: apenas quem registrou, o responsável vinculado ou um editor pode alterar.</div>'}
        ${formHTML(t, editavel)}
        <div class="section-title">Comentários (${coms.length})</div>
        <div class="comments">${coms.map((c) => `<div class="comment"><div class="comment-head"><b>${U.esc(HK.perfilNome(c.autor_id))}</b>
            <span>${U.fmtDateTime(c.criado_em)}${HK.perm.admin() || c.autor_id === HK.state.profile.id ? ` · <a href="#" data-delc="${c.id}">excluir</a>` : ''}</span></div>
            <p>${U.esc(c.texto)}</p></div>`).join('') || '<p class="muted">Nenhum comentário.</p>'}</div>
        <form class="comment-form" style="display:flex;gap:8px;margin-top:10px;align-items:flex-end">
          <label class="field" style="flex:1"><span class="sr-only">Novo comentário</span><textarea name="texto" rows="2" placeholder="Escreva um comentário…"></textarea></label>
          <button class="btn" type="submit">${U.icon('message')} Comentar</button></form>
        <div class="section-title">Histórico desta solicitação</div>
        <ul class="timeline">${hist.map((h) => { const x = HK.histTexto(h); return `<li>${U.icon('history')}<div><b>${U.esc(x.quem)}</b> ${U.esc(x.texto.split(' "')[0])}${x.detalhe ? `<small>${U.esc(x.detalhe)}</small>` : ''}<small>${U.fmtDateTime(h.em)}</small></div></li>`; }).join('') || '<li class="muted">Sem registros.</li>'}</ul>`,
      footer: `${HK.perm.admin() ? `<button class="btn btn-ghost left" data-del>${U.icon('trash')} Excluir</button>` : ''}
        <button class="btn" data-md>${U.icon('copy')} Copiar resumo (Markdown)</button>
        <button class="btn" data-close>Fechar</button>
        ${editavel ? '<button class="btn btn-primary" data-submit>Salvar alterações</button>' : ''}`,
    });
    if (editavel) {
      U.bindForm(m, async (v) => {
        const patch = limpar(v);
        if (['Concluída', 'Não realizada'].includes(patch.status) && !patch.data_conclusao) patch.data_conclusao = U.todayISO();
        if (!['Concluída', 'Não realizada'].includes(patch.status)) patch.data_conclusao = null;
        await HK.db.update('tickets', t.id, patch);
        m.close(); U.toast('Solicitação atualizada.'); HK.refresh();
      }, { validate: validar });
    }
    m.el.querySelector('[data-md]').addEventListener('click', () => U.copyText(markdown(t)));
    const del = m.el.querySelector('[data-del]');
    if (del) del.addEventListener('click', async () => {
      if (!(await U.confirm('Tickets não devem ser apagados — prefira "Não realizada". Excluir mesmo assim? (Fica registrado no histórico e pode ser restaurado.)', { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('tickets', t.id); m.close(); U.toast('Solicitação excluída.'); HK.refresh(); } catch (e) { U.toast(U.errMsg(e), 'error'); }
    });
    m.el.querySelector('.comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const txt = e.target.texto.value.trim();
      if (!txt) return;
      try {
        await HK.db.insert('ticket_comentarios', { ticket_id: t.id, texto: txt });
        await load(); m.close(); detalhe(t.id);
      } catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
    m.el.querySelectorAll('[data-delc]').forEach((a) => a.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!(await U.confirm('Excluir este comentário?', { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('ticket_comentarios', a.dataset.delc); await load(); m.close(); detalhe(t.id); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    }));
  }

  function exportar(list) {
    const cols = [
      { label: 'ID', value: (t) => HK.ticketId(t.numero) }, { label: 'Título', value: (t) => t.titulo },
      { label: 'Categoria', value: (t) => t.categoria }, { label: 'Prioridade', value: (t) => t.prioridade },
      { label: 'Status', value: (t) => t.status }, { label: 'Área', value: (t) => t.area || '' },
      { label: 'Solicitante', value: (t) => HK.nome(t.solicitante_id) }, { label: 'Responsável', value: (t) => (t.responsavel_id ? HK.nome(t.responsavel_id) : '') },
      { label: 'Criada em', value: (t) => U.fmtDate(U.isoFromTimestamp(t.criado_em)) }, { label: 'Prazo', value: (t) => (t.prazo ? U.fmtDate(t.prazo) : '') },
      { label: 'Concluída em', value: (t) => (t.data_conclusao ? U.fmtDate(t.data_conclusao) : '') },
      { label: 'Descrição', value: (t) => t.descricao }, { label: 'Resumo da solução', value: (t) => t.resumo_solucao || '' },
      { label: 'Justificativa (não realizada)', value: (t) => t.motivo_nao_realizacao || '' }, { label: 'Link Obsidian', value: (t) => t.link_obsidian || '' },
      { label: 'Decisão', value: (t) => t.decisao_ref || '' },
    ];
    U.download(`solicitacoes-${U.stamp()}.csv`, U.toCSV(list, cols), 'text/csv;charset=utf-8');
  }

  /* ---------- render ---------- */
  function card(t) {
    const nc = cache.comentarios.filter((c) => c.ticket_id === t.id).length;
    return `<button class="kcard" draggable="${HK.perm.canEdit(t)}" data-id="${t.id}">
      <div class="kcard-top"><span class="kcard-id">${HK.ticketId(t.numero)}</span>${U.chip(t.prioridade)}</div>
      <div class="kcard-title">${U.esc(t.titulo)}</div>
      <div class="kcard-meta"><span class="tag">${U.esc(t.categoria)}</span><span>${U.esc(HK.nome(t.solicitante_id))}</span>
        <span>${U.fmtDate(U.isoFromTimestamp(t.criado_em))}</span>${t.prazo ? `<span class="${U.daysUntil(t.prazo) < 0 && !['Concluída', 'Não realizada'].includes(t.status) ? 'overdue' : ''}">${U.icon('clock')} ${U.fmtDate(t.prazo)}</span>` : ''}
        ${nc ? `<span>${U.icon('message')} ${nc}</span>` : ''}<span class="sr-only">Status: ${U.esc(t.status)}</span></div></button>`;
  }

  function draw(el) {
    const all = cache.tickets;
    const list = filtrar(all);
    const f = st.filtros;
    const count = (s) => all.filter((t) => t.status === s).length;
    const urgentes = all.filter((t) => t.prioridade === 'Urgente' && !['Concluída', 'Não realizada'].includes(t.status)).length;
    const m = modo();
    el.innerHTML = `
      <div class="cards cols-6" style="margin-bottom:var(--s5)">
        ${U.kpi('Novas', String(count('Nova')), `de ${all.length} no total`)}${U.kpi('Em análise', String(count('Em análise')))}
        ${U.kpi('Em andamento', String(count('Em andamento')))}${U.kpi('Concluídas', String(count('Concluída')))}
        ${U.kpi('Não realizadas', String(count('Não realizada')))}
        ${U.kpi('Urgentes em aberto', String(urgentes), urgentes ? 'precisam de atenção' : '', { tone: urgentes ? 'critical' : '' })}
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="tk-new">${U.icon('plus')} Nova solicitação</button>
        <div class="filters">
          <input type="search" id="tk-q" placeholder="Buscar…" value="${U.esc(f.q)}" aria-label="Buscar">
          <select data-f="categoria" aria-label="Categoria">${U.opts(CATEGORIAS, f.categoria, { empty: 'Categoria: todas' })}</select>
          <select data-f="solicitante" aria-label="Solicitante">${U.opts(HK.state.integrantes, f.solicitante, { empty: 'Solicitante: todos' })}</select>
          <select data-f="prioridade" aria-label="Prioridade">${U.opts(PRIORIDADES, f.prioridade, { empty: 'Prioridade: todas' })}</select>
          <select data-f="status" aria-label="Status">${U.opts(STATUS, f.status, { empty: 'Status: todos' })}</select>
          <select data-f="area" aria-label="Área">${U.opts(AREAS, f.area, { empty: 'Área: todas' })}</select>
        </div>
        <span class="grow"></span>
        <div class="btn-group" role="group" aria-label="Modo de exibição">
          <button data-modo="kanban" class="${m === 'kanban' ? 'on' : ''}">${U.icon('board')} Quadro</button>
          <button data-modo="lista" class="${m === 'lista' ? 'on' : ''}">${U.icon('list')} Lista</button></div>
        <button class="btn" id="tk-csv">${U.icon('download')} CSV</button>
      </div>
      ${all.length && !list.length ? '<div class="notice" style="margin-bottom:12px">Nenhuma solicitação corresponde aos filtros.</div>' : ''}
      ${!all.length ? U.empty('Nenhuma solicitação registrada. Use "Nova solicitação" para pedir uma pesquisa, modificação, correção ou registrar uma ideia.') :
        m === 'kanban' ? `<div class="kanban">${STATUS.map((s) => { const cs = list.filter((t) => t.status === s).sort((a, b) => PRIO_ORD[a.prioridade] - PRIO_ORD[b.prioridade] || b.criado_em.localeCompare(a.criado_em)); return `
          <section class="kcol" data-status="${s}" aria-label="${COLS[s]}"><div class="kcol-head">${U.chip(s)}<span class="sr-only">${COLS[s]}</span><span class="badge">${cs.length}</span></div>
          <div class="kcol-body">${cs.map(card).join('') || '<p class="muted" style="font-size:12px;padding:4px">—</p>'}</div></section>`; }).join('')}</div>
          <p class="muted" style="font-size:12px;margin-top:6px">Arraste um cartão para mudar o status (no celular, abra o cartão e altere o campo Status). Concluir exige o resumo da solução.</p>`
        : `<div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>Título</th><th>Categoria</th><th>Solicitante</th><th>Prioridade</th><th>Status</th><th>Criada</th><th>Prazo</th></tr></thead>
          <tbody>${list.map((t) => `<tr data-open="${t.id}" style="cursor:pointer"><td class="kcard-id">${HK.ticketId(t.numero)}</td><td class="title-cell"><b>${U.esc(t.titulo)}</b><small>${U.esc(t.area || '')}</small></td>
            <td>${U.esc(t.categoria)}</td><td>${U.esc(HK.nome(t.solicitante_id))}</td><td>${U.chip(t.prioridade)}</td><td>${U.chip(t.status)}</td>
            <td class="nowrap">${U.fmtDate(U.isoFromTimestamp(t.criado_em))}</td><td class="nowrap">${t.prazo ? U.fmtDate(t.prazo) : '—'}</td></tr>`).join('')}</tbody></table></div>`}`;

    el.querySelector('#tk-new').addEventListener('click', novo);
    el.querySelector('#tk-csv').addEventListener('click', () => exportar(list));
    el.querySelector('#tk-q').addEventListener('input', U.debounce((e) => { st.filtros.q = e.target.value; draw(el); const q = el.querySelector('#tk-q'); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }, 250));
    el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st.filtros[s.dataset.f] = s.value; draw(el); }));
    el.querySelectorAll('[data-modo]').forEach((b) => b.addEventListener('click', () => { st.modo = b.dataset.modo; try { localStorage.setItem('hk_tk_modo', st.modo); } catch (e) { /* ok */ } draw(el); }));
    el.querySelectorAll('.kcard, [data-open]').forEach((c) => c.addEventListener('click', () => detalhe(c.dataset.id || c.dataset.open)));

    // arrastar e soltar
    let dragId = null;
    el.querySelectorAll('.kcard[draggable=true]').forEach((c) => {
      c.addEventListener('dragstart', (e) => { dragId = c.dataset.id; c.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId); });
      c.addEventListener('dragend', () => { c.classList.remove('dragging'); });
    });
    el.querySelectorAll('.kcol').forEach((col) => {
      col.addEventListener('dragover', (e) => { if (dragId) { e.preventDefault(); col.classList.add('drop-on'); } });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('drop-on'); });
      col.addEventListener('drop', async (e) => {
        e.preventDefault(); col.classList.remove('drop-on');
        const t = cache.tickets.find((x) => x.id === (dragId || e.dataTransfer.getData('text/plain')));
        dragId = null;
        if (!t) return;
        try { if (await mudarStatus(t, col.dataset.status)) { await load(); draw(el); } } catch (err) { U.toast(U.errMsg(err), 'error'); }
      });
    });
  }

  HK.views.solicitacoes = {
    async render(el, route, alive) {
      await load();
      if (!alive()) return;
      draw(el);
      if (route.params.t) { history.replaceState(null, '', '#/solicitacoes'); detalhe(route.params.t); }
    },
  };
})(window.HK = window.HK || {});
