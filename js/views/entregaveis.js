/* Entregáveis. O trabalho a fazer é registrado como Solicitação (categoria "Tarefa"),
 * vinculada ao entregável; aqui aparece o andamento dessas solicitações e os documentos. */
(function (HK) {
  'use strict';
  const U = HK.util;

  const ST_ENT = ['Não iniciado', 'Em andamento', 'Em revisão', 'Concluído', 'Enviado'];
  const ABERTAS = ['Nova', 'Em análise', 'Em andamento'];
  let D = { ent: [], docs: [], tickets: [] };

  async function load() {
    const [ent, docs, tickets] = await Promise.all([HK.db.list('entregaveis', { order: 'prazo', asc: true }), HK.db.list('documentos'), HK.db.list('tickets')]);
    D = { ent, docs, tickets };
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

  function draw(el) {
    const prazoTxt = (iso, done) => { if (!iso) return '—'; const n = U.daysUntil(iso); return `${U.fmtDate(iso)}${done ? '' : ` <small class="${n < 0 ? 'overdue' : n <= 3 ? 'soon' : 'muted'}">${U.prazoLabel(iso)}</small>`}`; };
    el.innerHTML = `
      <div class="toolbar"><p class="muted" style="margin:0">Materiais obrigatórios conforme o guia "Desafios e Premiações" v1.1 (p. 2). O trabalho de cada entregável é pedido e acompanhado em <a href="#/solicitacoes">Solicitações</a>.</p>
        <span class="grow"></span>${HK.perm.editor() ? `<button class="btn" id="e-new">${U.icon('plus')} Novo entregável</button>` : ''}</div>
      ${D.ent.length ? `<div class="cards cols-3">${D.ent.map((e) => {
        const ts = D.tickets.filter((t) => t.entregavel_id === e.id);
        const abertas = ts.filter((t) => ABERTAS.includes(t.status)).length;
        const feitas = ts.filter((t) => t.status === 'Concluída').length;
        const docs = D.docs.filter((d) => d.entregavel_id === e.id);
        const done = ['Concluído', 'Enviado'].includes(e.status); const pode = HK.perm.canEdit(e);
        return `<div class="card entregavel">
          <div class="card-head"><h3>${U.esc(e.nome)}</h3>${pode ? `<button class="btn-icon" data-eedit="${e.id}" aria-label="Editar">${U.icon('edit')}</button>` : ''}${HK.perm.admin() ? `<button class="btn-icon danger" data-edel="${e.id}" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</div>
          <dl class="detail-grid" style="grid-template-columns:1fr 1fr">
            <div><dt>Etapa</dt><dd>${U.esc(e.etapa || '—')}</dd></div><div><dt>Prazo</dt><dd>${prazoTxt(e.prazo, done)}</dd></div>
            <div><dt>Responsável</dt><dd>${U.esc(e.responsavel_id ? HK.nome(e.responsavel_id) : '—')}</dd></div>
            <div><dt>Status</dt><dd>${pode ? `<select data-est="${e.id}" aria-label="Status do entregável" style="min-height:32px;padding:0 var(--s2)">${U.opts(ST_ENT, e.status)}</select>` : U.chip(e.status)}</dd></div></dl>
          ${e.descricao ? `<p class="muted" style="font-size:12.5px">${U.esc(e.descricao)}</p>` : ''}
          <div class="entregavel-foot">
            <div style="font-size:12.5px;margin-bottom:var(--s2)">Solicitações: <b>${abertas}</b> aberta(s) · <b>${feitas}</b> concluída(s) de ${ts.length}</div>
            ${U.progress(ts.length ? (feitas / ts.length) * 100 : 0, ts.length && feitas === ts.length ? 'good' : '')}
            <div style="font-size:12.5px;margin-top:var(--s3)">Documentos: ${docs.length ? docs.map((d) => `<a href="#/documentos">${U.esc(d.nome)}</a> ${U.chip(d.status)}`).join(' ') : '<span class="muted">nenhum vinculado</span>'}</div>
            <div class="inline-row" style="margin-top:var(--s4)">
              <a class="btn btn-sm" href="#/solicitacoes?novo=1&entregavel=${e.id}">${U.icon('plus')} Solicitar tarefa</a>
              ${ts.length ? `<a class="btn btn-sm btn-ghost" href="#/solicitacoes?entregavel=${e.id}">Ver solicitações</a>` : ''}</div>
          </div></div>`; }).join('')}</div>` : U.empty('Nenhum entregável cadastrado.')}`;

    const on = (sel, fn) => el.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => fn(b)));
    const n = el.querySelector('#e-new'); if (n) n.addEventListener('click', () => entForm(null));
    on('[data-eedit]', (b) => entForm(D.ent.find((e) => e.id === b.dataset.eedit)));
    on('[data-edel]', async (b) => {
      const e = D.ent.find((x) => x.id === b.dataset.edel);
      if (!(await U.confirm(`Excluir o entregável "${e.nome}"? Solicitações e documentos vinculados são mantidos, sem vínculo.`, { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('entregaveis', e.id); U.toast('Entregável excluído.'); HK.refresh(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
    el.querySelectorAll('[data-est]').forEach((s) => s.addEventListener('change', async () => {
      try { await HK.db.update('entregaveis', s.dataset.est, { status: s.value }); U.toast('Status atualizado.'); await load(); draw(el); } catch (err) { U.toast(U.errMsg(err), 'error'); HK.refresh(); }
    }));
  }

  HK.views.entregaveis = {
    async render(el, route, alive) { await load(); if (!alive()) return; draw(el); },
  };
})(window.HK = window.HK || {});
