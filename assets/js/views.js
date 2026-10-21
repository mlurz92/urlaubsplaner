/*
 * Ansichten: Übersicht (Zeitstrahl aller Mitarbeitenden), Jahreskalender, Auswertung.
 */
(function (UP) {
  'use strict';

  const { esc, icon, $, $$, initials, toast, menu } = UP.ui;
  const D = UP.date;
  const S = UP.store;
  const fd = (n) => UP.fmtDays(n);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ===================================================== Gemeinsame Helfer */

  const H = (UP.viewHelpers = {
    year() {
      return UP.buildYear(S.prefs.year, S.data.settings);
    },
    /** Sichtbare Gruppen mit ihren Mitarbeitenden (Filter, Suche, inaktive) */
    groups() {
      const p = S.prefs, d = S.data;
      const q = (p.search || '').trim().toLowerCase();
      const emps = d.employees.filter(
        (e) =>
          (p.showInactive || e.active) &&
          (p.groupFilter === 'all' || e.group === p.groupFilter) &&
          (!q || e.name.toLowerCase().includes(q) || (e.position || '').toLowerCase().includes(q))
      );
      const res = d.groups.map((g) => ({ g, emps: emps.filter((e) => e.group === g.id) }));
      const orphan = emps.filter((e) => !d.groups.some((g) => g.id === e.group));
      if (orphan.length) res.push({ g: { id: '_none', name: 'Ohne Gruppe', short: '–', color: '#64748b', minPresent: 0 }, emps: orphan });
      return res.filter((x) => x.emps.length);
    },
    groupColor(emp) {
      const g = S.group(emp.group);
      return g ? g.color : '#64748b';
    },
    /** Index ganztägiger Abwesenheiten je Person und Tag des Jahres: 1 = ganztägig, 0.5 = halbtags */
    absenceIndex(Y) {
      const idx = new Map();
      S.data.employees.forEach((e) => idx.set(e.id, new Float32Array(Y.n)));
      S.absencesInYear(Y.y).forEach((a) => {
        const arr = idx.get(a.employeeId);
        if (!arr) return;
        const i0 = Math.max(0, D.diff(Y.start, a.start));
        const i1 = Math.min(Y.n - 1, D.diff(Y.start, a.end));
        for (let i = i0; i <= i1; i++) arr[i] = Math.max(arr[i], a.halfDay ? 0.5 : 1);
      });
      return idx;
    },
    /** Besetzung je Gruppe und Tag: [{g, days: [{present,total}|null]}] */
    coverage(Y, absIdx) {
      const d = S.data;
      return d.groups.map((g) => {
        const members = d.employees.filter((e) => e.active && e.group === g.id);
        const days = Y.days.map((day) => {
          let total = 0, present = 0;
          members.forEach((e) => {
            if (UP.dayValue(day.iso, e, d.settings) === 0) return;
            total++;
            if ((absIdx.get(e.id) || [])[day.i] !== 1) present++;
          });
          return total ? { present, total } : null;
        });
        return { g, members, days };
      });
    },
    shortageDays(Y, cov) {
      const res = [];
      Y.days.forEach((day, i) => {
        const bad = cov.filter((c) => c.days[i] && c.g.minPresent > 0 && c.days[i].present < c.g.minPresent);
        if (bad.length) res.push({ day, bad: bad.map((c) => ({ g: c.g, ...c.days[i] })) });
      });
      return res;
    },
    absLabel(a) {
      const e = S.employee(a.employeeId);
      const t = S.type(a.typeId);
      return `${t.name} · ${e ? e.name : ''} · ${D.range(a.start, a.end)}`;
    },
    /** Tooltip-Inhalt für einen Tag */
    dayTip(iso) {
      const Y = H.year();
      const day = Y.days[D.diff(Y.start, iso)];
      if (!day) return '';
      const rows = [];
      if (day.holiday) rows.push(`<div class="tt-row"><span class="mark hol"></span>${esc(day.holiday.name)}${day.holiday.kind === 'regional' ? ' <span class="tt-muted">(regional)</span>' : ' <span class="tt-muted">· gesetzl. Feiertag</span>'}</div>`);
      if (day.observance) rows.push(`<div class="tt-row tt-muted">${esc(day.observance.name)}</div>`);
      if (day.school) rows.push(`<div class="tt-row"><span class="mark sch"></span>${esc(day.school.name)} <span class="tt-muted">${D.range(day.school.start, day.school.end)}</span></div>`);
      if (day.bridge) rows.push(`<div class="tt-row"><span class="mark br"></span>Brückentag: ${fd(day.bridge.cost)} Urlaubstag${day.bridge.cost > 1 ? 'e' : ''} → ${day.bridge.gain} freie Tage</div>`);
      day.events.forEach((ev) => rows.push(`<div class="tt-row"><span class="mark ${ev.kind === 'sperre' ? 'blk' : 'ev'}"></span>${esc(ev.name)}${ev.kind === 'sperre' ? ' <span class="tt-warn">(Urlaubssperre)</span>' : ''}</div>`));
      const absent = S.absentOn(iso)
        .map((a) => ({ a, e: S.employee(a.employeeId), t: S.type(a.typeId) }))
        .filter((x) => x.e && x.e.active);
      let html = `<div class="tt-title">${D.fmt(iso, 'long')}</div><div class="tt-sub">KW ${day.kw}</div>`;
      if (rows.length) html += `<div class="tt-sec">${rows.join('')}</div>`;
      if (absent.length) {
        html += `<div class="tt-sec"><div class="tt-muted">Abwesend (${absent.length})</div>${absent
          .map((x) => `<div class="tt-row"><span class="mark" style="background:${esc(x.t.color)}"></span>${esc(x.e.name)} <span class="tt-muted">${esc(x.t.name)}${x.a.halfDay ? ' (½)' : ''}${x.a.status !== 'genehmigt' ? ' · ' + x.a.status : ''}</span></div>`)
          .join('')}</div>`;
      }
      const covRows = S.data.groups
        .map((g) => {
          const p = S.presence(g.id, iso);
          if (!p.total) return '';
          const low = g.minPresent > 0 && p.present < g.minPresent;
          return `<div class="tt-row ${low ? 'tt-warn' : ''}">Anwesend ${esc(g.short || g.name)}: ${p.present}/${p.total}${g.minPresent ? ` <span class="tt-muted">(min. ${g.minPresent})</span>` : ''}</div>`;
        })
        .join('');
      if (covRows) html += `<div class="tt-sec">${covRows}</div>`;
      return html;
    },
    absTip(a) {
      const e = S.employee(a.employeeId);
      const t = S.type(a.typeId);
      const days = UP.absenceDays(a, e, S.data.settings);
      const cal = D.diff(a.start, a.end) + 1;
      return `<div class="tt-title">${esc(e ? e.name : '')}</div>
        <div class="tt-sub">${D.fmt(a.start, 'medium')}${a.start !== a.end ? ' – ' + D.fmt(a.end, 'medium') : ''}</div>
        <div class="tt-sec">
          <div class="tt-row"><span class="mark" style="background:${esc(t.color)}"></span>${esc(t.name)}${a.halfDay ? ' (halber Tag)' : ''}</div>
          <div class="tt-row tt-muted">${fd(days)} Arbeitstag${days === 1 ? '' : 'e'} · ${cal} Kalendertag${cal === 1 ? '' : 'e'}${t.counts ? '' : ' · zählt nicht als Urlaub'}</div>
          <div class="tt-row">Status: ${esc(a.status.charAt(0).toUpperCase() + a.status.slice(1))}</div>
          ${a.note ? `<div class="tt-row tt-muted">„${esc(a.note)}“</div>` : ''}
        </div>
        <div class="tt-sec tt-muted" style="font-size:11px">Klick: bearbeiten · Ziehen: verschieben · Rechtsklick: Menü</div>`;
    }
  });

  UP.ui.tip.resolvers.push((t) => {
    if (t.dataset.tipkind === 'day') {
      const Y = H.year();
      const day = Y.days[+t.dataset.i];
      return day ? H.dayTip(day.iso) : t.dataset.iso ? H.dayTip(t.dataset.iso) : '';
    }
    if (t.dataset.tipkind === 'iso') return H.dayTip(t.dataset.iso);
    if (t.dataset.tipkind === 'abs') {
      const a = S.data.absences.find((x) => x.id === t.dataset.abs);
      return a ? H.absTip(a) : '';
    }
    if (t.dataset.tipkind === 'rest') {
      const e = S.employee(t.dataset.emp);
      if (!e) return '';
      const st = S.stats(e, S.prefs.year);
      return `<div class="tt-title">Urlaubskonto ${S.prefs.year}</div>
        <div class="tt-sec">
          <div class="tt-row">Anspruch: ${fd(st.entitlement)} T${st.carryover ? ` + Übertrag ${fd(st.carryover)} T` : ''}</div>
          <div class="tt-row">Genehmigt: ${fd(st.genehmigt)} T</div>
          <div class="tt-row">Beantragt: ${fd(st.beantragt)} T</div>
          <div class="tt-row">Geplant: ${fd(st.geplant)} T</div>
          <div class="tt-row"><b>Rest: ${fd(st.rest)} T</b></div>
        </div>`;
    }
    return '';
  });

  /* ========================================================== Zeitstrahl */

  const TL = (UP.timeline = {
    scroll: null,
    drag: null,
    hoverIdx: -1,
    lastKey: '',
    focusAbs: null,
    pendingScroll: null,

    mount() {
      const v = $('#view-timeline');
      v.innerHTML = `<div class="tl-wrap"><div id="tl-notice"></div>
        <div class="tl-frame" id="tl-frame">
          <div class="tl-scroll card" id="tl-scroll"></div>
          <button class="tl-nav prev" data-nav="-1" title="Einen Monat zurück (Umschalt+←)" aria-label="Einen Monat zurück">${icon('chevron-left')}</button>
          <button class="tl-nav next" data-nav="1" title="Einen Monat weiter (Umschalt+→)" aria-label="Einen Monat weiter">${icon('chevron-right')}</button>
        </div></div>`;
      this.scroll = $('#tl-scroll');
      $('#tl-frame').addEventListener('click', (e) => {
        const b = e.target.closest('[data-nav]');
        if (b) this.scrollByMonths(+b.dataset.nav);
      });
      $('#tl-notice').addEventListener('click', (e) => {
        if (e.target.closest('[data-dismiss-hint]')) S.setPref('hintDismissed', true);
      });
      const sc = this.scroll;
      sc.addEventListener('pointerdown', (e) => this.onDown(e));
      sc.addEventListener('pointermove', (e) => this.onMove(e));
      sc.addEventListener('pointerup', (e) => this.onUp(e));
      sc.addEventListener('pointercancel', () => this.cancelDrag());
      sc.addEventListener('pointerleave', () => this.setHover(-1));
      sc.addEventListener('dblclick', (e) => this.onDbl(e));
      sc.addEventListener('contextmenu', (e) => this.onContext(e));
      sc.addEventListener('keydown', (e) => this.onKey(e));
      sc.addEventListener('click', (e) => this.onClick(e));
      sc.addEventListener('scroll', () => this.updateNav(), { passive: true });
      sc.addEventListener(
        'wheel',
        (e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.zoomAt(this.col() * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX);
            return;
          }
          // Mausrad scrollt horizontal, solange nicht vertikal gescrollt werden muss
          // (oder über Kopf- und Besetzungszeile); Umschalt+Rad und Touchpad funktionieren nativ.
          if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
          const needsV = sc.scrollHeight > sc.clientHeight + 1;
          if (needsV && !e.target.closest('.tl-head, .tl-cov')) return;
          if (sc.scrollWidth <= sc.clientWidth) return;
          e.preventDefault();
          sc.scrollLeft += e.deltaY * (e.deltaMode === 1 ? 32 : e.deltaMode === 2 ? sc.clientWidth : 1);
        },
        { passive: false }
      );
    },

    /** Pfeil-Schaltflächen und Randschatten je nach Scrollposition */
    updateNav() {
      const sc = this.scroll, fr = $('#tl-frame');
      if (!sc || !fr) return;
      const max = sc.scrollWidth - sc.clientWidth;
      fr.classList.toggle('can-left', max > 4 && sc.scrollLeft > 4);
      fr.classList.toggle('can-right', max > 4 && sc.scrollLeft < max - 4);
    },
    scrollByDays(n) {
      this.scroll.scrollBy({ left: n * this.col(), behavior: 'smooth' });
    },
    /** Zum Anfang des vorigen/nächsten Monats */
    scrollByMonths(dir) {
      const Y = H.year();
      const first = Math.floor(this.scroll.scrollLeft / this.col() + 0.5);
      const starts = Y.months.map((m) => m.start);
      const target = dir > 0 ? starts.find((s) => s > first + 1) : [...starts].reverse().find((s) => s < first - 1);
      this.scrollToIdx(target != null ? target : dir > 0 ? Y.n : 0);
    },

    col() {
      return this.curCol || S.prefs.zoom;
    },
    /** Spaltenbreite: im Modus „Ganzes Jahr“ an die verfügbare Breite angepasst */
    computeCol(n) {
      const p = S.prefs;
      if (p.fit && this.scroll && this.scroll.clientWidth > 0) {
        return Math.max(1.5, Math.floor(((this.scroll.clientWidth - this.nameW() - 2) / n) * 1000) / 1000);
      }
      return p.zoom;
    },
    nameW() {
      return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--namecol')) || 248;
    },

    render() {
      if (!this.scroll) this.mount();
      const p = S.prefs, d = S.data;
      const Y = H.year();
      const sc = this.scroll;
      const col = (this.curCol = this.computeCol(Y.n));
      const W = Y.n * col;
      const key = `${Y.y}|${col}`;
      const prevKey = this.lastKey;
      const prevLeft = sc.scrollLeft, prevTop = sc.scrollTop;
      const prevCol = prevKey ? +prevKey.split('|')[1] : col;
      if (p.fit) this.pendingScroll = 0;

      document.documentElement.style.setProperty('--col', `${col}px`);
      const absIdx = H.absenceIndex(Y);
      const cov = H.coverage(Y, absIdx);
      const groups = H.groups();
      const today = D.today();
      const todayIdx = today.startsWith(String(Y.y)) ? D.diff(Y.start, today) : -1;
      const showSchool = p.showSchool;
      const narrow = col < 22, tiny = col < 13, micro = col < 7;

      /* ---- Kopf ---- */
      let months = '';
      Y.months.forEach((m) => {
        const w = m.len * col;
        const name = w > 95 ? D.MONTHS[m.m] : w > 34 ? D.MONTHS_SHORT[m.m] : D.MONTHS_SHORT[m.m][0];
        months += `<div class="tl-month" data-month="${m.m}" style="--m:${m.m};left:${m.start * col}px;width:${w}px" title="${col < 14 ? 'Hineinzoomen: ' : ''}${D.MONTHS[m.m]} ${Y.y}"><span>${name}${w > 140 ? ` <small>${Y.y}</small>` : ''}</span></div>`;
      });

      let weeks = '';
      if (p.showKW && col >= 8) {
        let i = 0;
        while (i < Y.n) {
          const kw = Y.days[i].kw;
          let j = i;
          while (j + 1 < Y.n && Y.days[j + 1].kw === kw) j++;
          const w = (j - i + 1) * col;
          weeks += `<div class="tl-week" style="left:${i * col}px;width:${w}px">${w >= 46 ? 'KW ' + kw : w >= 16 ? kw : ''}</div>`;
          i = j + 1;
        }
      }

      let days = '';
      Y.days.forEach((day) => {
        const cls = [day.weekend ? 'we' : '', day.holiday ? 'hol' : '', day.d === 1 && day.i > 0 ? 'ms' : '', day.i === todayIdx ? 'today' : ''].join(' ');
        days += `<div class="tl-day ${cls}" data-tipkind="day" data-i="${day.i}"><span class="wd">${D.WD_LETTER[day.wd]}</span><span class="dn">${day.d}</span>${p.showBridges && day.bridge ? '<i class="bd"></i>' : ''}</div>`;
      });

      const clipIdx = (s, e) => {
        const a = Math.max(0, D.diff(Y.start, s));
        const b = Math.min(Y.n - 1, D.diff(Y.start, e));
        return [a, b];
      };
      let bands = '';
      if (showSchool) {
        Y.school.forEach((s) => {
          const [a, b] = clipIdx(s.start, s.end);
          const w = (b - a + 1) * col;
          bands += `<div class="tl-band" style="left:${a * col + 1}px;width:${w - 2}px" data-tip="${esc(s.name)}\n${D.range(s.start, s.end)}">${w > 70 ? esc(s.name) : w > 24 ? esc(s.name[0]) : ''}</div>`;
        });
      }
      Y.holidays.forEach((h) => {
        if (col < 40) return;
        const i = D.diff(Y.start, h.date);
        bands += `<div class="tl-band hol" style="left:${i * col + 1}px;width:${col - 2}px" data-tip="${esc(h.name)}">F</div>`;
      });
      let evBands = '';
      Y.events.forEach((ev) => {
        const [a, b] = clipIdx(ev.start, ev.end);
        const w = (b - a + 1) * col;
        evBands += `<div class="tl-band ev ${ev.kind === 'sperre' ? 'block' : ''}" style="left:${a * col + 1}px;width:${w - 2}px" data-tip="${esc(ev.name)}${ev.kind === 'sperre' ? ' (Urlaubssperre)' : ''}\n${D.range(ev.start, ev.end)}">${w > 50 ? esc(ev.name) : ''}</div>`;
      });

      const totalEmps = groups.reduce((s, g) => s + g.emps.length, 0);
      const head = `
        <div class="tl-head">
          <div class="tl-corner">
            <div class="title">Mitarbeitende</div>
            <div class="sub">${totalEmps} Person${totalEmps === 1 ? '' : 'en'} · Rest = Resturlaub ${Y.y}</div>
          </div>
          <div class="tl-headdays" style="width:${W}px">
            <div class="tl-hrow months">${months}</div>
            ${weeks ? `<div class="tl-hrow weeks">${weeks}</div>` : ''}
            <div class="tl-hrow days">${days}</div>
            ${showSchool || bands ? `<div class="tl-hrow bands">${bands}</div>` : ''}
            ${evBands ? `<div class="tl-hrow bands">${evBands}</div>` : ''}
          </div>
        </div>`;

      /* ---- Hintergrund ---- */
      let bg = '';
      Y.days.forEach((day) => {
        if (day.holiday) bg += `<div class="tl-stripe hol" style="left:${day.i * col}px"></div>`;
        else if (day.weekend) bg += `<div class="tl-stripe we" style="left:${day.i * col}px"></div>`;
      });
      if (showSchool) {
        Y.school.forEach((s) => {
          const [a, b] = clipIdx(s.start, s.end);
          bg += `<div class="tl-stripe sch" style="left:${a * col}px;width:${(b - a + 1) * col}px"></div>`;
        });
      }
      Y.events.forEach((ev) => {
        if (ev.kind !== 'sperre') return;
        const [a, b] = clipIdx(ev.start, ev.end);
        bg += `<div class="tl-stripe blk" style="left:${a * col}px;width:${(b - a + 1) * col}px"></div>`;
      });
      Y.months.forEach((m) => {
        if (m.start) bg += `<div class="tl-stripe ms" style="left:${m.start * col}px"></div>`;
      });
      if (todayIdx >= 0) bg += `<div class="tl-today" style="left:${todayIdx * col + col / 2 - 1}px" title="Heute"></div>`;
      bg += `<div class="tl-hovercol" id="tl-hovercol"></div>`;

      /* ---- Zeilen ---- */
      let rows = '';
      let rowNo = 0;
      groups.forEach(({ g, emps }) => {
        const collapsed = !!p.collapsed[g.id];
        rows += `<div class="tl-group ${collapsed ? 'collapsed' : ''}">
          <div class="tl-name" data-action="toggle-group" data-group="${esc(g.id)}" title="${collapsed ? 'Aufklappen' : 'Zuklappen'}">
            ${icon('chevron-down', 'xs chev')}<span class="grp-dot" style="--c:${esc(g.color)}"></span><span class="gname">${esc(g.name)}</span><span class="count">${emps.length}</span>
          </div><div style="width:${W}px"></div></div>`;
        if (collapsed) return;
        emps.forEach((e) => {
          rows += this.rowHtml(e, Y, col, W, rowNo++);
        });
      });
      if (!groups.length) {
        rows += `<div class="tl-row" style="height:120px"><div class="tl-name" style="cursor:default"><span class="nm"><b>Keine Treffer</b><small>Filter oder Suche anpassen</small></span></div><div style="width:${W}px"></div></div>`;
      }

      /* ---- Besetzung ---- */
      let covHtml = '';
      cov.forEach((c) => {
        if (!c.members.length) return;
        let cells = '';
        c.days.forEach((v, i) => {
          if (!v) return;
          const min = c.g.minPresent;
          const cls = min > 0 && v.present < min ? 'bad' : min > 0 && v.present === min ? 'warn' : '';
          cells += `<div class="cov ${cls}" style="left:${i * col}px" data-tipkind="day" data-i="${i}">${v.present}</div>`;
        });
        covHtml += `<div class="tl-row cov-row"><div class="tl-name"><span>Anwesend ${esc(c.g.short || c.g.name)}</span><small>${c.g.minPresent ? `min. ${c.g.minPresent}` : ''}</small></div><div class="tl-lane" style="width:${W}px">${cells}</div></div>`;
      });

      sc.innerHTML = `<div class="tl ${narrow ? 'narrow' : ''} ${tiny ? 'tiny' : ''} ${micro ? 'micro' : ''}" style="width:${W + this.nameW()}px">
          ${head}
          <div class="tl-body"><div class="tl-bg" style="width:${W}px">${bg}</div>${rows}</div>
          ${covHtml ? `<div class="tl-cov">${covHtml}</div>` : ''}
        </div>`;

      // Hinweise
      const notes = [];
      if (!UP.holidays.hasSchoolData(Y.y)) {
        notes.push(`<div class="notice">${icon('info', 'sm')}<span>Für ${Y.y} liegen noch keine (vollständigen) amtlichen Schulferientermine für Sachsen vor. Feiertage werden berechnet und sind vollständig.</span></div>`);
      }
      if (!p.hintDismissed && !S.absencesInYear(Y.y).length && S.data.employees.length) {
        notes.push(`<div class="notice info">${icon('bulb', 'sm')}<span><b>So geht’s:</b> Abwesenheitsart oben wählen, dann in der Zeile einer Person über die gewünschten Tage ziehen. Einträge lassen sich verschieben, an den Rändern verlängern oder per Rechtsklick bearbeiten. <kbd>Strg</kbd> <kbd>K</kbd> öffnet die Befehlspalette.</span><button class="btn sm ghost icon-only" data-dismiss-hint title="Hinweis ausblenden">${icon('x', 'sm')}</button></div>`);
      }
      $('#tl-notice').innerHTML = notes.join('');
      $('#tl-notice').style.display = notes.length ? '' : 'none';

      // Scrollposition
      this.lastKey = key;
      if (this.pendingScroll != null) {
        sc.scrollLeft = this.pendingScroll;
        this.pendingScroll = null;
      } else if (!prevKey || prevKey.split('|')[0] !== String(Y.y)) {
        const target = todayIdx >= 0 ? todayIdx - 10 : 0;
        sc.scrollLeft = Math.max(0, target * col);
        sc.scrollTop = prevTop;
      } else if (prevCol !== col) {
        sc.scrollLeft = (prevLeft / prevCol) * col;
        sc.scrollTop = prevTop;
      } else {
        sc.scrollLeft = prevLeft;
        sc.scrollTop = prevTop;
      }
      this.updateNav();
      this.hoverIdx = -1;
      if (this.focusAbs) {
        const b = sc.querySelector(`.bar[data-abs="${CSS.escape(this.focusAbs)}"]`);
        if (b) b.focus({ preventScroll: true });
        this.focusAbs = null;
      }
    },

    rowHtml(e, Y, col, W, rowNo = 0) {
      const st = S.stats(e, Y.y);
      const restCls = st.rest < 0 ? 'neg' : st.rest === 0 ? 'zero' : '';
      const g = S.group(e.group);
      const wdText = e.workdays.length === 5 && [1, 2, 3, 4, 5].every((x) => e.workdays.includes(x)) ? '' : ` · ${e.workdays.length} T/Woche`;
      let bars = '';
      S.absencesOf(e.id, Y.y).forEach((a) => {
        bars += this.barHtml(a, e, Y, col);
      });
      return `<div class="tl-row" data-emp="${esc(e.id)}" style="--d:${rowNo}">
        <div class="tl-name ${e.active ? '' : 'inactive'}" data-action="edit-emp" data-emp="${esc(e.id)}" title="${esc(e.name)} bearbeiten">
          <span class="avatar" style="--c:${esc(g ? g.color : '#64748b')}">${esc(initials(e.name))}</span>
          <span class="nm"><b>${esc(e.name)}</b><small>${esc(e.position || (g ? g.short : ''))} · ${fd(st.total)} T Anspruch${wdText}</small></span>
          <span class="rest ${restCls}" data-tipkind="rest" data-emp="${esc(e.id)}">${fd(st.rest)}<small>T</small></span>
        </div>
        <div class="tl-lane" data-emp="${esc(e.id)}" style="width:${W}px">${bars}</div>
      </div>`;
    },

    barHtml(a, e, Y, col) {
      const settings = S.data.settings;
      const t = S.type(a.typeId);
      const s = D.max(a.start, Y.start);
      const en = D.min(a.end, `${Y.y}-12-31`);
      const i0 = D.diff(Y.start, s), i1 = D.diff(Y.start, en);
      const w = Math.max(3, (i1 - i0 + 1) * col - 2);
      const days = UP.absenceDays(a, e, settings);
      let label = '';
      if (w >= 92) label = `<span class="lbl">${esc(t.name)}</span><span class="cnt">${fd(days)} T</span>`;
      else if (w >= 46) label = `<span class="lbl">${esc(t.short)}</span><span class="cnt">${fd(days)}</span>`;
      else if (w >= 22) label = `<span class="lbl">${a.halfDay ? '½' : esc(t.short)}</span>`;
      if (a.note && w >= 60) label += '<i class="note-dot"></i>';
      let off = '';
      for (let i = i0; i <= i1; i++) {
        if (UP.dayValue(Y.days[i].iso, e, settings) === 0) off += `<i class="off" style="left:${(i - i0) * col - 1}px"></i>`;
      }
      const cls = `bar st-${a.status} ${w < 46 ? 'xs' : ''} ${a.halfDay ? 'half' : ''} ${a.start < s ? 'clip-l' : ''} ${a.end > en ? 'clip-r' : ''}`;
      return `<div class="${cls}" data-abs="${esc(a.id)}" data-tipkind="abs" tabindex="0" role="button"
        aria-label="${esc(H.absLabel(a))}, ${esc(a.status)}" style="--c:${esc(t.color)};--x:${(i0 / Y.n).toFixed(3)};left:${i0 * col + 1}px;width:${w}px">
        ${off}${w >= 20 ? '<span class="h l"></span>' : ''}${label}${w >= 20 ? '<span class="h r"></span>' : ''}</div>`;
    },

    /* ---------------- Navigation ---------------- */
    scrollToIdx(i, smooth = true) {
      const sc = this.scroll;
      if (!sc) return;
      sc.scrollTo({ left: Math.max(0, i * this.col() - 12), behavior: smooth ? 'smooth' : 'auto' });
    },
    scrollToMonth(m) {
      const Y = H.year();
      this.scrollToIdx(Y.months[m].start);
    },
    scrollToIso(iso) {
      const Y = H.year();
      this.scrollToIdx(Math.max(0, D.diff(Y.start, iso) - 7));
    },
    zoomAt(z, clientX) {
      const sc = this.scroll;
      const cur = this.col();
      z = clamp(Math.round(z * 2) / 2, 3, 64);
      if (z === cur && !S.prefs.fit) return;
      const rect = sc.getBoundingClientRect();
      const nameW = this.nameW();
      const x = clientX != null ? clientX - rect.left - nameW : (sc.clientWidth - nameW) / 2;
      const dayPos = (sc.scrollLeft + x) / cur;
      this.pendingScroll = Math.max(0, dayPos * z - x);
      S.setPrefs({ zoom: z, fit: false });
    },
    /** Ganzes Jahr: alle Mitarbeitenden und alle Monate ohne Scrollen */
    fitYear() {
      this.pendingScroll = 0;
      S.setPrefs({ fit: true });
    },
    /** „Ganzes Jahr“ ein-/ausschalten; beim Ausschalten tageweise ab heute */
    toggleFit() {
      if (!S.prefs.fit) return this.fitYear();
      const Y = H.year();
      const t = D.today();
      const i = t.startsWith(String(Y.y)) ? D.diff(Y.start, t) - 10 : 0;
      const z = S.prefs.zoom >= 14 ? S.prefs.zoom : 28;
      this.pendingScroll = Math.max(0, i * z);
      S.setPrefs({ fit: false, zoom: z });
    },
    /** Monat formatfüllend anzeigen */
    zoomMonth(m) {
      const Y = H.year();
      const mo = Y.months[m];
      const avail = this.scroll.clientWidth - this.nameW() - 4;
      const z = clamp(Math.floor((avail / mo.len) * 2) / 2, 3, 64);
      this.pendingScroll = mo.start * z;
      S.setPrefs({ zoom: z, fit: false });
    },

    /* ---------------- Interaktion ---------------- */
    idxFromX(lane, clientX) {
      const r = lane.getBoundingClientRect();
      return clamp(Math.floor((clientX - r.left) / this.col()), 0, H.year().n - 1);
    },
    setHover(i) {
      if (i === this.hoverIdx) return;
      const sc = this.scroll;
      const hc = $('#tl-hovercol');
      const days = sc.querySelectorAll('.tl-hrow.days .tl-day');
      if (this.hoverIdx >= 0 && days[this.hoverIdx]) days[this.hoverIdx].classList.remove('hover');
      this.hoverIdx = i;
      if (!hc) return;
      if (i < 0) {
        hc.style.display = 'none';
        return;
      }
      hc.style.display = 'block';
      hc.style.left = `${i * this.col()}px`;
      if (days[i]) days[i].classList.add('hover');
    },

    onClick(e) {
      if (this.suppressClick) {
        this.suppressClick = false;
        return;
      }
      const a = e.target.closest('[data-action]');
      const m = e.target.closest('.tl-month');
      if (m) {
        if (this.col() < 14) this.zoomMonth(+m.dataset.month);
        else this.scrollToMonth(+m.dataset.month);
        return;
      }
      if (!a) return;
      if (a.dataset.action === 'toggle-group') {
        const c = { ...S.prefs.collapsed };
        c[a.dataset.group] = !c[a.dataset.group];
        S.setPref('collapsed', c);
      } else if (a.dataset.action === 'edit-emp') {
        UP.dialogs.employee(S.employee(a.dataset.emp));
      }
    },

    /** Balken unter dem Zeiger – datenbasiert, damit laufende 3D-Animationen das Greifen nicht stören */
    barAt(lane, clientX) {
      const iso = H.year().days[this.idxFromX(lane, clientX)].iso;
      const a = S.data.absences.find((x) => x.employeeId === lane.dataset.emp && x.start <= iso && x.end >= iso);
      return a ? lane.querySelector(`.bar[data-abs="${CSS.escape(a.id)}"]`) : null;
    },

    onDown(e) {
      // Mittlere Maustaste überall bzw. linke Maustaste auf Kopf- und Besetzungszeile: Ansicht verschieben
      const panZone = e.target.closest('.tl-headdays, .tl-cov .tl-lane');
      if ((e.button === 1 || (e.button === 0 && panZone)) && e.pointerType !== 'touch') {
        if (this.scroll.scrollWidth <= this.scroll.clientWidth) return;
        e.preventDefault();
        this.drag = { kind: 'pan', x0: e.clientX, left0: this.scroll.scrollLeft, moved: false, pid: e.pointerId };
        return;
      }
      if (e.button !== 0) return;
      const lane = e.target.closest('.tl-lane[data-emp]');
      if (!lane) return;
      const bar = e.target.closest('.bar') || this.barAt(lane, e.clientX);
      const emp = S.employee(lane.dataset.emp);
      if (!emp) return;
      if (bar) {
        const a = S.data.absences.find((x) => x.id === bar.dataset.abs);
        if (!a) return;
        const mode = e.target.classList.contains('h') ? (e.target.classList.contains('l') ? 'l' : 'r') : 'move';
        this.drag = { kind: 'bar', mode, a, emp, el: bar, x0: e.clientX, y0: e.clientY, delta: 0, moved: false, touch: e.pointerType === 'touch', pid: e.pointerId };
        if (!this.drag.touch) e.preventDefault();
        return;
      }
      const i = this.idxFromX(lane, e.clientX);
      this.drag = { kind: 'select', emp, lane, a: i, b: i, x0: e.clientX, y0: e.clientY, moved: false, touch: e.pointerType === 'touch', pid: e.pointerId };
      if (this.drag.touch) return;
      e.preventDefault();
      lane.setPointerCapture(e.pointerId);
      const sel = document.createElement('div');
      sel.className = 'tl-sel';
      sel.style.setProperty('--c', S.type(S.prefs.brush).color);
      lane.appendChild(sel);
      this.drag.sel = sel;
      this.updateSel();
      document.body.classList.add('dragging');
    },

    updateSel() {
      const dr = this.drag, col = this.col();
      const lo = Math.min(dr.a, dr.b), hi = Math.max(dr.a, dr.b);
      dr.sel.style.left = `${lo * col + 1}px`;
      dr.sel.style.width = `${(hi - lo + 1) * col - 2}px`;
      const Y = H.year();
      const n = UP.absenceDays({ start: Y.days[lo].iso, end: Y.days[hi].iso }, dr.emp, S.data.settings);
      const w = (hi - lo + 1) * col;
      dr.sel.textContent = w > 70 ? `${fd(n)} Arbeitstag${n === 1 ? '' : 'e'}` : w > 26 ? fd(n) : '';
    },

    autoScroll(clientX) {
      const sc = this.scroll, r = sc.getBoundingClientRect();
      const left = r.left + this.nameW();
      if (clientX > r.right - 40) sc.scrollLeft += 14;
      else if (clientX < left + 30) sc.scrollLeft -= 14;
    },

    onMove(e) {
      const dr = this.drag;
      if (!dr) {
        // Spalten-Hervorhebung
        const sc = this.scroll, r = sc.getBoundingClientRect();
        const x = e.clientX - r.left - this.nameW() + sc.scrollLeft;
        const inBody = !!e.target.closest('.tl-body, .tl-cov');
        if (!inBody || e.clientX - r.left < this.nameW()) this.setHover(-1);
        else this.setHover(clamp(Math.floor(x / this.col()), 0, H.year().n - 1));
        return;
      }
      if (dr.kind === 'pan') {
        const dx = e.clientX - dr.x0;
        if (!dr.moved && Math.abs(dx) < 4) return;
        if (!dr.moved) {
          dr.moved = true;
          this.scroll.setPointerCapture(dr.pid);
          document.body.classList.add('panning');
          UP.ui.tip.hide();
        }
        this.scroll.scrollLeft = dr.left0 - dx;
        return;
      }
      if (dr.touch) {
        if (Math.abs(e.clientX - dr.x0) > 8 || Math.abs(e.clientY - dr.y0) > 8) dr.moved = true;
        return;
      }
      if (dr.kind === 'select') {
        this.autoScroll(e.clientX);
        const i = this.idxFromX(dr.lane, e.clientX);
        if (i !== dr.b) {
          dr.b = i;
          dr.moved = true;
          this.updateSel();
        }
        this.setHover(i);
        return;
      }
      // Balken verschieben / Größe ändern
      const col = this.col();
      const delta = Math.round((e.clientX - dr.x0) / col);
      if (!dr.moved && Math.abs(e.clientX - dr.x0) < 4) return;
      if (!dr.moved) {
        dr.moved = true;
        dr.el.classList.add('dragging');
        dr.el.setPointerCapture(dr.pid);
        document.body.classList.add('dragging');
        UP.ui.tip.hide();
      }
      this.autoScroll(e.clientX);
      if (delta === dr.delta && dr.range) return;
      dr.delta = delta;
      let { start, end } = dr.a;
      if (dr.mode === 'move') {
        start = D.add(start, delta);
        end = D.add(end, delta);
      } else if (dr.mode === 'l') {
        start = D.min(D.add(start, delta), end);
      } else {
        end = D.max(D.add(end, delta), start);
      }
      dr.range = { start, end };
      const Y = H.year();
      const i0 = clamp(D.diff(Y.start, start), 0, Y.n - 1), i1 = clamp(D.diff(Y.start, end), 0, Y.n - 1);
      dr.el.style.left = `${i0 * col + 1}px`;
      dr.el.style.width = `${(i1 - i0 + 1) * col - 2}px`;
      dr.el.querySelectorAll('.off').forEach((o) => o.remove());
      const invalid = S.overlaps(dr.emp.id, start, end, dr.a.id).length > 0;
      dr.el.classList.toggle('invalid', invalid);
      const n = UP.absenceDays({ start, end, halfDay: dr.a.halfDay && start === end }, dr.emp, S.data.settings);
      const tipEl = UP.ui.tip.el;
      tipEl.innerHTML = `<div class="tt-title">${D.range(start, end)}</div><div class="tt-sub">${fd(n)} Arbeitstag${n === 1 ? '' : 'e'}${invalid ? ' · <span class="tt-warn">Überschneidung!</span>' : ''}</div>`;
      tipEl.classList.add('show');
      const r = dr.el.getBoundingClientRect();
      tipEl.style.left = `${clamp(e.clientX - tipEl.offsetWidth / 2, 8, innerWidth - tipEl.offsetWidth - 8)}px`;
      tipEl.style.top = `${r.top - tipEl.offsetHeight - 8}px`;
    },

    onUp(e) {
      const dr = this.drag;
      if (!dr) return;
      this.drag = null;
      document.body.classList.remove('dragging');
      UP.ui.tip.el.classList.remove('show');
      if (dr.sel) dr.sel.remove();

      if (dr.kind === 'pan') {
        document.body.classList.remove('panning');
        if (dr.moved) this.suppressClick = true;
        return;
      }
      if (dr.kind === 'select') {
        const Y = H.year();
        if (dr.touch) {
          if (dr.moved) return;
          const i = this.idxFromX(dr.lane, e.clientX);
          UP.dialogs.absence({ empId: dr.emp.id, start: Y.days[i].iso, end: Y.days[i].iso, typeId: S.prefs.brush });
          return;
        }
        const lo = Math.min(dr.a, dr.b), hi = Math.max(dr.a, dr.b);
        const start = Y.days[lo].iso, end = Y.days[hi].iso;
        if (!dr.moved && e.detail > 1) return; // Doppelklick separat
        if (!dr.moved) {
          // Einfacher Klick: kurz verzögert öffnen, damit Doppelklick nicht doppelt auslöst
          clearTimeout(this.clickTimer);
          this.clickTimer = setTimeout(() => this.createFromSelection(dr.emp, start, end), 230);
          return;
        }
        this.createFromSelection(dr.emp, start, end);
        return;
      }

      // Balken
      if (!dr.moved) {
        if (dr.touch || e.button === 0) UP.dialogs.absence({ abs: dr.a });
        return;
      }
      this.suppressClick = true;
      const r = dr.range;
      if (!r || (r.start === dr.a.start && r.end === dr.a.end)) {
        this.render();
        return;
      }
      if (S.overlaps(dr.emp.id, r.start, r.end, dr.a.id).length) {
        toast('Überschneidung mit einem anderen Eintrag – Änderung verworfen.', { type: 'error' });
        this.render();
        return;
      }
      const label = dr.mode === 'move' ? 'Eintrag verschoben' : 'Zeitraum geändert';
      this.focusAbs = dr.a.id;
      S.commit(label, (d) => {
        const a = d.absences.find((x) => x.id === dr.a.id);
        a.start = r.start;
        a.end = r.end;
        if (a.start !== a.end) a.halfDay = false;
      });
      UP.app.undoToast(`${label}: ${D.range(r.start, r.end)}`);
    },

    createFromSelection(emp, start, end) {
      const s = S.data.settings;
      if (s.quickCreate) {
        if (S.overlaps(emp.id, start, end).length) {
          toast('Der Zeitraum überschneidet sich mit einem bestehenden Eintrag.', { type: 'error' });
          return;
        }
        const t = S.type(S.prefs.brush);
        const id = S.uid();
        this.flashAbs = id;
        S.commit(`${t.name} angelegt`, (d) => {
          d.absences.push({ id, employeeId: emp.id, typeId: t.id, start, end, halfDay: false, status: s.defaultStatus, note: '' });
        });
        UP.app.undoToast(`${t.name} für ${emp.name}: ${D.range(start, end)}`, [{ label: 'Bearbeiten', fn: () => UP.dialogs.absence({ abs: S.data.absences.find((a) => a.id === id) }) }]);
      } else {
        UP.dialogs.absence({ empId: emp.id, start, end, typeId: S.prefs.brush });
      }
    },

    cancelDrag() {
      if (!this.drag) return;
      const dr = this.drag;
      this.drag = null;
      document.body.classList.remove('dragging', 'panning');
      UP.ui.tip.el.classList.remove('show');
      if (dr.sel) dr.sel.remove();
      if (dr.kind === 'bar' && dr.moved) this.render();
    },

    onDbl(e) {
      clearTimeout(this.clickTimer);
      const lane = e.target.closest('.tl-lane[data-emp]');
      if (!lane || e.target.closest('.bar') || this.barAt(lane, e.clientX)) return;
      const Y = H.year();
      const i = this.idxFromX(lane, e.clientX);
      UP.dialogs.absence({ empId: lane.dataset.emp, start: Y.days[i].iso, end: Y.days[i].iso, typeId: S.prefs.brush });
    },

    onContext(e) {
      const lane = e.target.closest('.tl-lane[data-emp]');
      if (!lane) return;
      const bar = e.target.closest('.bar') || this.barAt(lane, e.clientX);
      e.preventDefault();
      if (bar) {
        const a = S.data.absences.find((x) => x.id === bar.dataset.abs);
        if (a) UP.app.absenceMenu(a, e.clientX, e.clientY);
        return;
      }
      const Y = H.year();
      const i = this.idxFromX(lane, e.clientX);
      const iso = Y.days[i].iso;
      const emp = S.employee(lane.dataset.emp);
      const mon = D.add(iso, -((D.weekday(iso) + 6) % 7));
      menu.open(e.clientX, e.clientY, [
        { title: `${emp.name} · ${D.fmt(iso, 'medium')}` },
        { label: 'Neuer Eintrag an diesem Tag …', icon: 'plus', fn: () => UP.dialogs.absence({ empId: emp.id, start: iso, end: iso, typeId: S.prefs.brush }) },
        { label: `Ganze Woche (KW ${D.isoWeek(iso)}) …`, icon: 'calendar', fn: () => UP.dialogs.absence({ empId: emp.id, start: mon, end: D.add(mon, 4), typeId: S.prefs.brush }) },
        '-',
        { label: 'Person bearbeiten …', icon: 'pencil', fn: () => UP.dialogs.employee(emp) }
      ]);
    },

    onKey(e) {
      const bar = e.target.closest && e.target.closest('.bar');
      if (!bar) return;
      const a = S.data.absences.find((x) => x.id === bar.dataset.abs);
      if (!a) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        UP.dialogs.absence({ abs: a });
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        UP.app.deleteAbsence(a);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (e.altKey) return;
        e.preventDefault();
        const dlt = e.key === 'ArrowLeft' ? -1 : 1;
        let start = a.start, end = a.end;
        if (e.shiftKey) end = D.max(D.add(end, dlt), start);
        else {
          start = D.add(start, dlt);
          end = D.add(end, dlt);
        }
        if (S.overlaps(a.employeeId, start, end, a.id).length) {
          toast('Überschneidung mit einem anderen Eintrag.', { type: 'error' });
          return;
        }
        this.focusAbs = a.id;
        S.commit(e.shiftKey ? 'Zeitraum geändert' : 'Eintrag verschoben', (d) => {
          const x = d.absences.find((y) => y.id === a.id);
          x.start = start;
          x.end = end;
          if (start !== end) x.halfDay = false;
        });
      }
    }
  });

  /* ========================================================== Kalender */

  const CAL = (UP.calendarView = {
    sel: null,
    mounted: false,

    mount() {
      const v = $('#view-calendar');
      v.innerHTML = `<div class="cal-wrap" id="cal-wrap"></div>`;
      const w = $('#cal-wrap');
      w.addEventListener('pointerdown', (e) => this.onDown(e));
      w.addEventListener('pointermove', (e) => this.onMove(e));
      w.addEventListener('pointerup', (e) => this.onUp(e));
      w.addEventListener('pointercancel', () => this.clearSel());
      w.addEventListener('click', (e) => this.onClick(e));
      w.addEventListener('contextmenu', (e) => {
        const c = e.target.closest('.cd[data-iso]');
        if (!c) return;
        const abs = this.absAt(c.dataset.iso);
        if (abs) {
          e.preventDefault();
          UP.app.absenceMenu(abs, e.clientX, e.clientY);
        }
      });
      this.mounted = true;
    },

    person() {
      const id = S.prefs.calPerson;
      return id !== 'all' ? S.employee(id) : null;
    },
    absAt(iso) {
      const emp = this.person();
      if (!emp) return null;
      return S.data.absences.find((a) => a.employeeId === emp.id && a.start <= iso && a.end >= iso) || null;
    },

    render() {
      if (!this.mounted) this.mount();
      const p = S.prefs, d = S.data;
      const Y = H.year();
      const emp = this.person();
      const today = D.today();
      const absIdx = H.absenceIndex(Y);
      const cov = H.coverage(Y, absIdx);
      const settings = d.settings;

      // Abwesenheiten der gewählten Person je Tag
      const personAbs = new Array(Y.n).fill(null);
      if (emp) {
        S.absencesOf(emp.id, Y.y).forEach((a) => {
          const i0 = Math.max(0, D.diff(Y.start, a.start)), i1 = Math.min(Y.n - 1, D.diff(Y.start, a.end));
          for (let i = i0; i <= i1; i++) personAbs[i] = a;
        });
      }
      // Anzahl Abwesender je Tag (alle)
      const absentCount = new Array(Y.n).fill(0);
      d.employees.forEach((e) => {
        if (!e.active) return;
        const arr = absIdx.get(e.id);
        for (let i = 0; i < Y.n; i++) if (arr[i] > 0 && UP.dayValue(Y.days[i].iso, e, settings) > 0) absentCount[i]++;
      });

      let monthsHtml = '';
      Y.months.forEach((m) => {
        const first = Y.days[m.start];
        const lead = (first.wd + 6) % 7;
        const workdays = Y.days.slice(m.start, m.start + m.len).filter((x) => !x.weekend && !x.holiday).length;
        let cells = '';
        ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].forEach((w, k) => (cells += `<div class="wh" ${k === 0 ? 'style="grid-column:2"' : ''}>${w}</div>`));
        cells = `<div class="wh">KW</div>` + cells.replace('style="grid-column:2"', '');
        const totalCells = Math.ceil((lead + m.len) / 7) * 7;
        for (let c = 0; c < totalCells; c++) {
          if (c % 7 === 0) {
            const di = m.start + Math.max(0, c - lead);
            const kwDay = Y.days[Math.min(m.start + m.len - 1, di)];
            cells += `<div class="kw">${kwDay.kw}</div>`;
          }
          const dn = c - lead;
          if (dn < 0 || dn >= m.len) {
            cells += `<div class="cd out"></div>`;
            continue;
          }
          const day = Y.days[m.start + dn];
          const cls = ['cd'];
          let style = '';
          let inner = `<span>${day.d}</span>`;
          if (day.weekend) cls.push('we');
          if (p.showSchool && day.school && !day.holiday) {
            cls.push('sch');
            const prev = Y.days[day.i - 1], next = Y.days[day.i + 1];
            if (!prev || !prev.school || prev.school !== day.school || day.wd === 1 || dn === 0) cls.push('sch-s');
            if (!next || !next.school || next.school !== day.school || day.wd === 0 || dn === m.len - 1) cls.push('sch-e');
          }
          if (day.holiday) cls.push('hol');
          if (day.iso === today) cls.push('today');
          if (emp) {
            const a = personAbs[day.i];
            if (a && !day.holiday) {
              const t = S.type(a.typeId);
              cls.push('abs', `st-${a.status}`);
              if (UP.dayValue(day.iso, emp, settings) === 0) cls.push('we');
              style = `--c:${t.color}`;
            }
          } else if (absentCount[day.i] > 0 && !day.weekend && !day.holiday) {
            const bad = cov.some((c) => c.days[day.i] && c.g.minPresent > 0 && c.days[day.i].present < c.g.minPresent);
            inner += `<i class="heat ${bad ? 'bad' : ''}">${absentCount[day.i]}</i>`;
          }
          if (p.showBridges && day.bridge) inner += '<i class="br"></i>';
          if (day.events.some((ev) => ev.kind === 'sperre')) inner += '<i class="blk"></i>';
          cells += `<div class="${cls.join(' ')}" data-iso="${day.iso}" data-tipkind="iso" style="${style}">${inner}</div>`;
        }
        monthsHtml += `<div class="cal-month card tilt" data-tilt="5" style="--d:${m.m}"><h3>${D.MONTHS[m.m]}<small>${workdays} Arbeitstage</small></h3><div class="cal-table">${cells}</div></div>`;
      });

      // Seitenleiste
      const holList = Y.holidays
        .map((h) => `<li class="${h.date < today ? 'pastday' : ''}"><span class="mark hol"></span><span class="when">${D.fmt(h.date, 'medium')}</span><span class="what">${esc(h.name)}${h.kind === 'regional' ? '<small>regional (sorb. Siedlungsgebiet)</small>' : ''}</span></li>`)
        .join('');
      const schList = Y.school.length
        ? Y.school
            .map((s) => {
              const n = D.diff(s.start, s.end) + 1;
              return `<li class="clickable ${s.end < today ? 'pastday' : ''}" data-range="${s.start}|${s.end}" title="Zeitraum als Eintrag übernehmen"><span class="mark sch"></span><span class="when">${D.range(s.start, s.end)}</span><span class="what">${esc(s.name)}<small>${n} Tag${n === 1 ? '' : 'e'}</small></span></li>`;
            })
            .join('')
        : `<li><span class="what" style="color:var(--muted)">Noch keine amtlichen Termine verfügbar.</span></li>`;
      const brList = Y.bridges.length
        ? Y.bridges
            .map((b) => `<li class="clickable ${b.days[b.days.length - 1] < today ? 'pastday' : ''}" data-range="${b.days[0]}|${b.days[b.days.length - 1]}" title="Als Urlaub eintragen"><span class="mark br"></span><span class="when">${b.days.length > 1 ? D.range(b.days[0], b.days[b.days.length - 1]) : D.fmt(b.days[0], 'medium')}</span><span class="what">${b.cost} Tag${b.cost > 1 ? 'e' : ''} → ${b.gain} frei<small>${esc(b.reason)}</small></span></li>`)
            .join('')
        : `<li><span class="what" style="color:var(--muted)">Keine Brückentage in diesem Jahr.</span></li>`;
      const evList = Y.events
        .map((ev) => `<li><span class="mark ${ev.kind === 'sperre' ? 'blk' : 'ev'}"></span><span class="when">${D.range(ev.start, ev.end)}</span><span class="what">${esc(ev.name)}<small>${ev.kind === 'sperre' ? 'Urlaubssperre' : 'Termin'}</small></span></li>`)
        .join('');
      let personCard = '';
      if (emp) {
        const st = S.stats(emp, Y.y);
        const list = S.absencesOf(emp.id, Y.y)
          .map((a) => {
            const t = S.type(a.typeId);
            return `<li class="clickable" data-abs="${esc(a.id)}"><span class="mark" style="background:${esc(t.color)}"></span><span class="when">${D.range(a.start, a.end)}</span><span class="what">${esc(t.name)} · ${fd(UP.absenceDays(a, emp, settings, Y.y))} T<small>${esc(a.status)}${a.note ? ' · ' + esc(a.note) : ''}</small></span></li>`;
          })
          .join('');
        personCard = `<div class="card side-card"><h4>${icon('users', 'sm')}${esc(emp.name)}<span class="badge ${st.rest < 0 ? 'danger' : 'primary'}">Rest ${fd(st.rest)} T</span></h4>
          <ul class="dlist">${list || '<li><span class="what" style="color:var(--muted)">Noch keine Einträge – Tage im Kalender anklicken oder ziehen.</span></li>'}</ul></div>`;
      }

      $('#cal-wrap').innerHTML = `
        <div class="cal-layout">
          <div class="cal-grid">${monthsHtml}</div>
          <aside class="cal-side">
            ${personCard}
            <div class="card side-card"><h4>${icon('flag', 'sm')}Feiertage Sachsen ${Y.y}<span class="badge">${Y.holidays.length}</span></h4><ul class="dlist">${holList}</ul></div>
            <div class="card side-card"><h4>${icon('school', 'sm')}Schulferien Sachsen ${Y.y}</h4><ul class="dlist">${schList}</ul></div>
            ${p.showBridges ? `<div class="card side-card"><h4>${icon('bulb', 'sm')}Brückentage<span class="badge ok">${Y.bridges.length}</span></h4><ul class="dlist">${brList}</ul></div>` : ''}
            ${evList ? `<div class="card side-card"><h4>${icon('lock', 'sm')}Sperrzeiten &amp; Termine</h4><ul class="dlist">${evList}</ul></div>` : ''}
          </aside>
        </div>`;
    },

    onClick(e) {
      const li = e.target.closest('li[data-range]');
      if (li) {
        const [start, end] = li.dataset.range.split('|');
        const emp = this.person();
        UP.dialogs.absence({ empId: emp ? emp.id : null, start, end, typeId: 'urlaub' });
        return;
      }
      const la = e.target.closest('li[data-abs]');
      if (la) {
        const a = S.data.absences.find((x) => x.id === la.dataset.abs);
        if (a) UP.dialogs.absence({ abs: a });
      }
    },

    onDown(e) {
      if (e.button !== 0) return;
      const c = e.target.closest('.cd[data-iso]');
      if (!c) return;
      this.sel = { a: c.dataset.iso, b: c.dataset.iso, touch: e.pointerType === 'touch', moved: false };
      if (!this.sel.touch) {
        e.preventDefault();
        this.paintSel();
      }
    },
    onMove(e) {
      if (!this.sel || this.sel.touch) return;
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const c = el && el.closest('.cd[data-iso]');
      if (c && c.dataset.iso !== this.sel.b) {
        this.sel.b = c.dataset.iso;
        this.sel.moved = true;
        this.paintSel();
      }
    },
    onUp(e) {
      const sel = this.sel;
      if (!sel) return;
      this.clearSel();
      const start = D.min(sel.a, sel.b), end = D.max(sel.a, sel.b);
      const emp = this.person();
      if (!sel.moved) {
        const abs = this.absAt(start);
        if (abs) {
          UP.dialogs.absence({ abs });
          return;
        }
      }
      void e;
      UP.dialogs.absence({ empId: emp ? emp.id : null, start, end, typeId: S.prefs.brush });
    },
    paintSel() {
      const lo = D.min(this.sel.a, this.sel.b), hi = D.max(this.sel.a, this.sel.b);
      $$('#cal-wrap .cd[data-iso]').forEach((c) => c.classList.toggle('sel', c.dataset.iso >= lo && c.dataset.iso <= hi));
    },
    clearSel() {
      this.sel = null;
      $$('#cal-wrap .cd.sel').forEach((c) => c.classList.remove('sel'));
    }
  });

  /* ========================================================= Auswertung */

  UP.statsView = {
    mounted: false,
    mount() {
      const v = $('#view-stats');
      v.innerHTML = `<div class="st-wrap" id="st-wrap"></div>`;
      $('#st-wrap').addEventListener('click', (e) => this.onClick(e));
      this.mounted = true;
    },

    render() {
      if (!this.mounted) this.mount();
      const p = S.prefs, d = S.data;
      const Y = H.year();
      const y = Y.y;
      const settings = d.settings;
      const emps = d.employees.filter((e) => e.active || p.showInactive);
      const rows = emps.map((e, order) => ({ e, order, st: S.stats(e, y), g: S.group(e.group) }));

      // KPIs
      const sumTotal = rows.reduce((s, r) => s + r.st.total, 0);
      const sumUsed = rows.reduce((s, r) => s + r.st.used, 0);
      const sumRest = rows.reduce((s, r) => s + r.st.rest, 0);
      const pending = S.absencesInYear(y).filter((a) => a.status === 'beantragt');
      const pendingDays = pending.reduce((s, a) => s + UP.absenceDays(a, S.employee(a.employeeId), settings, y), 0);
      const cov = H.coverage(Y, H.absenceIndex(Y));
      const shortage = H.shortageDays(Y, cov);
      const today = D.today();
      const nextShort = shortage.find((x) => x.day.iso >= today);
      const pct = sumTotal ? Math.round((sumUsed / sumTotal) * 100) : 0;

      const kpis = `
        <div class="kpis">
          <div class="card kpi tilt" style="--d:0"><div class="k-label"><span class="k-icon">${icon('calendar', 'sm')}</span>Urlaub verplant</div>
            <div class="k-value"><span data-count="${sumUsed}">${fd(sumUsed)}</span><small> / ${fd(sumTotal)} T</small></div><div class="k-sub">${pct} % des Gesamtanspruchs ${y}</div></div>
          <div class="card kpi tilt" style="--d:1"><div class="k-label"><span class="k-icon ${pending.length ? 'warn' : 'ok'}">${icon('file', 'sm')}</span>Offene Anträge</div>
            <div class="k-value"><span data-count="${pending.length}">${pending.length}</span></div><div class="k-sub">${fd(pendingDays)} Arbeitstage warten auf Entscheidung</div></div>
          <div class="card kpi tilt" style="--d:2"><div class="k-label"><span class="k-icon ok">${icon('check', 'sm')}</span>Resturlaub gesamt</div>
            <div class="k-value"><span data-count="${sumRest}">${fd(sumRest)}</span><small> T</small></div><div class="k-sub">Ø ${rows.length ? fd(sumRest / rows.length) : 0} T pro Person</div></div>
          <div class="card kpi tilt" style="--d:3"><div class="k-label"><span class="k-icon ${shortage.length ? 'danger' : 'ok'}">${icon('alert', 'sm')}</span>Unterbesetzte Tage</div>
            <div class="k-value"><span data-count="${shortage.length}">${shortage.length}</span></div><div class="k-sub">${nextShort ? `Nächster: ${D.fmt(nextShort.day.iso, 'medium')}` : 'Mindestbesetzung überall eingehalten'}</div></div>
        </div>`;

      // Urlaubskonten
      const extraTypes = d.types.filter((t) => !t.counts && rows.some((r) => r.st.byType[t.id]));
      const sort = p.statsSort || { key: 'order', dir: 1 };
      const val = (r, k) => (k === 'name' ? r.e.name.toLowerCase() : k === 'order' ? r.order : k.startsWith('t:') ? r.st.byType[k.slice(2)] || 0 : r.st[k]);
      rows.sort((a, b) => {
        const va = val(a, sort.key), vb = val(b, sort.key);
        return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir;
      });
      const th = (k, label, cls = 'r') => `<th class="sortable ${cls}" data-sort="${k}">${label}${sort.key === k ? `<span class="arr">${sort.dir > 0 ? '▲' : '▼'}</span>` : ''}</th>`;
      const accRows = rows
        .map((r) => {
          const st = r.st;
          const base = Math.max(st.total, st.used, 1);
          const seg = (v, cls) => (v > 0 ? `<span class="${cls}" style="width:${(Math.min(v, base) / base) * 100}%"></span>` : '');
          const over = Math.max(0, st.used - st.total);
          return `<tr>
            <td><div class="person" data-emp="${esc(r.e.id)}"><span class="avatar" style="--c:${esc(r.g ? r.g.color : '#64748b')}">${esc(initials(r.e.name))}</span><span><b>${esc(r.e.name)}</b><small>${esc(r.e.position || (r.g ? r.g.short : ''))}</small></span></div></td>
            <td class="r">${fd(st.entitlement)}</td>
            <td class="r">${st.carryover ? fd(st.carryover) : '–'}</td>
            <td class="r strong">${fd(st.total)}</td>
            <td class="r">${fd(st.genehmigt)}</td>
            <td class="r">${st.beantragt ? `<span class="badge warn">${fd(st.beantragt)}</span>` : '0'}</td>
            <td class="r">${fd(st.geplant)}</td>
            <td class="r strong" style="color:${st.rest < 0 ? 'var(--danger)' : 'inherit'}">${fd(st.rest)}</td>
            <td><div class="stack" title="Genehmigt ${fd(st.genehmigt)} · Beantragt ${fd(st.beantragt)} · Geplant ${fd(st.geplant)}">${seg(st.genehmigt, 's-genehmigt')}${seg(st.beantragt, 's-beantragt')}${seg(st.geplant - over, 's-geplant')}${over ? `<span class="s-over" style="width:${(over / base) * 100}%"></span>` : ''}</div></td>
            ${extraTypes.map((t) => `<td class="r">${st.byType[t.id] ? fd(st.byType[t.id]) : '–'}</td>`).join('')}
          </tr>`;
        })
        .join('');
      const accounts = `
        <div class="card panel">
          <div class="panel-head"><div><h3>Urlaubskonten ${y}</h3><p>Arbeitstage nach Feiertagen Sachsen und individuellen Arbeitstagen. Klick auf eine Person öffnet die Stammdaten.</p></div>
            <div class="spacer"></div><button class="btn sm" data-action="csv-stats">${icon('download', 'sm')}CSV</button></div>
          <div class="panel-body"><table class="data">
            <thead><tr>${th('name', 'Mitarbeiter/in', '')}${th('entitlement', 'Anspruch')}${th('carryover', 'Übertrag')}${th('total', 'Gesamt')}${th('genehmigt', 'Genehmigt')}${th('beantragt', 'Beantragt')}${th('geplant', 'Geplant')}${th('rest', 'Rest')}<th>Verteilung</th>${extraTypes.map((t) => th('t:' + t.id, `<span class="type-tag" style="--c:${esc(t.color)}">${esc(t.short)}</span>`)).join('')}</tr></thead>
            <tbody>${accRows || `<tr><td colspan="9"><div class="empty">Keine Mitarbeitenden vorhanden.</div></td></tr>`}</tbody>
          </table></div>
        </div>`;

      // Monatsdiagramm (Personentage je Abwesenheitsart)
      const perMonth = Y.months.map(() => ({}));
      S.absencesInYear(y).forEach((a) => {
        const e = S.employee(a.employeeId);
        if (!e || (!e.active && !p.showInactive)) return;
        const s = D.max(a.start, Y.start), en = D.min(a.end, `${y}-12-31`);
        for (let iso = s; iso <= en; iso = D.add(iso, 1)) {
          const v = UP.dayValue(iso, e, settings) * (a.halfDay ? 0.5 : 1);
          if (!v) continue;
          const m = +iso.slice(5, 7) - 1;
          perMonth[m][a.typeId] = (perMonth[m][a.typeId] || 0) + v;
        }
      });
      const maxM = Math.max(5, ...perMonth.map((o) => Object.values(o).reduce((s, v) => s + v, 0)));
      const niceMax = Math.ceil(maxM / 5) * 5;
      const CW = 960, CH = 220, PL = 34, PB = 26, PT = 14;
      const bw = (CW - PL) / 12;
      let svg = '';
      for (let k = 0; k <= 4; k++) {
        const v = (niceMax / 4) * k;
        const yy = CH - PB - ((CH - PB - PT) * v) / niceMax;
        svg += `<line class="gridline" x1="${PL}" x2="${CW}" y1="${yy}" y2="${yy}"/><text class="axis" x="${PL - 8}" y="${yy + 4}" text-anchor="end">${Math.round(v)}</text>`;
      }
      perMonth.forEach((o, m) => {
        let acc = 0;
        const x = PL + m * bw + bw * 0.22, w = bw * 0.56;
        d.types.forEach((t) => {
          const v = o[t.id] || 0;
          if (!v) return;
          const h = ((CH - PB - PT) * v) / niceMax;
          const yy = CH - PB - ((CH - PB - PT) * acc) / niceMax - h;
          svg += `<rect class="cbar" style="--m:${m}" x="${x}" y="${yy}" width="${w}" height="${Math.max(0, h - 1.5)}" rx="3" fill="${esc(t.color)}"><title>${D.MONTHS[m]}: ${esc(t.name)} ${fd(v)} T</title></rect>`;
          acc += v;
        });
        if (acc) svg += `<text class="val" x="${x + w / 2}" y="${CH - PB - ((CH - PB - PT) * acc) / niceMax - 5}" text-anchor="middle">${fd(acc)}</text>`;
        svg += `<text class="axis" x="${x + w / 2}" y="${CH - 6}" text-anchor="middle">${D.MONTHS_SHORT[m]}</text>`;
      });
      const usedTypes = d.types.filter((t) => perMonth.some((o) => o[t.id]));
      const chart = `
        <div class="card panel">
          <div class="panel-head"><div><h3>Abwesenheiten je Monat</h3><p>Summe der Arbeitstage aller Mitarbeitenden nach Art</p></div></div>
          <div class="chart"><svg viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Abwesenheitstage je Monat">${svg}</svg></div>
          <div class="chart-legend">${usedTypes.map((t) => `<span class="type-tag" style="--c:${esc(t.color)}">${esc(t.name)}</span>`).join('') || 'Noch keine Einträge in diesem Jahr.'}</div>
        </div>`;

      // Engpässe
      let shortHtml = '';
      if (shortage.length) {
        const runs = [];
        shortage.forEach((s) => {
          const key = s.bad.map((b) => `${b.g.id}:${b.present}`).join(',');
          const last = runs[runs.length - 1];
          if (last && last.key === key && D.diff(last.end, s.day.iso) <= 3 && Y.days.slice(D.diff(Y.start, last.end) + 1, s.day.i).every((x) => x.weekend || x.holiday)) {
            last.end = s.day.iso;
            last.n++;
          } else runs.push({ key, start: s.day.iso, end: s.day.iso, bad: s.bad, n: 1 });
        });
        shortHtml = `
          <div class="card panel">
            <div class="panel-head"><div><h3>Engpässe ${y}</h3><p>Zeiträume, in denen die Mindestbesetzung unterschritten wird</p></div></div>
            <div class="panel-body"><table class="data"><thead><tr><th>Zeitraum</th><th class="r">Arbeitstage</th><th>Besetzung</th><th></th></tr></thead><tbody>
            ${runs
              .map(
                (r) => `<tr><td class="strong">${D.range(r.start, r.end)}</td><td class="r">${r.n}</td>
                <td>${r.bad.map((b) => `<span class="badge danger">${esc(b.g.short || b.g.name)}: ${b.present} von ${b.total} (min. ${b.g.minPresent})</span>`).join(' ')}</td>
                <td class="r"><button class="btn sm ghost" data-goto="${r.start}">${icon('timeline', 'sm')}Anzeigen</button></td></tr>`
              )
              .join('')}
            </tbody></table></div>
          </div>`;
      }

      // Eintragsliste
      const lf = p.listFilter || 'all';
      const all = S.absencesInYear(y)
        .filter((a) => {
          const e = S.employee(a.employeeId);
          return e && (e.active || p.showInactive);
        })
        .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
      const list = all.filter((a) => lf === 'all' || a.status === lf);
      const counts = { all: all.length, beantragt: 0, geplant: 0, genehmigt: 0 };
      all.forEach((a) => counts[a.status]++);
      const listRows = list
        .map((a) => {
          const e = S.employee(a.employeeId), t = S.type(a.typeId);
          const n = UP.absenceDays(a, e, settings);
          return `<tr>
            <td class="strong num">${D.range(a.start, a.end)}${a.halfDay ? ' <span class="badge">½</span>' : ''}</td>
            <td><div class="person" data-emp="${esc(e.id)}"><span>${esc(e.name)}</span></div></td>
            <td><span class="type-tag" style="--c:${esc(t.color)}">${esc(t.name)}</span></td>
            <td><span class="status-pill ${a.status}">${a.status.charAt(0).toUpperCase() + a.status.slice(1)}</span></td>
            <td class="r">${fd(n)}</td>
            <td style="color:var(--muted);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(a.note)}">${esc(a.note)}</td>
            <td><div class="row-actions">
              ${a.status !== 'genehmigt' ? `<button class="btn sm ghost" data-approve="${esc(a.id)}" title="Genehmigen">${icon('check', 'sm')}Genehmigen</button>` : ''}
              <button class="btn sm ghost icon-only" data-edit="${esc(a.id)}" title="Bearbeiten">${icon('pencil', 'sm')}</button>
              <button class="btn sm ghost icon-only" data-del="${esc(a.id)}" title="Löschen">${icon('trash', 'sm')}</button>
            </div></td></tr>`;
        })
        .join('');
      const fbtn = (k, label) => `<button data-lf="${k}" aria-pressed="${lf === k}">${label} <span class="badge">${counts[k]}</span></button>`;
      const entries = `
        <div class="card panel">
          <div class="panel-head"><div><h3>Alle Einträge ${y}</h3><p>Anträge prüfen und genehmigen, Einträge bearbeiten oder löschen</p></div>
            <div class="spacer"></div>
            <div class="seg sm">${fbtn('all', 'Alle')}${fbtn('beantragt', 'Beantragt')}${fbtn('geplant', 'Geplant')}${fbtn('genehmigt', 'Genehmigt')}</div>
            ${lf !== 'genehmigt' && list.some((a) => a.status !== 'genehmigt') ? `<button class="btn sm" data-action="approve-all">${icon('check', 'sm')}Alle ${lf === 'all' ? 'offenen ' : ''}genehmigen</button>` : ''}
            <button class="btn sm" data-action="csv-abs">${icon('download', 'sm')}CSV</button>
          </div>
          <div class="panel-body"><table class="data">
            <thead><tr><th>Zeitraum</th><th>Mitarbeiter/in</th><th>Art</th><th>Status</th><th class="r">Arbeitstage</th><th>Notiz</th><th></th></tr></thead>
            <tbody>${listRows || `<tr><td colspan="7"><div class="empty">${icon('calendar')}<div>Keine Einträge${lf !== 'all' ? ' mit diesem Status' : ''}.</div></div></td></tr>`}</tbody>
          </table></div>
        </div>`;

      const wrap = $('#st-wrap');
      const top = wrap.scrollTop;
      wrap.innerHTML = `<div class="st-inner">${kpis}${accounts}${shortHtml}${chart}${entries}</div>`;
      wrap.scrollTop = top;
    },

    onClick(e) {
      const t = e.target;
      const sortTh = t.closest('th[data-sort]');
      if (sortTh) {
        const cur = S.prefs.statsSort || { key: 'order', dir: 1 };
        const key = sortTh.dataset.sort;
        const dir = cur.key === key ? -cur.dir : key === 'name' ? 1 : -1;
        S.setPref('statsSort', { key, dir });
        return;
      }
      const person = t.closest('.person[data-emp]');
      if (person) return UP.dialogs.employee(S.employee(person.dataset.emp));
      const find = (id) => S.data.absences.find((a) => a.id === id);
      const b = t.closest('button');
      if (!b) return;
      if (b.dataset.lf) return S.setPref('listFilter', b.dataset.lf);
      if (b.dataset.edit) return UP.dialogs.absence({ abs: find(b.dataset.edit) });
      if (b.dataset.del) return UP.app.deleteAbsence(find(b.dataset.del));
      if (b.dataset.approve) {
        S.commit('Antrag genehmigt', (d) => {
          d.absences.find((a) => a.id === b.dataset.approve).status = 'genehmigt';
        });
        UP.fx.celebrate(b);
        return UP.app.undoToast('Eintrag genehmigt');
      }
      if (b.dataset.goto) {
        UP.app.goTo(b.dataset.goto);
        return;
      }
      const act = b.dataset.action;
      if (act === 'approve-all') {
        const y = S.prefs.year, lf = S.prefs.listFilter || 'all';
        const ids = S.absencesInYear(y).filter((a) => a.status !== 'genehmigt' && (lf === 'all' || a.status === lf)).map((a) => a.id);
        UP.ui.confirmDialog({ title: 'Alle genehmigen?', message: `${ids.length} Einträge werden auf „Genehmigt“ gesetzt.`, confirm: 'Genehmigen' }).then((ok) => {
          if (!ok) return;
          S.commit(`${ids.length} Einträge genehmigt`, (d) => d.absences.forEach((a) => ids.includes(a.id) && (a.status = 'genehmigt')));
          UP.fx.celebrate(null);
          UP.app.undoToast(`${ids.length} Einträge genehmigt`);
        });
      } else if (act === 'csv-stats') UP.io.csvStats();
      else if (act === 'csv-abs') UP.io.csvAbsences();
    }
  };
})(window.UP = window.UP || {});
