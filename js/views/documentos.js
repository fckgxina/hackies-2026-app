/* Gestão operacional de documentos (com versões e anexos). */
(function (HK) {
  'use strict';
  const U = HK.util;

  const CATEGORIAS = ['Equipe', 'Competição', 'Entregáveis técnicos', 'Apresentação', 'Outros'];
  const STATUS = ['Não solicitado', 'Solicitado', 'Em preparação', 'Em revisão', 'Pronto para envio', 'Enviado', 'Aprovado', 'Pendente de correção'];
  const CAT_DESC = {
    'Equipe': 'Currículos, minibiografias, informações acadêmicas, comprovantes e autorizações quando solicitados.',
    'Competição': 'Edital, guias, regulamentos, comunicados oficiais, formulários e declarações.',
    'Entregáveis técnicos': 'Documento de Ideação, vídeo, relatórios, diagramas, memórias de cálculo e simulações.',
    'Apresentação': 'Apresentação HTML, slides, roteiros, imagens e diagramas finais.',
    'Outros': 'Documentos administrativos e materiais de apoio.',
  };
  const st = { q: '', categoria: '', status: '', responsavel: '' };
  let D = { docs: [], versoes: [], entregaveis: [] };

  async function load() {
    const [docs, versoes, entregaveis] = await Promise.all([HK.db.list('documentos', { order: 'nome', asc: true }), HK.db.list('documento_versoes'), HK.db.list('entregaveis', { order: 'prazo', asc: true })]);
    D = { docs, versoes, entregaveis };
  }

  const proxVersao = (atual) => {
    const m = String(atual || '').match(/^V?(\d+)\.(\d+)$/i);
    return m ? `V${m[1]}.${Number(m[2]) + 1}` : 'V0.1';
  };

  function docForm(doc) {
    const d = doc || { categoria: '', status: 'Não solicitado', responsavel_id: HK.state.me ? HK.state.me.id : '' };
    const m = U.modal({
      title: doc ? `Editar · ${doc.nome}` : 'Novo documento', size: 'lg',
      body: `<form class="form" novalidate>
        ${U.field('Nome do documento', `<input type="text" name="nome" required maxlength="200" value="${U.esc(d.nome)}">`, { req: true, full: true })}
        ${U.field('Categoria', `<select name="categoria" required>${U.opts(CATEGORIAS, d.categoria, { empty: '— selecione —' })}</select>`, { req: true })}
        ${U.field('Status', `<select name="status" required>${U.opts(STATUS, d.status)}</select>`, { req: true })}
        ${U.field('Responsável', `<select name="responsavel_id">${HK.integranteOpts(d.responsavel_id, '— a definir —')}</select>`)}
        ${U.field('Solicitante', `<input type="text" name="solicitante" placeholder="ex.: Organização HackIES, BRS, equipe" value="${U.esc(d.solicitante)}">`)}
        ${U.field('Data da solicitação', `<input type="date" name="data_solicitacao" value="${U.esc(d.data_solicitacao || '')}">`)}
        ${U.field('Prazo', `<input type="date" name="prazo" value="${U.esc(d.prazo || '')}">`)}
        ${U.field('Versão atual', `<input type="text" name="versao_atual" placeholder="V0.1" value="${U.esc(d.versao_atual)}">`, { hint: 'Atualizada automaticamente ao anexar uma nova versão.' })}
        ${U.field('Data de envio', `<input type="date" name="data_envio" value="${U.esc(d.data_envio || '')}">`)}
        ${U.field('Entregável vinculado', `<select name="entregavel_id">${U.opts(D.entregaveis, d.entregavel_id, { empty: '— nenhum —' })}</select>`)}
        ${U.field('Localização do arquivo', `<input type="text" name="localizacao" placeholder="link (Drive, etc.) ou caminho" value="${U.esc(d.localizacao)}">`, { hint: 'Opcional: os anexos de versão ficam no armazenamento do Supabase.' })}
        <div class="field"><span>Vínculos</span><label class="check"><input type="checkbox" name="vinculado_competicao" ${d.vinculado_competicao ? 'checked' : ''}> Documento exigido pela competição</label></div>
        <div class="field"><span>Acesso</span><label class="check"><input type="checkbox" name="restrito" ${d.restrito ? 'checked' : ''} ${HK.perm.editor() ? '' : 'disabled'}> Restrito (somente editores e administradores)</label>
          <small class="hint">Use para documentos com dados pessoais (ex.: CPF, matrícula). Inclua dados pessoais apenas quando houver solicitação oficial.</small></div>
        ${U.field('Observações', `<textarea name="observacoes" rows="2">${U.esc(d.observacoes)}</textarea>`, { full: true })}</form>`,
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Salvar</button>',
    });
    const form = m.el.querySelector('form');
    form.status.addEventListener('change', () => { if (form.status.value === 'Enviado' && !form.data_envio.value) form.data_envio.value = U.todayISO(); });
    U.bindForm(m, async (v) => {
      const row = {
        nome: v.nome, categoria: v.categoria, status: v.status, responsavel_id: v.responsavel_id || null, solicitante: v.solicitante || null,
        data_solicitacao: v.data_solicitacao || null, prazo: v.prazo || null, versao_atual: v.versao_atual || null, data_envio: v.data_envio || null,
        entregavel_id: v.entregavel_id || null, localizacao: v.localizacao || null, vinculado_competicao: !!v.vinculado_competicao, observacoes: v.observacoes || null,
      };
      if (HK.perm.editor()) row.restrito = !!v.restrito;
      if (doc) await HK.db.update('documentos', doc.id, row); else await HK.db.insert('documentos', row);
      m.close(); U.toast('Documento salvo.'); HK.refresh();
    });
  }

  async function versoes(docId) {
    const doc = D.docs.find((d) => d.id === docId);
    const vs = D.versoes.filter((v) => v.documento_id === docId);
    let urls = {};
    try { urls = await HK.db.signedUrls('documentos', vs.map((v) => v.arquivo_path), Object.fromEntries(vs.filter((v) => v.arquivo_path).map((v) => [v.arquivo_path, v.arquivo_nome || true]))); } catch (e) { console.warn(e); }
    const m = U.modal({
      title: `Versões · ${doc.nome}`, size: 'lg',
      body: `${vs.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Versão</th><th>Arquivo / link</th><th>Notas</th><th>Enviado por</th><th>Data</th><th class="actions"></th></tr></thead><tbody>
          ${vs.map((v) => `<tr><td><b>${U.esc(v.versao)}</b></td>
            <td>${v.arquivo_path ? (urls[v.arquivo_path] ? `<a href="${U.esc(urls[v.arquivo_path])}" target="_blank" rel="noopener" download="${U.esc(v.arquivo_nome || '')}">${U.icon('download')} ${U.esc(v.arquivo_nome || 'arquivo')}</a>` : `<span class="muted">${U.esc(v.arquivo_nome || 'arquivo')} (indisponível)</span>`) + ` <small class="muted">${U.fileSize(v.arquivo_tamanho)}</small>` : ''}
              ${v.link ? `${v.arquivo_path ? '<br>' : ''}${U.link(v.link, 'abrir link')}` : ''}</td>
            <td>${U.esc(v.notas || '')}</td><td><small>${U.esc(HK.perfilNome(v.criado_por))}</small></td><td class="nowrap">${U.fmtDateTime(v.criado_em)}</td>
            <td class="actions">${HK.perm.editor() ? `<button class="btn-icon danger" data-vdel="${v.id}" aria-label="Excluir versão">${U.icon('trash')}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : U.empty('Nenhuma versão anexada.')}
        <div class="section-title">Anexar nova versão</div>
        <form class="form" novalidate>
          ${U.field('Versão', `<input type="text" name="versao" required value="${U.esc(proxVersao(doc.versao_atual))}">`, { req: true, hint: 'V0.1 primeira elaboração · V0.2 revisão · V1.0 final · V1.1 ajuste posterior.' })}
          ${U.field('Arquivo', '<input type="file" name="arquivo">', { hint: 'Até 25 MB. Ou informe um link abaixo.' })}
          ${U.field('Link (alternativa ao arquivo)', '<input type="url" name="link" placeholder="https://…">', { full: true })}
          ${U.field('Notas da versão', '<textarea name="notas" rows="2"></textarea>', { full: true })}</form>`,
      footer: '<button class="btn" data-close>Fechar</button><button class="btn btn-primary" data-submit>' + U.icon('upload') + ' Anexar versão</button>',
    });
    const form = m.el.querySelector('form');
    U.bindForm(m, async (v) => {
      const file = form.arquivo.files[0];
      let path = null;
      if (file) {
        path = `${doc.id}/${Date.now()}-${U.safeFileName(file.name)}`;
        await HK.db.upload('documentos', path, file, file.type || 'application/octet-stream');
      }
      try {
        await HK.db.insert('documento_versoes', { documento_id: doc.id, versao: v.versao, arquivo_path: path, arquivo_nome: file ? file.name : null, arquivo_tamanho: file ? file.size : null, link: v.link || null, notas: v.notas || null });
      } catch (e) { if (path) await HK.db.removeFile('documentos', path).catch(() => {}); throw e; }
      try { await HK.db.update('documentos', doc.id, { versao_atual: v.versao }); } catch (e) { U.toast('Versão anexada; não foi possível atualizar a "versão atual" (permissão).', 'info'); }
      U.toast(`Versão ${v.versao} anexada.`);
      await load(); m.close(); versoes(doc.id); HK.refresh();
    }, {
      validate: (v) => {
        const e = {};
        const file = form.arquivo.files[0];
        if (!file && !v.link) e.arquivo = 'Anexe um arquivo ou informe um link.';
        if (file && file.size > 25 * 1048576) e.arquivo = 'Arquivo maior que 25 MB.';
        if (v.link && !/^https?:\/\//i.test(v.link)) e.link = 'Use http:// ou https://.';
        return e;
      },
    });
    m.el.querySelectorAll('[data-vdel]').forEach((b) => b.addEventListener('click', async () => {
      const ver = vs.find((x) => x.id === b.dataset.vdel);
      if (!(await U.confirm(`Excluir a versão ${ver.versao}? O registro fica no histórico, mas o arquivo anexado será apagado do armazenamento.`, { danger: true, okLabel: 'Excluir' }))) return;
      try {
        await HK.db.remove('documento_versoes', ver.id);
        if (ver.arquivo_path) await HK.db.removeFile('documentos', ver.arquivo_path).catch(() => {});
        U.toast('Versão excluída.'); await load(); m.close(); versoes(doc.id);
      } catch (e) { U.toast(U.errMsg(e), 'error'); }
    }));
  }

  function exportar(list) {
    U.download(`documentos-${U.stamp()}.csv`, U.toCSV(list, [
      { label: 'Documento', value: (d) => d.nome }, { label: 'Categoria', value: (d) => d.categoria }, { label: 'Responsável', value: (d) => (d.responsavel_id ? HK.nome(d.responsavel_id) : '') },
      { label: 'Solicitante', value: (d) => d.solicitante || '' }, { label: 'Data da solicitação', value: (d) => (d.data_solicitacao ? U.fmtDate(d.data_solicitacao) : '') },
      { label: 'Prazo', value: (d) => (d.prazo ? U.fmtDate(d.prazo) : '') }, { label: 'Status', value: (d) => d.status }, { label: 'Versão', value: (d) => d.versao_atual || '' },
      { label: 'Data de envio', value: (d) => (d.data_envio ? U.fmtDate(d.data_envio) : '') }, { label: 'Localização', value: (d) => d.localizacao || '' },
      { label: 'Entregável', value: (d) => ((D.entregaveis.find((e) => e.id === d.entregavel_id) || {}).nome || '') },
      { label: 'Exigido pela competição', value: (d) => (d.vinculado_competicao ? 'sim' : 'não') }, { label: 'Observações', value: (d) => d.observacoes || '' },
    ]), 'text/csv;charset=utf-8');
  }

  function draw(el) {
    const q = U.normalize(st.q);
    const list = D.docs.filter((d) => (!st.categoria || d.categoria === st.categoria) && (!st.status || d.status === st.status) &&
      (!st.responsavel || d.responsavel_id === st.responsavel) && (!q || U.normalize(`${d.nome} ${d.solicitante} ${d.observacoes}`).includes(q)));
    const cnt = (fn) => D.docs.filter(fn).length;
    const pend = cnt((d) => !['Enviado', 'Aprovado', 'Não solicitado'].includes(d.status));
    const atras = cnt((d) => d.prazo && U.daysUntil(d.prazo) < 0 && !['Enviado', 'Aprovado'].includes(d.status));
    const nv = (id) => D.versoes.filter((v) => v.documento_id === id).length;
    const ent = (id) => (D.entregaveis.find((e) => e.id === id) || {}).nome;

    el.innerHTML = `
      <div class="grid grid-kpi" style="margin-bottom:16px">
        ${U.kpi('Documentos', String(D.docs.length))}${U.kpi('Em andamento', String(pend))}
        ${U.kpi('Enviados / aprovados', String(cnt((d) => ['Enviado', 'Aprovado'].includes(d.status))), '', { tone: 'good' })}
        ${U.kpi('Pendentes de correção', String(cnt((d) => d.status === 'Pendente de correção')), '', { tone: cnt((d) => d.status === 'Pendente de correção') ? 'critical' : '' })}
        ${U.kpi('Com prazo vencido', String(atras), '', { tone: atras ? 'critical' : '' })}
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="d-new">${U.icon('plus')} Novo documento</button>
        <div class="filters">
          <input type="search" id="d-q" placeholder="Buscar…" value="${U.esc(st.q)}" aria-label="Buscar">
          <select data-f="categoria" aria-label="Categoria">${U.opts(CATEGORIAS, st.categoria, { empty: 'Categoria: todas' })}</select>
          <select data-f="status" aria-label="Status">${U.opts(STATUS, st.status, { empty: 'Status: todos' })}</select>
          <select data-f="responsavel" aria-label="Responsável">${U.opts(HK.state.integrantes, st.responsavel, { empty: 'Responsável: todos' })}</select>
        </div><span class="grow"></span><button class="btn" id="d-csv">${U.icon('download')} CSV</button>
      </div>
      ${!D.docs.length ? U.empty('Nenhum documento cadastrado. Registre o que a equipe precisa produzir, enviar ou guardar (com responsável, prazo, status e versões).') :
        CATEGORIAS.filter((c) => !st.categoria || c === st.categoria).map((c) => { const ds = list.filter((d) => d.categoria === c); if (!ds.length && (q || st.status || st.responsavel)) return ''; return `
        <div class="section-title">${U.esc(c)} <span class="badge">${ds.length}</span></div>
        ${ds.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>Versão</th><th>Envio</th><th>Entregável</th><th class="actions"></th></tr></thead><tbody>
          ${ds.map((d) => { const n = U.daysUntil(d.prazo); const done = ['Enviado', 'Aprovado'].includes(d.status); return `<tr>
            <td class="title-cell"><b>${U.esc(d.nome)}</b><small>${d.solicitante ? `solicitado por ${U.esc(d.solicitante)}` : ''}${d.vinculado_competicao ? ' <span class="tag">competição</span>' : ''}${d.restrito ? ' <span class="tag">restrito</span>' : ''}
              ${d.localizacao ? ` · ${U.isUrl(d.localizacao) ? U.link(d.localizacao, 'localização') : U.esc(d.localizacao)}` : ''}</small></td>
            <td>${U.esc(d.responsavel_id ? HK.nome(d.responsavel_id) : '—')}</td>
            <td class="nowrap">${d.prazo ? `${U.fmtDate(d.prazo)}${done ? '' : `<br><small class="${n < 0 ? 'overdue' : n <= 3 ? 'soon' : 'muted'}">${U.prazoLabel(d.prazo)}</small>`}` : '—'}</td>
            <td>${U.chip(d.status)}</td><td>${U.esc(d.versao_atual || '—')}</td><td class="nowrap">${d.data_envio ? U.fmtDate(d.data_envio) : '—'}</td>
            <td>${U.esc(ent(d.entregavel_id) || '—')}</td>
            <td class="actions"><button class="btn btn-sm" data-ver="${d.id}">${U.icon('file')} ${nv(d.id)}</button>
              ${HK.perm.canEdit(d) ? `<button class="btn-icon" data-edit="${d.id}" aria-label="Editar">${U.icon('edit')}</button>` : ''}
              ${HK.perm.editor() ? `<button class="btn-icon danger" data-del="${d.id}" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : `<p class="muted" style="font-size:12.5px">${U.esc(CAT_DESC[c])}</p>`}`; }).join('')}`;

    el.querySelector('#d-new').addEventListener('click', () => docForm(null));
    el.querySelector('#d-csv').addEventListener('click', () => exportar(list));
    el.querySelector('#d-q').addEventListener('input', U.debounce((e) => { st.q = e.target.value; draw(el); const x = el.querySelector('#d-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250));
    el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; draw(el); }));
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => docForm(D.docs.find((d) => d.id === b.dataset.edit))));
    el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => versoes(b.dataset.ver)));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const d = D.docs.find((x) => x.id === b.dataset.del);
      const n = nv(d.id);
      if (!(await U.confirm(`Excluir o documento "${d.nome}"${n ? ` e suas ${n} versão(ões)` : ''}? Os registros ficam no histórico; os arquivos anexados permanecem no armazenamento para recuperação.`, { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('documentos', d.id); U.toast('Documento excluído.'); HK.refresh(); } catch (e) { U.toast(U.errMsg(e), 'error'); }
    }));
  }

  HK.views.documentos = {
    async render(el, route, alive) { await load(); if (!alive()) return; draw(el); },
  };
})(window.HK = window.HK || {});
