/* HackIES 2026 · utilitários compartilhados (sem dependências). */
(function (HK) {
  'use strict';
  const U = (HK.util = {});

  /* ---------- texto e HTML ---------- */
  U.esc = (v) =>
    v == null ? '' : String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  U.normalize = (s) =>
    String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  U.debounce = (fn, ms) => {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms || 200); };
  };

  U.isUrl = (s) => {
    if (!s) return false;
    try { const u = new URL(s); return ['http:', 'https:', 'obsidian:'].includes(u.protocol); } catch (e) { return false; }
  };
  U.safeHref = (s) => (U.isUrl(s) ? U.esc(s) : '#');
  U.link = (url, label) =>
    U.isUrl(url) ? `<a href="${U.esc(url)}" target="_blank" rel="noopener noreferrer">${U.esc(label || url)}</a>` : U.esc(url || '');

  /* ---------- dinheiro (sempre em centavos inteiros) ---------- */
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  U.brl = (cents) => brl.format((Number(cents) || 0) / 100);
  U.centsToInput = (cents) => (cents == null || cents === '' ? '' : ((Number(cents) || 0) / 100).toFixed(2).replace('.', ','));

  /** Converte "1.234,56", "1234,56", "1234.56", "R$ 25" → centavos. Retorna NaN se inválido. */
  U.parseBRL = (input) => {
    if (input == null) return NaN;
    let s = String(input).replace(/R\$|\s/g, '');
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    if (!/^\d+(\.\d{0,2})?$/.test(s)) return NaN;
    return Math.round(parseFloat(s) * 100);
  };

  /** Quantidade: aceita "2", "2,5", "0.25" (até 3 casas). */
  U.parseQty = (input) => {
    const s = String(input == null ? '' : input).trim().replace(',', '.');
    if (!/^\d+(\.\d{1,3})?$/.test(s)) return NaN;
    const n = parseFloat(s);
    return n > 0 ? n : NaN;
  };
  U.fmtQty = (q) => {
    const n = Number(q) || 0;
    return Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR', { maximumFractionDigits: 3 });
  };
  U.pct = (v, digits) => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: digits == null ? 1 : digits })}%`;

  /* ---------- datas (datas puras em ISO AAAA-MM-DD, fuso local) ---------- */
  U.todayISO = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  U.fmtDate = (iso) => {
    if (!iso) return '—';
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return U.esc(iso);
    return `${m[3]}/${m[2]}/${m[1]}`;
  };
  U.fmtDateTime = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  U.isoFromTimestamp = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  /** Dias até a data (negativo = atrasado). */
  U.daysUntil = (iso) => {
    if (!iso) return null;
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  };
  U.prazoLabel = (iso) => {
    const n = U.daysUntil(iso);
    if (n == null) return '';
    if (n < 0) return `atrasado ${-n} dia${n === -1 ? '' : 's'}`;
    if (n === 0) return 'hoje';
    if (n === 1) return 'amanhã';
    return `em ${n} dias`;
  };
  U.relTime = (iso) => {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'agora';
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 7) return `há ${Math.floor(diff / 86400)} d`;
    return U.fmtDate(U.isoFromTimestamp(iso));
  };

  /* ---------- ícones (traço 1.75, 24×24) ---------- */
  const P = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5.5 5h13L21 13v6H3v-6z"/>',
    wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18"/><path d="M16 15h2"/><path d="M6 6l9-3 1 3"/>',
    file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h6"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    slides: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3.5a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10.2 4V3.5a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7h.1a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.4 1z"/>',
    logout: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4"/><path d="M6 12h10"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V4h6v3"/><path d="M6 7l1 13h10l1-13"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    external: '<path d="M14 4h6v6"/><path d="M20 4 11 13"/><path d="M18 14v6H4V6h6"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="m21 16-5-5-9 9"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17.5v.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.3"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>',
    board: '<rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/>',
    chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>',
    restore: '<path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7"/><path d="M4 4v4.7h4.7"/>',
    message: '<path d="M4 5h16v11H9l-5 4z"/>',
    copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
    box: '<path d="M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/>',
    book: '<path d="M4 5a2 2 0 0 1 2-2h13v15H6a2 2 0 0 0-2 2z"/><path d="M4 20a2 2 0 0 0 2 2h13v-4"/><path d="M9 7h6"/>',
  };
  U.icon = (name, cls) =>
    `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;

  /* ---------- notificações ---------- */
  U.toast = (msg, type) => {
    const root = document.getElementById('toast-root');
    if (!root) return alert(msg);
    const el = document.createElement('div');
    el.className = `toast toast-${type || 'ok'}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `${U.icon(type === 'error' ? 'alert' : type === 'info' ? 'info' : 'check')}<span>${U.esc(msg)}</span>`;
    root.appendChild(el);
    setTimeout(() => el.classList.add('out'), type === 'error' ? 6500 : 3200);
    setTimeout(() => el.remove(), type === 'error' ? 7000 : 3700);
  };

  /** Mensagem amigável para erros do banco/rede. */
  U.errMsg = (e) => {
    const raw = (e && (e.message || e.error_description || e.msg)) || String(e || 'Erro desconhecido');
    const map = [
      [/ticket_concluido_requer_resumo/, 'Para concluir, informe o resumo da solução.'],
      [/ticket_nao_realizado_requer_motivo/, 'Para marcar como não realizada, informe a justificativa.'],
      [/item_pago_requer_dados/, 'Para o status "Pago", informe a data do pagamento e quem pagou.'],
      [/item_nao_compartilhado_requer_responsavel/, 'Gasto não compartilhado precisa de um responsável.'],
      [/versao_tem_arquivo_ou_link/, 'A versão precisa de um arquivo ou de um link.'],
      [/violates foreign key constraint.*categorias_gasto|still referenced/i, 'Este registro está em uso por outros registros e não pode ser excluído.'],
      [/duplicate key value/i, 'Já existe um registro com esse valor.'],
      [/row-level security|permission denied|SEM_PERMISSAO|PGRST116/i, 'Você não tem permissão para esta ação.'],
      [/Invalid login credentials/i, 'E-mail ou senha incorretos.'],
      [/Email not confirmed/i, 'E-mail ainda não confirmado. Peça ao administrador para confirmar o usuário.'],
      [/Failed to fetch|NetworkError|network/i, 'Sem conexão com o servidor. Verifique a internet e tente novamente.'],
      [/exceeded the maximum allowed size|Payload too large|too large/i, 'Arquivo maior que o limite permitido.'],
      [/mime type .* is not supported/i, 'Tipo de arquivo não permitido.'],
      [/QuotaExceeded/i, 'Armazenamento do navegador cheio (modo demonstração).'],
    ];
    for (const [re, txt] of map) if (re.test(raw)) return txt;
    return raw;
  };

  /* ---------- modais ---------- */
  U.modal = ({ title, body, footer, size, onClose }) => {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="modal ${size ? 'modal-' + size : ''}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
        <header class="modal-head"><h2>${U.esc(title)}</h2>
          <button class="btn-icon" data-close aria-label="Fechar">${U.icon('x')}</button></header>
        <div class="modal-body">${body || ''}</div>
        ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
      </div>`;
    const prevFocus = document.activeElement;
    const close = () => {
      wrap.remove();
      document.removeEventListener('keydown', onKey);
      if (!root.children.length) document.body.classList.remove('modal-open');
      if (prevFocus && prevFocus.focus) prevFocus.focus();
      if (onClose) onClose();
    };
    const onKey = (e) => { if (e.key === 'Escape' && root.lastElementChild === wrap) close(); };
    wrap.addEventListener('mousedown', (e) => { if (e.target === wrap) wrap.dataset.down = '1'; });
    wrap.addEventListener('mouseup', (e) => { if (e.target === wrap && wrap.dataset.down) close(); delete wrap.dataset.down; });
    wrap.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    document.body.classList.add('modal-open');
    const first = wrap.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
    return { el: wrap, close, body: wrap.querySelector('.modal-body') };
  };

  U.confirm = (message, { okLabel, danger } = {}) =>
    new Promise((resolve) => {
      let done = false;
      const m = U.modal({
        title: 'Confirmar',
        size: 'sm',
        body: `<p>${U.esc(message)}</p>`,
        footer: `<button class="btn" data-close>Cancelar</button>
                 <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${U.esc(okLabel || 'Confirmar')}</button>`,
        onClose: () => { if (!done) resolve(false); },
      });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
    });

  /** Pede um texto obrigatório (ex.: resumo da solução). */
  U.promptText = (title, label, { value, okLabel, required } = {}) =>
    new Promise((resolve) => {
      let done = false;
      const m = U.modal({
        title,
        body: `<form class="form" novalidate><label class="field full"><span>${U.esc(label)}${required ? ' <b class="req">*</b>' : ''}</span>
               <textarea name="t" rows="5" ${required ? 'required' : ''}>${U.esc(value || '')}</textarea>
               <small class="field-error"></small></label></form>`,
        footer: `<button class="btn" data-close>Cancelar</button><button class="btn btn-primary" data-ok>${U.esc(okLabel || 'Salvar')}</button>`,
        onClose: () => { if (!done) resolve(null); },
      });
      const ta = m.el.querySelector('textarea');
      const ok = () => {
        const v = ta.value.trim();
        if (required && !v) { m.el.querySelector('.field-error').textContent = 'Campo obrigatório.'; ta.focus(); return; }
        done = true; m.close(); resolve(v);
      };
      m.el.querySelector('[data-ok]').addEventListener('click', ok);
      m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); ok(); });
    });

  /* ---------- formulários ---------- */
  U.opts = (list, selected, { empty, value, label } = {}) => {
    const val = value || ((x) => (typeof x === 'object' ? x.id : x));
    const lab = label || ((x) => (typeof x === 'object' ? x.nome : x));
    return (empty != null ? `<option value="">${U.esc(empty)}</option>` : '') +
      list.map((x) => {
        const v = val(x);
        return `<option value="${U.esc(v)}" ${String(v) === String(selected == null ? '' : selected) ? 'selected' : ''}>${U.esc(lab(x))}</option>`;
      }).join('');
  };

  U.field = (label, control, { req, hint, full, cls } = {}) =>
    `<label class="field ${full ? 'full' : ''} ${cls || ''}"><span>${U.esc(label)}${req ? ' <b class="req" aria-hidden="true">*</b>' : ''}</span>${control}${hint ? `<small class="hint">${hint}</small>` : ''}<small class="field-error"></small></label>`;

  U.formValues = (form) => {
    const out = {};
    U.$$('input, select, textarea', form).forEach((el) => {
      if (!el.name || el.type === 'file') return;
      if (el.type === 'checkbox') out[el.name] = el.checked;
      else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else out[el.name] = el.value.trim();
    });
    return out;
  };

  U.setFieldError = (form, name, msg) => {
    const el = form.querySelector(`[name="${name}"]`);
    if (!el) return;
    const box = el.closest('.field');
    if (box) { box.classList.toggle('has-error', !!msg); const fe = box.querySelector('.field-error'); if (fe) fe.textContent = msg || ''; }
  };
  U.clearErrors = (form) => U.$$('.field.has-error', form).forEach((f) => { f.classList.remove('has-error'); const fe = f.querySelector('.field-error'); if (fe) fe.textContent = ''; });

  /** Valida campos "required" nativos; devolve true se ok. */
  U.checkRequired = (form) => {
    let ok = true;
    U.$$('[required]', form).forEach((el) => {
      if (el.disabled || el.closest('[hidden]')) return;
      const empty = el.type === 'checkbox' ? !el.checked : !String(el.value || '').trim();
      if (empty) { U.setFieldError(form, el.name, 'Campo obrigatório.'); ok = false; }
    });
    return ok;
  };

  /** Liga um formulário dentro de um modal: valida, desabilita durante o envio, mostra erros. */
  U.bindForm = (modalRef, onSubmit, { validate } = {}) => {
    const form = modalRef.el.querySelector('form');
    const btn = modalRef.el.querySelector('[data-submit]');
    const submit = async (e) => {
      if (e) e.preventDefault();
      U.clearErrors(form);
      let ok = U.checkRequired(form);
      const values = U.formValues(form);
      if (validate) { const errs = validate(values, form) || {}; for (const k in errs) { U.setFieldError(form, k, errs[k]); ok = false; } }
      if (!ok) { const bad = form.querySelector('.has-error input, .has-error select, .has-error textarea'); if (bad) bad.focus(); return; }
      btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Salvando…';
      try { await onSubmit(values, form); }
      catch (err) { console.error(err); U.toast(U.errMsg(err), 'error'); }
      finally { if (btn.isConnected) { btn.disabled = false; btn.textContent = txt; } }
    };
    form.addEventListener('submit', submit);
    if (btn) btn.addEventListener('click', submit);
    return form;
  };

  /* ---------- exportação ---------- */
  U.download = (filename, content, mime) => {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  /** CSV para planilhas brasileiras: separador ";", BOM UTF-8. columns: [{label, value: fn(row)}] */
  U.toCSV = (rows, columns, sep) => {
    const s = sep || ';';
    const q = (v) => {
      const t = v == null ? '' : String(v);
      return /[";\n\r,]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const head = columns.map((c) => q(c.label)).join(s);
    const body = rows.map((r) => columns.map((c) => q(c.value(r))).join(s)).join('\r\n');
    return '﻿' + head + '\r\n' + body;
  };
  U.csvMoney = (cents) => ((Number(cents) || 0) / 100).toFixed(2).replace('.', ',');
  U.stamp = () => U.todayISO();

  U.copyText = async (text) => {
    try { await navigator.clipboard.writeText(text); U.toast('Copiado para a área de transferência.'); }
    catch (e) { U.download('copia.md', text, 'text/markdown;charset=utf-8'); U.toast('Não foi possível copiar; o texto foi baixado como arquivo.', 'info'); }
  };

  /* ---------- imagens ---------- */
  /** Redimensiona para no máx. maxDim px e converte em JPEG. */
  U.compressImage = (file, maxDim, quality) =>
    new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type)) return reject(new Error('Selecione um arquivo de imagem (JPG, PNG ou WebP).'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const max = maxDim || 1600;
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale);
        c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Falha ao processar a imagem.'))), 'image/jpeg', quality || 0.82);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não foi possível ler a imagem (formato não suportado pelo navegador, ex.: HEIC).')); };
      img.src = url;
    });

  U.fileSize = (bytes) => {
    const b = Number(bytes) || 0;
    if (b < 1024) return `${b} B`;
    if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
    return `${(b / 1048576).toFixed(1).replace('.', ',')} MB`;
  };
  U.safeFileName = (name) =>
    U.normalize(name).replace(/[^a-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'arquivo';

  /* ---------- componentes visuais ---------- */
  const TONE = {
    // compras
    'Planejado': 'neutral', 'Em cotação': 'info', 'Aguardando compra': 'warning', 'Comprado': 'accent',
    'Pago': 'good', 'Recebido': 'good', 'Cancelado': 'muted',
    // tickets
    'Nova': 'info', 'Em análise': 'warning', 'Em andamento': 'accent', 'Concluída': 'good', 'Não realizada': 'muted',
    // prioridades
    'Baixa': 'neutral', 'Média': 'info', 'Alta': 'serious', 'Urgente': 'critical',
    // documentos
    'Não solicitado': 'neutral', 'Solicitado': 'info', 'Em preparação': 'accent', 'Em revisão': 'warning',
    'Pronto para envio': 'accent', 'Enviado': 'good', 'Aprovado': 'good', 'Pendente de correção': 'critical',
    // entregáveis / tarefas
    'Não iniciado': 'neutral', 'Concluído': 'good', 'A fazer': 'neutral', 'Bloqueada': 'critical',
  };
  U.chip = (text, tone) => (text ? `<span class="chip chip-${tone || TONE[text] || 'neutral'}"><i class="dot"></i>${U.esc(text)}</span>` : '');

  /** Card de indicador — anatomia única: rótulo (1 linha) · valor · detalhe (1 linha, sempre presente p/ alinhar). */
  U.kpi = (label, value, sub, { tone, icon } = {}) =>
    `<div class="kpi ${tone ? 'kpi-' + tone : ''}"><div class="kpi-label" title="${U.esc(label)}">${icon ? U.icon(icon) : ''}<span>${U.esc(label)}</span></div>
     <div class="kpi-value">${value}</div><div class="kpi-sub">${sub || '&nbsp;'}</div></div>`;

  U.empty = (text, action) => `<div class="empty">${U.icon('box')}<p>${U.esc(text)}</p>${action || ''}</div>`;

  /**
   * Barras horizontais (uma série → sem legenda; rótulo direto à direita).
   * rows: [{label, value, display, sub, highlight}]
   */
  U.hbars = (rows, { color, max } = {}) => {
    if (!rows.length) return '';
    const m = max || Math.max(...rows.map((r) => r.value), 1);
    return `<div class="hbars">${rows.map((r) => {
      const w = r.value > 0 ? Math.max(1.5, (r.value / m) * 100) : 0;
      return `<div class="hbar-row" data-tip="${U.esc(r.tip || `${r.label}: ${r.display}`)}">
        <div class="hbar-label" title="${U.esc(r.label)}">${U.esc(r.label)}</div>
        <div class="hbar-track"><div class="hbar-fill ${r.highlight ? 'is-hl' : ''}" style="width:${w}%;${color ? `background:${color}` : ''}"></div></div>
        <div class="hbar-value">${U.esc(r.display)}${r.sub ? ` <small>${U.esc(r.sub)}</small>` : ''}</div></div>`;
    }).join('')}</div>`;
  };

  /** Barra de progresso simples (0–100+). */
  U.progress = (pct, tone) => {
    const w = Math.max(0, Math.min(100, pct || 0));
    return `<div class="progress ${tone ? 'progress-' + tone : ''}" role="progressbar" aria-valuenow="${Math.round(pct || 0)}" aria-valuemin="0" aria-valuemax="100"><div style="width:${w}%"></div></div>`;
  };
})(window.HK = window.HK || {});
