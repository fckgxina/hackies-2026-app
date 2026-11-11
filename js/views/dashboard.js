/* Visão geral (dashboard). */
(function (HK) {
  'use strict';
  const U = HK.util;

  const PRIO = { Urgente: 0, Alta: 1, 'Média': 2, Baixa: 3 };

  HK.views.dashboard = {
    async render(el, route, alive) {
      const [tickets, itens, contribs, entregaveis, documentos, hist] = await Promise.all([
        HK.db.list('tickets'), HK.db.list('itens'), HK.db.list('contribuicoes'), HK.db.list('entregaveis', { order: 'prazo', asc: true }),
        HK.db.list('documentos'), HK.db.list('historico', { limit: 10 }),
      ]);
      if (!alive()) return;

      const fin = HK.finance.resumo({ itens, contribs, integrantes: HK.integrantesRateio(), categorias: HK.state.categorias, orcamento: HK.state.config.orcamento_centavos });
      const pend = tickets.filter((t) => ['Nova', 'Em análise', 'Em andamento'].includes(t.status));
      const urg = pend.filter((t) => t.prioridade === 'Urgente').length;

      // prazos de todas as áreas
      const prazos = [
        ...entregaveis.filter((e) => e.prazo && !['Concluído', 'Enviado'].includes(e.status)).map((e) => ({ tipo: 'Entregável', nome: e.nome, prazo: e.prazo, status: e.status, href: '#/entregaveis' })),
        ...documentos.filter((d) => d.prazo && !['Enviado', 'Aprovado'].includes(d.status)).map((d) => ({ tipo: 'Documento', nome: d.nome, prazo: d.prazo, status: d.status, href: '#/documentos' })),
        ...pend.filter((t) => t.prazo).map((t) => ({ tipo: 'Solicitação', nome: `${HK.ticketId(t.numero)} ${t.titulo}`, prazo: t.prazo, status: t.status, href: `#/solicitacoes?t=${t.id}` })),
      ].sort((a, b) => a.prazo.localeCompare(b.prazo)).slice(0, 7);
      const prox = prazos.find((p) => U.daysUntil(p.prazo) >= 0);

      const prazoCls = (iso) => { const n = U.daysUntil(iso); return n < 0 ? 'overdue' : n <= 3 ? 'soon' : 'muted'; };
      const nTarefas = (eid) => { const ts = tickets.filter((t) => t.entregavel_id === eid && t.status !== 'Não realizada'); return [ts.filter((t) => t.status === 'Concluída').length, ts.length]; };
      const nDocs = (eid) => documentos.filter((d) => d.entregavel_id === eid).length;

      el.innerHTML = `
        <div class="card hero">
          <div><h2>HackIES 2026 · Desafio D02 — Alimentação elétrica de ROVs</h2>
            <p>Arquitetura de conversão CC-CC: entrada de referência de 600 V, saída de 15 V e potência de referência de 1.500 W (guia v1.1, p. 4). Equipe: ${HK.state.integrantes.map((i) => U.esc(i.nome)).join(', ')}.</p></div>
          ${prox ? `<div class="notice"><b>Próximo prazo:</b> ${U.esc(prox.nome)} — ${U.fmtDate(prox.prazo)} <span class="${prazoCls(prox.prazo)}">(${U.prazoLabel(prox.prazo)})</span></div>` : ''}
        </div>

        <h2 class="section-title">Atalhos</h2>
        <div class="cards cols-6">
          <a class="shortcut" href="#/solicitacoes">${U.icon('inbox')}<span>Solicitações</span></a>
          <a class="shortcut" href="#/gastos">${U.icon('wallet')}<span>Gastos</span></a>
          <a class="shortcut" href="#/documentos">${U.icon('file')}<span>Documentos</span></a>
          <a class="shortcut" href="#/entregaveis">${U.icon('flag')}<span>Entregáveis</span></a>
          <a class="shortcut" href="#" data-acao="apresentacao">${U.icon('slides')}<span>Apresentação<small>em breve · sem conteúdo</small></span></a>
          <a class="shortcut" href="${U.esc(HK.obsidianHref('00 - Painel Principal'))}" title="Abre o vault no Obsidian (precisa do Obsidian instalado com o vault)">${U.icon('book')}<span>Vault Obsidian</span></a>
        </div>

        <h2 class="section-title">Situação atual</h2>
        <div class="cards cols-4">
          ${U.kpi('Solicitações pendentes', String(pend.length), urg ? `<span class="overdue">${urg} urgente${urg > 1 ? 's' : ''}</span>` : 'nenhuma urgente', { icon: 'inbox', tone: urg ? 'critical' : '' })}
          ${U.kpi('Gastos realizados', U.brl(fin.totais.realizado), `${fin.contagem.comprados} item(ns) comprado(s)`, { icon: 'wallet' })}
          ${U.kpi('Gastos planejados', U.brl(fin.totais.estimado), `estimado · a comprar ${U.brl(fin.totais.previsto)}`, { icon: 'chart' })}
          ${(() => {
            const part = fin.membros.filter((m) => m.participa);
            if (!part.length) return U.kpi('Cota por integrante', '—', 'ninguém com login ativo no rateio', { icon: 'users' });
            const vals = part.map((m) => m.devidoEstimado);
            const iguais = Math.max(...vals) - Math.min(...vals) <= 1;
            return iguais
              ? U.kpi('Cota por integrante', U.brl(Math.max(...vals)), `estimada · dividida entre ${part.length}`, { icon: 'users' })
              : U.kpi('Cota por integrante', `${U.brl(Math.min(...vals))} – ${U.brl(Math.max(...vals))}`, '<a href="#/gastos">varia: há gastos individuais</a>', { icon: 'users' });
          })()}
        </div>

        <div class="cards cols-2">
          <div class="card"><div class="card-head">${U.icon('clock')}<h3>Próximos prazos</h3></div>
            ${prazos.length ? `<ul class="list">${prazos.map((p) => `<li><span class="tag">${p.tipo}</span>
              <span class="grow"><a href="${p.href}"><b>${U.esc(p.nome)}</b></a><small>${U.esc(p.status)}</small></span>
              <span class="nowrap right"><b class="num">${U.fmtDate(p.prazo)}</b><br><small class="${prazoCls(p.prazo)}">${U.prazoLabel(p.prazo)}</small></span></li>`).join('')}</ul>`
              : U.empty('Nenhum prazo em aberto.')}
          </div>
          <div class="card"><div class="card-head">${U.icon('flag')}<h3>Situação dos entregáveis</h3><a href="#/entregaveis" class="btn btn-sm btn-ghost">Abrir</a></div>
            ${entregaveis.length ? `<ul class="list">${entregaveis.map((e) => { const [ok, tot] = nTarefas(e.id); return `<li>
              <span class="grow"><b>${U.esc(e.nome)}</b><small>${U.esc(e.etapa || '')}${e.prazo ? ` · ${U.fmtDate(e.prazo)}` : ''} · ${tot ? `${ok}/${tot} solicitações concluídas` : 'sem solicitações'} · ${nDocs(e.id)} doc.</small></span>
              ${U.chip(e.status)}</li>`; }).join('')}</ul>` : U.empty('Nenhum entregável cadastrado.')}
          </div>
        </div>

        <div class="cards cols-2">
          <div class="card"><div class="card-head">${U.icon('inbox')}<h3>Solicitações que precisam de atenção</h3><a href="#/solicitacoes" class="btn btn-sm btn-ghost">Abrir</a></div>
            ${pend.length ? `<ul class="list">${pend.sort((a, b) => PRIO[a.prioridade] - PRIO[b.prioridade] || a.criado_em.localeCompare(b.criado_em)).slice(0, 6).map((t) => `<li>
              <span class="kcard-id">${HK.ticketId(t.numero)}</span>
              <span class="grow"><a href="#/solicitacoes?t=${t.id}"><b>${U.esc(t.titulo)}</b></a><small>${U.esc(t.categoria)} · ${U.esc(HK.nome(t.solicitante_id))} · ${U.esc(t.status)}</small></span>
              ${U.chip(t.prioridade)}</li>`).join('')}</ul>` : U.empty('Nenhuma solicitação pendente.')}
          </div>
          <div class="card"><div class="card-head">${U.icon('history')}<h3>Últimas atualizações</h3><a href="#/admin/historico" class="btn btn-sm btn-ghost">Histórico</a></div>
            ${hist.length ? `<ul class="timeline">${hist.slice(0, 8).map((h) => { const x = HK.histTexto(h); return `<li>${U.icon(h.acao === 'INSERT' ? 'plus' : h.acao === 'DELETE' ? 'trash' : 'edit')}
              <div><b>${U.esc(x.quem)}</b> ${U.esc(x.texto)}${x.detalhe ? `<small>${U.esc(x.detalhe)}</small>` : ''}<small>${U.relTime(h.em)}</small></div></li>`; }).join('')}</ul>` : U.empty('Nenhuma alteração registrada ainda.')}
          </div>
        </div>
        <p class="muted" style="margin-top:var(--s5)">Conhecimento técnico (pesquisas, decisões, diário): vault Obsidian <b>${U.esc((window.HK_CONFIG || {}).obsidianVault || 'HACKIES 2026')}</b> —
          <a href="${U.esc(HK.obsidianHref('00 - Painel Principal'))}">abrir o Painel Principal no Obsidian</a>.</p>`;
    },
  };
})(window.HK = window.HK || {});
