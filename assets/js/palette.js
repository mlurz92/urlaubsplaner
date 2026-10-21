/*
 * Befehlspalette (Strg+K / ⌘K): Aktionen, Ansichten, Personen, Datum und Jahr per Tastatur.
 * Eingaben wie „15.7.“, „15.07.2027“ oder „2027“ werden als Sprungziel erkannt.
 */
(function (UP) {
  'use strict';

  const { esc, icon, $ } = UP.ui;
  const D = UP.date;
  const S = UP.store;

  const norm = (s) =>
    String(s)
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .normalize('NFD').replace(/[̀-ͯ]/g, '');

  /** Datum aus „15.7.“, „15.07.2026“ oder „15.7.26“ lesen */
  function parseDate(q) {
    const m = q.trim().match(/^(\d{1,2})\.(\d{1,2})\.?(\d{2,4})?$/);
    if (!m) return null;
    let y = m[3] ? +m[3] : S.prefs.year;
    if (y < 100) y += 2000;
    const iso = D.iso(y, +m[2] - 1, +m[1]);
    return D.valid(iso) ? iso : null;
  }

  function staticItems() {
    const p = S.prefs, d = S.data;
    const A = UP.app;
    const items = [
      { group: 'Aktionen', icon: 'plus', label: 'Neuer Eintrag', kb: 'N', run: () => A.action('new-absence') },
      { group: 'Aktionen', icon: 'target', label: 'Zu heute springen', kb: 'T', run: () => A.goToday() },
      { group: 'Aktionen', icon: 'fit', label: 'Ganzes Jahr anzeigen', kb: 'G', keys: 'zoom übersicht alle', run: () => { A.setView('timeline'); UP.timeline.fitYear(); } },
      { group: 'Aktionen', icon: 'timeline', label: 'Tagesansicht (horizontal scrollen)', keys: 'zoom tage scrollen', run: () => { A.setView('timeline'); if (S.prefs.fit) UP.timeline.toggleFit(); } },
      { group: 'Aktionen', icon: 'undo', label: 'Rückgängig', hint: S.undoLabel, kb: 'Strg Z', run: () => A.undo(), when: () => S.canUndo },
      { group: 'Aktionen', icon: 'redo', label: 'Wiederholen', hint: S.redoLabel, kb: 'Strg Y', run: () => A.redo(), when: () => S.canRedo },
      { group: 'Ansicht', icon: 'timeline', label: 'Übersicht aller Mitarbeitenden', kb: 'Z', keys: 'zeitstrahl timeline', run: () => A.setView('timeline') },
      { group: 'Ansicht', icon: 'calendar', label: 'Jahreskalender', kb: 'K', run: () => A.setView('calendar') },
      { group: 'Ansicht', icon: 'chart', label: 'Auswertung & Anträge', kb: 'A', keys: 'statistik urlaubskonten genehmigen', run: () => A.setView('stats') },
      { group: 'Ansicht', icon: 'chevron-left', label: `Jahr ${p.year - 1}`, kb: 'Alt ←', keys: 'vorjahr zurück', run: () => A.setYear(p.year - 1) },
      { group: 'Ansicht', icon: 'chevron-right', label: `Jahr ${p.year + 1}`, kb: 'Alt →', keys: 'folgejahr weiter', run: () => A.setYear(p.year + 1) },
      { group: 'Ansicht', icon: 'moon', label: 'Farbschema wechseln', keys: 'dunkel hell theme darkmode', run: () => A.action('theme') },
      { group: 'Export & Daten', icon: 'download', label: 'Sicherung exportieren (.json)', keys: 'backup speichern', run: () => UP.io.exportJSON() },
      { group: 'Export & Daten', icon: 'upload', label: 'Sicherung importieren', keys: 'backup laden', run: () => UP.io.importJSON() },
      { group: 'Export & Daten', icon: 'file', label: 'Einträge als CSV (Excel)', run: () => UP.io.csvAbsences() },
      { group: 'Export & Daten', icon: 'file', label: 'Urlaubskonten als CSV', run: () => UP.io.csvStats() },
      { group: 'Export & Daten', icon: 'calendar', label: 'Kalenderdatei (.ics)', keys: 'outlook ical', run: () => UP.io.ics() },
      { group: 'Export & Daten', icon: 'printer', label: 'Drucken / PDF', kb: 'Strg P', run: () => UP.io.print() },
      { group: 'Verwaltung', icon: 'users', label: 'Mitarbeitende verwalten', keys: 'personen team', run: () => UP.dialogs.employees() },
      { group: 'Verwaltung', icon: 'settings', label: 'Einstellungen', run: () => UP.dialogs.settings() },
      { group: 'Verwaltung', icon: 'users', label: 'Mindestbesetzung festlegen', keys: 'gruppen', run: () => UP.dialogs.settings('besetzung') },
      { group: 'Verwaltung', icon: 'lock', label: 'Urlaubssperre anlegen', keys: 'termine sperrzeit', run: () => UP.dialogs.settings('termine') },
      { group: 'Verwaltung', icon: 'flag', label: 'Abwesenheitsarten bearbeiten', run: () => UP.dialogs.settings('arten') },
      { group: 'Verwaltung', icon: 'help', label: 'Hilfe & Tastenkürzel', kb: '?', run: () => UP.dialogs.help() }
    ];
    d.types.forEach((t, i) => items.push({ group: 'Eintragen als', color: t.color, label: t.name, kb: i < 9 ? String(i + 1) : '', keys: 'pinsel art', run: () => S.setPref('brush', t.id) }));
    d.employees.forEach((e) => {
      const g = S.group(e.group);
      items.push({ group: 'Personen', avatar: e, label: e.name, hint: `${e.position || ''} · Kalender öffnen`, keys: `${e.position} ${g ? g.name : ''}`, run: () => { S.setPref('calPerson', e.id); A.setView('calendar'); } });
      items.push({ group: 'Personen', icon: 'plus', label: `Eintrag für ${e.name} …`, keys: 'urlaub neu', run: () => UP.dialogs.absence({ empId: e.id, typeId: S.prefs.brush }) });
    });
    return items.filter((it) => !it.when || it.when());
  }

  function dynamicItems(q) {
    const items = [];
    const iso = parseDate(q);
    if (iso) {
      items.push({ group: 'Datum', icon: 'target', label: `Zu ${D.fmt(iso, 'long')} springen`, run: () => UP.app.goTo(iso) });
      items.push({ group: 'Datum', icon: 'plus', label: `Neuer Eintrag am ${D.fmt(iso)}`, run: () => UP.dialogs.absence({ start: iso, end: iso, typeId: S.prefs.brush }) });
    }
    const y = q.trim().match(/^(19|20)\d\d$/);
    if (y) items.push({ group: 'Datum', icon: 'calendar', label: `Jahr ${q.trim()} anzeigen`, run: () => UP.app.setYear(+q.trim()) });
    const nq = norm(q.trim());
    if (nq.length >= 2 && S.data.employees.some((e) => norm(e.name).includes(nq))) {
      items.push({ group: 'Filter', icon: 'search', label: `Übersicht filtern: „${q.trim()}“`, run: () => { S.setPref('search', q.trim()); UP.app.setView('timeline'); } });
    }
    return items;
  }

  function score(it, tokens) {
    if (!tokens.length) return 1;
    const hay = norm(`${it.label} ${it.group} ${it.keys || ''} ${it.hint || ''}`);
    const lab = norm(it.label);
    let s = 0;
    for (const t of tokens) {
      const i = hay.indexOf(t);
      if (i < 0) return 0;
      s += lab.startsWith(t) ? 6 : lab.includes(` ${t}`) ? 4 : lab.includes(t) ? 3 : 1;
    }
    return s;
  }

  UP.palette = {
    open(initial = '') {
      if (this.dlg) return;
      const d = document.createElement('dialog');
      d.className = 'palette';
      d.setAttribute('aria-label', 'Befehlspalette');
      d.innerHTML = `
        <div class="pal-search">${icon('search')}<input type="text" id="pal-q" placeholder="Befehl, Person, Datum (z. B. 15.7.) oder Jahr suchen …" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="pal-list"><kbd>Esc</kbd></div>
        <div class="pal-list" id="pal-list" role="listbox"></div>
        <div class="pal-foot"><span><kbd>↑</kbd><kbd>↓</kbd> auswählen</span><span><kbd>↵</kbd> ausführen</span><span><kbd>Strg</kbd><kbd>K</kbd> öffnen/schließen</span></div>`;
      document.body.appendChild(d);
      this.dlg = d;
      this.active = 0;
      const input = $('#pal-q', d);
      input.value = initial;
      const close = () => this.close();
      d.addEventListener('cancel', (e) => {
        e.preventDefault();
        close();
      });
      d.addEventListener('click', (e) => {
        if (e.target === d) close();
        const row = e.target.closest('[data-idx]');
        if (row) this.run(+row.dataset.idx);
      });
      d.addEventListener('pointermove', (e) => {
        const row = e.target.closest('[data-idx]');
        if (row && +row.dataset.idx !== this.active) this.setActive(+row.dataset.idx, false);
      });
      input.addEventListener('input', () => this.update());
      input.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const n = this.results.length;
          if (n) this.setActive((this.active + (e.key === 'ArrowDown' ? 1 : -1) + n) % n, true);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.run(this.active);
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          close();
        }
      });
      d.showModal();
      UP.ui.tip.hide();
      this.update();
      input.focus();
    },
    close() {
      if (!this.dlg) return;
      const d = this.dlg;
      this.dlg = null;
      d.classList.add('closing');
      setTimeout(() => {
        d.close();
        d.remove();
      }, 140);
    },
    toggle() {
      this.dlg ? this.close() : this.open();
    },
    update() {
      const q = $('#pal-q', this.dlg).value;
      const tokens = norm(q).split(/\s+/).filter(Boolean);
      const dyn = dynamicItems(q);
      const stat = staticItems()
        .map((it) => ({ it, s: score(it, tokens) }))
        .filter((x) => x.s > 0);
      if (tokens.length) stat.sort((a, b) => b.s - a.s);
      // Ohne Suchbegriff Personen-Unterbefehle ausblenden, um die Liste kurz zu halten
      const list = dyn.concat(stat.map((x) => x.it).filter((it) => tokens.length || !(it.group === 'Personen' && it.icon === 'plus')));
      this.results = list.slice(0, 60);
      this.active = 0;
      let html = '', lastGroup = '';
      this.results.forEach((it, i) => {
        if (it.group !== lastGroup) {
          html += `<div class="pal-group">${esc(it.group)}</div>`;
          lastGroup = it.group;
        }
        const g = it.avatar ? S.group(it.avatar.group) : null;
        const lead = it.avatar
          ? `<span class="avatar" style="--c:${esc(g ? g.color : '#64748b')}">${esc(UP.ui.initials(it.avatar.name))}</span>`
          : it.color
            ? `<span class="pal-sw" style="background:${esc(it.color)}"></span>`
            : `<span class="pal-ic">${icon(it.icon || 'chevron-right', 'sm')}</span>`;
        html += `<div class="pal-item" role="option" data-idx="${i}" aria-selected="${i === 0}" style="--i:${Math.min(i, 12)}">${lead}<span class="pal-label">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>${it.kb ? `<span class="pal-kb">${it.kb.split(' ').map((k) => `<kbd>${esc(k)}</kbd>`).join('')}</span>` : ''}</div>`;
      });
      $('#pal-list', this.dlg).innerHTML = html || `<div class="pal-empty">${icon('search')}<div>Nichts gefunden. Tipp: Datum wie „24.12.“ oder ein Jahr eingeben.</div></div>`;
    },
    setActive(i, scroll) {
      const rows = this.dlg.querySelectorAll('.pal-item');
      rows.forEach((r) => r.setAttribute('aria-selected', +r.dataset.idx === i));
      this.active = i;
      if (scroll && rows[i]) rows[i].scrollIntoView({ block: 'nearest' });
    },
    run(i) {
      const it = this.results && this.results[i];
      if (!it) return;
      this.close();
      setTimeout(() => it.run(), 60);
    }
  };
})(window.UP = window.UP || {});
