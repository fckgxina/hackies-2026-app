/* Apresentação — apresentação em rolagem do modelo de alta fidelidade (apresentacao-garrafa.js) seguida
 * do visualizador do modelo conceitual v0 (fluxo de energia).
 * O visualizador (js/viewer3d/visualizador.js, módulo ES + Three.js) é carregado só quando
 * esta aba é aberta e é destruído ao sair dela (HK.onLeave), liberando o WebGL.
 * Seções futuras da apresentação (problema, objetivos, arquitetura, cálculos, térmica,
 * resultados, conclusão) entram em #apr-secoes, abaixo do visualizador. */
(function (HK) {
  'use strict';
  const U = HK.util;
  const BASE = 'assets/3d/';

  HK.views.apresentacao = {
    async render(el, route, alive) {
      el.innerHTML = `
        <div class="apr">
          <div id="apr-garrafa"></div>
          <h3 class="apr-legado-titulo">Modelo conceitual (v0) e fluxo de energia</h3>
          <div id="apr-visualizador" class="apr-visualizador"></div>
          <div id="apr-secoes"></div>
        </div>`;
      const alvo = el.querySelector('#apr-visualizador');
      let instancia = null, garrafa = null;
      HK.onLeave(() => { if (instancia) instancia.destruir(); instancia = null; if (garrafa) garrafa.destruir(); garrafa = null; });
      // apresentação em rolagem do modelo de alta fidelidade (GLB v002)
      try {
        const urlG = new URL('js/viewer3d/apresentacao-garrafa.js?v=20261116f', document.baseURI).href;
        const modG = await import(urlG);
        if (!alive()) return;
        garrafa = await modG.montarApresentacaoGarrafa(el.querySelector('#apr-garrafa'), { base: BASE });
        if (!alive() && garrafa) { garrafa.destruir(); garrafa = null; }
      } catch (e) {
        console.error(e);
        el.querySelector('#apr-garrafa').innerHTML = `<div class="alert alert-critical">${U.icon('alert')}<span>Não foi possível iniciar a apresentação 3D: ${U.esc(U.errMsg(e))}.</span></div>`;
      }
      if (!alive()) return;
      try {
        const url = new URL('js/viewer3d/visualizador.js?v=20261114b', document.baseURI).href;
        const mod = await import(url);
        if (!alive()) return;
        instancia = await mod.montarVisualizador(alvo, { base: BASE });
        if (!alive() && instancia) { instancia.destruir(); instancia = null; }
      } catch (e) {
        console.error(e);
        alvo.innerHTML = `<div class="alert alert-critical">${U.icon('alert')}<span>Não foi possível iniciar o visualizador 3D: ${U.esc(U.errMsg(e))}. Verifique a conexão com a internet (a biblioteca Three.js vem do jsDelivr).</span></div>`;
      }
    },
  };
})(window.HK = window.HK || {});
