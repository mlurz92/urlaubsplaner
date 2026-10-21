/*
 * UI-Grundbausteine: Escaping, Icons, Toasts, Tooltips, Kontextmenüs, Dialoge, Downloads.
 */
(function (UP) {
  'use strict';

  const esc = (s) =>
    String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const icon = (name, cls = '') => `<svg class="icon ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** Initialen ohne Titel: "Dr. Lurz" -> "LU", "Anna Muster" -> "AM" */
  function initials(name) {
    const parts = String(name)
      .replace(/\b(Prof|Dr|PD|Fr|Hr|Frau|Herr|med|rer|nat|habil|Dipl)\.?\s*/gi, '')
      .replace(/[.,]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  /* ------------------------------------------------------------- Toasts */
  function toast(msg, opts = {}) {
    const root = $('#toasts');
    const el = document.createElement('div');
    el.className = `toast ${opts.type || ''}`;
    const ic = opts.type === 'error' ? 'alert' : opts.type === 'ok' ? 'check' : 'info';
    el.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>`;
    (opts.actions || []).forEach((a) => {
      const b = document.createElement('button');
      b.textContent = a.label;
      b.addEventListener('click', () => {
        a.fn();
        close();
      });
      el.appendChild(b);
    });
    root.appendChild(el);
    while (root.children.length > 3) root.firstElementChild.remove();
    let t = setTimeout(close, opts.timeout || (opts.actions ? 6500 : 3200));
    el.addEventListener('mouseenter', () => clearTimeout(t));
    el.addEventListener('mouseleave', () => (t = setTimeout(close, 2500)));
    function close() {
      clearTimeout(t);
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }
    return close;
  }

  /* ----------------------------------------------------------- Tooltips */
  const tip = {
    el: null,
    timer: null,
    target: null,
    resolvers: [],
    init() {
      this.el = $('#tooltip');
      document.addEventListener('pointerover', (e) => {
        if (e.pointerType === 'touch') return;
        const t = e.target.closest('[data-tip],[data-tipkind]');
        if (t === this.target) return;
        this.hide();
        if (!t || document.body.classList.contains('dragging')) return;
        this.target = t;
        this.timer = setTimeout(() => this.show(t), t.dataset.tipkind ? 280 : 450);
      });
      document.addEventListener('pointerdown', () => this.hide(), true);
      document.addEventListener('scroll', () => this.hide(), true);
      document.addEventListener('keydown', () => this.hide(), true);
    },
    show(t) {
      if (!t.isConnected) return;
      let html = '';
      if (t.dataset.tipkind) {
        for (const r of this.resolvers) {
          html = r(t);
          if (html) break;
        }
      } else {
        html = esc(t.dataset.tip).replace(/\n/g, '<br>');
      }
      if (!html) return;
      const el = this.el;
      el.innerHTML = html;
      el.style.left = '0px';
      el.style.top = '0px';
      el.classList.add('show');
      const r = t.getBoundingClientRect();
      const w = el.offsetWidth, h = el.offsetHeight;
      let x = r.left + r.width / 2 - w / 2;
      let y = r.bottom + 8;
      if (y + h > innerHeight - 8) y = r.top - h - 8;
      x = Math.max(8, Math.min(innerWidth - w - 8, x));
      el.style.left = `${x}px`;
      el.style.top = `${Math.max(8, y)}px`;
    },
    hide() {
      clearTimeout(this.timer);
      this.target = null;
      if (this.el) this.el.classList.remove('show');
    }
  };

  /* -------------------------------------------------------- Kontextmenü */
  const menu = {
    el: null,
    open(x, y, items, anchor) {
      const el = (this.el = $('#menu'));
      el.innerHTML = '';
      items.forEach((it) => {
        if (it === '-') {
          el.appendChild(document.createElement('hr'));
          return;
        }
        if (it.title) {
          const d = document.createElement('div');
          d.className = 'menu-title';
          d.textContent = it.title;
          el.appendChild(d);
          return;
        }
        const b = document.createElement('button');
        b.setAttribute('role', 'menuitem');
        b.className = `${it.danger ? 'danger' : ''} ${it.checked ? 'checked' : ''}`;
        b.innerHTML = `${it.color ? `<span class="sw" style="background:${esc(it.color)}"></span>` : it.icon ? icon(it.icon, 'sm') : ''}<span>${esc(it.label)}</span>${it.kb ? `<span class="kb">${esc(it.kb)}</span>` : ''}`;
        b.addEventListener('click', () => {
          this.close();
          it.fn();
        });
        el.appendChild(b);
      });
      el.classList.add('show');
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        x = r.right - el.offsetWidth;
        y = r.bottom + 6;
      }
      const w = el.offsetWidth, h = el.offsetHeight;
      el.style.left = `${Math.max(8, Math.min(innerWidth - w - 8, x))}px`;
      el.style.top = `${Math.max(8, y + h > innerHeight - 8 ? y - h : y)}px`;
      const first = el.querySelector('button');
      if (first) first.focus({ preventScroll: true });
      setTimeout(() => {
        document.addEventListener('pointerdown', this._outside, true);
        document.addEventListener('keydown', this._key, true);
      });
    },
    close() {
      if (!this.el) return;
      this.el.classList.remove('show');
      document.removeEventListener('pointerdown', this._outside, true);
      document.removeEventListener('keydown', this._key, true);
    },
    get isOpen() {
      return !!this.el && this.el.classList.contains('show');
    },
    _outside(e) {
      if (!menu.el.contains(e.target)) menu.close();
    },
    _key(e) {
      const btns = $$('button', menu.el);
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        menu.close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        btns[(i + 1) % btns.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        btns[(i - 1 + btns.length) % btns.length].focus();
      }
    }
  };

  /* ------------------------------------------------------------ Dialoge */
  /**
   * openDialog({ title, subtitle, body, footer, size, onClose, init })
   * body/footer: HTML-Strings. Gibt { el, close } zurück.
   */
  function openDialog(o) {
    const d = document.createElement('dialog');
    d.className = `dlg ${o.size || ''}`;
    d.innerHTML = `
      <div class="dlg-head">
        <div><h2>${esc(o.title)}</h2>${o.subtitle ? `<p>${o.subtitle}</p>` : ''}</div>
        <button class="btn ghost icon-only" data-close title="Schließen (Esc)">${icon('x')}</button>
      </div>
      ${o.raw ? o.body : `<div class="dlg-body">${o.body}</div>`}
      ${o.footer ? `<div class="dlg-foot">${o.footer}</div>` : ''}`;
    document.body.appendChild(d);
    const api = {
      el: d,
      close(result) {
        if (!d.open) return;
        d.close();
        d.remove();
        if (o.onClose) o.onClose(result);
      }
    };
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) api.close();
      // Klick auf Backdrop
      if (e.target === d) {
        const r = d.getBoundingClientRect();
        if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) api.close();
      }
    });
    d.addEventListener('cancel', (e) => {
      e.preventDefault();
      api.close();
    });
    d.showModal();
    tip.hide();
    if (o.init) o.init(d, api);
    return api;
  }

  function confirmDialog({ title, message, confirm = 'Bestätigen', danger = false }) {
    return new Promise((resolve) => {
      let ok = false;
      const dlg = openDialog({
        title,
        size: 'sm',
        body: `<p style="margin:0;color:var(--text-2)">${message}</p>`,
        footer: `<div class="spacer"></div><button class="btn" data-close>Abbrechen</button><button class="btn ${danger ? 'primary' : 'primary'}" data-ok ${danger ? 'style="background:var(--danger);border-color:var(--danger)"' : ''}>${esc(confirm)}</button>`,
        onClose: () => resolve(ok),
        init(d) {
          const b = d.querySelector('[data-ok]');
          b.addEventListener('click', () => {
            ok = true;
            dlg.close();
          });
          b.focus();
        }
      });
    });
  }

  function download(filename, content, mime) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  UP.ui = { esc, icon, $, $$, initials, toast, tip, menu, openDialog, confirmDialog, download };
})(window.UP = window.UP || {});
