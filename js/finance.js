/* HackIES 2026 · cálculos financeiros (funções puras; valores sempre em centavos inteiros).
 * Funciona no navegador (HK.finance) e no Node (module.exports) para testes. */
(function (root) {
  'use strict';

  const STATUS = ['Planejado', 'Em cotação', 'Aguardando compra', 'Comprado', 'Pago', 'Recebido', 'Cancelado'];
  const PREVISTOS = ['Planejado', 'Em cotação', 'Aguardando compra']; // ainda não adquiridos
  const REALIZADOS = ['Comprado', 'Pago', 'Recebido'];                 // gasto efetivamente realizado

  const isAtivo = (i) => i.status !== 'Cancelado';
  const isRealizado = (i) => REALIZADOS.includes(i.status);
  const isPrevisto = (i) => PREVISTOS.includes(i.status);
  const isPago = (i) => isAtivo(i) && !!i.pago_em;

  /** Subtotal = valor unitário × quantidade, arredondado ao centavo (meio para cima). */
  function subtotal(item) {
    const unit = Math.round(Number(item.valor_unitario_centavos) || 0);
    const qMilli = Math.round((Number(item.quantidade) || 0) * 1000);
    return Math.round((unit * qMilli) / 1000);
  }

  const sum = (arr, fn) => arr.reduce((acc, x) => acc + fn(x), 0);

  /**
   * Divide `total` (centavos) igualmente entre `membros` (ordem fixa).
   * Centavos que sobram da divisão vão, um a um, aos primeiros da lista —
   * a soma das partes é sempre exatamente igual ao total.
   */
  function splitEven(total, membros) {
    const n = membros.length;
    if (!n) return { partes: [], resto: 0, base: 0 };
    const t = Math.round(total);
    const base = Math.floor(t / n);
    const resto = t - base * n;
    const partes = membros.map((m, idx) => ({ id: m.id, nome: m.nome, valor: base + (idx < resto ? 1 : 0), centavoExtra: idx < resto }));
    return { partes, resto, base };
  }

  /** Sugere transferências mínimas (gulosas) para zerar saldos. saldo > 0 = pagou a mais. */
  function acertos(membros) {
    const cred = membros.filter((m) => m.saldo > 0).map((m) => ({ ...m, r: m.saldo })).sort((a, b) => b.r - a.r);
    const deve = membros.filter((m) => m.saldo < 0).map((m) => ({ ...m, r: -m.saldo })).sort((a, b) => b.r - a.r);
    const out = [];
    let i = 0, j = 0;
    while (i < deve.length && j < cred.length) {
      const v = Math.min(deve[i].r, cred[j].r);
      if (v > 0) out.push({ de: deve[i].nome, deId: deve[i].id, para: cred[j].nome, paraId: cred[j].id, valor: v });
      deve[i].r -= v; cred[j].r -= v;
      if (deve[i].r === 0) i++;
      if (cred[j].r === 0) j++;
    }
    return out;
  }

  /**
   * Resumo completo.
   * itens: linhas da tabela itens; contribs: contribuições; integrantes: todos;
   * categorias: [{id,nome}]; orcamento: centavos ou null.
   */
  function resumo({ itens = [], contribs = [], integrantes = [], categorias = [], orcamento = null }) {
    const ativos = itens.filter(isAtivo);
    const realizados = itens.filter(isRealizado);
    const previstos = itens.filter(isPrevisto);
    const st = (i) => subtotal(i);

    const totais = {
      estimado: sum(ativos, st),                                      // todos os não cancelados
      realizado: sum(realizados, st),                                 // comprados/pagos/recebidos
      pago: sum(itens.filter(isPago), st),                            // com pagamento registrado
      pendentePagamento: sum(realizados.filter((i) => !i.pago_em), st), // comprados sem pagamento registrado
      previsto: sum(previstos, st),                                   // ainda a comprar
      cancelado: sum(itens.filter((i) => !isAtivo(i)), st),
      contribuido: sum(contribs, (c) => Math.round(Number(c.valor_centavos) || 0)),
    };

    const contagem = {
      cadastrados: itens.length,
      ativos: ativos.length,
      comprados: realizados.length,
      recebidos: itens.filter((i) => i.status === 'Recebido').length,
      pendentes: itens.filter((i) => isAtivo(i) && i.status !== 'Recebido').length,
      cancelados: itens.length - ativos.length,
      previstos: previstos.length,
    };

    // --- rateio ---
    const rateio = integrantes.filter((m) => m.participa_rateio !== false)
      .sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || String(a.nome).localeCompare(b.nome));
    const compEst = sum(ativos.filter((i) => i.compartilhado !== false), st);
    const compReal = sum(realizados.filter((i) => i.compartilhado !== false), st);
    const divEst = splitEven(compEst, rateio);
    const divReal = splitEven(compReal, rateio);
    const individual = (lista, id) => sum(lista.filter((i) => i.compartilhado === false && i.responsavel_id === id), st);

    const membros = integrantes.map((m) => {
      const pEst = divEst.partes.find((p) => p.id === m.id);
      const pReal = divReal.partes.find((p) => p.id === m.id);
      const devidoEstimado = (pEst ? pEst.valor : 0) + individual(ativos, m.id);
      const devido = (pReal ? pReal.valor : 0) + individual(realizados, m.id);
      const contribuido = sum(contribs.filter((c) => c.integrante_id === m.id), (c) => Math.round(Number(c.valor_centavos) || 0));
      const saldo = contribuido - devido;
      return {
        id: m.id, nome: m.nome, participa: !!pEst,
        cotaEstimada: pEst ? pEst.valor : 0, cotaRealizada: pReal ? pReal.valor : 0,
        individualEstimado: individual(ativos, m.id), individualRealizado: individual(realizados, m.id),
        devidoEstimado, devido, contribuido, saldo,
        pendente: Math.max(0, -saldo), excedente: Math.max(0, saldo),
        centavoExtraEst: !!(pEst && pEst.centavoExtra), centavoExtraReal: !!(pReal && pReal.centavoExtra),
      };
    });

    const totalDevido = sum(membros, (m) => m.devido);
    const diferencaCaixa = totais.contribuido - totalDevido; // >0: contribuições acima do gasto realizado

    // --- por categoria ---
    const catNome = (id) => (categorias.find((c) => c.id === id) || {}).nome || 'Sem categoria';
    const porCategoria = categorias.map((c) => ({ id: c.id, nome: c.nome }))
      .concat(ativos.some((i) => !categorias.find((c) => c.id === i.categoria_id)) ? [{ id: null, nome: 'Sem categoria' }] : [])
      .map((c) => {
        const doCat = (lista) => lista.filter((i) => (c.id ? i.categoria_id === c.id : !categorias.find((k) => k.id === i.categoria_id)));
        return {
          id: c.id, nome: c.nome,
          estimado: sum(doCat(ativos), st), realizado: sum(doCat(realizados), st), itens: doCat(ativos).length,
        };
      })
      .filter((c) => c.estimado > 0 || c.realizado > 0 || c.itens > 0)
      .map((c) => ({ ...c, pctEstimado: totais.estimado ? (c.estimado / totais.estimado) * 100 : 0, pctRealizado: totais.realizado ? (c.realizado / totais.realizado) * 100 : 0 }))
      .sort((a, b) => b.estimado - a.estimado);

    // --- por item ---
    const comSub = ativos.map((i) => ({ ...i, subtotal: st(i), categoria: catNome(i.categoria_id) }));
    const topCusto = [...comSub].sort((a, b) => b.subtotal - a.subtotal).slice(0, 5);
    const topUnitario = [...comSub].sort((a, b) => b.valor_unitario_centavos - a.valor_unitario_centavos).slice(0, 5);
    const topQuantidade = comSub.filter(isRealizado).sort((a, b) => Number(b.quantidade) - Number(a.quantidade)).slice(0, 5);

    // --- compras ---
    const compras = {
      naoAdquiridos: comSub.filter(isPrevisto),
      aguardandoCompra: comSub.filter((i) => i.status === 'Aguardando compra'),
      compradosNaoRecebidos: comSub.filter((i) => i.status === 'Comprado' || i.status === 'Pago'),
      semPagamento: comSub.filter((i) => isRealizado(i) && !i.pago_em),
      cancelados: itens.filter((i) => !isAtivo(i)).map((i) => ({ ...i, subtotal: st(i), categoria: catNome(i.categoria_id) })),
    };

    // --- possíveis duplicidades (mesmo nome normalizado entre itens ativos) ---
    const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const grupos = {};
    ativos.forEach((i) => { const k = norm(i.nome); (grupos[k] = grupos[k] || []).push(i); });
    const duplicidades = Object.values(grupos).filter((g) => g.length > 1).map((g) => ({ nome: g[0].nome, itens: g }));

    // --- orçamento ---
    const orc = orcamento == null || orcamento === '' ? null : Math.round(Number(orcamento));
    const orcamentoInfo = orc == null ? null : {
      valor: orc,
      usado: totais.realizado,
      comprometido: totais.estimado,
      disponivel: orc - totais.realizado,
      disponivelAposPrevistos: orc - totais.estimado,
      pctUsado: orc > 0 ? (totais.realizado / orc) * 100 : 0,
      pctComprometido: orc > 0 ? (totais.estimado / orc) * 100 : 0,
    };

    // --- alertas (somente a partir dos dados registrados) ---
    const alertas = [];
    const brl = (c) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pctTxt = (p) => `${p.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
    if (porCategoria.length >= 2 && porCategoria[0].pctEstimado >= 40) {
      alertas.push({ nivel: 'warning', texto: `A categoria "${porCategoria[0].nome}" concentra ${pctTxt(porCategoria[0].pctEstimado)} do total estimado.` });
    }
    if (comSub.length >= 3 && topCusto[0] && totais.estimado && topCusto[0].subtotal / totais.estimado >= 0.25) {
      alertas.push({ nivel: 'warning', texto: `O item "${topCusto[0].nome}" representa ${pctTxt((topCusto[0].subtotal / totais.estimado) * 100)} do total estimado.` });
    }
    if (compras.naoAdquiridos.length) {
      alertas.push({ nivel: 'info', texto: `${compras.naoAdquiridos.length} item(ns) planejado(s) ainda não comprado(s), somando ${brl(totais.previsto)}.` });
    }
    if (compras.compradosNaoRecebidos.length) {
      alertas.push({ nivel: 'info', texto: `${compras.compradosNaoRecebidos.length} item(ns) comprado(s) ainda não recebido(s).` });
    }
    if (compras.semPagamento.length) {
      alertas.push({ nivel: 'warning', texto: `${compras.semPagamento.length} item(ns) adquirido(s) sem pagamento registrado (${brl(totais.pendentePagamento)}).` });
    }
    const pend = membros.filter((m) => m.pendente > 0);
    if (pend.length) {
      alertas.push({ nivel: 'warning', texto: `Contribuições pendentes: ${pend.map((m) => `${m.nome} (${brl(m.pendente)})`).join(', ')}.` });
    }
    if (orcamentoInfo) {
      if (orcamentoInfo.pctUsado >= 100) alertas.push({ nivel: 'critical', texto: `Gastos realizados ultrapassaram o orçamento em ${brl(-orcamentoInfo.disponivel)}.` });
      else if (orcamentoInfo.pctUsado >= 80) alertas.push({ nivel: 'warning', texto: `Gastos realizados já usam ${pctTxt(orcamentoInfo.pctUsado)} do orçamento.` });
      if (orcamentoInfo.disponivelAposPrevistos < 0) alertas.push({ nivel: 'critical', texto: `O total estimado excede o orçamento em ${brl(-orcamentoInfo.disponivelAposPrevistos)}.` });
    }
    if (duplicidades.length) {
      alertas.push({ nivel: 'info', texto: `Possível duplicidade: ${duplicidades.map((d) => `"${d.nome}" (${d.itens.length}×)`).join(', ')}.` });
    }

    return {
      totais, contagem, membros, rateio: { estimado: divEst, realizado: divReal, participantes: rateio.length },
      totalDevido, diferencaCaixa, acertos: acertos(membros),
      porCategoria, topCusto, topUnitario, topQuantidade, compras, duplicidades, orcamento: orcamentoInfo, alertas,
    };
  }

  /** Cotações: menor preço unitário e menor custo total (preço × qtd + frete). Não decide a compra. */
  function analisarCotacoes(cotacoes, quantidade) {
    const q = Number(quantidade) || 1;
    const linhas = cotacoes.map((c) => {
      const qMilli = Math.round(q * 1000);
      const produto = Math.round((Math.round(Number(c.preco_unitario_centavos) || 0) * qMilli) / 1000);
      const frete = c.frete_centavos == null ? null : Math.round(Number(c.frete_centavos));
      return { ...c, totalProduto: produto, totalComFrete: produto + (frete || 0), freteInformado: frete != null };
    });
    const minUnit = linhas.length ? Math.min(...linhas.map((l) => Number(l.preco_unitario_centavos))) : null;
    const minTotal = linhas.length ? Math.min(...linhas.map((l) => l.totalComFrete)) : null;
    return linhas.map((l) => ({ ...l, menorUnitario: Number(l.preco_unitario_centavos) === minUnit, menorTotal: l.totalComFrete === minTotal }));
  }

  const api = { STATUS, PREVISTOS, REALIZADOS, subtotal, splitEven, acertos, resumo, analisarCotacoes, isRealizado, isPrevisto, isAtivo, isPago };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') { root.HK = root.HK || {}; root.HK.finance = api; }
})(typeof window !== 'undefined' ? window : globalThis);
