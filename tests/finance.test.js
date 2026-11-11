/* Testes dos cálculos financeiros. Execute: node tests/finance.test.js */
'use strict';
const assert = require('assert');
const F = require('../js/finance.js');

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('  ok -', name); };

const M = [
  { id: 'w', nome: 'Willyans Chen', ordem: 1 },
  { id: 'c', nome: 'Cauã Peixoto', ordem: 2 },
  { id: 's', nome: 'Spencer', ordem: 3 },
];
const cat = [{ id: 'k1', nome: 'Componentes eletrônicos' }, { id: 'k2', nome: 'Cabos e conectores' }];
const item = (o) => ({ categoria_id: 'k1', compartilhado: true, status: 'Comprado', pago_em: null, ...o });

console.log('finance.js');

t('subtotal = unitário × quantidade (exemplo do enunciado)', () => {
  assert.strictEqual(F.subtotal({ valor_unitario_centavos: 2500, quantidade: 4 }), 10000);
  assert.strictEqual(F.subtotal({ valor_unitario_centavos: 4000, quantidade: 2 }), 8000);
  assert.strictEqual(F.subtotal({ valor_unitario_centavos: 1500, quantidade: 3 }), 4500);
});

t('total dos itens do enunciado = R$ 225,00', () => {
  const r = F.resumo({
    itens: [item({ valor_unitario_centavos: 2500, quantidade: 4 }), item({ valor_unitario_centavos: 4000, quantidade: 2 }),
      item({ valor_unitario_centavos: 1500, quantidade: 3, categoria_id: 'k2' })],
    integrantes: M, categorias: cat,
  });
  assert.strictEqual(r.totais.realizado, 22500);
  assert.strictEqual(r.totais.estimado, 22500);
});

t('quantidade fracionária arredonda ao centavo', () => {
  assert.strictEqual(F.subtotal({ valor_unitario_centavos: 1999, quantidade: 2.5 }), 4998); // 49,975 → 49,98
  assert.strictEqual(F.subtotal({ valor_unitario_centavos: 333, quantidade: 0.333 }), 111);
});

t('R$ 900,00 ÷ 3 = R$ 300,00 cada', () => {
  const d = F.splitEven(90000, M);
  assert.deepStrictEqual(d.partes.map((p) => p.valor), [30000, 30000, 30000]);
  assert.strictEqual(d.resto, 0);
});

t('centavos residuais distribuídos e soma exata', () => {
  for (const total of [1, 2, 100, 10001, 10002, 99999, 123457]) {
    const d = F.splitEven(total, M);
    assert.strictEqual(d.partes.reduce((a, p) => a + p.valor, 0), total);
    const vals = d.partes.map((p) => p.valor);
    assert.ok(Math.max(...vals) - Math.min(...vals) <= 1);
  }
  assert.deepStrictEqual(F.splitEven(10000, M).partes.map((p) => p.valor), [3334, 3333, 3333]);
  assert.deepStrictEqual(F.splitEven(10001, M).partes.map((p) => p.valor), [3334, 3334, 3333]);
});

t('planejado não entra no realizado; cancelado não entra em nada', () => {
  const r = F.resumo({
    itens: [
      item({ valor_unitario_centavos: 10000, quantidade: 1, status: 'Planejado' }),
      item({ valor_unitario_centavos: 5000, quantidade: 1, status: 'Pago', pago_em: '2026-11-11', pago_por_id: 'w' }),
      item({ valor_unitario_centavos: 7000, quantidade: 1, status: 'Cancelado' }),
      item({ valor_unitario_centavos: 2000, quantidade: 1, status: 'Recebido' }),
    ],
    integrantes: M, categorias: cat,
  });
  assert.strictEqual(r.totais.estimado, 17000);
  assert.strictEqual(r.totais.realizado, 7000);
  assert.strictEqual(r.totais.pago, 5000);
  assert.strictEqual(r.totais.pendentePagamento, 2000);
  assert.strictEqual(r.totais.previsto, 10000);
  assert.strictEqual(r.contagem.recebidos, 1);
  assert.strictEqual(r.contagem.pendentes, 2);
  assert.strictEqual(r.contagem.cancelados, 1);
});

