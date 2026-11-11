/* Gastos do Projeto: painel, itens (com fotos e cotações), contribuições, categorias e orçamento. */
(function (HK) {
  'use strict';
  const U = HK.util;
  const F = HK.finance;

  const TABS = [['', 'Painel e análise', 'chart'], ['itens', 'Itens e compras', 'box'], ['contribuicoes', 'Contribuições e acerto', 'users'], ['configurar', 'Categorias e orçamento', 'settings']];
  const st = { filtros: { q: '', categoria: '', status: '', responsavel: '' }, catModo: 'estimado' };
  let D = { itens: [], cotacoes: [], contribs: [], fotos: {} };

  async function load() {
    const [itens, cotacoes, contribs] = await Promise.all([HK.db.list('itens'), HK.db.list('cotacoes'), HK.db.list('contribuicoes', { order: 'data', asc: false })]);
    let fotos = {};
    try { fotos = await HK.db.signedUrls('fotos-itens', itens.map((i) => i.foto_path)); } catch (e) { console.warn('fotos', e); }
    D = { itens, cotacoes, contribs, fotos };
  }
  const resumo = () => F.resumo({ itens: D.itens, contribs: D.contribs, integrantes: HK.integrantesRateio(), categorias: HK.state.categorias, orcamento: HK.state.config.orcamento_centavos });

  const thumb = (i, size) => {
    const url = i.foto_path && D.fotos[i.foto_path];
    const s = size ? `style="width:${size}px;height:${size}px"` : '';
    return url ? `<button class="thumb-btn" data-photo="${i.id}" aria-label="Ver foto de ${U.esc(i.nome)}"><span class="thumb" ${s}><img src="${U.esc(url)}" alt="" loading="lazy"></span></button>`
      : `<span class="thumb" ${s} title="Sem foto">${U.icon('image')}</span>`;
  };
  const verFoto = (id) => {
    const i = D.itens.find((x) => x.id === id);
    if (i && D.fotos[i.foto_path]) U.modal({ title: i.nome, body: `<div class="lightbox"><img src="${U.esc(D.fotos[i.foto_path])}" alt="Foto de ${U.esc(i.nome)}"></div>` });
  };

  /* ===================== PAINEL E ANÁLISE ===================== */
  function membrosTabela(r, { compacto } = {}) {
    const resto = r.rateio.realizado.resto;
    const restoEst = r.rateio.estimado.resto;
    return `<div class="table-wrap"><table class="table ${compacto ? 'compact' : ''}"><thead><tr>
        <th>Integrante</th><th class="right">Cota estimada<br><small class="muted">inclui planejados</small></th><th class="right">Deveria contribuir<br><small class="muted">gastos realizados</small></th>
        <th class="right">Já contribuiu</th><th class="right">Saldo</th></tr></thead><tbody>
      ${r.membros.filter((m) => m.participa || m.devido || m.contribuido || m.devidoEstimado).map((m) => `<tr>
        <td><b>${U.esc(m.nome)}</b>${m.participa ? '' : ' <small class="muted">(fora do rateio)</small>'}${m.individualRealizado ? `<br><small class="muted">inclui ${U.brl(m.individualRealizado)} em gastos individuais</small>` : ''}</td>
        <td class="right num">${U.brl(m.devidoEstimado)}${m.centavoExtraEst ? '<sup title="Recebeu 1 centavo do arredondamento">¹</sup>' : ''}</td>
        <td class="right num">${U.brl(m.devido)}${m.centavoExtraReal ? '<sup title="Recebeu 1 centavo do arredondamento">¹</sup>' : ''}</td>
        <td class="right num">${U.brl(m.contribuido)}</td>
        <td class="right num">${m.saldo < 0 ? `<span class="overdue">falta ${U.brl(-m.saldo)}</span>` : m.saldo > 0 ? `<span style="color:var(--good-ink);font-weight:600">pagou a mais ${U.brl(m.saldo)}</span>` : '<span class="muted">em dia</span>'}</td></tr>`).join('')}
      </tbody><tfoot><tr><td>Total</td><td class="right num">${U.brl(r.membros.reduce((a, m) => a + m.devidoEstimado, 0))}</td><td class="right num">${U.brl(r.totalDevido)}</td><td class="right num">${U.brl(r.totais.contribuido)}</td><td></td></tr></tfoot></table></div>
      <p class="muted" style="font-size:12px;margin-top:8px">Divisão igualitária entre os ${r.rateio.participantes} integrantes com acesso ativo ao sistema (Valor individual = total compartilhado ÷ ${r.rateio.participantes}).
        ${resto || restoEst ? `¹ Os centavos que não se dividem igualmente são atribuídos, um a um, na ordem fixa ${HK.integrantesRateio().filter((i) => i.participa_rateio).sort((a, b) => a.ordem - b.ordem).map((i) => U.esc(i.nome)).join(' → ')}; a soma é exatamente o total.` : ''}
        Gastos marcados como "não compartilhados" ficam integralmente com o responsável.</p>`;
  }

  function acertoHTML(r) {
    const linhas = r.acertos.map((a) => `<li>${U.icon('wallet')}<span class="grow"><b>${U.esc(a.de)}</b> → <b>${U.esc(a.para)}</b></span><b class="num">${U.brl(a.valor)}</b></li>`).join('');
    const dif = r.diferencaCaixa;
    return `${linhas ? `<ul class="list">${linhas}</ul>` : '<p class="muted">Nenhum acerto necessário com os dados atuais.</p>'}
      ${dif ? `<div class="notice" style="margin-top:10px">${dif > 0
        ? `As contribuições superam os gastos realizados em <b>${U.brl(dif)}</b> (saldo em caixa ou adiantamento para compras futuras).`
        : `Os gastos realizados superam as contribuições registradas em <b>${U.brl(-dif)}</b>.`} Os acertos acima consideram apenas a diferença entre integrantes.</div>` : ''}`;
  }

  function painel(el) {
    const r = resumo();
    const T = r.totais, C = r.contagem;
    const catRows = r.porCategoria.map((c, idx) => {
      const v = st.catModo === 'estimado' ? c.estimado : c.realizado;
      const p = st.catModo === 'estimado' ? c.pctEstimado : c.pctRealizado;
      return { label: c.nome, value: v, display: U.brl(v), sub: U.pct(p), highlight: idx === 0, tip: `${c.nome}: ${U.brl(v)} (${U.pct(p)}) · ${c.itens} item(ns)` };
    }).sort((a, b) => b.value - a.value);
    const maxPair = Math.max(1, ...r.membros.map((m) => Math.max(m.devido, m.contribuido)));
    const lista = (arr, fmt, vazio) => (arr.length ? `<ul class="list">${arr.map(fmt).join('')}</ul>` : `<p class="muted">${vazio}</p>`);
    const linhaItem = (i, extra) => `<li>${thumb(i, 32)}<span class="grow"><b>${U.esc(i.nome)}</b><small>${U.esc(i.categoria)} · ${U.esc(i.status)}</small></span><span class="num right">${extra}</span></li>`;
    const O = r.orcamento;

    el.insertAdjacentHTML('beforeend', `
      <div class="cards cols-4">
        ${U.kpi('Gastos realizados', U.brl(T.realizado), 'comprados, pagos ou recebidos', { icon: 'wallet' })}
        ${U.kpi('Total estimado', U.brl(T.estimado), 'todos os itens não cancelados', { icon: 'chart' })}
        ${U.kpi('Efetivamente pago', U.brl(T.pago), 'com pagamento registrado', { icon: 'check', tone: 'good' })}
        ${U.kpi('Pendente de pagamento', U.brl(T.pendentePagamento), 'adquiridos sem pagamento registrado', { icon: 'clock', tone: T.pendentePagamento ? 'warning' : '' })}
        ${U.kpi('Previsto para compras', U.brl(T.previsto), 'planejado, em cotação ou aguardando', { icon: 'list' })}
        ${U.kpi('Peças cadastradas', String(C.cadastrados), `${C.cancelados} cancelada(s)`, { icon: 'box' })}
        ${U.kpi('Compradas', String(C.comprados), `${C.previstos} ainda por comprar`, { icon: 'tag' })}
        ${U.kpi('Recebidas', String(C.recebidos), `${C.pendentes} pendente(s) de recebimento`, { icon: 'check' })}
      </div>

      ${r.alertas.length ? `<div class="card" style="margin-top:14px"><div class="card-head">${U.icon('alert')}<h3>Alertas e observações</h3></div>
        <div class="alerts">${r.alertas.map((a) => `<div class="alert alert-${a.nivel}">${U.icon(a.nivel === 'info' ? 'info' : 'alert')}<span>${U.esc(a.texto)}</span></div>`).join('')}</div>
        <p class="muted" style="font-size:12px;margin-top:8px">Calculado apenas com os dados registrados. Não há comparação com preços de mercado.</p></div>` : ''}

      <div class="section-title">Divisão entre os integrantes</div>
      ${membrosTabela(r, { compacto: true })}
      <div class="cards cols-2" style="margin-top:var(--s4)">
        <div class="card"><div class="card-head">${U.icon('users')}<h3>Devido × contribuído</h3></div>
          <div class="legend"><span><i style="background:var(--series-1)"></i>Deveria contribuir (realizado)</span><span><i style="background:var(--series-2)"></i>Já contribuiu</span></div>
          <div class="pair-bars">${r.membros.filter((m) => m.participa || m.devido || m.contribuido).map((m) => `<div class="pair-row"><div class="hbar-label">${U.esc(m.nome)}</div><div class="lines">
            <div class="line" data-tip="${U.esc(m.nome)} · deveria contribuir: ${U.brl(m.devido)}"><div class="hbar-track"><div class="hbar-fill" style="width:${(m.devido / maxPair) * 100}%"></div></div><span class="hbar-value">${U.brl(m.devido)}</span></div>
            <div class="line" data-tip="${U.esc(m.nome)} · já contribuiu: ${U.brl(m.contribuido)}"><div class="hbar-track"><div class="hbar-fill" style="width:${(m.contribuido / maxPair) * 100}%;background:var(--series-2)"></div></div><span class="hbar-value">${U.brl(m.contribuido)}</span></div>
          </div></div>`).join('')}</div></div>
        <div class="card"><div class="card-head">${U.icon('wallet')}<h3>Resumo de acerto</h3></div>${acertoHTML(r)}</div>
      </div>

      <div class="section-title">Análise por categoria</div>
      <div class="card"><div class="card-head">${U.icon('chart')}<h3>Onde o dinheiro está sendo utilizado</h3>
          <div class="btn-group" role="group" aria-label="Base de cálculo"><button data-cat="estimado" class="${st.catModo === 'estimado' ? 'on' : ''}">Estimado</button><button data-cat="realizado" class="${st.catModo === 'realizado' ? 'on' : ''}">Realizado</button></div></div>
        ${catRows.some((x) => x.value) ? U.hbars(catRows) + `<p class="muted" style="font-size:12px;margin-top:10px">Maior parcela: <b>${U.esc(catRows[0].label)}</b> (${catRows[0].sub}). Percentuais sobre o total ${st.catModo === 'estimado' ? 'estimado' : 'realizado'}.</p>` : U.empty(st.catModo === 'estimado' ? 'Cadastre itens para ver a distribuição por categoria.' : 'Nenhum gasto realizado ainda.')}
      </div>

      <div class="section-title">Análise por item</div>
      <div class="cards cols-3">
        <div class="card"><div class="card-head"><h3>Maior custo total</h3></div>${lista(r.topCusto, (i) => linhaItem(i, `<b>${U.brl(i.subtotal)}</b><br><small>${T.estimado ? U.pct((i.subtotal / T.estimado) * 100) : ''}</small>`), 'Sem itens.')}</div>
        <div class="card"><div class="card-head"><h3>Maior valor unitário</h3></div>${lista(r.topUnitario, (i) => linhaItem(i, `<b>${U.brl(i.valor_unitario_centavos)}</b><br><small>× ${U.fmtQty(i.quantidade)}</small>`), 'Sem itens.')}</div>
        <div class="card"><div class="card-head"><h3>Maior quantidade comprada</h3></div>${lista(r.topQuantidade, (i) => linhaItem(i, `<b>${U.fmtQty(i.quantidade)} un.</b><br><small>${U.brl(i.subtotal)}</small>`), 'Nenhum item comprado ainda.')}</div>
      </div>
      ${r.topCusto.length ? `<div class="table-wrap" style="margin-top:14px"><table class="table compact"><thead><tr><th>Item</th><th class="right">Valor unitário</th><th class="right">Qtd.</th><th class="right">Custo total</th><th class="right">% do estimado</th></tr></thead><tbody>
        ${[...D.itens].filter(F.isAtivo).map((i) => ({ ...i, sub: F.subtotal(i) })).sort((a, b) => b.sub - a.sub).slice(0, 12).map((i) => `<tr><td>${U.esc(i.nome)}</td><td class="right num">${U.brl(i.valor_unitario_centavos)}</td><td class="right num">${U.fmtQty(i.quantidade)}</td><td class="right num"><b>${U.brl(i.sub)}</b></td><td class="right num">${T.estimado ? U.pct((i.sub / T.estimado) * 100) : '—'}</td></tr>`).join('')}
      </tbody></table></div>` : ''}

      <div class="section-title">Orçamento</div>
      <div class="card">${O ? `
          <div class="cards cols-4" style="margin-bottom:var(--s4)">
            ${U.kpi('Orçamento definido', U.brl(O.valor))}${U.kpi('Utilizado (realizado)', U.brl(O.usado), U.pct(O.pctUsado))}
            ${U.kpi('Disponível agora', U.brl(O.disponivel), '', { tone: O.disponivel < 0 ? 'critical' : '' })}
            ${U.kpi('Disponível após previstos', U.brl(O.disponivelAposPrevistos), `comprometido: ${U.pct(O.pctComprometido)}`, { tone: O.disponivelAposPrevistos < 0 ? 'critical' : '' })}
          </div>
          <div class="stack"><div><small class="muted">Realizado × orçamento</small>${U.progress(O.pctUsado, O.pctUsado >= 100 ? 'critical' : O.pctUsado >= 80 ? 'warning' : '')}</div>
          <div><small class="muted">Estimado (realizado + previstos) × orçamento</small>${U.progress(O.pctComprometido, O.pctComprometido > 100 ? 'critical' : O.pctComprometido >= 80 ? 'warning' : '')}</div></div>`
        : `<p class="muted">Nenhum orçamento definido. Total previsto (estimado): <b>${U.brl(T.estimado)}</b> · realizado: <b>${U.brl(T.realizado)}</b>.</p>${HK.perm.admin() ? '<a class="btn btn-sm" href="#/gastos/configurar">Definir orçamento</a>' : '<small class="muted">O administrador pode definir um orçamento.</small>'}`}
      </div>

      <div class="section-title">Análise de compras</div>
      <div class="cards cols-2">
        <div class="card"><div class="card-head"><h3>Ainda não adquiridos</h3><span class="badge">${r.compras.naoAdquiridos.length}</span></div>${lista(r.compras.naoAdquiridos, (i) => linhaItem(i, U.brl(i.subtotal)), 'Nenhum item pendente de compra.')}</div>
        <div class="card"><div class="card-head"><h3>Comprados e não recebidos</h3><span class="badge">${r.compras.compradosNaoRecebidos.length}</span></div>${lista(r.compras.compradosNaoRecebidos, (i) => linhaItem(i, U.brl(i.subtotal)), 'Nenhum.')}</div>
        <div class="card"><div class="card-head"><h3>Adquiridos sem pagamento registrado</h3><span class="badge">${r.compras.semPagamento.length}</span></div>${lista(r.compras.semPagamento, (i) => linhaItem(i, U.brl(i.subtotal)), 'Nenhum.')}</div>
        <div class="card"><div class="card-head"><h3>Cancelados</h3><span class="badge">${r.compras.cancelados.length}</span></div>${lista(r.compras.cancelados, (i) => linhaItem(i, `<s>${U.brl(i.subtotal)}</s>`), 'Nenhum.')}</div>
        <div class="card"><div class="card-head"><h3>Possíveis duplicidades</h3><span class="badge">${r.duplicidades.length}</span></div>
          ${r.duplicidades.length ? `<ul class="list">${r.duplicidades.map((d) => `<li>${U.icon('copy')}<span class="grow"><b>${U.esc(d.nome)}</b><small>${d.itens.map((i) => `${U.esc(i.status)} · ${U.brl(F.subtotal(i))}`).join(' | ')}</small></span><span class="badge">${d.itens.length}×</span></li>`).join('')}</ul>` : '<p class="muted">Nenhum nome repetido entre itens ativos.</p>'}</div>
      </div>

      <div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="g-md">${U.icon('copy')} Copiar resumo financeiro (Markdown)</button><button class="btn" id="g-csv">${U.icon('download')} Exportar itens (CSV)</button></div>`);

    el.querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => { st.catModo = b.dataset.cat; draw(el, ''); }));
    el.querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', () => verFoto(b.dataset.photo)));
    el.querySelector('#g-md').addEventListener('click', () => U.copyText(markdownResumo(r)));
    el.querySelector('#g-csv').addEventListener('click', () => exportarItens(D.itens));
  }

  function markdownResumo(r) {
    const T = r.totais;
    return [`### Resumo financeiro — ${U.fmtDate(U.todayISO())}`, '', '_Gerado pela aplicação web (fonte oficial: banco de dados Supabase)._', '',
      '| Indicador | Valor |', '|---|---:|',
      `| Total estimado | ${U.brl(T.estimado)} |`, `| Gastos realizados | ${U.brl(T.realizado)} |`, `| Efetivamente pago | ${U.brl(T.pago)} |`,
      `| Pendente de pagamento | ${U.brl(T.pendentePagamento)} |`, `| Previsto para compras | ${U.brl(T.previsto)} |`, '',
      '| Categoria | Estimado | % | Realizado |', '|---|---:|---:|---:|',
      ...r.porCategoria.map((c) => `| ${c.nome} | ${U.brl(c.estimado)} | ${U.pct(c.pctEstimado)} | ${U.brl(c.realizado)} |`), '',
      '| Integrante | Deveria contribuir | Contribuiu | Saldo |', '|---|---:|---:|---:|',
      ...r.membros.filter((m) => m.participa || m.devido || m.contribuido).map((m) => `| ${m.nome} | ${U.brl(m.devido)} | ${U.brl(m.contribuido)} | ${U.brl(m.saldo)} |`), ''].join('\n');
  }

  /* ===================== ITENS ===================== */
  function exportarItens(list) {
    const cols = [
      { label: 'Item', value: (i) => i.nome }, { label: 'Descrição', value: (i) => i.descricao || '' }, { label: 'Categoria', value: (i) => HK.catNome(i.categoria_id) },
      { label: 'Valor unitário (R$)', value: (i) => U.csvMoney(i.valor_unitario_centavos) }, { label: 'Quantidade', value: (i) => String(i.quantidade).replace('.', ',') },
      { label: 'Subtotal (R$)', value: (i) => U.csvMoney(F.subtotal(i)) }, { label: 'Status', value: (i) => i.status }, { label: 'Compartilhado', value: (i) => (i.compartilhado === false ? 'não' : 'sim') },
      { label: 'Fornecedor', value: (i) => i.fornecedor || '' }, { label: 'Link de compra', value: (i) => i.link_compra || '' },
      { label: 'Responsável', value: (i) => (i.responsavel_id ? HK.nome(i.responsavel_id) : '') }, { label: 'Data de inclusão', value: (i) => U.fmtDate(U.isoFromTimestamp(i.criado_em)) },
      { label: 'Comprado em', value: (i) => (i.comprado_em ? U.fmtDate(i.comprado_em) : '') }, { label: 'Pago em', value: (i) => (i.pago_em ? U.fmtDate(i.pago_em) : '') },
      { label: 'Pago por', value: (i) => (i.pago_por_id ? HK.nome(i.pago_por_id) : '') }, { label: 'Recebido em', value: (i) => (i.recebido_em ? U.fmtDate(i.recebido_em) : '') },
      { label: 'Observações', value: (i) => i.observacoes || '' },
    ];
    U.download(`gastos-itens-${U.stamp()}.csv`, U.toCSV(list, cols), 'text/csv;charset=utf-8');
  }

  function itensTab(el) {
    const f = st.filtros, q = U.normalize(f.q);
    const list = D.itens.filter((i) => (!f.categoria || i.categoria_id === f.categoria) && (!f.status || i.status === f.status) &&
      (!f.responsavel || i.responsavel_id === f.responsavel) && (!q || U.normalize(`${i.nome} ${i.descricao} ${i.fornecedor}`).includes(q)));
    const ativos = list.filter(F.isAtivo);
    const nCot = (id) => D.cotacoes.filter((c) => c.item_id === id).length;
    el.insertAdjacentHTML('beforeend', `
      <div class="toolbar">
        <button class="btn btn-primary" id="i-new">${U.icon('plus')} Adicionar item</button>
        <div class="filters">
          <input type="search" id="i-q" placeholder="Buscar item, fornecedor…" value="${U.esc(f.q)}" aria-label="Buscar">
          <select data-f="categoria" aria-label="Categoria">${U.opts(HK.state.categorias, f.categoria, { empty: 'Categoria: todas' })}</select>
          <select data-f="status" aria-label="Status">${U.opts(F.STATUS, f.status, { empty: 'Status: todos' })}</select>
          <select data-f="responsavel" aria-label="Responsável">${U.opts(HK.state.integrantes, f.responsavel, { empty: 'Responsável: todos' })}</select>
        </div><span class="grow"></span>
        <button class="btn" id="i-csv">${U.icon('download')} CSV</button>
      </div>
      ${!D.itens.length ? U.empty('Nenhum item cadastrado. Adicione peças, componentes ou materiais com valor, quantidade, foto e link de compra.') : `
      <div class="table-wrap"><table class="table"><thead><tr><th></th><th>Item</th><th>Categoria</th><th class="right">Valor unit.</th><th class="right">Qtd.</th><th class="right">Subtotal</th><th>Status</th><th>Responsável</th><th>Inclusão</th><th class="actions"></th></tr></thead>
      <tbody>${list.map((i) => `<tr class="${i.status === 'Cancelado' ? 'row-cancel' : ''}">
        <td style="width:56px">${thumb(i)}</td>
        <td class="title-cell"><b>${U.esc(i.nome)}</b><small>${U.esc(i.fornecedor || '')}${i.link_compra && U.isUrl(i.link_compra) ? ` · <a href="${U.esc(i.link_compra)}" target="_blank" rel="noopener noreferrer">${U.icon('external')} link de compra</a>` : ''}${i.compartilhado === false ? ' · <span class="tag">individual</span>' : ''}</small></td>
        <td>${U.esc(HK.catNome(i.categoria_id))}</td>
        <td class="right num">${U.brl(i.valor_unitario_centavos)}</td><td class="right num">${U.fmtQty(i.quantidade)}</td>
        <td class="right num"><b>${U.brl(F.subtotal(i))}</b></td>
        <td>${U.chip(i.status)}${i.pago_em ? `<br><small class="muted">pago ${U.fmtDate(i.pago_em)} · ${U.esc(HK.nome(i.pago_por_id))}</small>` : ''}</td>
        <td>${U.esc(i.responsavel_id ? HK.nome(i.responsavel_id) : '—')}</td>
        <td class="nowrap">${U.fmtDate(U.isoFromTimestamp(i.criado_em))}</td>
        <td class="actions"><button class="btn btn-sm" data-cot="${i.id}" title="Cotações">${U.icon('tag')} ${nCot(i.id)}</button>
          ${HK.perm.canEdit(i) ? `<button class="btn-icon" data-edit="${i.id}" title="Editar" aria-label="Editar">${U.icon('edit')}</button>` : ''}
          ${HK.perm.editor() ? `<button class="btn-icon danger" data-del="${i.id}" title="Excluir" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</td></tr>`).join('')}</tbody>
      <tfoot><tr><td></td><td colspan="4">Total dos itens exibidos (sem cancelados) · ${ativos.length} item(ns)</td><td class="right num">${U.brl(ativos.reduce((a, i) => a + F.subtotal(i), 0))}</td><td colspan="4"></td></tr></tfoot></table></div>`}`);

    el.querySelector('#i-new').addEventListener('click', () => itemForm(null));
    el.querySelector('#i-csv').addEventListener('click', () => exportarItens(list));
    el.querySelector('#i-q').addEventListener('input', U.debounce((e) => { st.filtros.q = e.target.value; draw(el, 'itens'); const x = el.querySelector('#i-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 250));
    el.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st.filtros[s.dataset.f] = s.value; draw(el, 'itens'); }));
    el.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => itemForm(D.itens.find((i) => i.id === b.dataset.edit))));
    el.querySelectorAll('[data-cot]').forEach((b) => b.addEventListener('click', () => cotacoes(b.dataset.cot)));
    el.querySelectorAll('[data-photo]').forEach((b) => b.addEventListener('click', () => verFoto(b.dataset.photo)));
    el.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      const i = D.itens.find((x) => x.id === b.dataset.del);
      if (!(await U.confirm(`Excluir o item "${i.nome}"? As cotações dele também serão excluídas. Contribuições vinculadas são mantidas (sem vínculo). Prefira "Cancelado" para manter o histórico de compras.`, { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('itens', i.id); U.toast('Item excluído.'); HK.refresh(); } catch (e) { U.toast(U.errMsg(e), 'error'); }
    }));
  }

  function itemForm(item) {
    const i = item || { status: 'Planejado', quantidade: 1, compartilhado: true, categoria_id: '' };
    const temContrib = item && D.contribs.some((c) => c.item_id === item.id);
    let novaFoto = null;
    const m = U.modal({
      title: item ? `Editar item · ${item.nome}` : 'Adicionar item', size: 'lg',
      body: `<form class="form" novalidate>
        ${U.field('Nome da peça ou material', `<input type="text" name="nome" required maxlength="160" value="${U.esc(i.nome)}">`, { req: true, full: true })}
        ${U.field('Categoria', `<select name="categoria_id" required>${U.opts(HK.state.categorias, i.categoria_id, { empty: '— selecione —' })}</select>`, { req: true, hint: HK.perm.editor() ? '<a href="#/gastos/configurar" data-close>Editar categorias</a>' : '' })}
        ${U.field('Status da aquisição', `<select name="status" required>${U.opts(F.STATUS, i.status)}</select>`, { req: true })}
        ${U.field('Descrição', `<textarea name="descricao" rows="2">${U.esc(i.descricao)}</textarea>`, { full: true })}
        ${U.field('Valor unitário (R$)', `<input type="text" inputmode="decimal" name="valor" required placeholder="0,00" value="${U.esc(U.centsToInput(i.valor_unitario_centavos))}">`, { req: true })}
        ${U.field('Quantidade', `<input type="text" inputmode="decimal" name="quantidade" required value="${U.esc(U.fmtQty(i.quantidade))}">`, { req: true, hint: 'Aceita frações (ex.: 2,5 m de cabo).' })}
        <div class="field full"><div class="calc"><span>Subtotal (valor unitário × quantidade)</span><b id="f-sub" class="num">—</b></div></div>
        <div class="field full"><span>Fotografia do produto</span>
          <div class="photo-pick"><div class="photo-preview" id="f-prev">${i.foto_path && D.fotos[i.foto_path] ? `<img src="${U.esc(D.fotos[i.foto_path])}" alt="">` : U.icon('image')}</div>
            <div><input type="file" name="foto" accept="image/jpeg,image/png,image/webp" id="f-foto"><small class="hint" style="display:block">A imagem é reduzida para até 1600 px antes do envio.</small>
            ${i.foto_path ? '<label class="check" style="margin-top:6px"><input type="checkbox" name="remover_foto"> Remover foto atual</label>' : ''}</div></div>
          <small class="field-error" id="f-foto-err"></small></div>
        ${U.field('Link de compra', `<input type="url" name="link_compra" placeholder="https://…" value="${U.esc(i.link_compra)}">`)}
        ${U.field('Loja ou fornecedor', `<input type="text" name="fornecedor" value="${U.esc(i.fornecedor)}">`)}
        ${U.field('Responsável pela compra', `<select name="responsavel_id">${HK.integranteOpts(i.responsavel_id, '— a definir —')}</select>`)}
        <div class="field"><span>Divisão</span><label class="check"><input type="checkbox" name="compartilhado" ${i.compartilhado !== false ? 'checked' : ''}> Gasto compartilhado (dividido igualmente)</label>
          <small class="hint">Desmarque para atribuir o valor integralmente ao responsável.</small><small class="field-error"></small></div>
        <div class="form-section">Compra, pagamento e recebimento</div>
        ${U.field('Data da compra', `<input type="date" name="comprado_em" value="${U.esc(i.comprado_em || '')}">`)}
        ${U.field('Data de recebimento', `<input type="date" name="recebido_em" value="${U.esc(i.recebido_em || '')}">`)}
        ${U.field('Data do pagamento', `<input type="date" name="pago_em" value="${U.esc(i.pago_em || '')}">`, { hint: 'Obrigatória para o status "Pago".' })}
        ${U.field('Pago por', `<select name="pago_por_id">${HK.integranteOpts(i.pago_por_id, '—')}</select>`, { hint: 'Obrigatório para o status "Pago".' })}
        <div class="field full" id="f-contrib" hidden><label class="check"><input type="checkbox" name="registrar_contribuicao" ${temContrib ? '' : 'checked'}>
          Registrar também como contribuição de quem pagou (valor do subtotal)</label>
          <small class="hint">${temContrib ? 'Já existe contribuição vinculada a este item — verifique na aba Contribuições para não duplicar.' : 'Assim o pagamento entra no acerto entre os integrantes.'}</small></div>
        ${U.field('Observações', `<textarea name="observacoes" rows="2">${U.esc(i.observacoes)}</textarea>`, { full: true })}
        ${item ? `<p class="muted full" style="grid-column:1/-1;font-size:12px">Incluído em ${U.fmtDateTime(item.criado_em)} por ${U.esc(HK.perfilNome(item.criado_por))}.</p>` : ''}
      </form>`,
      footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>${item ? 'Salvar alterações' : 'Adicionar item'}</button>`,
    });
    const form = m.el.querySelector('form');
    const sub = m.el.querySelector('#f-sub');
    const recalc = () => {
      const c = U.parseBRL(form.valor.value), q = U.parseQty(form.quantidade.value);
      sub.textContent = Number.isNaN(c) || Number.isNaN(q) ? '—' : U.brl(F.subtotal({ valor_unitario_centavos: c, quantidade: q }));
    };
    const syncStatus = () => {
      const s = form.status.value;
      const hoje = U.todayISO();
      if (['Comprado', 'Pago', 'Recebido'].includes(s) && !form.comprado_em.value) form.comprado_em.value = hoje;
      if (s === 'Pago' && !form.pago_em.value) form.pago_em.value = hoje;
      if (s === 'Recebido' && !form.recebido_em.value) form.recebido_em.value = hoje;
      const pagoAgora = (s === 'Pago' || form.pago_em.value) && !(item && item.pago_em);
      m.el.querySelector('#f-contrib').hidden = !pagoAgora;
    };
    form.valor.addEventListener('input', recalc);
    form.quantidade.addEventListener('input', recalc);
    form.status.addEventListener('change', syncStatus);
    form.pago_em.addEventListener('change', syncStatus);
    recalc(); syncStatus();
    let fotoProc = null; // processamento da imagem em andamento (o salvar aguarda)
    m.el.querySelector('#f-foto').addEventListener('change', (e) => {
      const file = e.target.files[0];
      const err = m.el.querySelector('#f-foto-err');
      err.textContent = '';
      novaFoto = null;
      if (!file) { fotoProc = null; return; }
      fotoProc = U.compressImage(file, 1600, 0.82).then((blob) => {
        novaFoto = blob;
        m.el.querySelector('#f-prev').innerHTML = `<img src="${URL.createObjectURL(blob)}" alt="Prévia">`;
      }).catch((ex) => { err.textContent = ex.message; e.target.value = ''; });
    });

    U.bindForm(m, async (v) => {
      if (fotoProc) await fotoProc;
      const row = {
        nome: v.nome, descricao: v.descricao || null, categoria_id: v.categoria_id, status: v.status,
        valor_unitario_centavos: U.parseBRL(v.valor), quantidade: U.parseQty(v.quantidade),
        link_compra: v.link_compra || null, fornecedor: v.fornecedor || null, responsavel_id: v.responsavel_id || null,
        compartilhado: !!v.compartilhado, comprado_em: v.comprado_em || null, pago_em: v.pago_em || null,
        pago_por_id: v.pago_por_id || null, recebido_em: v.recebido_em || null, observacoes: v.observacoes || null,
      };
      if (v.remover_foto) row.foto_path = null;
      let saved = item ? await HK.db.update('itens', item.id, row) : await HK.db.insert('itens', row);
      if (novaFoto) {
        try {
          const path = `${saved.id}/${Date.now()}.jpg`;
          await HK.db.upload('fotos-itens', path, novaFoto, 'image/jpeg');
          saved = await HK.db.update('itens', saved.id, { foto_path: path });
        } catch (e) { U.toast(`Item salvo, mas a foto não foi enviada: ${U.errMsg(e)}`, 'error'); }
      }
      const pagoAgora = saved.pago_em && saved.pago_por_id && !(item && item.pago_em);
      if (pagoAgora && v.registrar_contribuicao) {
        try {
          await HK.db.insert('contribuicoes', { integrante_id: saved.pago_por_id, valor_centavos: F.subtotal(saved), data: saved.pago_em, item_id: saved.id, observacao: `Pagamento do item "${saved.nome}" (registrado ao marcar como pago).` });
        } catch (e) { U.toast(`Item salvo, mas a contribuição não foi registrada: ${U.errMsg(e)}`, 'error'); }
      }
      m.close();
      U.toast(item ? 'Item atualizado.' : 'Item adicionado.');
      HK.refresh();
    }, {
      validate: (v) => {
        const e = {};
        if (Number.isNaN(U.parseBRL(v.valor))) e.valor = 'Valor inválido. Use o formato 25,00.';
        if (Number.isNaN(U.parseQty(v.quantidade))) e.quantidade = 'Quantidade deve ser maior que zero (até 3 casas decimais).';
        if (v.link_compra && !/^https?:\/\//i.test(v.link_compra)) e.link_compra = 'Informe um endereço começando com http:// ou https://.';
        if (v.status === 'Pago' && !v.pago_em) e.pago_em = 'Informe a data do pagamento.';
        if (v.status === 'Pago' && !v.pago_por_id) e.pago_por_id = 'Informe quem pagou.';
        if (v.pago_em && !v.pago_por_id) e.pago_por_id = 'Informe quem pagou.';
        if (!v.compartilhado && !v.responsavel_id) e.responsavel_id = 'Gasto individual precisa de responsável.';
        return e;
      },
    });
  }

  /* ===================== COTAÇÕES ===================== */
  function cotacoes(itemId) {
    const item = D.itens.find((i) => i.id === itemId);
    const linhas = F.analisarCotacoes(D.cotacoes.filter((c) => c.item_id === itemId), item.quantidade);
    const pode = HK.perm.canEdit(item);
    const m = U.modal({
      title: `Cotações · ${item.nome}`, size: 'lg',
      body: `<p class="muted">Quantidade do item: <b>${U.fmtQty(item.quantidade)}</b> · valor atual: <b>${U.brl(item.valor_unitario_centavos)}</b>/un.${item.fornecedor ? ` (${U.esc(item.fornecedor)})` : ''}</p>
        <div class="notice" style="margin-bottom:12px">${U.icon('info')} O menor preço é apenas destacado. Avalie também frete, prazo, reputação, garantia, especificações e compatibilidade com o projeto antes de decidir.</div>
        ${linhas.length ? `<div class="table-wrap"><table class="table compact"><thead><tr><th>Loja</th><th class="right">Preço unit.</th><th class="right">Frete</th><th class="right">Total p/ qtd.</th><th>Prazo</th><th>Garantia</th><th>Disponível</th><th>Reputação</th><th>Especificações / compatibilidade</th><th class="actions"></th></tr></thead><tbody>
          ${linhas.map((c) => `<tr class="${c.menorTotal ? 'row-hl' : ''}">
            <td><b>${U.esc(c.loja)}</b>${c.link && U.isUrl(c.link) ? `<br><a href="${U.esc(c.link)}" target="_blank" rel="noopener noreferrer">${U.icon('external')} abrir</a>` : ''}</td>
            <td class="right num">${U.brl(c.preco_unitario_centavos)}${c.menorUnitario ? '<br><span class="chip chip-good">menor preço</span>' : ''}</td>
            <td class="right num">${c.freteInformado ? U.brl(c.frete_centavos) : '<span class="muted">não informado</span>'}</td>
            <td class="right num"><b>${U.brl(c.totalComFrete)}</b>${c.menorTotal ? '<br><span class="chip chip-good">menor total</span>' : ''}${c.freteInformado ? '' : '<br><small class="muted">frete não informado</small>'}</td>
            <td>${c.prazo_dias != null ? `${c.prazo_dias} dia(s)` : '—'}</td><td>${U.esc(c.garantia || '—')}</td><td>${U.esc(c.disponibilidade || '—')}</td>
            <td>${U.esc(c.reputacao || '—')}</td><td style="max-width:220px">${U.esc(c.especificacoes || '—')}${c.observacoes ? `<br><small class="muted">${U.esc(c.observacoes)}</small>` : ''}</td>
            <td class="actions">${pode ? `<button class="btn btn-sm" data-usar="${c.id}" title="Copiar preço, loja e link para o item">Usar no item</button>` : ''}
              ${HK.perm.editor() || HK.perm.own(c) ? `<button class="btn-icon" data-ced="${c.id}" aria-label="Editar">${U.icon('edit')}</button><button class="btn-icon danger" data-cdel="${c.id}" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : U.empty('Nenhuma cotação registrada para este item.')}`,
      footer: '<button class="btn" data-close>Fechar</button><button class="btn btn-primary" data-add>' + U.icon('plus') + ' Registrar cotação</button>',
    });
    const reabrir = async () => { await load(); m.close(); cotacoes(itemId); };
    m.el.querySelector('[data-add]').addEventListener('click', () => cotacaoForm(item, null, reabrir));
    m.el.querySelectorAll('[data-ced]').forEach((b) => b.addEventListener('click', () => cotacaoForm(item, D.cotacoes.find((c) => c.id === b.dataset.ced), reabrir)));
    m.el.querySelectorAll('[data-cdel]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await U.confirm('Excluir esta cotação?', { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('cotacoes', b.dataset.cdel); U.toast('Cotação excluída.'); reabrir(); } catch (e) { U.toast(U.errMsg(e), 'error'); }
    }));
    m.el.querySelectorAll('[data-usar]').forEach((b) => b.addEventListener('click', async () => {
      const c = D.cotacoes.find((x) => x.id === b.dataset.usar);
      if (!(await U.confirm(`Atualizar o item com a cotação de "${c.loja}" (${U.brl(c.preco_unitario_centavos)}/un.)? Valor unitário, fornecedor e link serão substituídos.`, { okLabel: 'Atualizar item' }))) return;
      try {
        await HK.db.update('itens', item.id, { valor_unitario_centavos: c.preco_unitario_centavos, fornecedor: c.loja, link_compra: c.link || item.link_compra });
        U.toast('Item atualizado com a cotação.'); m.close(); HK.refresh();
      } catch (e) { U.toast(U.errMsg(e), 'error'); }
    }));
  }

  function cotacaoForm(item, cot, after) {
    const c = cot || {};
    const m = U.modal({
      title: cot ? 'Editar cotação' : `Nova cotação · ${item.nome}`,
      body: `<form class="form" novalidate>
        ${U.field('Loja', `<input type="text" name="loja" required value="${U.esc(c.loja)}">`, { req: true })}
        ${U.field('Preço unitário (R$)', `<input type="text" inputmode="decimal" name="preco" required placeholder="0,00" value="${U.esc(U.centsToInput(c.preco_unitario_centavos))}">`, { req: true })}
        ${U.field('Frete (R$)', `<input type="text" inputmode="decimal" name="frete" placeholder="deixe vazio se não souber" value="${U.esc(U.centsToInput(c.frete_centavos))}">`)}
        ${U.field('Prazo de entrega (dias)', `<input type="number" min="0" step="1" name="prazo_dias" value="${U.esc(c.prazo_dias == null ? '' : c.prazo_dias)}">`)}
        ${U.field('Link', `<input type="url" name="link" placeholder="https://…" value="${U.esc(c.link)}">`, { full: true })}
        ${U.field('Garantia', `<input type="text" name="garantia" value="${U.esc(c.garantia)}">`)}
        ${U.field('Quantidade disponível', `<input type="text" name="disponibilidade" value="${U.esc(c.disponibilidade)}">`)}
        ${U.field('Reputação do fornecedor', `<input type="text" name="reputacao" placeholder="fonte e nota, se houver" value="${U.esc(c.reputacao)}">`, { full: true })}
        ${U.field('Especificações técnicas / compatibilidade', `<textarea name="especificacoes" rows="2">${U.esc(c.especificacoes)}</textarea>`, { full: true })}
        ${U.field('Observações', `<textarea name="observacoes" rows="2">${U.esc(c.observacoes)}</textarea>`, { full: true })}</form>`,
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Salvar cotação</button>',
    });
    U.bindForm(m, async (v) => {
      const row = {
        item_id: item.id, loja: v.loja, preco_unitario_centavos: U.parseBRL(v.preco), frete_centavos: v.frete ? U.parseBRL(v.frete) : null,
        prazo_dias: v.prazo_dias === '' ? null : parseInt(v.prazo_dias, 10), link: v.link || null, garantia: v.garantia || null,
        disponibilidade: v.disponibilidade || null, reputacao: v.reputacao || null, especificacoes: v.especificacoes || null, observacoes: v.observacoes || null,
      };
      if (cot) await HK.db.update('cotacoes', cot.id, row); else await HK.db.insert('cotacoes', row);
      m.close(); U.toast('Cotação salva.'); after();
    }, {
      validate: (v) => {
        const e = {};
        if (Number.isNaN(U.parseBRL(v.preco))) e.preco = 'Valor inválido.';
        if (v.frete && Number.isNaN(U.parseBRL(v.frete))) e.frete = 'Valor inválido.';
        if (v.prazo_dias !== '' && !(parseInt(v.prazo_dias, 10) >= 0)) e.prazo_dias = 'Informe um número de dias.';
        if (v.link && !/^https?:\/\//i.test(v.link)) e.link = 'Use http:// ou https://.';
        return e;
      },
    });
  }

  /* ===================== CONTRIBUIÇÕES ===================== */
  function contribTab(el) {
    const r = resumo();
    el.insertAdjacentHTML('beforeend', `
      <div class="section-title" style="margin-top:0">Situação de cada integrante</div>${membrosTabela(r)}
      <div class="card" style="margin-top:14px"><div class="card-head">${U.icon('wallet')}<h3>Resumo de acerto</h3></div>${acertoHTML(r)}
        <p class="muted" style="font-size:12px;margin-top:10px">A divisão igualitária não muda com os pagamentos: as contribuições servem para acompanhar quem já pagou e quem tem valores pendentes.</p></div>
      <div class="section-title">Pagamentos registrados</div>
      <div class="toolbar"><button class="btn btn-primary" id="c-new">${U.icon('plus')} Registrar contribuição</button><span class="grow"></span><button class="btn" id="c-csv">${U.icon('download')} CSV</button></div>
      ${D.contribs.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>Data</th><th>Integrante</th><th class="right">Valor</th><th>Item ou despesa</th><th>Observação</th><th>Registrado por</th><th class="actions"></th></tr></thead><tbody>
        ${D.contribs.map((c) => { const it = D.itens.find((i) => i.id === c.item_id); return `<tr><td class="nowrap">${U.fmtDate(c.data)}</td><td><b>${U.esc(HK.nome(c.integrante_id))}</b></td>
          <td class="right num"><b>${U.brl(c.valor_centavos)}</b></td><td>${it ? U.esc(it.nome) : '<span class="muted">—</span>'}</td><td>${U.esc(c.observacao || '')}</td>
          <td><small>${U.esc(HK.perfilNome(c.criado_por))}</small></td>
          <td class="actions">${HK.perm.editor() || HK.perm.own(c) ? `<button class="btn-icon" data-ced="${c.id}" aria-label="Editar">${U.icon('edit')}</button><button class="btn-icon danger" data-cdel="${c.id}" aria-label="Excluir">${U.icon('trash')}</button>` : ''}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td colspan="2">Total contribuído</td><td class="right num">${U.brl(r.totais.contribuido)}</td><td colspan="4"></td></tr></tfoot></table></div>` : U.empty('Nenhuma contribuição registrada.')}`);
    el.querySelector('#c-new').addEventListener('click', () => contribForm(null));
    el.querySelector('#c-csv').addEventListener('click', () => U.download(`contribuicoes-${U.stamp()}.csv`, U.toCSV(D.contribs, [
      { label: 'Data', value: (c) => U.fmtDate(c.data) }, { label: 'Integrante', value: (c) => HK.nome(c.integrante_id) },
      { label: 'Valor (R$)', value: (c) => U.csvMoney(c.valor_centavos) }, { label: 'Item', value: (c) => ((D.itens.find((i) => i.id === c.item_id) || {}).nome || '') },
      { label: 'Observação', value: (c) => c.observacao || '' }]), 'text/csv;charset=utf-8'));
    el.querySelectorAll('[data-ced]').forEach((b) => b.addEventListener('click', () => contribForm(D.contribs.find((c) => c.id === b.dataset.ced))));
    el.querySelectorAll('[data-cdel]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await U.confirm('Excluir esta contribuição?', { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('contribuicoes', b.dataset.cdel); U.toast('Contribuição excluída.'); HK.refresh(); } catch (e) { U.toast(U.errMsg(e), 'error'); }
    }));
  }

  function contribForm(c0) {
    const c = c0 || { data: U.todayISO(), integrante_id: HK.state.me ? HK.state.me.id : '' };
    const m = U.modal({
      title: c0 ? 'Editar contribuição' : 'Registrar contribuição',
      body: `<form class="form" novalidate>
        ${U.field('Integrante', `<select name="integrante_id" required>${HK.integranteOpts(c.integrante_id)}</select>`, { req: true })}
        ${U.field('Valor pago (R$)', `<input type="text" inputmode="decimal" name="valor" required placeholder="0,00" value="${U.esc(U.centsToInput(c.valor_centavos))}">`, { req: true })}
        ${U.field('Data do pagamento', `<input type="date" name="data" required value="${U.esc(c.data || '')}">`, { req: true })}
        ${U.field('Item ou despesa relacionada', `<select name="item_id">${U.opts(D.itens, c.item_id, { empty: '— geral / nenhum —' })}</select>`)}
        ${U.field('Observação', `<textarea name="observacao" rows="2">${U.esc(c.observacao)}</textarea>`, { full: true })}</form>`,
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Salvar</button>',
    });
    U.bindForm(m, async (v) => {
      const row = { integrante_id: v.integrante_id, valor_centavos: U.parseBRL(v.valor), data: v.data, item_id: v.item_id || null, observacao: v.observacao || null };
      if (c0) await HK.db.update('contribuicoes', c0.id, row); else await HK.db.insert('contribuicoes', row);
      m.close(); U.toast('Contribuição salva.'); HK.refresh();
    }, { validate: (v) => { const n = U.parseBRL(v.valor); return Number.isNaN(n) || n <= 0 ? { valor: 'Informe um valor maior que zero.' } : {}; } });
  }

  /* ===================== CATEGORIAS E ORÇAMENTO ===================== */
  function configTab(el) {
    const orc = HK.state.config.orcamento_centavos;
    const uso = (id) => D.itens.filter((i) => i.categoria_id === id).length;
    el.insertAdjacentHTML('beforeend', `
      <div class="cards cols-2">
        <div class="card"><div class="card-head">${U.icon('wallet')}<h3>Orçamento do projeto</h3></div>
          ${HK.perm.admin() ? `<form id="orc-form" class="form" novalidate style="grid-template-columns:1fr auto;align-items:end">
            ${U.field('Valor total (R$)', `<input type="text" inputmode="decimal" name="orc" placeholder="sem orçamento definido" value="${U.esc(orc == null ? '' : U.centsToInput(orc))}">`, { hint: 'Deixe vazio para não usar orçamento.' })}
            <button class="btn btn-primary" type="submit">Salvar</button></form>`
            : `<p>${orc == null ? 'Nenhum orçamento definido.' : `Orçamento: <b>${U.brl(orc)}</b>`}</p><small class="muted">Somente o administrador altera o orçamento.</small>`}
        </div>
        <div class="card"><div class="card-head">${U.icon('tag')}<h3>Categorias de gastos</h3></div>
          <ul class="list">${HK.state.categorias.map((c, idx) => `<li><span class="grow"><b>${U.esc(c.nome)}</b><small>${uso(c.id)} item(ns)</small></span>
            ${HK.perm.editor() ? `<button class="btn-icon" data-up="${idx}" aria-label="Subir" ${idx === 0 ? 'disabled' : ''}>↑</button>
              <button class="btn-icon" data-ren="${c.id}" aria-label="Renomear">${U.icon('edit')}</button>
              <button class="btn-icon danger" data-cdel="${c.id}" aria-label="Excluir" ${uso(c.id) ? 'disabled title="Em uso"' : ''}>${U.icon('trash')}</button>` : ''}</li>`).join('')}</ul>
          ${HK.perm.editor() ? `<form id="cat-form" style="display:flex;gap:8px;margin-top:10px"><input type="text" name="nome" placeholder="Nova categoria" aria-label="Nova categoria" maxlength="80"><button class="btn" type="submit">${U.icon('plus')} Adicionar</button></form>` : '<small class="muted">Editores e administradores podem editar as categorias.</small>'}
        </div>
      </div>`);
    const of = el.querySelector('#orc-form');
    if (of) of.addEventListener('submit', async (e) => {
      e.preventDefault();
      const s = of.orc.value.trim();
      const v = s ? U.parseBRL(s) : null;
      if (s && (Number.isNaN(v) || v <= 0)) { U.setFieldError(of, 'orc', 'Valor inválido.'); return; }
      try { await HK.db.upsert('configuracoes', { chave: 'orcamento_centavos', valor: v }); await HK.loadRefs(); U.toast('Orçamento salvo.'); HK.refresh(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
    const cf = el.querySelector('#cat-form');
    if (cf) cf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = cf.nome.value.trim();
      if (!nome) return;
      try { await HK.db.insert('categorias_gasto', { nome, ordem: HK.state.categorias.length + 1 }); await HK.loadRefs(); U.toast('Categoria adicionada.'); HK.refresh(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
    el.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', async () => {
      const c = HK.state.categorias.find((x) => x.id === b.dataset.ren);
      const nome = await U.promptText('Renomear categoria', 'Novo nome', { value: c.nome, required: true });
      if (!nome || nome === c.nome) return;
      try { await HK.db.update('categorias_gasto', c.id, { nome }); await HK.loadRefs(); U.toast('Categoria renomeada.'); HK.refresh(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    }));
    el.querySelectorAll('[data-up]').forEach((b) => b.addEventListener('click', async () => {
      const idx = Number(b.dataset.up);
      const cats = [...HK.state.categorias];
      [cats[idx - 1], cats[idx]] = [cats[idx], cats[idx - 1]];
      try {
        for (let k = 0; k < cats.length; k++) if (cats[k].ordem !== k + 1) await HK.db.update('categorias_gasto', cats[k].id, { ordem: k + 1 });
        await HK.loadRefs(); HK.refresh();
      } catch (err) { U.toast(U.errMsg(err), 'error'); }
    }));
    el.querySelectorAll('[data-cdel]').forEach((b) => b.addEventListener('click', async () => {
      const c = HK.state.categorias.find((x) => x.id === b.dataset.cdel);
      if (!(await U.confirm(`Excluir a categoria "${c.nome}"?`, { danger: true, okLabel: 'Excluir' }))) return;
      try { await HK.db.remove('categorias_gasto', c.id); await HK.loadRefs(); U.toast('Categoria excluída.'); HK.refresh(); } catch (err) { U.toast(U.errMsg(err), 'error'); }
    }));
  }

  /* ===================== render ===================== */
  function draw(el, sub) {
    el.innerHTML = `<nav class="tabs" aria-label="Seções de gastos">${TABS.map(([k, label, ic]) => `<a href="#/gastos${k ? '/' + k : ''}" class="${k === sub ? 'on' : ''}">${label}</a>`).join('')}</nav>`;
    if (sub === 'itens') itensTab(el);
    else if (sub === 'contribuicoes') contribTab(el);
    else if (sub === 'configurar') configTab(el);
    else painel(el);
  }

  HK.views.gastos = {
    async render(el, route, alive) {
      await load();
      if (!alive()) return;
      const sub = TABS.some(([k]) => k === route.sub) ? route.sub : '';
      draw(el, sub);
    },
  };
})(window.HK = window.HK || {});
