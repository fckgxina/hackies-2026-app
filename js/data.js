/* HackIES 2026 · camada de dados.
 * - SupabaseAdapter: fonte oficial (dados compartilhados entre os integrantes).
 * - DemoAdapter: SOMENTE para experimentar a interface. Dados ficam neste navegador,
 *   não são compartilhados e podem ser perdidos. A interface exibe um aviso permanente. */
(function (HK) {
  'use strict';

  const ORDER = {
    historico: ['em', false], configuracoes: ['chave', true], integrantes: ['ordem', true], categorias_gasto: ['ordem', true],
    perfis: ['nome', true], ticket_comentarios: ['criado_em', true], documento_versoes: ['criado_em', false],
  };
  const pkOf = (table) => (table === 'configuracoes' ? 'chave' : 'id');

  /* ===================================================================
   * Supabase
   * =================================================================== */
  function SupabaseAdapter(url, key) {
    if (!window.supabase || !window.supabase.createClient) throw new Error('Biblioteca do Supabase não carregou (verifique a internet).');
    const sb = window.supabase.createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    const chk = (res) => { if (res.error) throw res.error; return res.data; };

    return {
      mode: 'supabase',
      client: sb,
      async session() { const { data } = await sb.auth.getSession(); return data.session; },
      onAuth(cb) { sb.auth.onAuthStateChange((evt, session) => cb(evt, session)); },
      async signIn(email, password) { return chk(await sb.auth.signInWithPassword({ email, password })); },
      async signOut() { await sb.auth.signOut(); },
      async resetPassword(email) { return chk(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname })); },
      async updatePassword(password) { return chk(await sb.auth.updateUser({ password })); },
      async profile(uid) { return chk(await sb.from('perfis').select('*').eq('id', uid).maybeSingle()); },
      /** IDs dos integrantes com login ativo vinculado (função do banco; serve ao visitante, que não lê perfis). */
      async integrantesComAcesso() { return (chk(await sb.rpc('integrantes_com_acesso')) || []).map((r) => r.integrante_id); },

      async list(table, { eq, order, asc, limit, inList } = {}) {
        const [col, dir] = order ? [order, !!asc] : ORDER[table] || ['criado_em', false];
        let q = sb.from(table).select('*').order(col, { ascending: dir });
        if (eq) for (const k in eq) q = q.eq(k, eq[k]);
        if (inList) for (const k in inList) q = q.in(k, inList[k]);
        if (limit) q = q.limit(limit);
        return chk(await q);
      },
      /** Todas as linhas, paginando de 1000 em 1000 (limite padrão da API). */
      async listAll(table) {
        const [col, dir] = ORDER[table] || ['criado_em', false];
        const out = [];
        for (let from = 0; ; from += 1000) {
          const page = chk(await sb.from(table).select('*').order(col, { ascending: dir }).range(from, from + 999));
          out.push(...page);
          if (page.length < 1000) return out;
        }
      },
      async insert(table, row) { return chk(await sb.from(table).insert(row).select().single()); },
      async update(table, id, patch) {
        const res = await sb.from(table).update(patch).eq(pkOf(table), id).select();
        const data = chk(res);
        if (!data || !data.length) throw new Error('SEM_PERMISSAO');
        return data[0];
      },
      async upsert(table, row) { return chk(await sb.from(table).upsert(row).select().single()); },
      async remove(table, id) {
        const data = chk(await sb.from(table).delete().eq(pkOf(table), id).select());
        if (!data || !data.length) throw new Error('SEM_PERMISSAO');
        return true;
      },
      async upload(bucket, path, file, contentType) {
        chk(await sb.storage.from(bucket).upload(path, file, { contentType: contentType || file.type, upsert: false }));
        return path;
      },
      async signedUrls(bucket, paths, downloadNames) {
        const list = paths.filter(Boolean);
        if (!list.length) return {};
        const out = {};
        if (downloadNames) {
          for (const p of list) {
            const { data } = await sb.storage.from(bucket).createSignedUrl(p, 3600, { download: downloadNames[p] || true });
            if (data) out[p] = data.signedUrl;
          }
          return out;
        }
        const { data, error } = await sb.storage.from(bucket).createSignedUrls(list, 3600);
        if (error) throw error;
        (data || []).forEach((d) => { if (d.signedUrl) out[d.path] = d.signedUrl; });
        return out;
      },
      async removeFile(bucket, path) { if (path) chk(await sb.storage.from(bucket).remove([path])); },
    };
  }

  /* ===================================================================
   * Demonstração (localStorage) — imita as regras principais do banco.
   * =================================================================== */
  function DemoAdapter() {
    const KEY = 'hk_demo_v1';
    const DEMO_USER = { id: '00000000-0000-4000-8000-000000000001', email: 'demo@local', nome: 'Usuário de demonstração', papel: 'admin', ativo: true };
    const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); }));
    const now = () => new Date().toISOString();

    const seed = () => {
      const ints = [['Willyans Chen', 1], ['Cauã Peixoto', 2], ['Spencer S. Garcia', 3]].map(([nome, ordem]) => ({ id: uuid(), nome, ordem, perfil_id: null, participa_rateio: true, criado_em: now() }));
      ints[0].perfil_id = DEMO_USER.id;
      const cats = ['Eletrônica de potência', 'Componentes eletrônicos', 'Cabos e conectores', 'Estrutura e materiais mecânicos', 'Instrumentação e medição', 'Ferramentas', 'Outros']
        .map((nome, i) => ({ id: uuid(), nome, ordem: i + 1, criado_em: now() }));
      const ent = [
        ['Documento de Ideação', 'Etapa 1 (on-line)', 'Material obrigatório (guia v1.1, p. 2; edital arts. 26–29). Formato a confirmar no edital/grupo oficial.', '2026-11-14'],
        ['Vídeo Explicativo da Solução e/ou Protótipo', 'Etapa 1 (on-line)', 'Material obrigatório (guia v1.1, p. 2; edital arts. 26–29). Protótipo físico não é obrigatório.', '2026-11-14'],
        ['Pitch da apresentação final', 'Etapa 2 (presencial)', 'Até 5 minutos + perguntas da banca, no IFF Campus Macaé, para as 10 equipes classificadas (guia v1.1, p. 2).', '2026-12-03'],
      ].map(([nome, etapa, descricao, prazo]) => ({ id: uuid(), nome, etapa, descricao, prazo, responsavel_id: null, status: 'Não iniciado', observacoes: null, criado_por: null, criado_em: now(), atualizado_em: now() }));
      return {
        seq: { tickets: 0, historico: 0 },
        files: {},
        t: {
          perfis: [{ ...DEMO_USER, criado_em: now() }], integrantes: ints, categorias_gasto: cats,
          configuracoes: [{ chave: 'orcamento_centavos', valor: null, atualizado_em: now() }],
          categorias_documento: ['Pesquisa', 'Currículos', 'Competição', 'Entregáveis', 'Apresentação', 'Administrativo', 'Outros'].map((nome, i) => ({ id: uuid(), nome, ordem: i + 1, criado_em: now() })),
          itens: [], cotacoes: [], contribuicoes: [], entregaveis: ent, documentos: [], documento_versoes: [],
          tarefas: [], tickets: [], ticket_comentarios: [], historico: [],
        },
      };
    };

    let db;
    try { db = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch (e) { db = seed(); }
    const save = () => { localStorage.setItem(KEY, JSON.stringify(db)); };
    save();

    const audit = (table, acao, antes, depois) => {
      if (table === 'historico' || table === 'ticket_comentarios') return;
      const reg = depois || antes;
      db.t.historico.unshift({
        id: ++db.seq.historico, tabela: table, registro_id: String(reg.id || reg.chave), acao,
        usuario_id: DEMO_USER.id, usuario_nome: DEMO_USER.nome, em: now(),
        dados_antes: antes ? JSON.parse(JSON.stringify(antes)) : null, dados_depois: depois ? JSON.parse(JSON.stringify(depois)) : null,
      });
      if (db.t.historico.length > 2000) db.t.historico.length = 2000;
    };

    // Regras equivalentes às constraints do banco
    const constraints = (table, r) => {
      const blank = (v) => !String(v == null ? '' : v).trim();
      if (table === 'tickets') {
        if (r.status === 'Concluída' && blank(r.resumo_solucao)) throw new Error('ticket_concluido_requer_resumo');
        if (r.status === 'Não realizada' && blank(r.motivo_nao_realizacao)) throw new Error('ticket_nao_realizado_requer_motivo');
        if (blank(r.titulo)) throw new Error('Título obrigatório.');
      }
      if (table === 'itens') {
        if (r.status === 'Pago' && (!r.pago_em || !r.pago_por_id)) throw new Error('item_pago_requer_dados');
        if (r.compartilhado === false && !r.responsavel_id) throw new Error('item_nao_compartilhado_requer_responsavel');
        if (!r.categoria_id) throw new Error('Categoria obrigatória.');
        if (!(Number(r.quantidade) > 0)) throw new Error('Quantidade deve ser maior que zero.');
      }
      if (table === 'documento_versoes' && !r.arquivo_path && !r.link) throw new Error('versao_tem_arquivo_ou_link');
      if (table === 'categorias_gasto' && db.t.categorias_gasto.some((c) => c.id !== r.id && HK.util.normalize(c.nome) === HK.util.normalize(r.nome))) throw new Error('duplicate key value');
    };
    const DEFAULTS = {
      itens: { status: 'Planejado', compartilhado: true, quantidade: 1, valor_unitario_centavos: 0 },
      tickets: { status: 'Nova', prioridade: 'Média', descricao: '' },
      documentos: { status: 'Não solicitado', categoria: 'Outros', restrito: false, vinculado_competicao: false },
      tarefas: { status: 'A fazer', prioridade: 'Média' },
      entregaveis: { status: 'Não iniciado' },
    };
    const FK = { // tabela-filha → [coluna, tabela-pai, ação]
      itens: [['categoria_id', 'categorias_gasto', 'restrict']],
      contribuicoes: [['integrante_id', 'integrantes', 'restrict'], ['item_id', 'itens', 'null']],
      cotacoes: [['item_id', 'itens', 'cascade']],
      documento_versoes: [['documento_id', 'documentos', 'cascade']],
      ticket_comentarios: [['ticket_id', 'tickets', 'cascade']],
      tickets: [['documento_id', 'documentos', 'null']],
      documentos: [['entregavel_id', 'entregaveis', 'null']],
      tarefas: [['entregavel_id', 'entregaveis', 'null']],
    };

    const clone = (x) => JSON.parse(JSON.stringify(x));
    return {
      mode: 'demo',
      async session() { return { user: { id: DEMO_USER.id, email: DEMO_USER.email } }; },
      onAuth() {},
      async signIn() { return {}; },
      async signOut() { localStorage.removeItem('hk_mode'); location.reload(); },
      async resetPassword() { throw new Error('Indisponível no modo demonstração.'); },
      async updatePassword() { throw new Error('Indisponível no modo demonstração.'); },
      async profile() { return clone(db.t.perfis[0]); },
      async integrantesComAcesso() {
        return db.t.integrantes.filter((i) => db.t.perfis.some((p) => p.id === i.perfil_id && p.ativo && p.papel !== 'visitante')).map((i) => i.id);
      },
      resetAll() { localStorage.removeItem(KEY); },

      async list(table, { eq, order, asc, limit, inList } = {}) {
        let rows = clone(db.t[table] || []);
        if (eq) rows = rows.filter((r) => Object.keys(eq).every((k) => String(r[k]) === String(eq[k])));
        if (inList) rows = rows.filter((r) => Object.keys(inList).every((k) => inList[k].map(String).includes(String(r[k]))));
        const [col, dir] = order ? [order, !!asc] : ORDER[table] || ['criado_em', false];
        rows.sort((a, b) => { const x = a[col], y = b[col]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * (dir ? 1 : -1); });
        return limit ? rows.slice(0, limit) : rows;
      },
      async insert(table, row) {
        const r = { ...(DEFAULTS[table] || {}), ...clone(row) };
        if (pkOf(table) === 'id' && !r.id) r.id = uuid();
        if (!r.criado_em) r.criado_em = now();
        if (['itens', 'cotacoes', 'contribuicoes', 'entregaveis', 'documentos', 'tarefas', 'tickets', 'configuracoes'].includes(table)) r.atualizado_em = now();
        if (table === 'ticket_comentarios' && !r.autor_id) r.autor_id = DEMO_USER.id;
        else if (!('criado_por' in r) && !['configuracoes', 'integrantes', 'categorias_gasto', 'categorias_documento'].includes(table)) r.criado_por = DEMO_USER.id;
        if (table === 'tickets') { if (r.numero == null) r.numero = ++db.seq.tickets; else db.seq.tickets = Math.max(db.seq.tickets, r.numero); }
        constraints(table, r);
        db.t[table].push(r);
        audit(table, 'INSERT', null, r);
        save();
        return clone(r);
      },
      async update(table, id, patch) {
        const pk = pkOf(table);
        const idx = db.t[table].findIndex((r) => String(r[pk]) === String(id));
        if (idx < 0) throw new Error('SEM_PERMISSAO');
        const antes = clone(db.t[table][idx]);
        const r = { ...antes, ...clone(patch) };
        if ('atualizado_em' in antes || table === 'configuracoes') r.atualizado_em = now();
        constraints(table, r);
        db.t[table][idx] = r;
        audit(table, 'UPDATE', antes, r);
        save();
        return clone(r);
      },
      async upsert(table, row) {
        const pk = pkOf(table);
        return db.t[table].some((r) => String(r[pk]) === String(row[pk])) ? this.update(table, row[pk], row) : this.insert(table, row);
      },
      async remove(table, id) {
        const pk = pkOf(table);
        const r = db.t[table].find((x) => String(x[pk]) === String(id));
        if (!r) throw new Error('SEM_PERMISSAO');
        for (const child in FK) for (const [col, parent, action] of FK[child]) {
          if (parent !== table) continue;
          const refs = db.t[child].filter((c) => String(c[col]) === String(id));
          if (!refs.length) continue;
          if (action === 'restrict') throw new Error('still referenced');
          if (action === 'cascade') { db.t[child] = db.t[child].filter((c) => String(c[col]) !== String(id)); refs.forEach((c) => audit(child, 'DELETE', c, null)); }
          if (action === 'null') refs.forEach((c) => { c[col] = null; });
        }
        db.t[table] = db.t[table].filter((x) => String(x[pk]) !== String(id));
        audit(table, 'DELETE', r, null);
        save();
        return true;
      },
      async upload(bucket, path, file) {
        if (file.size > 1.5 * 1048576) throw new Error('Modo demonstração: arquivos de até 1,5 MB (no Supabase o limite é maior).');
        const dataUrl = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
        db.files[`${bucket}/${path}`] = dataUrl;
        try { save(); } catch (e) { delete db.files[`${bucket}/${path}`]; throw new Error('QuotaExceeded'); }
        return path;
      },
      async signedUrls(bucket, paths) {
        const out = {};
        paths.filter(Boolean).forEach((p) => { if (db.files[`${bucket}/${p}`]) out[p] = db.files[`${bucket}/${p}`]; });
        return out;
      },
      async removeFile(bucket, path) { delete db.files[`${bucket}/${path}`]; save(); },
    };
  }

  HK.createDataAdapter = function () {
    const cfg = window.HK_CONFIG || {};
    const mode = localStorage.getItem('hk_mode');
    const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey);
    // Com o banco configurado, o modo demonstração deixa de existir: evita que alguém
    // registre dados reais só no navegador por engano.
    if (configured) { localStorage.removeItem('hk_mode'); return SupabaseAdapter(cfg.supabaseUrl, cfg.supabaseAnonKey); }
    if (mode === 'demo') return DemoAdapter();
    return null; // não configurado
  };
})(window.HK = window.HK || {});
