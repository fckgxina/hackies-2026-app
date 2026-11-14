/* HackIES 2026 · núcleo: inicialização, autenticação, permissões, navegação. */
(function (HK) {
  'use strict';
  const U = HK.util;

  HK.state = { profile: null, me: null, integrantes: [], categorias: [], config: {}, perfis: [] };
  HK.views = HK.views || {};

  /* ---------- permissões (espelham as regras RLS do banco) ---------- */
  HK.perm = {
    papel: () => (HK.state.profile && HK.state.profile.papel) || 'membro',
    admin: () => HK.perm.papel() === 'admin',
    editor: () => ['admin', 'editor'].includes(HK.perm.papel()),
    /** Visitante: lê tudo, menos o histórico e os perfis da equipe; não grava nada (RLS: e_leitor() sim, e_membro() não). */
    visitante: () => HK.perm.papel() === 'visitante',
    /** Pode criar registros (qualquer integrante; RLS: e_membro()). */
    membro: () => !HK.perm.visitante(),
    own: (rec) => HK.perm.membro() && !!(rec && HK.state.profile && rec.criado_por === HK.state.profile.id),
    resp: (rec, field) => HK.perm.membro() && !!(rec && HK.state.me && rec[field || 'responsavel_id'] === HK.state.me.id),
    /** Pode alterar: editor/admin, quem criou, ou o responsável vinculado (quando a tabela permite). */
    canEdit: (rec, { resp = true } = {}) => HK.perm.membro() && (HK.perm.editor() || HK.perm.own(rec) || (resp && HK.perm.resp(rec))),
  };
  HK.PAPEIS = { admin: 'Administrador', editor: 'Editor', membro: 'Membro', visitante: 'Visitante (somente leitura)' };

  /* ---------- referências compartilhadas ---------- */
  HK.nome = (id) => (HK.state.integrantes.find((i) => i.id === id) || {}).nome || '—';
  HK.perfilNome = (id) => { const p = HK.state.perfis.find((x) => x.id === id); return p ? p.nome || p.email : '—'; };
  HK.catNome = (id) => (HK.state.categorias.find((c) => c.id === id) || {}).nome || 'Sem categoria';
  HK.integranteOpts = (sel, empty) => U.opts(HK.state.integrantes, sel, { empty: empty === undefined ? '— selecione —' : empty });

  HK.loadRefs = async () => {
    const [ints, cats, cfg, perfis] = await Promise.all([
      HK.db.list('integrantes'), HK.db.list('categorias_gasto'), HK.db.list('configuracoes'), HK.db.list('perfis'),
    ]);
    HK.state.integrantes = ints;
    HK.state.categorias = cats;
    HK.state.perfis = perfis;
    HK.state.config = Object.fromEntries(cfg.map((c) => [c.chave, c.valor]));
    HK.state.me = ints.find((i) => HK.state.profile && i.perfil_id === HK.state.profile.id) || null;
    // O visitante não lê os perfis da equipe (RLS); a divisão de gastos vem de uma função do banco que só devolve IDs.
    HK.state.acessoIds = HK.perm.visitante() ? new Set(await HK.db.integrantesComAcesso()) : null;
  };

  /** Integrante com login ativo vinculado (usuário ativado pelo administrador). */
  HK.temAcesso = (i) => {
    if (HK.state.acessoIds) return HK.state.acessoIds.has(i.id);
    const p = HK.state.perfis.find((x) => x.id === i.perfil_id); return !!(p && p.ativo && p.papel !== 'visitante');
  };
  /** Quem divide os gastos: integrantes com acesso ativo ao sistema (e não retirados manualmente do rateio).
   *  No modo demonstração não há logins reais, então todos participam. */
  HK.integrantesRateio = () => HK.state.integrantes.map((i) => ({
    ...i, participa_rateio: i.participa_rateio !== false && (HK.db.mode === 'demo' || HK.temAcesso(i)),
  }));

  /** Link obsidian:// a partir de um caminho de nota (ou devolve a URL se já for um link). */
  HK.obsidianHref = (v) => {
    if (!v) return '';
    if (/^(obsidian|https?):\/\//i.test(v)) return v;
    const vault = (window.HK_CONFIG && window.HK_CONFIG.obsidianVault) || 'HACKIES 2026';
    return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(v.replace(/\.md$/i, ''))}`;
  };

  /* ---------- histórico legível ---------- */
  const TAB = {
    itens: ['item de gasto', 'nome'], cotacoes: ['cotação', 'loja'], contribuicoes: ['contribuição', null],
    entregaveis: ['entregável', 'nome'], documentos: ['documento', 'nome'], documento_versoes: ['versão de documento', 'versao'],
    tarefas: ['tarefa', 'titulo'], tickets: ['solicitação', 'titulo'], categorias_gasto: ['categoria de gasto', 'nome'], categorias_documento: ['categoria de documento', 'nome'],
    configuracoes: ['configuração', 'chave'], integrantes: ['integrante', 'nome'], perfis: ['usuário', 'nome'],
  };
  const CAMPOS = {
    status: 'status', prioridade: 'prioridade', valor_unitario_centavos: 'valor unitário', quantidade: 'quantidade',
    responsavel_id: 'responsável', papel: 'papel', ativo: 'ativo', prazo: 'prazo', categoria_id: 'categoria', nome: 'nome',
    titulo: 'título', valor: 'valor', valor_centavos: 'valor', versao_atual: 'versão', restrito: 'restrito', compartilhado: 'compartilhado',
  };
  HK.histTabela = (t) => (TAB[t] ? TAB[t][0] : t);
  HK.histRotulo = (h) => {
    const d = h.dados_depois || h.dados_antes || {};
    if (h.tabela === 'tickets' && d.numero) return `${HK.ticketId(d.numero)} ${d.titulo || ''}`.trim();
    if (h.tabela === 'contribuicoes') return `${HK.nome(d.integrante_id)} · ${U.brl(d.valor_centavos)}`;
    const f = TAB[h.tabela] && TAB[h.tabela][1];
    return (f && d[f]) || '';
  };
  HK.histMudancas = (h) => {
    if (h.acao !== 'UPDATE' || !h.dados_antes || !h.dados_depois) return [];
    const out = [];
    for (const k of Object.keys(CAMPOS)) {
      const a = h.dados_antes[k], b = h.dados_depois[k];
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
      const fmt = (v) => {
        if (v == null || v === '') return '—';
        if (k.endsWith('_centavos')) return U.brl(v);
        if (k === 'responsavel_id') return HK.nome(v);
        if (k === 'categoria_id') return HK.catNome(v);
        if (typeof v === 'boolean') return v ? 'sim' : 'não';
        if (k === 'valor' && h.tabela === 'configuracoes') return v == null ? '—' : U.brl(v);
        return String(v);
      };
      out.push(`${CAMPOS[k]}: ${fmt(a)} → ${fmt(b)}`);
    }
    return out;
  };
  HK.histTexto = (h) => {
    const verbo = { INSERT: 'criou', UPDATE: 'alterou', DELETE: 'excluiu' }[h.acao];
    const quem = h.usuario_nome || 'Sistema';
    const rot = HK.histRotulo(h);
    const mud = HK.histMudancas(h);
    return { quem, texto: `${verbo} ${HK.histTabela(h.tabela)}${rot ? ` "${rot}"` : ''}`, detalhe: mud.join(' · ') };
  };
  HK.ticketId = (n) => `TICKET-${String(n || 0).padStart(3, '0')}`;

  /* ---------- navegação ---------- */
  const NAV = [
    { route: '', label: 'Visão geral', icon: 'home', view: 'dashboard' },
    { route: 'solicitacoes', label: 'Solicitações', icon: 'inbox', view: 'solicitacoes' },
    { route: 'gastos', label: 'Gastos do projeto', icon: 'wallet', view: 'gastos' },
    { route: 'documentos', label: 'Documentos', icon: 'file', view: 'documentos' },
    { route: 'entregaveis', label: 'Entregáveis', icon: 'flag', view: 'entregaveis' },
    { sep: true },
    { route: 'apresentacao', label: 'Apresentação', icon: 'slides', view: 'apresentacao' },
    { route: 'admin', label: 'Administração', icon: 'settings', view: 'admin', equipe: true },
  ];
  /** Itens visíveis para o usuário atual (visitante vê tudo em modo leitura, menos a administração). */
  const navVisivel = () => NAV.filter((n) => !(n.equipe && HK.perm.visitante()));

  function renderNav(active) {
    U.$('#nav').innerHTML = navVisivel().map((n) => {
      if (n.sep) return '<div class="nav-sep"></div>';
      if (n.acao) return `<a href="#" data-acao="${n.acao}">${U.icon(n.icon)}<span>${n.label}</span>${n.tag ? `<span class="tag nav-tag">${n.tag}</span>` : ''}</a>`;
      if (n.external) return `<a href="${n.href}" target="_blank" rel="noopener">${U.icon(n.icon)}<span>${n.label}</span>${U.icon('external', 'muted')}</a>`;
      return `<a href="#/${n.route}" class="${n.route === active ? 'active' : ''}">${U.icon(n.icon)}<span>${n.label}</span></a>`;
    }).join('');
  }

  HK.parseRoute = () => {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, query] = h.split('?');
    const parts = path.split('/').filter(Boolean);
    const params = Object.fromEntries(new URLSearchParams(query || ''));
    return { name: parts[0] || '', sub: parts[1] || '', params };
  };

  let renderSeq = 0;
  let saida = [];
  /** Registra uma função para liberar recursos quando o usuário sair da tela atual (ex.: WebGL da Apresentação). */
  HK.onLeave = (fn) => { saida.push(fn); };
  HK.render = async () => {
    saida.splice(0).forEach((fn) => { try { fn(); } catch (e) { console.warn(e); } });
    const r = HK.parseRoute();
    const item = navVisivel().find((n) => !n.sep && !n.external && !n.acao && n.route === r.name) || NAV[0];
    const view = HK.views[item.view];
    renderNav(item.route);
    U.$('#page-title').textContent = item.label;
    document.title = `${item.label} · HackIES 2026`;
    closeSidebar();
    const el = U.$('#view');
    const seq = ++renderSeq;
    el.innerHTML = '<div class="empty"><div class="spinner"></div></div>';
    try {
      if (!view) throw new Error('Tela não encontrada.');
      await view.render(el, r, () => seq === renderSeq);
    } catch (e) {
      console.error(e);
      if (seq === renderSeq) el.innerHTML = `<div class="alert alert-critical">${U.icon('alert')}<span>Não foi possível carregar esta tela: ${U.esc(U.errMsg(e))}</span></div>`;
    }
  };
  HK.refresh = () => HK.render();

  function closeSidebar() { U.$('#sidebar').classList.remove('open'); U.$('#scrim').hidden = true; }

  /* ---------- telas de acesso ---------- */
  function gate(html) {
    U.$('#boot').hidden = true;
    U.$('#shell').hidden = true;
    const g = U.$('#gate');
    g.hidden = false;
    g.innerHTML = html;
    return g;
  }
  const brandHTML = `<div class="gate-brand"><span class="brand-mark"><svg viewBox="0 0 24 24"><path d="M13 4 7 13h4l-1 7 6-9h-4z" fill="currentColor"/></svg></span>
    <span class="brand-text"><b>HackIES 2026</b><small>Gestão do projeto · D02</small></span></div>`;

  function setupScreen() {
    const g = gate(`<div class="gate-card wide">${brandHTML}
      <h1>Configuração necessária</h1>
      <p class="lead">A aplicação ainda não está conectada ao banco de dados compartilhado (Supabase). Sem ele, os dados não são salvos para a equipe.</p>
      <ol>
        <li>Crie um projeto gratuito em <a href="https://supabase.com/dashboard" target="_blank" rel="noopener">supabase.com</a>.</li>
        <li>No <b>SQL Editor</b>, execute o arquivo <code>supabase/schema.sql</code>.</li>
        <li>Crie os usuários em <b>Authentication → Users → Add user</b> e torne-se administrador (instruções no fim do schema.sql).</li>
        <li>Copie <b>Project URL</b> e a chave pública <b>anon/publishable</b> (Project Settings → API) para <code>js/config.js</code>.</li>
        <li>Recarregue esta página.</li>
      </ol>
      <p class="muted">O passo a passo completo está em <code>README.md</code>.</p>
      <div class="notice" style="margin:var(--s4) 0">${U.icon('info')} <b>Modo demonstração:</b> permite experimentar todas as telas agora, mas os dados ficam <b>somente neste navegador</b>, não são compartilhados e podem ser perdidos.</div>
      <button class="btn" id="demo-btn">${U.icon('box')} Experimentar em modo demonstração</button>
    </div>`);
    g.querySelector('#demo-btn').addEventListener('click', () => { localStorage.setItem('hk_mode', 'demo'); location.reload(); });
  }

  function loginScreen() {
    const g = gate(`<div class="gate-card">${brandHTML}
      <h1>Entrar</h1><p class="lead">Acesso restrito aos integrantes da equipe.</p>
      <form class="form" id="login-form" novalidate style="grid-template-columns:1fr">
        ${U.field('E-mail', '<input type="email" name="email" autocomplete="username" required>', { req: true })}
        ${U.field('Senha', '<input type="password" name="password" autocomplete="current-password" required>', { req: true })}
        <button class="btn btn-primary" type="submit">Entrar</button>
        <button class="btn btn-ghost" type="button" id="forgot">Esqueci minha senha</button>
      </form></div>`);
    const form = g.querySelector('#login-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      U.clearErrors(form);
      if (!U.checkRequired(form)) return;
      const v = U.formValues(form);
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.textContent = 'Entrando…';
      try { await HK.db.signIn(v.email, v.password); await afterLogin(); }
      catch (err) { U.toast(U.errMsg(err), 'error'); btn.disabled = false; btn.textContent = 'Entrar'; }
    });
    g.querySelector('#forgot').addEventListener('click', async () => {
      const email = form.email.value.trim();
      if (!email) { U.setFieldError(form, 'email', 'Informe o e-mail para receber o link.'); return; }
      try { await HK.db.resetPassword(email); U.toast('Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.', 'info'); }
      catch (err) { U.toast(U.errMsg(err), 'error'); }
    });
  }

  function pendingScreen(profile) {
    const g = gate(`<div class="gate-card">${brandHTML}
      <h1>Acesso aguardando ativação</h1>
      <p class="lead">Seu usuário (${U.esc(profile ? profile.email : '')}) foi criado, mas ainda não foi ativado pelo administrador da equipe.</p>
      <button class="btn" id="out">${U.icon('logout')} Sair</button></div>`);
    g.querySelector('#out').addEventListener('click', () => HK.db.signOut().then(() => location.reload()));
  }

  HK.changePassword = () => {
    const m = U.modal({
      title: 'Alterar senha', size: 'sm',
      body: `<form class="form" novalidate style="grid-template-columns:1fr">
        ${U.field('Nova senha', '<input type="password" name="p1" autocomplete="new-password" required minlength="8">', { req: true, hint: 'Mínimo de 8 caracteres.' })}
        ${U.field('Repita a nova senha', '<input type="password" name="p2" autocomplete="new-password" required>', { req: true })}</form>`,
      footer: '<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-submit>Salvar senha</button>',
    });
    U.bindForm(m, async (v) => { await HK.db.updatePassword(v.p1); m.close(); U.toast('Senha alterada.'); }, {
      validate: (v) => (v.p1.length < 8 ? { p1: 'Use pelo menos 8 caracteres.' } : v.p1 !== v.p2 ? { p2: 'As senhas não coincidem.' } : {}),
    });
  };

  /* ---------- casca da aplicação ---------- */
  function shell() {
    U.$('#boot').hidden = true;
    U.$('#gate').hidden = true;
    U.$('#shell').hidden = false;
    const p = HK.state.profile;
    const ini = (p.nome || p.email || '?').split(/\s+/).map((s) => s[0]).slice(0, 2).join('').toUpperCase();
    U.$('#menu-btn').innerHTML = U.icon('menu');
    U.$('#userbox').innerHTML = `
      <div class="userchip"><span class="avatar">${U.esc(ini)}</span>
        <span class="who"><b>${U.esc(p.nome || p.email)}</b><small>${HK.PAPEIS[p.papel] || p.papel}${HK.state.me || HK.perm.visitante() ? '' : ' · sem integrante vinculado'}</small></span></div>
      ${HK.db.mode === 'supabase' ? `<button class="btn-icon" id="pwd-btn" title="Alterar senha" aria-label="Alterar senha">${U.icon('key')}</button>` : ''}
      <button class="btn-icon" id="logout-btn" title="Sair" aria-label="Sair">${U.icon('logout')}</button>`;
    U.$('#sidebar-foot').innerHTML = HK.db.mode === 'demo'
      ? `<span class="chip chip-warning" title="Modo demonstração"><i class="dot"></i><span>Modo demonstração</span></span>`
      : `<span class="chip chip-good" title="Conectado ao Supabase"><i class="dot"></i><span>Conectado ao Supabase</span></span>`;
    if (HK.db.mode === 'demo') {
      U.$('#banner').innerHTML = `<div class="banner banner-demo">${U.icon('alert')}
        <span><b>Modo demonstração:</b> os dados ficam somente neste navegador e <b>não são compartilhados</b> com a equipe.</span>
        <button class="btn btn-sm" id="demo-exit">Sair do modo demonstração</button>
        <button class="btn btn-sm btn-ghost" id="demo-reset">Apagar dados de demonstração</button></div>`;
      U.$('#demo-exit').addEventListener('click', () => { localStorage.removeItem('hk_mode'); location.reload(); });
      U.$('#demo-reset').addEventListener('click', async () => {
        if (await U.confirm('Apagar todos os dados do modo demonstração neste navegador?', { danger: true, okLabel: 'Apagar' })) { HK.db.resetAll(); location.reload(); }
      });
    } else if (HK.perm.visitante()) {
      U.$('#banner').innerHTML = `<div class="banner banner-visitante">${U.icon('info')}
        <span><b>Acesso de visitante:</b> você pode ver o projeto, mas não cria nem altera nada.</span></div>`;
    }
    U.$('#logout-btn').addEventListener('click', () => HK.db.signOut().then(() => location.reload()));
    const pwd = U.$('#pwd-btn'); if (pwd) pwd.addEventListener('click', HK.changePassword);
    U.$('#menu-btn').addEventListener('click', () => { U.$('#sidebar').classList.add('open'); U.$('#scrim').hidden = false; });
    U.$('#scrim').addEventListener('click', closeSidebar);
    window.addEventListener('hashchange', HK.render);
    HK.render();
  }

  async function afterLogin() {
    const s = await HK.db.session();
    if (!s) return loginScreen();
    const profile = await HK.db.profile(s.user.id);
    if (!profile || !profile.ativo) return pendingScreen(profile || { email: s.user.email });
    HK.state.profile = profile;
    await HK.loadRefs();
    shell();
  }

  HK.boot = async () => {
    try {
      HK.db = HK.createDataAdapter();
      if (!HK.db) return setupScreen();
      HK.db.onAuth((evt) => {
        if (evt === 'PASSWORD_RECOVERY') setTimeout(HK.changePassword, 300);
        if (evt === 'SIGNED_OUT') location.reload();
      });
      await afterLogin();
    } catch (e) {
      console.error(e);
      gate(`<div class="gate-card">${brandHTML}<h1>Erro ao iniciar</h1><p class="lead">${U.esc(U.errMsg(e))}</p>
        <button class="btn" onclick="location.reload()">Tentar novamente</button></div>`);
    }
  };
})(window.HK = window.HK || {});
