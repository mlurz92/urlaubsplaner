/*
 * App-Steuerung: Rendering, Kopf- und Werkzeugleiste, Legende, Tastatur, Effekte.
 */
(function (UP) {
  'use strict';

  const { esc, icon, $, $$, toast, menu } = UP.ui;
  const D = UP.date;
  const S = UP.store;

  /* ============================================================ Effekte */

  const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fx = (UP.fx = {
    get on() {
      return S.prefs.effects !== false && !reduceMotion();
    },
    apply() {
      document.documentElement.dataset.fx = fx.on ? 'on' : 'off';
    },
    /** Konfetti (canvas-confetti via CDN, falls verfügbar) */
    celebrate(el) {
      if (!fx.on || typeof window.confetti !== 'function') return;
      const r = el ? el.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
      const origin = { x: (r.left + r.width / 2) / innerWidth, y: (r.top + r.height / 2) / innerHeight };
      const colors = ['#2f74e0', '#0f9e8e', '#ffd166', '#8a4fd1', '#e2662b'];
      window.confetti({ particleCount: 70, spread: 75, startVelocity: 32, scalar: 0.9, ticks: 160, origin, colors, disableForReducedMotion: true });
      setTimeout(() => window.confetti({ particleCount: 40, spread: 110, startVelocity: 22, scalar: 0.7, origin, colors, disableForReducedMotion: true }), 140);
    },
    /** 3D-Neigung für Elemente mit .tilt */
    initTilt() {
      let cur = null, raf = 0, ev = null;
      const reset = (el) => {
        el.style.transform = '';
        el.style.removeProperty('--gx');
        el.style.removeProperty('--gy');
      };
      document.addEventListener('pointermove', (e) => {
        if (!fx.on || e.pointerType === 'touch') return;
        const el = e.target.closest('.tilt');
        if (cur && cur !== el) reset(cur);
        cur = el;
        if (!el) return;
        ev = e;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          if (!cur) return;
          const r = cur.getBoundingClientRect();
          const px = (ev.clientX - r.left) / r.width - 0.5, py = (ev.clientY - r.top) / r.height - 0.5;
          const max = +(cur.dataset.tilt || 7);
          cur.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateZ(6px)`;
          cur.style.setProperty('--gx', `${((px + 0.5) * 100).toFixed(1)}%`);
          cur.style.setProperty('--gy', `${((py + 0.5) * 100).toFixed(1)}%`);
        });
      });
      document.addEventListener('pointerleave', () => cur && reset(cur), true);
    },
    /** Zahlen hochzählen */
    countUp(root) {
      if (!fx.on) return;
      $$('[data-count]', root).forEach((el) => {
        const target = +el.dataset.count;
        if (!isFinite(target) || target === 0) return;
        const t0 = performance.now(), dur = 900;
        const step = (t) => {
          const k = Math.min(1, (t - t0) / dur);
          const v = target * (1 - Math.pow(1 - k, 3));
          el.textContent = UP.fmtDays(k < 1 ? Math.round(v) : target);
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    },
    /**
     * Seitenübergang über die View-Transitions-API:
     * year-next/-prev (Kalenderblatt), view-fwd/-back (3D-Würfel), theme (Kreis-Enthüllung).
     */
    transition(kind, update, origin) {
      const root = document.documentElement;
      if (!fx.on || typeof document.startViewTransition !== 'function' || document.querySelector('dialog[open]') || fx.vt) {
        update();
        return;
      }
      root.dataset.vt = kind;
      if (origin) {
        root.style.setProperty('--vt-x', `${Math.round(origin.x)}px`);
        root.style.setProperty('--vt-y', `${Math.round(origin.y)}px`);
      }
      UP.ui.tip.hide();
      fx.vt = true;
      try {
        const t = document.startViewTransition(() => update());
        t.finished.finally(() => {
          delete root.dataset.vt;
          fx.vt = false;
        });
      } catch (e) {
        delete root.dataset.vt;
        fx.vt = false;
        update();
      }
    },
    /** Eintritts-Animation einer Ansicht (Rückfall ohne View-Transitions-API) */
    enter(el, cls = 'enter-3d') {
      if (!fx.on || !el || typeof document.startViewTransition === 'function') return;
      el.classList.remove('enter-3d', 'enter-flip');
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 900);
    }
  });

  /* ============================================================== App */

  const VIEWS = ['timeline', 'calendar', 'stats'];
  const app = (UP.app = {
    lastView: null,
    lastYear: null,
    toolbarHtml: '',

    init() {
      document.documentElement.classList.add('booting');
      setTimeout(() => document.documentElement.classList.remove('booting'), 1800);
      S.init();
      UP.ui.tip.init();
      fx.apply();
      fx.initTilt();
      this.applyTheme();
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.applyTheme());
      this.bindTopbar();
      this.bindKeys();
      S.subscribe((kind) => this.render(kind));
      this.render('init');
      this.registerSW();
      window.addEventListener('resize', () => {
        clearTimeout(this._rs);
        this._rs = setTimeout(() => S.prefs.view === 'timeline' && UP.timeline.render(), 150);
      });
      if (!S.storageOk) toast('Daten können in diesem Browser nicht dauerhaft gespeichert werden. Bitte regelmäßig exportieren.', { type: 'error', timeout: 8000 });
    },

    render(kind) {
      const p = S.prefs;
      if (!VIEWS.includes(p.view)) p.view = 'timeline';
      fx.apply();
      document.documentElement.dataset.density = p.density;
      this.renderTopbar();
      this.renderToolbar();
      this.renderLegend();
      const viewChanged = this.lastView !== p.view;
      const yearChanged = this.lastYear !== p.year;
      VIEWS.forEach((v) => $(`#view-${v}`).classList.toggle('active', v === p.view));
      const el = $(`#view-${p.view}`);
      if (p.view === 'timeline') UP.timeline.render();
      else if (p.view === 'calendar') UP.calendarView.render();
      else UP.statsView.render();
      const zr = $('#zoom');
      if (zr && document.activeElement !== zr) zr.value = UP.timeline.col();
      if (viewChanged || yearChanged || kind === 'init') {
        el.classList.add('intro');
        clearTimeout(this._intro);
        this._intro = setTimeout(() => el.classList.remove('intro'), 1400);
        if (kind !== 'init') fx.enter(el, viewChanged ? 'enter-3d' : 'enter-flip');
        fx.countUp(el);
      }
      if (UP.timeline.flashAbs) {
        const b = document.querySelector(`.bar[data-abs="${CSS.escape(UP.timeline.flashAbs)}"]`);
        if (b) b.classList.add(fx.on ? 'pop3d' : 'flash');
        UP.timeline.flashAbs = null;
      }
      if (UP.timeline.flipAbs) {
        const b = document.querySelector(`.bar[data-abs="${CSS.escape(UP.timeline.flipAbs)}"]`);
        if (b && fx.on) b.classList.add('flip3d');
        UP.timeline.flipAbs = null;
      }
      this.lastView = p.view;
      this.lastYear = p.year;
    },

    /** Offline-Fähigkeit & Installation (nur über http/https möglich) */
    registerSW() {
      if (!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol)) return;
      navigator.serviceWorker.register('sw.js').catch(() => {});
    },

    setYear(y, origin) {
      const p = S.prefs;
      if (!y || y === p.year) return;
      fx.transition(y > p.year ? 'year-next' : 'year-prev', () => S.setPref('year', y), origin);
    },
    setView(v) {
      const p = S.prefs;
      if (v === p.view) return;
      fx.transition(VIEWS.indexOf(v) > VIEWS.indexOf(p.view) ? 'view-fwd' : 'view-back', () => S.setPref('view', v));
    },
    /** Zu einem Datum springen und es hervorheben */
    goTo(iso, { zoom = true } = {}) {
      const y = +iso.slice(0, 4);
      const wait = S.prefs.view === 'stats' || S.prefs.year !== y;
      if (S.prefs.view === 'stats') this.setView('timeline');
      if (S.prefs.year !== y) this.setYear(y);
      setTimeout(() => {
        if (S.prefs.view === 'timeline') {
          if (zoom && UP.timeline.col() < 14) UP.timeline.zoomMonth(+iso.slice(5, 7) - 1);
          requestAnimationFrame(() => {
            UP.timeline.scrollToIso(iso);
            const Y = UP.viewHelpers.year();
            const cell = document.querySelector(`.tl-hrow.days .tl-day[data-i="${D.diff(Y.start, iso)}"]`);
            if (cell) {
              cell.classList.remove('ping');
              void cell.offsetWidth;
              cell.classList.add('ping');
            }
          });
        } else {
          const c = document.querySelector(`.cd[data-iso="${iso}"]`);
          if (c) {
            c.scrollIntoView({ behavior: 'smooth', block: 'center' });
            c.classList.add('ping');
            setTimeout(() => c.classList.remove('ping'), 1600);
          }
        }
      }, wait ? 750 : 0);
    },

    /* ---------------------------------------------------------- Kopfzeile */
    renderTopbar() {
      const p = S.prefs;
      const sel = $('#year-select');
      const cy = new Date().getFullYear();
      const from = Math.min(2024, p.year - 2, cy - 1), to = Math.max(2031, p.year + 3, cy + 4);
      let opts = '';
      for (let y = from; y <= to; y++) opts += `<option value="${y}" ${y === p.year ? 'selected' : ''}>${y}</option>`;
      if (sel.innerHTML !== opts) sel.innerHTML = opts;
      sel.value = p.year;
      $$('.views [data-view]').forEach((b) => b.setAttribute('aria-selected', b.dataset.view === p.view));
      const u = $('#btn-undo'), r = $('#btn-redo');
      u.disabled = !S.canUndo;
      r.disabled = !S.canRedo;
      u.title = S.canUndo ? `Rückgängig: ${S.undoLabel} (Strg+Z)` : 'Rückgängig (Strg+Z)';
      r.title = S.canRedo ? `Wiederholen: ${S.redoLabel} (Strg+Y)` : 'Wiederholen (Strg+Y)';
      const ic = { auto: 'monitor', light: 'sun', dark: 'moon' }[p.theme] || 'monitor';
      $('#btn-theme').innerHTML = icon(ic);
      $('#btn-theme').title = `Darstellung: ${{ auto: 'System', light: 'Hell', dark: 'Dunkel' }[p.theme]} (klicken zum Wechseln)`;
    },

    bindTopbar() {
      $('#year-select').addEventListener('change', (e) => this.setYear(+e.target.value));
      document.querySelector('.topbar').addEventListener('click', (e) => {
        const b = e.target.closest('[data-action],[data-view]');
        if (!b) return;
        if (b.dataset.view) return this.setView(b.dataset.view);
        this.action(b.dataset.action, b);
      });
      $('#toolbar').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        if (b.dataset.brush) S.setPref('brush', b.dataset.brush);
        else if (b.dataset.gf) S.setPref('groupFilter', b.dataset.gf);
        else if (b.dataset.toggle) S.setPref(b.dataset.toggle, !S.prefs[b.dataset.toggle]);
        else if (b.dataset.action) this.action(b.dataset.action, b);
      });
      $('#toolbar').addEventListener('input', (e) => {
        if (e.target.id === 'zoom') UP.timeline.zoomAt(+e.target.value);
      });
      $('#toolbar').addEventListener('change', (e) => {
        if (e.target.id === 'cal-person') S.setPref('calPerson', e.target.value);
      });

    },

    action(a, el) {
      const p = S.prefs;
      switch (a) {
        case 'year-prev':
          return this.setYear(p.year - 1);
        case 'year-next':
          return this.setYear(p.year + 1);
        case 'palette':
          return UP.palette.open();
        case 'clear-search':
          return S.setPref('search', '');
        case 'today':
          return this.goToday();
        case 'undo':
          return this.undo();
        case 'redo':
          return this.redo();
        case 'new-absence':
          return UP.dialogs.absence({ typeId: p.brush, empId: p.view === 'calendar' && p.calPerson !== 'all' ? p.calPerson : null });
        case 'employees':
          return UP.dialogs.employees();
        case 'settings':
          return UP.dialogs.settings();
        case 'help':
          return UP.dialogs.help();
        case 'theme': {
          const r = (el || $('#btn-theme')).getBoundingClientRect();
          return this.setTheme({ auto: 'light', light: 'dark', dark: 'auto' }[p.theme] || 'auto', { x: r.left + r.width / 2, y: r.top + r.height / 2 });
        }
        case 'export-menu':
          return menu.open(0, 0, [
            { title: 'Sichern & Teilen' },
            { label: 'Sicherung exportieren (.json)', icon: 'download', fn: () => UP.io.exportJSON() },
            { label: 'Sicherung importieren …', icon: 'upload', fn: () => UP.io.importJSON() },
            '-',
            { title: `Export ${p.year}` },
            { label: 'Einträge als CSV (Excel)', icon: 'file', fn: () => UP.io.csvAbsences() },
            { label: 'Urlaubskonten als CSV', icon: 'file', fn: () => UP.io.csvStats() },
            { label: 'Kalenderdatei (.ics) für Outlook', icon: 'calendar', fn: () => UP.io.ics() },
            '-',
            { label: 'Drucken / als PDF speichern', icon: 'printer', kb: 'Strg+P', fn: () => UP.io.print() }
          ], el);
        case 'zoom-in':
          return UP.timeline.zoomAt(UP.timeline.col() * 1.35);
        case 'zoom-out':
          return UP.timeline.zoomAt(UP.timeline.col() / 1.35);
        case 'fit':
          return UP.timeline.toggleFit();
        case 'print':
          return UP.io.print();
        case 'csv-stats':
          return UP.io.csvStats();
      }
    },

    goToday() {
      this.goTo(D.today(), { zoom: false });
    },

    undo() {
      const l = S.undo();
      if (l) toast(`Rückgängig: ${l}`, { actions: [{ label: 'Wiederholen', fn: () => this.redo() }] });
    },
    redo() {
      const l = S.redo();
      if (l) toast(`Wiederholt: ${l}`);
    },
    undoToast(msg, extra = []) {
      toast(msg, { type: 'ok', actions: [{ label: 'Rückgängig', fn: () => this.undo() }, ...extra] });
    },

    setTheme(t, origin) {
      if (!origin) {
        const r = $('#btn-theme').getBoundingClientRect();
        origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
      const prev = document.documentElement.dataset.theme;
      const apply = () => {
        S.setPref('theme', t);
        this.applyTheme();
      };
      let next = t;
      if (t === 'auto') next = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (next === prev) apply();
      else fx.transition('theme', apply, origin);
    },
    applyTheme() {
      let t = S.prefs.theme || 'auto';
      if (t === 'auto') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.dataset.theme = t;
    },

    /* ------------------------------------------------------- Werkzeugleiste */
    renderToolbar() {
      const p = S.prefs, d = S.data;
      const brushes = `<div class="tool-block palette-block" role="group" aria-label="Abwesenheitsart zum Eintragen"><span class="brush-lead" title="Eintragen als – Art wählen, dann in der Übersicht über die Tage ziehen">${icon('pencil', 'sm')}</span><div class="brushes">${d.types
        .map((t, i) => `<button class="brush" data-brush="${esc(t.id)}" style="--c:${esc(t.color)}" aria-pressed="${t.id === p.brush}" title="Eintragen als: ${esc(t.name)}${i < 9 ? ` (Taste ${i + 1})` : ''}"><span class="sw"></span>${esc(t.name)}</button>`)
        .join('')}</div></div>`;
      const gf = `<div class="seg sm" role="group" aria-label="Gruppe filtern"><button data-gf="all" aria-pressed="${p.groupFilter === 'all'}">Alle</button>${d.groups
        .map((g) => `<button data-gf="${esc(g.id)}" aria-pressed="${p.groupFilter === g.id}" title="${esc(g.name)}">${esc(g.short || g.name)}</button>`)
        .join('')}</div>`;
      const filterChip = p.search ? `<button class="chip filter-chip" data-action="clear-search" title="Filter entfernen">${icon('search', 'xs')}„${esc(p.search)}“ ${icon('x', 'xs')}</button>` : '';
      let html = '';
      if (p.view === 'timeline') {
        html = `${brushes}${gf}${filterChip}<div class="spacer"></div>
          <div class="zoom"><button class="btn sm ghost icon-only" data-action="zoom-out" title="Verkleinern (−)">${icon('minus', 'sm')}</button>
            <input type="range" id="zoom" min="3" max="64" step="0.5" aria-label="Zoom">
            <button class="btn sm ghost icon-only" data-action="zoom-in" title="Vergrößern (+)">${icon('plus', 'sm')}</button>
            <button class="btn sm" data-action="fit" aria-pressed="${!!p.fit}" title="${p.fit ? 'Zurück zur Tagesansicht mit horizontalem Scrollen (G)' : 'Alle Mitarbeitenden über das ganze Jahr auf einen Blick (G)'}">${icon('fit', 'sm')}Ganzes Jahr</button></div>`;
      } else if (p.view === 'calendar') {
        const opts = `<option value="all" ${p.calPerson === 'all' ? 'selected' : ''}>Alle Mitarbeitenden (Anzahl Abwesender)</option>` +
          d.groups.map((g) => `<optgroup label="${esc(g.name)}">${d.employees.filter((e) => e.group === g.id && (e.active || p.showInactive)).map((e) => `<option value="${esc(e.id)}" ${p.calPerson === e.id ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</optgroup>`).join('');
        html = `<div class="tool-block"><select id="cal-person" class="input sm" aria-label="Kalender für" title="Kalender für" style="width:auto;min-width:230px">${opts}</select></div>${brushes}<div class="spacer"></div>
          <button class="chip" data-toggle="showSchool" aria-pressed="${p.showSchool}">${p.showSchool ? '✓ ' : ''}Schulferien</button>
          <button class="chip" data-toggle="showBridges" aria-pressed="${p.showBridges}">${p.showBridges ? '✓ ' : ''}Brückentage</button>`;
      } else {
        html = `<div class="tool-block"><span class="label">Auswertung ${p.year}</span></div><div class="spacer"></div>
          <button class="chip" data-toggle="showInactive" aria-pressed="${p.showInactive}">${p.showInactive ? '✓ ' : ''}Inaktive einbeziehen</button>
          <button class="btn sm" data-action="print">${icon('printer', 'sm')}Drucken</button>`;
      }
      if (html !== this.toolbarHtml) {
        $('#toolbar').innerHTML = html;
        this.toolbarHtml = html;
      }
      const z = $('#zoom');
      if (z && document.activeElement !== z) z.value = p.view === 'timeline' && UP.timeline.curCol ? UP.timeline.curCol : p.zoom;
    },

    renderLegend() {
      const p = S.prefs;
      const Y = UP.viewHelpers.year();
      const html = `<span class="li"><span class="sw st-genehmigt"></span>Genehmigt</span>
        <span class="li"><span class="sw st-beantragt"></span>Beantragt</span>
        <span class="li"><span class="sw st-geplant"></span>Geplant</span><span class="sep"></span>
        <span class="li"><span class="sw hol"></span>Feiertag</span>
        ${p.showSchool ? '<span class="li"><span class="sw sch"></span>Schulferien</span>' : ''}
        <span class="li"><span class="sw we"></span>Wochenende</span>
        ${p.showBridges ? '<span class="li"><span class="sw br"></span>Brückentag</span>' : ''}
        ${Y.events.some((e) => e.kind === 'sperre') ? '<span class="li"><span class="sw blk"></span>Urlaubssperre</span>' : ''}
        <span class="li"><span class="sw today"></span>Heute</span>
        <span class="save-state ${S.storageOk ? '' : 'err'}" title="Daten werden in diesem Browser gespeichert"><span class="dot"></span>${S.storageOk ? 'Automatisch gespeichert' : 'Speichern nicht möglich'}</span>`;
      const lg = $('#legend');
      if (lg.dataset.html !== html) {
        lg.innerHTML = html;
        lg.dataset.html = html;
      }
    },

    /* ---------------------------------------------------- Eintragsaktionen */
    absenceMenu(a, x, y) {
      const setStatus = (st) => {
        if (st === 'genehmigt') UP.timeline.flipAbs = a.id;
        S.commit(`Status: ${st}`, (d) => (d.absences.find((z) => z.id === a.id).status = st));
        if (st === 'genehmigt') fx.celebrate(document.querySelector(`.bar[data-abs="${CSS.escape(a.id)}"]`));
      };
      const setType = (tid) => S.commit('Art geändert', (d) => (d.absences.find((z) => z.id === a.id).typeId = tid));
      menu.open(x, y, [
        { title: UP.viewHelpers.absLabel(a) },
        { label: 'Bearbeiten …', icon: 'pencil', kb: '↵', fn: () => UP.dialogs.absence({ abs: a }) },
        { label: 'Duplizieren …', icon: 'copy', fn: () => UP.dialogs.absence({ empId: a.employeeId, start: a.start, end: a.end, typeId: a.typeId }) },
        '-',
        { title: 'Status' },
        ...UP.STATUSES.map((s) => ({ label: s.name, checked: a.status === s.id, fn: () => setStatus(s.id) })),
        '-',
        { title: 'Art' },
        ...S.data.types.map((t) => ({ label: t.name, color: t.color, checked: a.typeId === t.id, fn: () => setType(t.id) })),
        '-',
        { label: 'Löschen', icon: 'trash', danger: true, kb: 'Entf', fn: () => this.deleteAbsence(a) }
      ]);
    },

    deleteAbsence(a) {
      if (!a) return;
      const label = UP.viewHelpers.absLabel(a);
      S.commit('Eintrag gelöscht', (d) => {
        d.absences = d.absences.filter((x) => x.id !== a.id);
      });
      this.undoToast(`Gelöscht: ${label}`);
    },

    /* ------------------------------------------------------------ Tastatur */
    bindKeys() {
      document.addEventListener('keydown', (e) => {
        const tag = (e.target.tagName || '').toLowerCase();
        const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;
        const dialogOpen = !!document.querySelector('dialog[open]');
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === 'p') {
          e.preventDefault();
          if (!dialogOpen) UP.io.print();
          return;
        }
        if (mod && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (UP.palette.dlg || !dialogOpen) UP.palette.toggle();
          return;
        }
        if (dialogOpen || typing || menu.isOpen) return;
        if (mod && !e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault();
          return this.undo();
        }
        if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) {
          e.preventDefault();
          return this.redo();
        }
        if (mod && e.key.toLowerCase() === 's') {
          e.preventDefault();
          return toast('Alles gespeichert – Änderungen werden automatisch gesichert.', { type: 'ok' });
        }
        if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
          e.preventDefault();
          return this.setYear(S.prefs.year + (e.key === 'ArrowLeft' ? -1 : 1));
        }
        if (mod || e.altKey) return;
        const k = e.key;
        // Übersicht horizontal scrollen: ←/→ eine Woche, Umschalt eine Monat, Bild↑/↓ Monat, Pos1/Ende
        if (S.prefs.view === 'timeline' && !e.defaultPrevented && !(e.target.closest && e.target.closest('.bar'))) {
          const T = UP.timeline;
          const nav = {
            ArrowLeft: () => (e.shiftKey ? T.scrollByMonths(-1) : T.scrollByDays(-7)),
            ArrowRight: () => (e.shiftKey ? T.scrollByMonths(1) : T.scrollByDays(7)),
            PageUp: () => T.scrollByMonths(-1),
            PageDown: () => T.scrollByMonths(1),
            Home: () => T.scrollToIdx(0),
            End: () => T.scrollToIdx(UP.viewHelpers.year().n)
          }[k];
          if (nav) {
            e.preventDefault();
            return nav();
          }
        }
        if (/^[1-9]$/.test(k)) {
          const t = S.data.types[+k - 1];
          if (t) {
            S.setPref('brush', t.id);
            toast(`Eintragen als: ${t.name}`);
          }
          return;
        }
        const map = {
          n: () => this.action('new-absence'),
          t: () => this.goToday(),
          g: () => S.prefs.view === 'timeline' && UP.timeline.toggleFit(),
          z: () => this.setView('timeline'),
          k: () => this.setView('calendar'),
          a: () => this.setView('stats'),
          '+': () => S.prefs.view === 'timeline' && this.action('zoom-in'),
          '=': () => S.prefs.view === 'timeline' && this.action('zoom-in'),
          '-': () => S.prefs.view === 'timeline' && this.action('zoom-out'),
          '?': () => UP.dialogs.help(),
          '/': () => UP.palette.open()
        };
        const fn = map[k.toLowerCase()] || map[k];
        if (fn) {
          e.preventDefault();
          fn();
        }
      });
    }
  });

  document.addEventListener('DOMContentLoaded', () => app.init());
})(window.UP = window.UP || {});
