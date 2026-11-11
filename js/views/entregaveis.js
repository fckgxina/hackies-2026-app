/* Entregáveis e atividades (tarefas). */
(function (HK) {
  'use strict';
  const U = HK.util;

  const ST_ENT = ['Não iniciado', 'Em andamento', 'Em revisão', 'Concluído', 'Enviado'];
  const ST_TAR = ['A fazer', 'Em andamento', 'Concluída', 'Bloqueada'];
  const PRIO = ['Baixa', 'Média', 'Alta', 'Urgente'];
  const st = { responsavel: '', status: '', entregavel: '', ocultarConcluidas: false };
  let D = { ent: [], tar: [], docs: [] };

  async function load() {
    const [ent, tar, docs] = await Promise.all([HK.db.list('entregaveis', { order: 'prazo', asc: true }), HK.db.list('tarefas', { order: 'prazo', asc: true }), HK.db.list('documentos')]);
    D = { ent, tar, docs };
  }

  function entForm(e0) {
    const e = e0 || { status: 'Não iniciado' };
    const m = U.modal({
      title: e0 ? `Editar · ${e0.nome}` : 'Novo entregável',
      body: `<form class="form" novalidate>
        ${U.field('Nome', `<input type="text" name="nome" required value="${U.esc(e.nome)}">`, { req: true, full: true })}
        ${U.field('Etapa', `<input type="text" name="etapa" placeholder="ex.: Etapa 1 (on-line)" value="${U.esc(e.etapa)}">`)}
        ${U.field('Prazo', `<input type="date" name="prazo" value="${U.esc(e.prazo || '')}">`)}
        ${U.field('Responsável', `<select name="responsavel_id">${HK.integranteOpts(e.responsavel_id, '— a definir —')}</select>`)}
        ${U.field('Status', `<select name="status">${U.opts(ST_ENT, e.status)}</select>`)}
        ${U.field('Descrição / exigências', `<textarea name="descricao" rows="3">${U.esc(e.descricao)}</textarea>`, { full: true, hint: 'Cite a fonte oficial (edital/guia) quando houver.' })}
        ${U.field('Observações', `<textarea name="observacoes" rows="2">${U.esc(e.observacoes)}</textarea>`, { full: true })}</form>`,
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Salvar</button>',
    });
    U.bindForm(m, async (v) => {
      const row = { nome: v.nome, etapa: v.etapa || null, prazo: v.prazo || null, responsavel_id: v.responsavel_id || null, status: v.status, descricao: v.descricao || null, observacoes: v.observacoes || null };
      if (e0) await HK.db.update('entregaveis', e0.id, row); else await HK.db.insert('entregaveis', row);
      m.close(); U.toast('Entregável salvo.'); HK.refresh();
    });
  }

  function tarForm(t0, entregavelId) {
    const t = t0 || { status: 'A fazer', prioridade: 'Média', entregavel_id: entregavelId || '', responsavel_id: HK.state.me ? HK.state.me.id : '' };
    const m = U.modal({
      title: t0 ? 'Editar tarefa' : 'Nova tarefa',
      body: `<form class="form" novalidate>
        ${U.field('Tarefa', `<input type="text" name="titulo" required value="${U.esc(t.titulo)}">`, { req: true, full: true })}
        ${U.field('Responsável', `<select name="responsavel_id">${HK.integranteOpts(t.responsavel_id, '— a definir —')}</select>`)}
        ${U.field('Prazo', `<input type="date" name="prazo" value="${U.esc(t.prazo || '')}">`)}
        ${U.field('Prioridade', `<select name="prioridade">${U.opts(PRIO, t.prioridade)}</select>`)}
        ${U.field('Status', `<select name="status">${U.opts(ST_TAR, t.status)}</select>`)}
        ${U.field('Entregável', `<select name="entregavel_id">${U.opts(D.ent, t.entregavel_id, { empty: '— nenhum —' })}</select>`, { full: true })}
        ${U.field('Descrição', `<textarea name="descricao" rows="3">${U.esc(t.descricao)}</textarea>`, { full: true })}</form>`,
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Salvar</button>',
    });
    U.bindForm(m, async (v) => {
      const row = { titulo: v.titulo, responsavel_id: v.responsavel_id || null, prazo: v.prazo || null, prioridade: v.prioridade, status: v.status, entregavel_id: v.entregavel_id || null, descricao: v.descricao || null };
      if (t0) await HK.db.update('tarefas', t0.id, row); else await HK.db.insert('tarefas', row);
      m.close(); U.toast('Tarefa salva.'); HK.refresh();
    });
  }

  function draw(el) {
    const tarefas = D.tar.filter((t) => (!st.responsavel || t.responsavel_id === st.responsavel) && (!st.status || t.status === st.status) &&
      (!st.entregavel || t.entregavel_id === st.entregavel) && (!st.ocultarConcluidas || t.status !== 'Concluída'));
    const prazoTxt = (iso, done) => { if (!iso) return '—'; const n = U.daysUntil(iso); return `${U.fmtDate(iso)}${done ? '' : `<br><small class="${n < 0 ? 'overdue' : n <= 3 ? 'soon' : 'muted'}">${U.prazoLabel(iso)}</small>`}`; };

    el.innerHTML = `
      <div class="toolbar"><h2 style="font-size:16px">Entregáveis</h2><span class="grow"></span>
        ${HK.perm.editor() ? `<button class="btn" id="e-new">${U.icon('plus')} Novo entregável</button>` : ''}</div>
      <p class="muted" style="margin-top:-6px">Materiais obrigatórios conforme o guia "Desafios e Premiações" v1.1 (p. 2). Formatos, horários e links: edital (arts. 26–29) e grupo oficial da HACKIES.</p>
      ${D.ent.length ? `<div class="cards cols-3">${D.ent.map((e) => {
        const ts = D.tar.filter((t) => t.entregavel_id === e.id); const ok = ts.filter((t) => t.status === 'Concluída').length;
        const docs = D.docs.filter((d) => d.entregavel_id === e.id); const done = ['Concluído', 'Enviado'].includes(e.status); const pode = HK.perm.canEdit(e);
        return `<div class="card"><div class="card-head"><h3>${U.esc(e.nome)}</h3>${pode ? `<button class="btn-icon" data-eedit="${e.id}" aria-label="Editar">${U.icon('edit')}</button>` : ''}${HK.perm.admin() ? `<button class="btn-icon danger" data-edel="${e.id}" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</div>
          <dl class="detail-grid" style="grid-template-columns:1fr 1fr">
            <div><dt>Etapa</dt><dd>${U.esc(e.etapa || '—')}</dd></div><div><dt>Prazo</dt><dd>${prazoTxt(e.prazo, done)}</dd></div>
            <div><dt>Responsável</dt><dd>${U.esc(e.responsavel_id ? HK.nome(e.responsavel_id) : '—')}</dd></div>
            <div><dt>Status</dt><dd>${pode ? `<select data-est="${e.id}" aria-label="Status do entregável" style="min-height:30px;padding:3px 6px">${U.opts(ST_ENT, e.status)}</select>` : U.chip(e.status)}</dd></div></dl>
          ${e.descricao ? `<p class="muted" style="font-size:12.5px">${U.esc(e.descricao)}</p>` : ''}
          <div style="font-size:12.5px;margin-bottom:6px">Tarefas: <b>${ok}/${ts.length}</b> concluídas</div>${U.progress(ts.length ? (ok / ts.length) * 100 : 0, ok === ts.length && ts.length ? 'good' : '')}
          <div style="font-size:12.5px;margin-top:10px">Documentos vinculados: ${docs.length ? docs.map((d) => `<a href="#/documentos">${U.esc(d.nome)}</a> ${U.chip(d.status)}`).join(' ') : '<span class="muted">nenhum</span>'}</div>
          <button class="btn btn-sm" style="margin-top:12px" data-tnew="${e.id}">${U.icon('plus')} Tarefa</button></div>`; }).join('')}</div>` : U.empty('Nenhum entregável cadastrado.')}

      <div class="toolbar" style="margin-top:26px"><h2 style="font-size:16px">Atividades</h2>
        <div class="filters">
          <select data-f="responsavel" aria-label="Responsável">${U.opts(HK.state.integrantes, st.responsavel, { empty: 'Responsável: todos' })}</select>
          <select data-f="status" aria-label="Status">${U.opts(ST_TAR, st.status, { empty: 'Status: todos' })}</select>
          <select data-f="entregavel" aria-label="Entregável">${U.opts(D.ent, st.entregavel, { empty: 'Entregável: todos' })}</select>
          <label class="check"><input type="checkbox" id="t-hide" ${st.ocultarConcluidas ? 'checked' : ''}> Ocultar concluídas</label></div>
        <span class="grow"></span><button class="btn btn-primary" id="t-new">${U.icon('plus')} Nova tarefa</button><button class="btn" id="t-csv">${U.icon('download')} CSV</button></div>
      ${D.tar.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Tarefa</th><th>Entregável</th><th>Responsável</th><th>Prazo</th><th>Prioridade</th><th>Status</th><th class="actions"></th></tr></thead><tbody>
        ${tarefas.map((t) => { const pode = HK.perm.canEdit(t); return `<tr><td class="title-cell"><b>${U.esc(t.titulo)}</b>${t.descricao ? `<small>${U.esc(t.descricao.slice(0, 120))}</small>` : ''}</td>
          <td>${U.esc((D.ent.find((e) => e.id === t.entregavel_id) || {}).nome || '—')}</td><td>${U.esc(t.responsavel_id ? HK.nome(t.responsavel_id) : '—')}</td>
          <td class="nowrap">${prazoTxt(t.prazo, t.status === 'Concluída')}</td><td>${U.chip(t.prioridade)}</td>
          <td>${pode ? `<select data-tst="${t.id}" aria-label="Status da tarefa" style="min-height:30px;padding:3px 6px">${U.opts(ST_TAR, t.status)}</select>` : U.chip(t.status)}</td>
          <td class="actions">${pode ? `<button class="btn-icon" data-tedit="${t.id}" aria-label="Editar">${U.icon('edit')}</button>` : ''}${HK.perm.editor() || HK.perm.own(t) ? `<button class="btn-icon danger" data-tdel="${t.id}" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</td></tr>`; }).join('') || '<tr><td colspan="7" class="muted">Nenhuma tarefa com esses filtros.</td></tr>'}
      </tbody></table></div>` : U.empty('Nenhuma tarefa cadastrada. Divida cada entregável em atividades com responsável e prazo.')}`;

    const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
    const n = el.querySelector('#e-new'); if (n) n.addEventListener('click', () => entForm(null));
    el.querySelector('#t-new').addEventListener('click', () => tarForm(null));
    el.querySelector('#t-hide').addEventListener('change', (e) => { st.ocultarConcluidas = e.target.checked; draw(el); });
    el.querySelector('#t-csv').addEventListener('click', () => U.download(`tarefas-${U.stamp()}.csv`, U.toCSV(tarefas, [
      { label: 'Tarefa', value: (t) => t.titulo }, { label: 'Entregável', value: (t) => (D.ent.find((e) => e.id === t.entregavel_id) || {}).nome || '' },
      { label: 'Responsável', value: (t) => (t.responsavel_id ? HK.nome(t.responsavel_id) : '') }, { label: 'Prazo', value: (t) => (t.prazo ? U.fmtDate(t.prazo) : '') },
      { label: 'Prioridade', value: (t) => t.prioridade }, { label: 'Status', value: (t) => t.status }, { label: 'Descrição', value: (t) => t.descricao || '' }]), 'text/csv;charset=utf-8'));
    el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; draw(el); }));
    on('[data-eedit]', (b) => entForm(D.ent.find((e) => e.id === b.dataset.eedit)));
    on('[data-tnew]', (b) => tarForm(null, b.dataset.tnew));
    on('[data-tedit]', (b) => tarForm(D.tar.find((t) => t.id === b.dataset.tedit)));
    on('[data-edel]', async (b) => {
      const e = D.ent.find((x) => x.id === b.dataset.edel);
      if (!(await U.confirm(`Excluir o entregável "${e.nome}"? Tarefas e documentos vinculados são mantidos, sem vínculo.`, { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('entregaveis', e.id); U.toast('Entregável excluído.'); HK.refresh(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
    on('[data-tdel]', async (b) => {
      if (!(await U.confirm('Excluir esta tarefa?', { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('tarefas', b.dataset.tdel); U.toast('Tarefa excluída.'); HK.refresh(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
    const quick = (sel, table, attr) => el.querySelectorAll(sel).forEach((s) => s.addEventListener('change', async () => {
      try { await HK.db.update(table, s.dataset[attr], { status: s.value }); U.toast('Status atualizado.'); await load(); draw(el); } catch (err) { U.toast(U.errMsg(err), 'error'); HK.refresh(); }
    }));
    quick('[data-est]', 'entregaveis', 'est');
    quick('[data-tst]', 'tarefas', 'tst');
  }

  HK.views.entregaveis = {
    async render(el, route, alive) { await load(); if (!alive()) return; draw(el); },
  };
})(window.HK = window.HK || {});
