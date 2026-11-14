/* Apresentação — por enquanto contém só o visualizador 3D da garrafa de alimentação.
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
          <div id="apr-visualizador" class="apr-visualizador"></div>
          <div id="apr-secoes"></div>
        </div>`;
      const alvo = el.querySelector('#apr-visualizador');
      let instancia = null;
      HK.onLeave(() => { if (instancia) instancia.destruir(); instancia = null; });
      try {
        const url = new URL('js/viewer3d/visualizador.js', document.baseURI).href;
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
