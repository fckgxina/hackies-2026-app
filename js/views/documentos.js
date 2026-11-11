/* Gestão operacional de documentos (com versões e anexos). */
(function (HK) {
  'use strict';
  const U = HK.util;

  // Categorias vêm do banco (tabela categorias_documento) e são editáveis pela equipe.
  const cats = () => D.cats.map((c) => c.nome);
  const STATUS = ['Não solicitado', 'Solicitado', 'Em preparação', 'Em revisão', 'Pronto para envio', 'Enviado', 'Aprovado', 'Pendente de correção'];
  const CAT_DESC = {
    'Pesquisa': 'Artigos, normas, datasheets e materiais de pesquisa.',
    'Currículos': 'Currículos, minibiografias, comprovantes e informações acadêmicas da equipe.',
    'Competição': 'Edital, guias, regulamentos, comunicados oficiais e formulários.',
    'Entregáveis': 'Documento de Ideação, vídeo, relatórios, diagramas, memórias de cálculo e simulações.',
    'Apresentação': 'Slides, roteiros, imagens e diagramas finais.',
    'Administrativo': 'Autorizações, declarações e documentos administrativos.',
    'Outros': 'Demais documentos e materiais de apoio.',
  };
  const st = { q: '', categoria: '', status: '', responsavel: '' };
  let D = { docs: [], versoes: [], entregaveis: [], cats: [] };

  async function load() {
    const [docs, versoes, entregaveis, catsDb] = await Promise.all([HK.db.list('documentos', { order: 'nome', asc: true }), HK.db.list('documento_versoes'), HK.db.list('entregaveis', { order: 'prazo', asc: true }), HK.db.list('categorias_documento', { order: 'ordem', asc: true })]);
    D = { docs, versoes, entregaveis, cats: catsDb };
  }

  const proxVersao = (atual) => {
    const m = String(atual || '').match(/^V?(\d+)\.(\d+)$/i);
    return m ? `V${m[1]}.${Number(m[2]) + 1}` : 'V0.1';
  };

  /** Versão mais recente de um documento (a que vale como "arquivo atual"). */
  const ultimaVersao = (docId) => D.versoes.filter((v) => v.documento_id === docId)
    .sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)))[0] || null;
  const ehVisualizavel = (nome) => /\.(pdf|png|jpe?g|gif|webp|svg|txt|csv|md|mp4|webm)$/i.test(nome || '');

  /** Visualiza (nova aba) ou baixa o arquivo de uma versão, com link temporário seguro. */
  async function abrirArquivo(ver, baixar) {
    if (!ver.arquivo_path) { if (ver.link) window.open(ver.link, '_blank', 'noopener'); return; }
    const janela = baixar ? null : window.open('', '_blank'); // aberta já no clique, para o navegador não bloquear
    try {
      const urls = await HK.db.signedUrls('documentos', [ver.arquivo_path], baixar ? { [ver.arquivo_path]: ver.arquivo_nome || true } : undefined);
      let url = urls[ver.arquivo_path];
      if (!url) throw new Error('Arquivo indisponível no armazenamento.');
      if (url.startsWith('data:')) url = URL.createObjectURL(await (await fetch(url)).blob()); // modo demonstração
      if (baixar) {
        const a = document.createElement('a'); a.href = url; a.download = ver.arquivo_nome || 'arquivo';
        document.body.appendChild(a); a.click(); a.remove();
      } else { janela.opener = null; janela.location = url; }
    } catch (e) { if (janela) janela.close(); U.toast(U.errMsg(e), 'error'); }
  }

  /** Anexa um arquivo (ou link) como nova versão e atualiza a "versão atual" do documento. */
  async function anexar(doc, { file, versao, link, notas }) {
    let path = null;
    if (file) {
      path = `${doc.id}/${Date.now()}-${U.safeFileName(file.name)}`;
      await HK.db.upload('documentos', path, file, file.type || 'application/octet-stream');
    }
    try {
      await HK.db.insert('documento_versoes', { documento_id: doc.id, versao, arquivo_path: path, arquivo_nome: file ? file.name : null, arquivo_tamanho: file ? file.size : null, link: link || null, notas: notas || null });
    } catch (e) { if (path) await HK.db.removeFile('documentos', path).catch(() => {}); throw e; }
    try { await HK.db.update('documentos', doc.id, { versao_atual: versao }); } catch (e) { U.toast('Arquivo anexado; não foi possível atualizar a "versão atual" (permissão).', 'info'); }
  }

  function docForm(doc) {
    const d = doc || { categoria: st.categoria || '', status: 'Não solicitado', responsavel_id: HK.state.me ? HK.state.me.id : '' };
    const m = U.modal({
      title: doc ? `Editar · ${doc.nome}` : 'Novo documento', size: 'lg',
      body: `<form class="form" novalidate>
        ${U.field('Nome do documento', `<input type="text" name="nome" required maxlength="200" value="${U.esc(d.nome)}">`, { req: true, full: true })}
        ${U.field('Categoria', `<select name="categoria" required>${U.opts(cats(), d.categoria, { empty: '— selecione —' })}</select>`, { req: true, hint: '<a href="#" data-gerenciar-cat>Criar ou editar categorias</a>' })}
        ${U.field('Status', `<select name="status" required>${U.opts(STATUS, d.status)}</select>`, { req: true })}
        ${U.field('Responsável', `<select name="responsavel_id">${HK.integranteOpts(d.responsavel_id, '— a definir —')}</select>`)}
        ${U.field('Solicitante', `<input type="text" name="solicitante" placeholder="ex.: Organização HackIES, BRS, equipe" value="${U.esc(d.solicitante)}">`)}
        ${U.field('Data da solicitação', `<input type="date" name="data_solicitacao" value="${U.esc(d.data_solicitacao || '')}">`)}
        ${U.field('Prazo', `<input type="date" name="prazo" value="${U.esc(d.prazo || '')}">`)}
        ${U.field('Data de envio', `<input type="date" name="data_envio" value="${U.esc(d.data_envio || '')}">`)}
        ${U.field('Entregável vinculado', `<select name="entregavel_id">${U.opts(D.entregaveis, d.entregavel_id, { empty: '— nenhum —' })}</select>`)}
        ${U.field('Localização do arquivo', `<input type="text" name="localizacao" placeholder="link (Drive, etc.) ou caminho" value="${U.esc(d.localizacao)}">`, { hint: 'Opcional: os anexos de versão ficam no armazenamento do Supabase.' })}
        <div class="field"><span>Vínculos</span><label class="check"><input type="checkbox" name="vinculado_competicao" ${d.vinculado_competicao ? 'checked' : ''}> Documento exigido pela competição</label></div>
        <div class="field"><span>Acesso</span><label class="check"><input type="checkbox" name="restrito" ${d.restrito ? 'checked' : ''} ${HK.perm.editor() ? '' : 'disabled'}> Restrito (somente editores e administradores)</label>
          <small class="hint">Use para documentos com dados pessoais (ex.: CPF, matrícula). Inclua dados pessoais apenas quando houver solicitação oficial.</small></div>
        ${U.field('Observações', `<textarea name="observacoes" rows="2">${U.esc(d.observacoes)}</textarea>`, { full: true })}
        <div class="form-section">Arquivo ${doc && doc.versao_atual ? `<span class="tag">atual: ${U.esc(doc.versao_atual)}</span>` : ''}</div>
        ${U.field(doc ? 'Anexar nova versão (opcional)' : 'Anexar arquivo (opcional)', '<input type="file" name="arquivo">', { hint: 'Até 25 MB · PDF, Word, planilha, imagem, vídeo… Pode anexar depois também.' })}
        ${U.field('Versão do anexo', `<input type="text" name="versao" value="${U.esc(proxVersao(d.versao_atual))}">`, { hint: 'V0.1 primeira elaboração · V0.2 revisão · V1.0 final · V1.1 ajuste posterior.' })}</form>`,
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Salvar</button>',
    });
    const form = m.el.querySelector('form');
    m.el.querySelector('[data-gerenciar-cat]').addEventListener('click', (e) => { e.preventDefault(); gerenciarCategorias(); });
    form.status.addEventListener('change', () => { if (form.status.value === 'Enviado' && !form.data_envio.value) form.data_envio.value = U.todayISO(); });
    U.bindForm(m, async (v) => {
      const row = {
        nome: v.nome, categoria: v.categoria, status: v.status, responsavel_id: v.responsavel_id || null, solicitante: v.solicitante || null,
        data_solicitacao: v.data_solicitacao || null, prazo: v.prazo || null, data_envio: v.data_envio || null,
        entregavel_id: v.entregavel_id || null, localizacao: v.localizacao || null, vinculado_competicao: !!v.vinculado_competicao, observacoes: v.observacoes || null,
      };
      if (HK.perm.editor()) row.restrito = !!v.restrito;
      const salvo = doc ? await HK.db.update('documentos', doc.id, row) : await HK.db.insert('documentos', row);
      const file = form.arquivo.files[0];
      if (file) {
        try { await anexar(salvo, { file, versao: v.versao || proxVersao(salvo.versao_atual) }); U.toast(`Documento salvo com o arquivo ${file.name}.`); }
        catch (e) { U.toast(`Documento salvo, mas o arquivo não foi anexado: ${U.errMsg(e)}`, 'error'); }
      } else U.toast('Documento salvo.');
      m.close(); HK.refresh();
    }, {
      validate: (v) => {
        const file = form.arquivo.files[0];
        if (file && file.size > 25 * 1048576) return { arquivo: 'Arquivo maior que 25 MB.' };
        if (file && !v.versao) return { versao: 'Informe a versão (ex.: V0.1).' };
        return {};
      },
    });
  }

  async function versoes(docId) {
    const doc = D.docs.find((d) => d.id === docId);
    const vs = D.versoes.filter((v) => v.documento_id === docId).sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em)));
    const m = U.modal({
      title: `Arquivos · ${doc.nome}`, size: 'lg',
      body: `${vs.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Versão</th><th>Arquivo</th><th>Notas</th><th>Enviado por</th><th>Data</th><th class="actions"></th></tr></thead><tbody>
          ${vs.map((v, i) => `<tr><td><b>${U.esc(v.versao)}</b>${i === 0 ? ' <span class="tag">atual</span>' : ''}</td>
            <td class="title-cell">${v.arquivo_path ? `<b>${U.esc(v.arquivo_nome || 'arquivo')}</b><small>${U.fileSize(v.arquivo_tamanho)}</small>` : v.link ? U.link(v.link, 'link externo') : '—'}</td>
            <td>${U.esc(v.notas || '')}</td><td><small>${U.esc(HK.perfilNome(v.criado_por))}</small></td><td class="nowrap">${U.fmtDateTime(v.criado_em)}</td>
            <td class="actions">${v.arquivo_path ? `<button class="btn btn-sm" data-ver="${v.id}" title="${ehVisualizavel(v.arquivo_nome) ? 'Abrir no navegador' : 'Este formato pode ser baixado em vez de exibido'}">${U.icon('external')} Visualizar</button>
              <button class="btn btn-sm" data-baixar="${v.id}">${U.icon('download')} Baixar</button>` : v.link ? `<a class="btn btn-sm" href="${U.esc(v.link)}" target="_blank" rel="noopener noreferrer">${U.icon('external')} Abrir</a>` : ''}
              ${HK.perm.editor() ? `<button class="btn-icon danger" data-vdel="${v.id}" aria-label="Excluir versão">${U.icon('trash')}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : U.empty('Nenhum arquivo anexado ainda.')}
        <div class="section-title">Anexar nova versão</div>
        <form class="form" novalidate>
          ${U.field('Versão', `<input type="text" name="versao" required value="${U.esc(proxVersao(doc.versao_atual))}">`, { req: true, hint: 'V0.1 primeira elaboração · V0.2 revisão · V1.0 final · V1.1 ajuste posterior.' })}
          ${U.field('Arquivo', '<input type="file" name="arquivo">', { hint: 'Até 25 MB. Ou informe um link abaixo.' })}
          ${U.field('Link (alternativa ao arquivo)', '<input type="url" name="link" placeholder="https://…">', { full: true })}
          ${U.field('Notas da versão', '<textarea name="notas" rows="2"></textarea>', { full: true })}</form>`,
      footer: '<button class="btn" data-close>Fechar</button><button class="btn btn-primary" data-submit>' + U.icon('upload') + ' Anexar versão</button>',
    });
    const form = m.el.querySelector('form');
    m.el.querySelectorAll('[data-ver]').forEach((b) => b.addEventListener('click', () => abrirArquivo(vs.find((x) => x.id === b.dataset.ver), false)));
    m.el.querySelectorAll('[data-baixar]').forEach((b) => b.addEventListener('click', () => abrirArquivo(vs.find((x) => x.id === b.dataset.baixar), true)));
    U.bindForm(m, async (v) => {
      await anexar(doc, { file: form.arquivo.files[0], versao: v.versao, link: v.link, notas: v.notas });
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

  /** Criar (qualquer integrante), renomear e excluir (editor/admin) categorias de documento. */
  function gerenciarCategorias() {
    const uso = (nome) => D.docs.filter((d) => d.categoria === nome).length;
    const ed = HK.perm.editor();
    const m = U.modal({
      title: 'Categorias de documentos',
      body: `<ul class="list">${D.cats.map((c) => `<li><span class="grow"><b>${U.esc(c.nome)}</b><small>${uso(c.nome)} documento(s)</small></span>
          ${ed ? `<button class="btn-icon" data-ren="${c.id}" aria-label="Renomear">${U.icon('edit')}</button>
          <button class="btn-icon danger" data-cdel="${c.id}" aria-label="Excluir" ${uso(c.nome) ? 'disabled title="Em uso: mova os documentos antes de excluir"' : ''}>${U.icon('trash')}</button>` : ''}</li>`).join('')}</ul>
        <form class="inline-row" id="nova-cat" style="margin-top:var(--s4)"><input type="text" name="nome" maxlength="60" placeholder="Nova categoria (ex.: Normas técnicas)" aria-label="Nova categoria"><button class="btn" type="submit">${U.icon('plus')} Criar</button></form>
        ${ed ? '' : '<p class="muted" style="font-size:12px;margin-top:var(--s2)">Renomear e excluir: editores e administradores.</p>'}`,
      footer: '<button class="btn" data-close>Fechar</button>',
    });
    const reabrir = async () => { await load(); m.close(); HK.refresh(); gerenciarCategorias(); };
    m.el.querySelector('#nova-cat').addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = e.target.nome.value.trim();
      if (!nome) return;
      try { await HK.db.insert('categorias_documento', { nome, ordem: D.cats.length + 1 }); U.toast(`Categoria "${nome}" criada.`); reabrir(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
    m.el.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', async () => {
      const c = D.cats.find((x) => x.id === b.dataset.ren);
      const nome = await U.promptText('Renomear categoria', 'Novo nome (os documentos acompanham)', { value: c.nome, required: true });
      if (!nome || nome === c.nome) return;
      try { await HK.db.update('categorias_documento', c.id, { nome }); if (st.categoria === c.nome) st.categoria = nome; U.toast('Categoria renomeada.'); reabrir(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    }));
    m.el.querySelectorAll('[data-cdel]').forEach((b) => b.addEventListener('click', async () => {
      const c = D.cats.find((x) => x.id === b.dataset.cdel);
      if (!(await U.confirm(`Excluir a categoria "${c.nome}"?`, { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('categorias_documento', c.id); if (st.categoria === c.nome) st.categoria = ''; U.toast('Categoria excluída.'); reabrir(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
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
      <div class="cards cols-4" style="margin-bottom:var(--s5)">
        ${U.kpi('Documentos', String(D.docs.length), `${cnt((d) => d.status === 'Não solicitado')} ainda não solicitado(s)`)}
        ${U.kpi('Em andamento', String(pend), 'solicitados, em preparo ou revisão')}
        ${U.kpi('Enviados ou aprovados', String(cnt((d) => ['Enviado', 'Aprovado'].includes(d.status))), '', { tone: 'good' })}
        ${(() => { const corr = cnt((d) => d.status === 'Pendente de correção'); const n = corr + atras; return U.kpi('Precisam de atenção', String(n), `${atras} com prazo vencido · ${corr} a corrigir`, { tone: n ? 'critical' : '' }); })()}
      </div>
      <div class="cat-bar" role="tablist" aria-label="Categorias de documentos">
        <button role="tab" data-cat="" class="${!st.categoria ? 'on' : ''}" aria-selected="${!st.categoria}">Todos <span class="badge">${D.docs.length}</span></button>
        ${cats().map((c) => `<button role="tab" data-cat="${U.esc(c)}" class="${st.categoria === c ? 'on' : ''}" aria-selected="${st.categoria === c}">${U.esc(c)} <span class="badge">${D.docs.filter((d) => d.categoria === c).length}</span></button>`).join('')}
        <button class="cat-manage" data-gerenciar title="Criar, renomear ou excluir categorias">${U.icon('settings')} Categorias</button>
      </div>
      <div class="toolbar">
        <button class="btn btn-primary" id="d-new">${U.icon('plus')} ${st.categoria ? `Novo em ${U.esc(st.categoria)}` : 'Novo documento'}</button>
        <div class="filters">
          <input type="search" id="d-q" placeholder="Buscar…" value="${U.esc(st.q)}" aria-label="Buscar">
          <select data-f="status" aria-label="Status">${U.opts(STATUS, st.status, { empty: 'Status: todos' })}</select>
          <select data-f="responsavel" aria-label="Responsável">${U.opts(HK.state.integrantes, st.responsavel, { empty: 'Responsável: todos' })}</select>
        </div><span class="grow"></span><button class="btn" id="d-csv">${U.icon('download')} CSV</button>
      </div>
      ${!D.docs.length && !st.categoria ? U.empty('Nenhum documento cadastrado. Guarde aqui qualquer documento da equipe — pesquisas, currículos, edital, entregáveis — com arquivo, responsável, prazo e versões.') :
        (st.categoria ? [st.categoria] : cats().filter((c) => list.some((d) => d.categoria === c))).map((c) => { const ds = list.filter((d) => d.categoria === c); return `
        <h2 class="section-title cat-title">${U.esc(c)} <span class="badge">${ds.length}</span><small class="muted">${U.esc(CAT_DESC[c] || '')}</small></h2>
        ${ds.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Documento</th><th>Arquivo atual</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>Entregável</th><th class="actions"></th></tr></thead><tbody>
          ${ds.map((d) => { const n = U.daysUntil(d.prazo); const done = ['Enviado', 'Aprovado'].includes(d.status); const uv = ultimaVersao(d.id); return `<tr>
            <td class="title-cell"><b>${U.esc(d.nome)}</b><small>${d.solicitante ? `solicitado por ${U.esc(d.solicitante)}` : ''}${d.vinculado_competicao ? ' <span class="tag">competição</span>' : ''}${d.restrito ? ' <span class="tag">restrito</span>' : ''}
              ${d.localizacao ? ` · ${U.isUrl(d.localizacao) ? U.link(d.localizacao, 'localização') : U.esc(d.localizacao)}` : ''}</small></td>
            <td>${uv && uv.arquivo_path ? `<div class="file-cell"><span class="title-cell"><b title="${U.esc(uv.arquivo_nome)}">${U.esc(uv.versao)} · ${U.esc(uv.arquivo_nome || 'arquivo')}</b><small>${U.fileSize(uv.arquivo_tamanho)} · ${U.fmtDate(U.isoFromTimestamp(uv.criado_em))}</small></span>
                <span class="file-actions"><button class="btn btn-sm" data-doc-ver="${uv.id}" title="${ehVisualizavel(uv.arquivo_nome) ? 'Abrir no navegador' : 'Este formato pode ser baixado em vez de exibido'}">${U.icon('external')} Visualizar</button><button class="btn btn-sm" data-doc-baixar="${uv.id}">${U.icon('download')} Baixar</button></span></div>`
              : uv && uv.link ? `<a class="btn btn-sm" href="${U.esc(uv.link)}" target="_blank" rel="noopener noreferrer">${U.icon('external')} Abrir link (${U.esc(uv.versao)})</a>`
              : `<button class="btn btn-sm" data-anexar="${d.id}">${U.icon('upload')} Anexar</button>`}</td>
            <td>${U.esc(d.responsavel_id ? HK.nome(d.responsavel_id) : '—')}</td>
            <td class="nowrap">${d.prazo ? `${U.fmtDate(d.prazo)}${done ? '' : `<br><small class="${n < 0 ? 'overdue' : n <= 3 ? 'soon' : 'muted'}">${U.prazoLabel(d.prazo)}</small>`}` : '—'}</td>
            <td>${U.chip(d.status)}${d.data_envio ? `<br><small class="muted">enviado ${U.fmtDate(d.data_envio)}</small>` : ''}</td>
            <td>${U.esc(ent(d.entregavel_id) || '—')}</td>
            <td class="actions"><button class="btn btn-sm" data-arquivos="${d.id}" title="Todas as versões e anexar nova">${U.icon('file')} Versões ${nv(d.id)}</button>
              ${HK.perm.canEdit(d) ? `<button class="btn-icon" data-edit="${d.id}" aria-label="Editar">${U.icon('edit')}</button>` : ''}
              ${HK.perm.editor() ? `<button class="btn-icon danger" data-del="${d.id}" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</td></tr>`; }).join('')}
        </tbody></table></div>` : U.empty(q || st.status || st.responsavel ? 'Nenhum documento desta categoria corresponde aos filtros.' : `Nenhum documento em "${c}" ainda.`, `<button class="btn" data-novo-cat="${U.esc(c)}">${U.icon('plus')} Adicionar documento</button>`)}`; }).join('') || (list.length ? '' : U.empty('Nenhum documento corresponde aos filtros.'))}`;

    el.querySelector('#d-new').addEventListener('click', () => docForm(null));
    el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { st.categoria = b.dataset.cat; draw(el); }));
    el.querySelector('[data-gerenciar]').addEventListener('click', () => gerenciarCategorias());
    el.querySelectorAll('[data-novo-cat]').forEach((b) => b.addEventListener('click', () => docForm(null)));
    el.querySelector('#d-csv').addEventListener('click', () => exportar(list));
    el.querySelector('#d-q').addEventListener('input', U.debounce((e) => { st.q = e.target.value; draw(el); const x = el.querySelector('#d-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250));
    el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st[s.dataset.f] = s.value; draw(el); }));
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => docForm(D.docs.find((d) => d.id === b.dataset.edit))));
    el.querySelectorAll('[data-arquivos], [data-anexar]').forEach((b) => b.addEventListener('click', () => versoes(b.dataset.arquivos || b.dataset.anexar)));
    const verPorId = (id) => D.versoes.find((v) => v.id === id);
    el.querySelectorAll('[data-doc-ver]').forEach((b) => b.addEventListener('click', () => abrirArquivo(verPorId(b.dataset.docVer), false)));
    el.querySelectorAll('[data-doc-baixar]').forEach((b) => b.addEventListener('click', () => abrirArquivo(verPorId(b.dataset.docBaixar), true)));
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
