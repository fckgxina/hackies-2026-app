/* Visualizador 3D da garrafa de alimentação (D02) — componente independente.
 * Módulo ES carregado sob demanda pela aba Apresentação (js/views/apresentacao.js).
 * Three.js via import map (index.html), versão fixa 0.170.0.
 * Uso:  const v = await montarVisualizador(elemento, { base: 'assets/3d/' });  ...  v.destruir();
 * Os nomes dos objetos do GLB são o contrato com components.json (id = nome no Blender). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ICON = {
  casa: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  alvo: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  explodir: '<path d="M12 3v6M12 15v6M3 12h6M15 12h6"/><path d="m9 6 3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  lista: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
  play: '<path d="M7 5v14l11-7z"/>', pause: '<path d="M7 5h3v14H7zM14 5h3v14h-3z"/>',
  prev: '<path d="M15 6l-6 6 6 6"/>', next: '<path d="M9 6l6 6-6 6"/>', reset: '<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v4h4"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>', raio: '<path d="M13 3 6 13h5l-1 8 7-10h-5z"/>',
};
const ic = (n) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;

const DESTAQUE = new THREE.Color('#f5b301');

export async function montarVisualizador(raiz, { base = 'assets/3d/' } = {}) {
  raiz.innerHTML = `
  <div class="v3d">
    <div class="v3d-barra" role="toolbar" aria-label="Ferramentas de visualização">
      <div class="v3d-grupo">
        <button class="btn btn-sm" data-acao="inicial" title="Voltar à visão inicial">${ic('casa')} Visão inicial</button>
        <button class="btn btn-sm" data-acao="centralizar" title="Centralizar o equipamento">${ic('alvo')} Centralizar</button>
      </div>
      <div class="v3d-seg" role="group" aria-label="Carcaça">
        <span class="v3d-seg-rot">Carcaça</span>
        <button class="v3d-seg-btn on" data-modo="normal" aria-pressed="true">Completa</button>
        <button class="v3d-seg-btn" data-modo="transparente" aria-pressed="false">Transparente</button>
        <button class="v3d-seg-btn" data-modo="aberta" aria-pressed="false">Aberta</button>
        <button class="v3d-seg-btn" data-modo="corte" aria-pressed="false">Corte</button>
      </div>
      <div class="v3d-grupo">
        <button class="btn btn-sm" data-acao="explodir" aria-pressed="false">${ic('explodir')} Vista explodida</button>
        <button class="btn btn-sm" data-acao="lista" aria-expanded="false">${ic('lista')} Componentes</button>
      </div>
    </div>
    <div class="v3d-corpo">
      <div class="v3d-palco">
        <canvas class="v3d-canvas" aria-label="Modelo 3D da garrafa de alimentação. Arraste para girar, role para aproximar e clique numa peça para ver a ficha."></canvas>
        <div class="v3d-carregando" role="status">
          <img src="${base}preview.jpg" alt="" class="v3d-previa">
          <div class="v3d-carregando-msg"><div class="spinner"></div><span>Carregando modelo 3D…</span></div>
        </div>
        <div class="v3d-lista" hidden></div>
        <div class="v3d-legenda">
          <span class="v3d-tag real">Dimensões do fabricante</span><span class="v3d-tag ilus">Ilustrativo</span>
          <span class="v3d-dica">Arraste para girar · role para zoom · botão direito para mover · clique numa peça</span>
        </div>
      </div>
      <aside class="v3d-painel" hidden aria-live="polite"></aside>
    </div>
    <div class="v3d-fluxo">
      <div class="v3d-fluxo-cab">
        <b>${ic('raio')} Acompanhar fluxo de energia</b>
        <div class="v3d-fluxo-ctl">
          <button class="btn-icon" data-fluxo="reiniciar" title="Reiniciar" aria-label="Reiniciar">${ic('reset')}</button>
          <button class="btn-icon" data-fluxo="voltar" title="Voltar" aria-label="Voltar etapa">${ic('prev')}</button>
          <button class="btn btn-sm btn-primary" data-fluxo="play">${ic('play')} Iniciar</button>
          <button class="btn-icon" data-fluxo="avancar" title="Avançar" aria-label="Avançar etapa">${ic('next')}</button>
          <button class="btn btn-sm btn-ghost" data-fluxo="sair" hidden>Sair do fluxo</button>
        </div>
      </div>
      <ol class="v3d-etapas"></ol>
      <div class="v3d-etapa-info" hidden></div>
    </div>
    <div class="v3d-func" hidden role="dialog" aria-modal="true" aria-label="Ver funcionamento"></div>
  </div>`;

  const $ = (s) => raiz.querySelector(s);
  const canvas = $('.v3d-canvas'), palco = $('.v3d-palco'), painel = $('.v3d-painel');
  const limpezas = [];
  const fluxo = { ativo: false, idx: -1, tocando: false, timer: 0, objetosAtuais: new Set() };
  const on = (alvo, ev, fn, opt) => { alvo.addEventListener(ev, fn, opt); limpezas.push(() => alvo.removeEventListener(ev, fn, opt)); };

  // ---------- cena ----------
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;
  const cena = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const ambiente = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; cena.environment = ambiente; cena.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.005, 20);
  cena.add(new THREE.HemisphereLight(0xffffff, 0x7a7f88, 1.5));
  const sol = new THREE.DirectionalLight(0xffffff, 2.4); sol.position.set(0.6, 1.2, 0.9); cena.add(sol);
  const pre = new THREE.DirectionalLight(0xffffff, 0.8); pre.position.set(-0.8, 0.4, -0.6); cena.add(pre);
  const controles = new OrbitControls(camera, canvas);
  controles.enableDamping = true; controles.dampingFactor = 0.08; controles.minDistance = 0.08; controles.maxDistance = 3;

  let precisaRender = true, animando = 0, rafId = 0, destruido = false;
  const pedir = () => { precisaRender = true; };
  on(controles, 'change', pedir);

  function laco() {
    if (destruido) return;
    rafId = requestAnimationFrame(laco);
    const t = performance.now();
    const mexeu = controles.update();
    tickTweens(t);
    if (animando > 0 || mexeu || precisaRender || fluxo.ativo) { renderer.render(cena, camera); precisaRender = false; }
  }

  const ro = new ResizeObserver(() => {
    const w = palco.clientWidth, h = palco.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); pedir();
  });
  ro.observe(palco);

  // ---------- tweens simples ----------
  const tweens = new Set();
  function tween(dur, fn, fim) { const t0 = performance.now(); const tw = { t0, dur, fn, fim }; tweens.add(tw); animando++; return tw; }
  function tickTweens(t) {
    for (const tw of [...tweens]) {
      const k = Math.min(1, (t - tw.t0) / tw.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      tw.fn(e);
      if (k >= 1) { tweens.delete(tw); animando--; if (tw.fim) tw.fim(); }
    }
  }

  // ---------- dados e modelo ----------
  let meta, gltf;
  try {
    const [m, g] = await Promise.all([
      fetch(base + 'components.json', { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error('components.json: HTTP ' + r.status); return r.json(); }),
      new Promise((res, rej) => new GLTFLoader().load(base + 'garrafa-alimentacao.glb', res, (ev) => {
        if (ev.total) $('.v3d-carregando-msg span').textContent = `Carregando modelo 3D… ${Math.round(100 * ev.loaded / ev.total)} %`;
      }, rej)),
    ]);
    meta = m; gltf = g;
  } catch (err) {
    $('.v3d-carregando').innerHTML = `<div class="v3d-erro">${ic('x')}<div><b>Não foi possível abrir o modelo 3D.</b><small>${esc(err && err.message ? err.message : err)}</small>
      <button class="btn btn-sm" data-acao="tentar">Tentar de novo</button></div></div>`;
    $('[data-acao="tentar"]').addEventListener('click', () => { destruir(); montarVisualizador(raiz, { base }); });
    return { destruir };
  }
  if (destruido) return { destruir };

  const modelo = gltf.scene; cena.add(modelo);
  const pecas = new Map(); // id -> {mesh, base:{pos, cor, emi, opac}, info}
  const idDaMalha = new Map(); // mesh.uuid -> id
  modelo.traverse((o) => {
    if (!o.isMesh) return;
    const id = (o.userData && o.userData.id) || o.name;
    if (!meta.objetos[id]) return;
    o.material = o.material.clone();
    idDaMalha.set(o.uuid, id);
    pecas.set(id, { id, mesh: o, info: meta.objetos[id], base: { pos: o.position.clone(), emi: o.material.emissive.clone(), opac: o.material.opacity } });
  });
  const faltando = Object.keys(meta.objetos).filter((id) => !pecas.has(id));
  if (faltando.length) console.warn('Objetos do components.json ausentes no GLB:', faltando);

  // enquadramento inicial
  const caixa = new THREE.Box3().setFromObject(modelo), centro = caixa.getCenter(new THREE.Vector3()), raio = caixa.getSize(new THREE.Vector3()).length() / 2;
  const posInicial = centro.clone().add(new THREE.Vector3(0.62, 0.42, 0.78).normalize().multiplyScalar(raio * 2.35));
  function irPara(pos, alvo, dur = 650) {
    const p0 = camera.position.clone(), a0 = controles.target.clone();
    tween(dur, (e) => { camera.position.lerpVectors(p0, pos, e); controles.target.lerpVectors(a0, alvo, e); pedir(); });
  }
  camera.position.copy(posInicial); controles.target.copy(centro); controles.update();
  $('.v3d-carregando').remove();
  laco();

  // ---------- estados de exibição ----------
  const ehCarcaca = (p) => !!p.info.carcaca;
  let modo = 'normal', explodido = false, explodeK = 0, selecionado = null;
  const ocultos = new Set();
  const planoCorte = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);

  function aplicarMateriais() {
    for (const p of pecas.values()) {
      const m = p.mesh.material, carc = ehCarcaca(p);
      const transp = modo === 'transparente' && carc;
      const esmaecer = fluxo.ativo && !fluxo.objetosAtuais.has(p.id) && !carc;
      m.transparent = transp || esmaecer;
      m.opacity = transp ? 0.14 : esmaecer ? 0.22 : p.base.opac;
      m.depthWrite = !(transp || esmaecer);
      m.side = (modo === 'corte' || transp) && carc ? THREE.DoubleSide : THREE.FrontSide;
      m.clippingPlanes = modo === 'corte' ? [planoCorte] : null;
      m.needsUpdate = true;
      p.mesh.visible = !ocultos.has(p.id) && !(modo === 'aberta' && p.id === 'garrafa_tubo_superior')
        && !(fluxo.ativo && p.id === 'garrafa_tubo_superior');
      // destaque
      const dest = (selecionado && selecionado === p.id) || (fluxo.ativo && fluxo.objetosAtuais.has(p.id));
      const irmao = selecionado && !dest && meta.objetos[selecionado] && p.info.grupo === meta.objetos[selecionado].grupo;
      // brilho na própria cor (preserva a identidade da peça) + contorno âmbar nas arestas
      m.emissive.copy(dest || irmao ? m.color : p.base.emi);
      m.emissiveIntensity = dest ? 0.45 : irmao ? 0.15 : 1;
      if ((dest || irmao) && !p.contorno) {
        p.contorno = new THREE.LineSegments(new THREE.EdgesGeometry(p.mesh.geometry, 25), new THREE.LineBasicMaterial({ color: DESTAQUE, transparent: true }));
        p.contorno.renderOrder = 2; p.mesh.add(p.contorno);
      }
      if (p.contorno) {
        p.contorno.visible = !!(dest || irmao);
        p.contorno.material.opacity = dest ? 1 : 0.35;
        p.contorno.material.clippingPlanes = m.clippingPlanes;
      }
    }
    pedir();
  }

  function setModo(novo) {
    modo = novo;
    raiz.querySelectorAll('[data-modo]').forEach((b) => { const on = b.dataset.modo === modo; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    aplicarMateriais();
  }

  function setExplodido(v) {
    explodido = v;
    const b = $('[data-acao="explodir"]'); b.setAttribute('aria-pressed', v); b.classList.toggle('btn-primary', v);
    const k0 = explodeK, k1 = v ? 1 : 0;
    tween(700, (e) => {
      explodeK = k0 + (k1 - k0) * e;
      for (const p of pecas.values()) { const d = p.info.explode || [0, 0, 0]; p.mesh.position.set(p.base.pos.x + d[0] * explodeK, p.base.pos.y + d[1] * explodeK, p.base.pos.z + d[2] * explodeK); }
      pedir();
    });
  }

  // ---------- lista de componentes ----------
  const lista = $('.v3d-lista');
  lista.innerHTML = `<div class="v3d-lista-cab"><b>Componentes</b><button class="btn-icon" data-acao="fechar-lista" aria-label="Fechar">${ic('x')}</button></div>
    <ul>${Object.entries(meta.objetos).map(([id, o]) => `<li><label><input type="checkbox" data-vis="${id}" checked>
      <span class="v3d-ponto ${esc(meta.grupos[o.grupo].natureza)}"></span><span>${esc(o.rotulo)}</span></label>
      <button class="btn-icon" data-sel="${id}" title="Selecionar" aria-label="Selecionar ${esc(o.rotulo)}">${ic('alvo')}</button></li>`).join('')}</ul>
    <div class="v3d-lista-pe"><button class="btn btn-sm" data-acao="mostrar-todos">Mostrar todos</button></div>`;
  function setLista(aberta) { lista.hidden = !aberta; $('[data-acao="lista"]').setAttribute('aria-expanded', aberta); }

  // ---------- seleção e ficha ----------
  function fichaHTML(id) {
    const o = meta.objetos[id], g = meta.grupos[o.grupo];
    const linha = (k, v) => v ? `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>` : '';
    const sec = (t, html) => html ? `<section><h4>${esc(t)}</h4>${html}</section>` : '';
    return `<div class="v3d-painel-cab"><div><small>${esc(g.estagio)}</small><h3>${esc(o.rotulo)}</h3>
        <span class="v3d-tag ${esc(g.natureza)}">${g.natureza === 'real' ? 'Dimensões do fabricante' : 'Ilustrativo'}</span></div>
        <button class="btn-icon" data-acao="fechar-painel" aria-label="Fechar ficha">${ic('x')}</button></div>
      <button class="btn btn-primary v3d-ver" data-acao="funcionamento">${ic('play')} Ver funcionamento</button>
      ${sec('Identificação', `<table>${linha('Componente', g.nome)}${linha('Fabricante', g.fabricante)}${linha('Modelo', g.modelo)}${linha('Quantidade', String(g.quantidade))}${linha('Categoria', g.categoria)}${linha('Estágio', g.estagio)}</table>`)}
      ${sec('Características', `<table>${g.caracteristicas.map(([k, v]) => linha(k, v)).join('')}</table>`)}
      ${sec('Função no projeto', `<dl>${[['O que faz', g.funcao], ['Por que foi escolhido', g.motivo], ['Problema que resolve', g.problema], ['Recebe do estágio anterior', g.anterior], ['Entrega ao estágio seguinte', g.seguinte], ['Limitações', g.limitacoes]].filter(([, v]) => v).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`)}
      ${sec('Documentação', g.docs.length ? `<ul class="v3d-docs">${g.docs.map(([t, u, p]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a><small>${esc(p)}</small></li>`).join('')}</ul>` : '<p class="v3d-nota">Elemento conceitual, sem documento de fabricante.</p>')}
      <p class="v3d-nota">[F] documentação do fabricante · [E] estimativa da equipe (não é medição).</p>`;
  }

  function selecionar(id, { focar = true } = {}) {
    selecionado = id;
    if (!id) { painel.hidden = true; aplicarMateriais(); return; }
    painel.innerHTML = fichaHTML(id); painel.hidden = false; painel.scrollTop = 0;
    aplicarMateriais();
    if (focar) {
      const b = new THREE.Box3().setFromObject(pecas.get(id).mesh), c = b.getCenter(new THREE.Vector3());
      const tam = Math.max(b.getSize(new THREE.Vector3()).length(), 0.06);
      const dir = camera.position.clone().sub(controles.target).normalize();
      irPara(c.clone().add(dir.multiplyScalar(tam * 2.6)), c);
    }
    ro.disconnect(); ro.observe(palco); // painel muda a largura do palco
  }

  // raycasting: clique sem arrastar
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2(); let down = null;
  on(canvas, 'pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
  on(canvas, 'pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) { down = null; return; }
    down = null;
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const vis = [...pecas.values()].filter((p) => p.mesh.visible).map((p) => p.mesh);
    let hits = ray.intersectObjects(vis, false);
    if (modo === 'corte') hits = hits.filter((h) => planoCorte.distanceToPoint(h.point) >= -1e-4);
    if (modo === 'transparente' || fluxo.ativo) { const interno = hits.find((h) => !ehCarcaca(pecas.get(idDaMalha.get(h.object.uuid)) || { info: {} })); if (interno) hits = [interno]; }
    const h = hits[0];
    if (h) selecionar(idDaMalha.get(h.object.uuid)); else selecionar(null);
  });
  on(canvas, 'pointermove', (e) => {
    if (e.buttons) return;
    const r = canvas.getBoundingClientRect();
    ptr.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    const vis = [...pecas.values()].filter((p) => p.mesh.visible).map((p) => p.mesh);
    canvas.style.cursor = ray.intersectObjects(vis, false).length ? 'pointer' : 'grab';
  });

  // ---------- ver funcionamento (animação conceitual) ----------
  const func = $('.v3d-func');
  function svgFuncionamento(grupo) {
    const bx = (x, y, w, h, cls, t1, t2) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="fx-box ${cls}"/>
      <text x="${x + w / 2}" y="${y + h / 2 - (t2 ? 6 : -4)}" class="fx-t">${t1}</text>${t2 ? `<text x="${x + w / 2}" y="${y + h / 2 + 14}" class="fx-s">${t2}</text>` : ''}</g>`;
    const seta = (x1, y1, x2, y2, cls = '') => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="fx-fluxo ${cls}" marker-end="url(#fx-seta)"/>`;
    const defs = '<defs><marker id="fx-seta" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0 10 5 0 10z" class="fx-ponta"/></marker></defs>';
    if (grupo === 'bcm') return `<svg viewBox="0 0 760 220" class="fx">${defs}
      ${bx(10, 70, 130, 80, 'in', '600 V CC', 'entrada')}${seta(140, 110, 220, 110)}
      ${bx(222, 40, 200, 140, 'bcm', 'BCM · K = 1/16', '2 em paralelo')}
      <line x1="322" y1="48" x2="322" y2="172" class="fx-iso"/><text x="322" y="198" class="fx-s">isolação galvânica</text>
      <text x="270" y="140" class="fx-s">HI</text><text x="374" y="140" class="fx-s">LO</text>
      ${seta(422, 110, 500, 110)}${bx(502, 70, 120, 80, 'bus', '≈ 37,1 V', '43,9 A')}${seta(622, 110, 690, 110)}
      ${bx(692, 80, 62, 60, 'prox', '→ DCM', '')}</svg>`;
    if (grupo === 'dcm') {
      let s = `<svg viewBox="0 0 760 300" class="fx">${defs}${bx(10, 110, 120, 80, 'bus', '≈ 37,1 V', 'barramento')}`;
      for (let i = 0; i < 6; i++) { const y = 14 + i * 46; s += seta(130, 150, 238, y + 18, 'fino') + bx(240, y, 200, 36, 'dcm', `DCM #${i + 1} · 16,7 A`, '') + seta(440, y + 18, 548, 150, 'fino'); }
      return s + `${bx(550, 110, 110, 80, 'out', '15 V', '100 A')}${seta(660, 150, 700, 150)}${bx(702, 120, 54, 60, 'prox', 'carga', '')}</svg>`;
    }
    const simples = {
      protecao: ['600 V CC', 'Proteção e filtro', 'para os BCMs'], barramento_37v: ['2 × BCM', 'barramento ≈ 37 V', '6 × DCM'],
      barramento_15v: ['6 × DCM', 'barramento 15 V · 100 A', 'conector de saída'], conector_entrada: ['ROV (600 V CC)', 'conector de entrada', 'proteção'],
      conector_saida: ['barramento 15 V', 'conector de saída', 'cargas do ROV'], placa_fria: ['módulos (≈ 190 W de calor)', 'placa fria', 'parede da garrafa'],
      suporte: ['placa fria', 'suporte', 'parede da garrafa'], carcaca: ['placa fria e suportes', 'garrafa', 'água do mar'], tampa: ['interior', 'tampa e conectores', 'exterior'],
    }[grupo] || ['entrada', 'componente', 'saída'];
    const termico = ['placa_fria', 'suporte', 'carcaca'].includes(grupo);
    return `<svg viewBox="0 0 760 180" class="fx ${termico ? 'termico' : ''}">${defs}${bx(10, 50, 200, 80, 'in', simples[0], '')}${seta(210, 90, 278, 90)}
      ${bx(280, 40, 200, 100, grupo === 'protecao' ? 'prot' : 'bus', simples[1], termico ? 'fluxo de calor' : '')}${seta(480, 90, 548, 90)}${bx(550, 50, 200, 80, 'prox', simples[2], '')}</svg>`;
  }
  function textosFuncionamento(grupo) {
    return ({
      bcm: ['A entrada recebe os 600 V CC já protegidos.', 'O BCM opera em razão fixa: a saída é a entrada dividida por 16.', 'A barreira de isolação separa o lado de 600 V do lado de baixa tensão.', 'Sob carga, a resistência interna faz o barramento cair de 37,5 V para ≈ 37,1 V.', 'Os dois BCMs dividem ≈ 43,9 A e alimentam os seis DCMs.'],
      dcm: ['Cada DCM recebe o barramento de ≈ 37 V (aceita 16–50 V).', 'O DCM regula a tensão e a isola de novo, entregando 15 V.', 'A saída tem leve inclinação com a carga (reta de carga), que divide a corrente sem fio de partilha.', 'Os seis módulos operam a ≈ 16,7 A cada (78 % da nominal).', 'Somados, entregam 100 A ao barramento de 15 V; com um módulo a menos, ainda restam 107 A.'],
    })[grupo] || null;
  }
  function abrirFuncionamento() {
    if (!selecionado) return;
    const o = meta.objetos[selecionado], g = meta.grupos[o.grupo], passos = textosFuncionamento(o.grupo);
    func.innerHTML = `<div class="v3d-func-caixa">
      <div class="v3d-func-cab"><div><small>Ver funcionamento</small><h3>${esc(g.nome)}</h3></div>
        <button class="btn-icon" data-acao="fechar-func" aria-label="Fechar">${ic('x')}</button></div>
      <div class="v3d-func-aviso">Animação conceitual e esquemática. Não representa o circuito interno nem a construção real do equipamento.</div>
      ${svgFuncionamento(o.grupo)}
      ${passos ? `<ol class="v3d-func-passos">${passos.map((p) => `<li>${esc(p)}</li>`).join('')}</ol>` : `<p class="v3d-func-txt">${esc(g.funcao)}</p>`}
    </div>`;
    func.hidden = false; func.querySelector('[data-acao="fechar-func"]').focus();
  }

  // ---------- acompanhar fluxo de energia ----------
  const etapasEl = $('.v3d-etapas'), infoEl = $('.v3d-etapa-info'), playBtn = $('[data-fluxo="play"]');
  etapasEl.innerHTML = meta.fluxo.map((s, i) => `<li><button data-etapa="${i}"><span>${i + 1}</span>${esc(s.titulo.split(' — ')[0])}</button></li>`).join('');
  function irEtapa(i) {
    const n = meta.fluxo.length; i = Math.max(0, Math.min(n - 1, i));
    if (!fluxo.ativo) { fluxo.ativo = true; $('[data-fluxo="sair"]').hidden = false; selecionado = null; painel.hidden = true; }
    fluxo.idx = i; const s = meta.fluxo[i]; fluxo.objetosAtuais = new Set(s.objetos);
    etapasEl.querySelectorAll('[data-etapa]').forEach((b) => { const k = +b.dataset.etapa; b.classList.toggle('on', k === i); b.classList.toggle('feita', k < i); b.setAttribute('aria-current', k === i ? 'step' : 'false'); });
    infoEl.hidden = false;
    infoEl.innerHTML = `<div><small>Etapa ${i + 1} de ${n}</small><h4>${esc(s.titulo)}</h4><p>${esc(s.texto)}</p></div>
      <dl>${s.valores.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;
    aplicarMateriais();
    const b = new THREE.Box3(); s.objetos.forEach((id) => pecas.get(id) && b.expandByObject(pecas.get(id).mesh));
    if (!b.isEmpty()) { const c = b.getCenter(new THREE.Vector3()); const tam = Math.max(b.getSize(new THREE.Vector3()).length(), 0.08); const dir = camera.position.clone().sub(controles.target).normalize(); irPara(c.clone().add(dir.multiplyScalar(tam * 2.4 + 0.08)), c, 800); }
  }
  function tocar(v) {
    fluxo.tocando = v; clearInterval(fluxo.timer);
    playBtn.innerHTML = v ? `${ic('pause')} Pausar` : `${ic('play')} ${fluxo.idx >= 0 ? 'Continuar' : 'Iniciar'}`;
    if (v) {
      if (fluxo.idx < 0 || fluxo.idx >= meta.fluxo.length - 1) irEtapa(0);
      fluxo.timer = setInterval(() => { if (fluxo.idx >= meta.fluxo.length - 1) { tocar(false); return; } irEtapa(fluxo.idx + 1); }, 3800);
    }
  }
  function sairFluxo() {
    tocar(false); fluxo.ativo = false; fluxo.idx = -1; fluxo.objetosAtuais = new Set();
    infoEl.hidden = true; $('[data-fluxo="sair"]').hidden = true; playBtn.innerHTML = `${ic('play')} Iniciar`;
    etapasEl.querySelectorAll('[data-etapa]').forEach((b) => b.classList.remove('on', 'feita'));
    aplicarMateriais();
  }

  // ---------- eventos da interface ----------
  on(raiz, 'click', (e) => {
    const b = e.target.closest('button, input'); if (!b) return;
    if (b.dataset.modo) return setModo(b.dataset.modo);
    if (b.dataset.etapa) { tocar(false); return irEtapa(+b.dataset.etapa); }
    if (b.dataset.sel) { setLista(false); return selecionar(b.dataset.sel); }
    if (b.dataset.vis) { if (b.checked) ocultos.delete(b.dataset.vis); else ocultos.add(b.dataset.vis); if (!b.checked && selecionado === b.dataset.vis) selecionar(null); return aplicarMateriais(); }
    switch (b.dataset.acao || b.dataset.fluxo) {
      case 'inicial': return irPara(posInicial, centro);
      case 'centralizar': { const c = new THREE.Box3().setFromObject(modelo).getCenter(new THREE.Vector3()); const d = camera.position.distanceTo(controles.target); return irPara(c.clone().add(camera.position.clone().sub(controles.target).normalize().multiplyScalar(d)), c); }
      case 'explodir': return setExplodido(!explodido);
      case 'lista': return setLista(lista.hidden);
      case 'fechar-lista': return setLista(false);
      case 'mostrar-todos': ocultos.clear(); lista.querySelectorAll('[data-vis]').forEach((c) => { c.checked = true; }); return aplicarMateriais();
      case 'fechar-painel': return selecionar(null);
      case 'funcionamento': return abrirFuncionamento();
      case 'fechar-func': func.hidden = true; return undefined;
      case 'play': return tocar(!fluxo.tocando);
      case 'reiniciar': tocar(false); return irEtapa(0);
      case 'voltar': tocar(false); return irEtapa((fluxo.idx < 0 ? 0 : fluxo.idx) - 1);
      case 'avancar': tocar(false); return irEtapa(fluxo.idx + 1);
      case 'sair': return sairFluxo();
      default: return undefined;
    }
  });
  on(func, 'click', (e) => { if (e.target === func) func.hidden = true; });
  on(window, 'keydown', (e) => { if (e.key === 'Escape') { if (!func.hidden) func.hidden = true; else if (!lista.hidden) setLista(false); else if (selecionado) selecionar(null); } });

  aplicarMateriais();

  // ---------- liberação de recursos ----------
  function destruir() {
    if (destruido) return; destruido = true;
    cancelAnimationFrame(rafId); clearInterval(fluxo.timer); ro.disconnect();
    limpezas.forEach((f) => f()); controles.dispose();
    cena.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      mats.forEach((m) => { Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); }); m.dispose(); });
    });
    ambiente.dispose(); pmrem.dispose();
    renderer.dispose(); renderer.forceContextLoss();
  }
  /** Diagnóstico: posição (px, relativa ao canvas) do centro visível de uma peça — usada nos testes de clique. */
  function pontoNaTela(id) {
    const p = pecas.get(id); if (!p) return null;
    const c = new THREE.Box3().setFromObject(p.mesh).getCenter(new THREE.Vector3()).project(camera);
    return { x: (c.x + 1) / 2 * canvas.clientWidth, y: (1 - c.y) / 2 * canvas.clientHeight };
  }
  const api = { destruir, selecionar, irEtapa, pontoNaTela, pecas, meta, get selecionado() { return selecionado; } };
  raiz._v3d = api;
  return api;
}