t('saldo, pendência, excedente e acertos', () => {
  const r = F.resumo({
    itens: [item({ valor_unitario_centavos: 90000, quantidade: 1, status: 'Pago', pago_em: '2026-11-11', pago_por_id: 'w' })],
    contribs: [{ integrante_id: 'w', valor_centavos: 90000 }],
    integrantes: M, categorias: cat,
  });
  const [w, c, s] = r.membros;
  assert.strictEqual(w.devido, 30000); assert.strictEqual(w.saldo, 60000); assert.strictEqual(w.excedente, 60000);
  assert.strictEqual(c.pendente, 30000); assert.strictEqual(s.pendente, 30000);
  assert.deepStrictEqual(r.acertos.map((a) => [a.deId, a.paraId, a.valor]), [['c', 'w', 30000], ['s', 'w', 30000]]);
  assert.strictEqual(r.diferencaCaixa, 0);
});

t('gasto não compartilhado fica com o responsável', () => {
  const r = F.resumo({
    itens: [item({ valor_unitario_centavos: 30000, quantidade: 1 }), item({ valor_unitario_centavos: 5000, quantidade: 1, compartilhado: false, responsavel_id: 's' })],
    integrantes: M, categorias: cat,
  });
  assert.deepStrictEqual(r.membros.map((m) => m.devido), [10000, 10000, 15000]);
  assert.strictEqual(r.totalDevido, r.totais.realizado);
});

t('integrante fora do rateio não recebe cota', () => {
  const r = F.resumo({
    itens: [item({ valor_unitario_centavos: 10000, quantidade: 1 })],
    integrantes: [M[0], M[1], { ...M[2], participa_rateio: false }], categorias: cat,
  });
  assert.deepStrictEqual(r.membros.map((m) => m.devido), [5000, 5000, 0]);
});

t('categorias: participação percentual e ordenação', () => {
  const r = F.resumo({
    itens: [item({ valor_unitario_centavos: 7500, quantidade: 1 }), item({ valor_unitario_centavos: 2500, quantidade: 1, categoria_id: 'k2' })],
    integrantes: M, categorias: cat,
  });
  assert.strictEqual(r.porCategoria[0].nome, 'Componentes eletrônicos');
  assert.strictEqual(Math.round(r.porCategoria[0].pctEstimado), 75);
  assert.ok(r.alertas.some((a) => /concentra 75%/.test(a.texto)));
});

t('orçamento: uso, disponível e excesso', () => {
  const r = F.resumo({
    itens: [item({ valor_unitario_centavos: 85000, quantidade: 1 }), item({ valor_unitario_centavos: 30000, quantidade: 1, status: 'Planejado' })],
    integrantes: M, categorias: cat, orcamento: 100000,
  });
  assert.strictEqual(r.orcamento.disponivel, 15000);
  assert.strictEqual(r.orcamento.disponivelAposPrevistos, -15000);
  assert.ok(r.alertas.some((a) => a.nivel === 'critical'));
  assert.ok(r.alertas.some((a) => /85%/.test(a.texto)));
});

t('duplicidades por nome normalizado', () => {
  const r = F.resumo({
    itens: [item({ nome: 'Capacitor 100uF', valor_unitario_centavos: 100, quantidade: 1 }), item({ nome: 'capacitor  100UF', valor_unitario_centavos: 120, quantidade: 1 }), item({ nome: 'Cabo', valor_unitario_centavos: 100, quantidade: 1 })],
    integrantes: M, categorias: cat,
  });
  assert.strictEqual(r.duplicidades.length, 1);
  assert.strictEqual(r.duplicidades[0].itens.length, 2);
});

t('cotações: menor unitário × menor total com frete', () => {
  const linhas = F.analisarCotacoes([
    { loja: 'A', preco_unitario_centavos: 3500, frete_centavos: 0 },
    { loja: 'B', preco_unitario_centavos: 3000, frete_centavos: 2500 },
    { loja: 'C', preco_unitario_centavos: 3800, frete_centavos: null },
  ], 2);
  assert.deepStrictEqual(linhas.map((l) => l.menorUnitario), [false, true, false]);
  assert.deepStrictEqual(linhas.map((l) => l.totalComFrete), [7000, 8500, 7600]);
  assert.deepStrictEqual(linhas.map((l) => l.menorTotal), [true, false, false]);
});

console.log(`\n${n} testes passaram.`);
