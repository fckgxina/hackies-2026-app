/* Apresentação — apresentação em rolagem do modelo 3D de alta fidelidade (js/viewer3d/apresentacao-garrafa.js,
 * módulo ES + Three.js). É carregada só quando esta aba é aberta e destruída ao sair dela (HK.onLeave),
 * liberando o WebGL. O visualizador do modelo conceitual v0 foi retirado em 16/11/2026 (a fonte continua em
 * modelo-3d/garrafa_modelo.py e no histórico do git).
 * Seções futuras da apresentação (problema, objetivos, arquitetura, cálculos, térmica,
 * resultados, conclusão) entram em #apr-secoes, abaixo do modelo. */
(function (HK) {
  'use strict';
  const U = HK.util;
  const BASE = 'assets/3d/';

  HK.views.apresentacao = {
    async render(el, route, alive) {
      el.innerHTML = `
        <div class="apr">
          <div id="apr-garrafa"></div>
          <div id="apr-secoes"></div>
        </div>`;
      let garrafa = null;
      HK.onLeave(() => { if (garrafa) garrafa.destruir(); garrafa = null; });
      try {
        const urlG = new URL('js/viewer3d/apresentacao-garrafa.js?v=20261116f', document.baseURI).href;
        const modG = await import(urlG);
        if (!alive()) return;
        garrafa = await modG.montarApresentacaoGarrafa(el.querySelector('#apr-garrafa'), { base: BASE });
        if (!alive() && garrafa) { garrafa.destruir(); garrafa = null; }
      } catch (e) {
        console.error(e);
        el.querySelector('#apr-garrafa').innerHTML = `<div class="alert alert-critical">${U.icon('alert')}<span>Não foi possível iniciar a apresentação 3D: ${U.esc(U.errMsg(e))}. Verifique a conexão com a internet (a biblioteca Three.js vem do jsDelivr).</span></div>`;
      }
    },
  };
})(window.HK = window.HK || {});
