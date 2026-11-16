/* Apresentação da garrafa de alimentação em rolagem (modelo de alta fidelidade, GLB v002, sem compressão).
 * Um único visualizador 3D fica fixo ao lado do texto (no celular, no alto) e muda de cena conforme a
 * seção visível: visão geral, cada componente isolado, montagem (animação do GLB) e equipamento completo.
 * Dados: assets/3d/garrafa_secoes.json (textos e fontes) e garrafa_rov_web_v002.json (trechos da animação e
 * tabela de detalhe dos materiais); estudio.exr = mesmo HDRI do estúdio do Blender (CC0). */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const NATUREZA = {
  fabricante: ['real', 'Dados do fabricante'], referencia: ['real', 'Referência comercial'],
  hipotese: ['ilus', 'Hipótese da equipe'], ilustrativo: ['ilus', 'Ilustrativo'],
};
const DIR_PADRAO = new THREE.Vector3(-0.55, 0.42, 0.75).normalize();   // glTF: Y para cima

// Detalhe dos materiais no navegador, com os mesmos nós e faixas do Blender (materiais/detalhe.py):
// Noise Texture (gradiente, Detail 6, Roughness 0,55, lacunaridade 2) em coordenadas do objeto → Map Range
// linear para a rugosidade (0,3–0,7) e para a mistura de cor (0,35–0,75); Mapping (estrias, 1, 1) no alumínio
// usinado; nó Bump (Distance 0,05 mm). Oitavas mais finas que o pixel são atenuadas (o Cycles as tiraria
// pela média das amostras), o que evita cintilação ao girar.
const GLSL_RUIDO = `
varying vec3 vPosObj;
uniform vec2 uRug; uniform vec3 uEsc; uniform vec3 uCor2; uniform float uMisturaCor; uniform float uRelevo; uniform float uEscRelevo;
vec3 apgHash(vec3 p) {
  p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}
float apgGrad(vec3 p) {
  vec3 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(dot(apgHash(i), f), dot(apgHash(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                 mix(dot(apgHash(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(apgHash(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
             mix(mix(dot(apgHash(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(apgHash(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                 mix(dot(apgHash(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(apgHash(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
}
float apgFbm(vec3 p, int oit, float fw) {
  float a = 1.0, s = 0.0, m = 0.0, fr = 1.0;
  for (int k = 0; k < 8; k++) {
    if (k >= oit) break;
    s += a * (1.0 - smoothstep(0.25, 0.6, fr * fw)) * apgGrad(p * fr);
    m += a; a *= 0.55; fr *= 2.0;
  }
  return clamp(0.5 + 0.7 * s / m, 0.0, 1.0);
}
`;
function detalharMateriais(modelo, tabela) {
  const feitos = new Set();
  modelo.traverse((m) => {
    if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material])) {
      if (!mat || feitos.has(mat) || !mat.isMeshStandardMaterial) continue;
      const spec = tabela[mat.name] || tabela[(mat.name || '').split('.')[0]];
      if (!spec) continue;
      feitos.add(mat);
      const est = spec.estrias || 1, esc = spec.escala || 300;
      const cor2 = spec.cor2 ? new THREE.Color().setRGB(spec.cor2[0], spec.cor2[1], spec.cor2[2], THREE.SRGBColorSpace) : mat.color.clone();
      const rel = spec.relevo ? spec.relevo[0] : 0, escRel = spec.relevo ? spec.relevo[1] : 1;
      mat.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, {
          uRug: { value: new THREE.Vector2(spec.rug[0], spec.rug[1]) }, uEsc: { value: new THREE.Vector3(esc * est, esc, esc) },
          uCor2: { value: cor2 }, uMisturaCor: { value: spec.cor2 ? 1 : 0 }, uRelevo: { value: rel }, uEscRelevo: { value: escRel },
        });
        sh.vertexShader = 'varying vec3 vPosObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vPosObj = position;');
        sh.fragmentShader = GLSL_RUIDO + sh.fragmentShader
          .replace('#include <color_fragment>', `#include <color_fragment>
  vec3 apgP = vPosObj * uEsc;
  float apgN = apgFbm(apgP, 7, max(length(dFdx(apgP)), length(dFdy(apgP))));
  if (uMisturaCor > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, uCor2, clamp((apgN - 0.35) / 0.4, 0.0, 1.0));`)
          .replace('#include <roughnessmap_fragment>',
            'float roughnessFactor = mix(uRug.x, uRug.y, clamp((apgN - 0.3) / 0.4, 0.0, 1.0));')
          .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (uRelevo > 0.0) {
    vec3 q = vPosObj * uEscRelevo;
    float H = uRelevo * 0.00005 * apgFbm(q, 5, max(length(dFdx(q)), length(dFdy(q))));
    vec3 pX = dFdx(-vViewPosition), pY = dFdy(-vViewPosition);
    float lx = max(length(pX), 1e-7), ly = max(length(pY), 1e-7);
    vec3 sx = pX / lx, sy = pY / ly, R1 = cross(sy, normal), R2 = cross(normal, sx);
    float det = dot(sx, R1) * faceDirection;
    normal = normalize(abs(det) * normal - sign(det) * ((dFdx(H) / lx) * R1 + (dFdy(H) / ly) * R2));
  }`);
      };
      mat.customProgramCacheKey = () => 'apg-' + mat.name;
      mat.needsUpdate = true;
    }
  });
  return feitos.size;
}

export async function montarApresentacaoGarrafa(raiz, { base = 'assets/3d/' } = {}) {
  const limpezas = [];
  const on = (alvo, ev, fn, opt) => { alvo.addEventListener(ev, fn, opt); limpezas.push(() => alvo.removeEventListener(ev, fn, opt)); };
  let destruido = false;
  const destruir = () => {
    destruido = true; cancelAnimationFrame(rafId); limpezas.forEach((f) => f()); limpezas.length = 0;
    if (renderer) { renderer.dispose(); renderer.forceContextLoss(); }
    raiz.innerHTML = '';
  };
  let renderer = null, rafId = 0;

  const [sec, meta] = await Promise.all([
    fetch(base + 'garrafa_secoes.json', { cache: 'no-cache' }).then((r) => r.json()),
    fetch(base + 'garrafa_rov_web_v002.json', { cache: 'no-cache' }).then((r) => r.json()),
  ]);
  const anim = meta.animacao.trechos;
  const tA1fim = anim.A1.segundos[1], tA4 = anim.A4.segundos;

  const tag = (n) => { const [c, t] = NATUREZA[n] || ['ilus', n]; return `<span class="v3d-tag ${c}">${esc(t)}</span>`; };
  const fatos = (lista) => `<table class="apg-tab"><tbody>${lista.map(([k, v, f]) => `<tr><th>${esc(k)}</th><td>${esc(v)}${f && f !== '—' ? `<small>${esc(f)}</small>` : ''}</td></tr>`).join('')}</tbody></table>`;
  const passosComp = sec.componentes.map((c, i) => `
    <section class="apg-passo card" data-passo="comp:${esc(c.chave)}" id="apg-${esc(c.chave)}">
      <div class="apg-num">Componente ${i + 1} de ${sec.componentes.length}</div>
      <h3>${esc(c.titulo)}</h3>
      <div class="apg-ids">${tag(c.natureza)} ${c.ids.map((id) => `<code>${esc(id.replace(/-$/, '-…'))}</code>`).join(' ')}</div>
      <p><b>Função.</b> ${esc(c.funcao)}</p>
      ${fatos(c.specs)}
      <p class="apg-pos"><b>Posição no conjunto.</b> ${esc(c.posicao)}</p>
      <button class="btn btn-sm" data-acao="posicao" aria-pressed="false">Ver posição no conjunto</button>
    </section>`).join('');

  raiz.innerHTML = `
  <div class="apg">
    <div class="apg-grade">
      <div class="apg-passos">
        <section class="apg-passo apg-abertura" data-passo="visao" id="apg-visao">
          <div class="apg-sec">1 · Visão geral</div>
          <h2>${esc(sec.visao.titulo)}</h2>
          <p class="apg-sub">${esc(sec.visao.subtitulo)}</p>
          <p>${esc(sec.visao.texto)}</p>
          ${fatos(sec.visao.fatos)}
          <p class="apg-aviso">${esc(sec.aviso)}</p>
          <p class="apg-dica">Gire arrastando, aproxime com a roda ou com dois dedos. Role a página para ver cada componente.</p>
        </section>
        <div class="apg-sec apg-sec-sep">2 · Componentes individuais</div>
        ${passosComp}
        <section class="apg-passo card" data-passo="montagem" id="apg-montagem">
          <div class="apg-sec">3 · Comparação e montagem</div>
          <h3>Da vista explodida ao conjunto montado</h3>
          <p>A animação parte da vista explodida: os módulos descem para o lugar, os cabos aparecem, o tubo desliza sobre o trenó e as tampas fecham. É uma representação visual, não instrução de montagem.</p>
          <div class="apg-ctl">
            <button class="btn btn-sm btn-primary" data-acao="tocar">Tocar montagem</button>
            <input type="range" min="0" max="1000" value="0" class="apg-faixa" aria-label="Posição da animação de montagem">
          </div>
        </section>
        <section class="apg-passo card" data-passo="completo" id="apg-completo">
          <div class="apg-sec">4 · Equipamento completo</div>
          <h3>O conjunto montado</h3>
          <p>Explore a garrafa completa. Use os botões para abrir as tampas, ver a vista explodida, trocar o tubo de acrílico pelo de alumínio ou girar automaticamente.</p>
          <div class="apg-ctl">
            <div class="v3d-seg" role="group" aria-label="Estado">
              <button class="v3d-seg-btn on" data-estado="montado">Montado</button>
              <button class="v3d-seg-btn" data-estado="aberto">Tampas abertas</button>
              <button class="v3d-seg-btn" data-estado="explodido">Explodido</button>
            </div>
            <div class="v3d-seg" role="group" aria-label="Tubo">
              <button class="v3d-seg-btn on" data-tubo="acrilico">Acrílico</button>
              <button class="v3d-seg-btn" data-tubo="didatico">Didático</button>
              <button class="v3d-seg-btn" data-tubo="aluminio">Alumínio</button>
            </div>
            <button class="btn btn-sm" data-acao="girar" aria-pressed="false">Girar</button>
          </div>
        </section>
      </div>
      <div class="apg-palco-col">
        <div class="apg-palco">
          <canvas class="v3d-canvas" aria-label="Modelo 3D interativo da garrafa de alimentação"></canvas>
          <div class="v3d-carregando" role="status"><div class="v3d-carregando-msg"><div class="spinner"></div><span>Carregando modelo 3D…</span></div></div>
          <div class="apg-rotulo" aria-live="polite"></div>
          <div class="v3d-legenda"><span class="v3d-dica">Arraste para girar · role ou pince para aproximar</span></div>
        </div>
      </div>
    </div>
  </div>`;
  const $ = (s) => raiz.querySelector(s);
  const canvas = $('.v3d-canvas'), palco = $('.apg-palco'), rotulo = $('.apg-rotulo');

  // ---------- cena ----------
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // mesma transformação de cor do Blender (AgX) e o mesmo estúdio HDRI (CC0, Poly Haven)
  renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const cena = new THREE.Scene();
  // Fundo desenhado na cena com o mesmo degradê do cartão (.apg-palco). Com o canvas transparente, a
  // refração do acrílico (transmissão) leria um fundo branco a 50 % e o tubo ficaria leitoso.
  // O degradê "farthest-corner" acompanha a proporção da caixa; desenhado num quadrado e esticado na tela,
  // fica idêntico ao do CSS em qualquer tamanho (a textura nunca muda de tamanho, então não é realocada).
  const FUNDO = 512, fundoCv = document.createElement('canvas'), fundoCtx = fundoCv.getContext('2d');
  fundoCv.width = fundoCv.height = FUNDO;
  const fundoTex = new THREE.CanvasTexture(fundoCv); fundoTex.colorSpace = THREE.SRGBColorSpace;
  function pintarFundo() {
    const cs = getComputedStyle(palco);
    const c1 = cs.getPropertyValue('--surface').trim() || '#1a1a1d', c2 = cs.getPropertyValue('--surface-2').trim() || c1;
    // equivalente a radial-gradient(ellipse at 50% 40%, c1 0%, c2 75%)
    const cx = FUNDO * 0.5, cy = FUNDO * 0.4, rx = Math.SQRT2 * FUNDO * 0.5, ry = Math.SQRT2 * FUNDO * 0.6;
    fundoCtx.save(); fundoCtx.translate(cx, cy); fundoCtx.scale(1, ry / rx);
    const g = fundoCtx.createRadialGradient(0, 0, 0, 0, 0, rx); g.addColorStop(0, c1); g.addColorStop(0.75, c2); g.addColorStop(1, c2);
    fundoCtx.fillStyle = g; fundoCtx.fillRect(-cx, -cy * rx / ry, FUNDO, FUNDO * rx / ry); fundoCtx.restore();
    fundoTex.needsUpdate = true;
  }
  pintarFundo(); cena.background = fundoTex;
  const mqTema = matchMedia('(prefers-color-scheme: dark)'); on(mqTema, 'change', () => { pintarFundo(); pedir(); });
  const pmrem = new THREE.PMREMGenerator(renderer);
  cena.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; cena.environmentIntensity = 0.8;
  new EXRLoader().load(base + 'estudio.exr', (tex) => {
    if (destruido) return;
    tex.mapping = THREE.EquirectangularReflectionMapping;
    cena.environment = pmrem.fromEquirectangular(tex).texture; cena.environmentIntensity = 0.9; tex.dispose(); pedir();
  }, undefined, (e) => console.warn('HDRI do estúdio não carregou; usando o ambiente padrão', e));
  cena.add(new THREE.HemisphereLight(0xffffff, 0x8a8f96, 0.5));
  // luz principal ampla vinda de cima (como no estúdio da E6), com sombra suave
  const sol = new THREE.DirectionalLight(0xfff7ee, 2.6); sol.position.set(-0.15, 0.85, -0.1); sol.castShadow = true;
  sol.shadow.mapSize.set(4096, 4096); sol.shadow.bias = -0.00015; sol.shadow.normalBias = 0.0004; sol.shadow.radius = 4;
  cena.add(sol); cena.add(sol.target);
  const preench = new THREE.DirectionalLight(0xf2f6ff, 0.7); preench.position.set(0.6, 0.3, 0.9); cena.add(preench);
  const contorno = new THREE.DirectionalLight(0xeaf2ff, 1.1); contorno.position.set(0.4, 0.35, -0.75); cena.add(contorno);
  const camera = new THREE.PerspectiveCamera(35, 1, 0.002, 20);
  const controles = new OrbitControls(camera, canvas);
  controles.enableDamping = true; controles.dampingFactor = 0.08; controles.minDistance = 0.03; controles.maxDistance = 4;
  controles.autoRotateSpeed = 1.2;
  let precisa = true, ativos = 0;
  const pedir = () => { precisa = true; };
  on(controles, 'change', pedir);
  const tweens = new Set();
  const tween = (dur, fn, fim) => { tweens.add({ t0: performance.now(), dur, fn, fim }); ativos++; };
  function laco() {
    if (destruido) return;
    rafId = requestAnimationFrame(laco);
    const t = performance.now();
    for (const tw of [...tweens]) {
      const k = Math.min(1, (t - tw.t0) / tw.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      tw.fn(e, k); if (k >= 1) { tweens.delete(tw); ativos--; if (tw.fim) tw.fim(); }
    }
    const mexeu = controles.update();
    if (ativos > 0 || mexeu || precisa || controles.autoRotate) { renderer.render(cena, camera); precisa = false; }
  }
  const ro = new ResizeObserver(() => {
    const w = palco.clientWidth, h = palco.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); pedir();
  });
  ro.observe(palco); limpezas.push(() => ro.disconnect());
  laco();

  // ---------- modelo ----------
  let gltf;
  try {
    gltf = await new Promise((res, rej) => new GLTFLoader().load(base + meta.arquivo, res, (ev) => {
      if (ev.total) $('.v3d-carregando-msg span').textContent = `Carregando modelo 3D… ${Math.round(100 * ev.loaded / ev.total)} %`;
    }, rej));
  } catch (err) {
    $('.v3d-carregando').innerHTML = `<div class="v3d-erro"><div><b>Não foi possível abrir o modelo 3D.</b><small>${esc(err && err.message ? err.message : err)}</small></div></div>`;
    return { destruir };
  }
  if (destruido) return { destruir };
  const modelo = gltf.scene; cena.add(modelo);
  $('.v3d-carregando').hidden = true;
  // sombras e piso que só recebe sombra; sombra da luz principal ajustada ao tamanho do modelo
  const cxM = new THREE.Box3().setFromObject(modelo), tamM = cxM.getSize(new THREE.Vector3()), cM = cxM.getCenter(new THREE.Vector3());
  modelo.traverse((m) => { if (m.isMesh) { m.castShadow = m.name !== 'ROV-TUBE-001'; m.receiveShadow = true; } });
  const raioM = tamM.length() * 0.75;
  Object.assign(sol.shadow.camera, { left: -raioM, right: raioM, top: raioM, bottom: -raioM, near: 0.01, far: 4 });
  sol.target.position.copy(cM); sol.position.copy(cM).add(new THREE.Vector3(-0.15, 0.85, -0.1)); sol.shadow.camera.updateProjectionMatrix();
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(raioM * 6, raioM * 6), new THREE.ShadowMaterial({ opacity: 0.28 }));
  piso.rotation.x = -Math.PI / 2; piso.position.set(cM.x, cxM.min.y - 0.0005, cM.z); piso.receiveShadow = true; cena.add(piso);
  const nDetalhados = detalharMateriais(modelo, meta.materiais_detalhe || {});
  // Gravação dos BCMs e etiquetas dos DCMs: recorte por alfa (com antisserrilhado) em vez de mistura.
  // Objetos misturados são desenhados depois do tubo refrativo e ficariam escondidos atrás dele.
  modelo.traverse((m) => {
    if (!m.isMesh || m.name === 'ROV-TUBE-001' || !m.material || !m.material.transparent || !m.material.map) return;
    Object.assign(m.material, { transparent: false, alphaTest: 0.5, alphaToCoverage: true, depthWrite: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    m.material.needsUpdate = true;
  });

  // animação: um clipe por objeto, todos na mesma linha do tempo
  const mixer = new THREE.AnimationMixer(modelo);
  for (const clip of gltf.animations) {
    const a = mixer.clipAction(clip); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  }
  const cabos = new Set(meta.animacao.cabos);
  const objCabos = []; modelo.traverse((o) => { if (cabos.has(o.name)) objCabos.push(o); });
  let tempo = 0;
  function setTempo(t) {
    tempo = t; mixer.setTime(t);
    const oculto = meta.animacao.cabos_ocultos_segundos.some(([a, b]) => t >= a && t <= b);
    objCabos.forEach((o) => { o.userData.ocultoAnim = oculto; });
    aplicarVisibilidade(); pedir();
  }

  // grupos de componentes (prefixos dos IDs) e materiais originais
  const grupos = new Map(sec.componentes.map((c) => [c.chave, []]));
  const ehPrefixo = (nome, id) => (id.endsWith('-') ? nome.startsWith(id) : nome === id);
  const raizesDe = new Map();
  modelo.traverse((o) => {
    for (const c of sec.componentes) {
      if (c.ids.some((id) => ehPrefixo(o.name, id))) {
        let p = o.parent, dentro = false;
        while (p) { if (raizesDe.get(p) === c.chave) { dentro = true; break; } p = p.parent; }
        if (!dentro) { grupos.get(c.chave).push(o); raizesDe.set(o, c.chave); }
        break;
      }
    }
  });
  const grupoDaMalha = new Map();
  for (const [chave, objs] of grupos) objs.forEach((r) => r.traverse((m) => { if (m.isMesh) grupoDaMalha.set(m, chave); }));
  const malhas = []; modelo.traverse((m) => { if (m.isMesh) { malhas.push(m); m.userData.matOriginal = m.material; } });
  const semGrupo = malhas.filter((m) => !grupoDaMalha.has(m)).map((m) => m.name);
  if (semGrupo.length) console.warn('Malhas sem grupo na apresentação:', semGrupo);
  const fantasma = new THREE.MeshStandardMaterial({ color: 0x9aa3ad, transparent: true, opacity: 0.12, depthWrite: false, roughness: 0.6 });
  const tuboObj = modelo.getObjectByName('ROV-TUBE-001');
  const tuboMats = {
    // acrílico físico: transmissão com refração, índice 1,49 (o mesmo do Blender)
    acrilico: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, ior: 1.49, thickness: 0.0064, specularIntensity: 1 }),
    didatico: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }),
    aluminio: new THREE.MeshStandardMaterial({ color: 0xc4c7cc, metalness: 1, roughness: 0.52 }),
  };
  let modoTubo = 'acrilico';

  // ---------- estado visual ----------
  let foco = null, mostrarConjunto = false;
  function aplicarVisibilidade() {
    for (const m of malhas) {
      const g = grupoDaMalha.get(m);
      let vis = true, mat = m.userData.matOriginal;
      if (m.userData.ocultoAnim || (m.parent && m.parent.userData.ocultoAnim)) vis = false;
      if (foco && g !== foco) { if (mostrarConjunto) mat = fantasma; else vis = false; }
      if (m === tuboObj || (tuboObj && m.parent === tuboObj)) mat = foco && foco !== 'tubo' ? (mostrarConjunto ? fantasma : mat) : tuboMats[modoTubo];
      m.visible = vis; m.material = mat; m.castShadow = vis && mat !== fantasma && m !== tuboObj;
    }
  }
  function caixaDe(objs) {
    const cx = new THREE.Box3(); objs.forEach((o) => { o.updateWorldMatrix(true, true); cx.expandByObject(o); }); return cx;
  }
  function enquadrar(cx, dur = 700, dir = null) {
    const c = cx.getCenter(new THREE.Vector3()), r = cx.getSize(new THREE.Vector3()).length() / 2 || 0.05;
    const d = (dir || camera.position.clone().sub(controles.target).normalize()).clone();
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * (camera.aspect < 1 ? 1.25 : 0.95);
    const p0 = camera.position.clone(), t0 = controles.target.clone(), p1 = c.clone().add(d.multiplyScalar(dist));
    tween(dur, (e) => { camera.position.lerpVectors(p0, p1, e); controles.target.lerpVectors(t0, c, e); pedir(); });
  }
  const todos = () => [modelo];
  const tituloDe = (chave) => (sec.componentes.find((c) => c.chave === chave) || {}).titulo || '';

  let passoAtual = null, tocando = null;
  function irPasso(passo) {
    if (passo === passoAtual) return;
    passoAtual = passo; controles.autoRotate = false; if (tocando) { tocando = null; }
    raiz.querySelectorAll('[data-acao="girar"]').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    if (passo === 'visao' || passo === 'completo') {
      foco = null; mostrarConjunto = false; setTempo(0); modoTubo = passo === 'visao' ? 'acrilico' : modoTubo;
      raiz.querySelectorAll('[data-estado]').forEach((b) => b.classList.toggle('on', b.dataset.estado === 'montado'));
      aplicarVisibilidade(); enquadrar(caixaDe(todos()), 800, DIR_PADRAO.clone());
      rotulo.textContent = passo === 'visao' ? 'Visão geral' : 'Equipamento completo';
    } else if (passo === 'montagem') {
      foco = null; mostrarConjunto = false; setTempo(tA4[0]); aplicarVisibilidade();
      $('.apg-faixa').value = 0; enquadrar(caixaDe(todos()), 800, new THREE.Vector3(-0.2, 0.45, 1).normalize());
      rotulo.textContent = 'Montagem do conjunto';
    } else if (passo.startsWith('comp:')) {
      foco = passo.slice(5); mostrarConjunto = false; setTempo(0);
      raiz.querySelectorAll('[data-acao="posicao"]').forEach((b) => { b.setAttribute('aria-pressed', 'false'); b.textContent = 'Ver posição no conjunto'; });
      aplicarVisibilidade(); enquadrar(caixaDe(grupos.get(foco)), 700, DIR_PADRAO.clone());
      rotulo.textContent = tituloDe(foco);
    }
    pedir();
  }

  // seção ativa = a que ocupa mais o centro da tela
  const passos = [...raiz.querySelectorAll('.apg-passo')];
  const io = new IntersectionObserver((ents) => {
    ents.forEach((e) => { e.target._vis = e.isIntersecting ? e.intersectionRatio : 0; });
    const melhor = passos.reduce((a, b) => ((b._vis || 0) > (a._vis || 0) ? b : a), passos[0]);
    if (melhor && melhor._vis > 0) irPasso(melhor.dataset.passo);
  }, { rootMargin: '-35% 0px -35% 0px', threshold: [0, 0.01, 0.25, 0.5, 0.75, 1] });
  passos.forEach((p) => io.observe(p)); limpezas.push(() => io.disconnect());

  // controles das seções
  on(raiz, 'click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.acao === 'posicao') {
      const passo = b.closest('.apg-passo').dataset.passo; irPasso(passo);
      mostrarConjunto = b.getAttribute('aria-pressed') !== 'true';
      b.setAttribute('aria-pressed', String(mostrarConjunto)); b.textContent = mostrarConjunto ? 'Ver a peça isolada' : 'Ver posição no conjunto';
      aplicarVisibilidade(); enquadrar(mostrarConjunto ? caixaDe(todos()) : caixaDe(grupos.get(foco)), 700);
    } else if (b.dataset.acao === 'tocar') {
      irPasso('montagem'); const faixa = $('.apg-faixa'); const ini = performance.now(), dur = (tA4[1] - tA4[0]) * 1000;
      tocando = ini;
      tween(dur, (e, k) => { if (tocando !== ini) return; faixa.value = Math.round(k * 1000); setTempo(tA4[0] + k * (tA4[1] - tA4[0])); });
    } else if (b.dataset.estado) {
      irPasso('completo'); raiz.querySelectorAll('[data-estado]').forEach((x) => x.classList.toggle('on', x === b));
      const alvo = { montado: 0, aberto: tA1fim, explodido: tA4[0] }[b.dataset.estado];
      const t0 = tempo; tween(900, (e) => setTempo(t0 + (alvo - t0) * e), () => enquadrar(caixaDe(todos()), 600));
    } else if (b.dataset.tubo) {
      modoTubo = b.dataset.tubo; raiz.querySelectorAll('[data-tubo]').forEach((x) => x.classList.toggle('on', x === b));
      aplicarVisibilidade(); pedir();
    } else if (b.dataset.acao === 'girar') {
      controles.autoRotate = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(controles.autoRotate)); pedir();
    }
  });
  on($('.apg-faixa'), 'input', (ev) => {
    if (passoAtual !== 'montagem') irPasso('montagem');
    tocando = null; setTempo(tA4[0] + (ev.target.value / 1000) * (tA4[1] - tA4[0]));
  });

  setTempo(0); irPasso('visao');
  raiz._apg = { grupos, semGrupo, malhas: malhas.length, nDetalhados, setTempo, irPasso, camera, controles, renderer, cena };   // usado nos testes
  return { destruir };
}
