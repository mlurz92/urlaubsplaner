/*
 * Dialoge (Eintrag, Mitarbeitende, Einstellungen, Hilfe) sowie Import/Export/Druck.
 */
(function (UP) {
  'use strict';

  const { esc, icon, $, $$, initials, toast, openDialog, confirmDialog, download } = UP.ui;
  const D = UP.date;
  const S = UP.store;
  const fd = (n) => UP.fmtDays(n);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  /** Zusammenhängende Datumsliste kompakt darstellen: "07.07.–09.07., 14.07." */
  function compactDates(list, max = 6) {
    const runs = [];
    list.forEach((iso) => {
      const last = runs[runs.length - 1];
      if (last && D.diff(last[1], iso) === 1) last[1] = iso;
      else runs.push([iso, iso]);
    });
    const txt = runs.slice(0, max).map(([a, b]) => (a === b ? D.fmt(a, 'short') : `${D.fmt(a, 'short')}–${D.fmt(b, 'short')}`));
    return txt.join(', ') + (runs.length > max ? ` und ${runs.length - max} weitere` : '');
  }

  function employeeOptions(selected) {
    return S.data.groups
      .map((g) => {
        const emps = S.data.employees.filter((e) => e.group === g.id && (e.active || e.id === selected));
        if (!emps.length) return '';
        return `<optgroup label="${esc(g.name)}">${emps.map((e) => `<option value="${esc(e.id)}" ${e.id === selected ? 'selected' : ''}>${esc(e.name)}${e.position ? ` (${esc(e.position)})` : ''}</option>`).join('')}</optgroup>`;
      })
      .join('') +
      S.data.employees
        .filter((e) => !S.group(e.group))
        .map((e) => `<option value="${esc(e.id)}" ${e.id === selected ? 'selected' : ''}>${esc(e.name)}</option>`)
        .join('');
  }

  /* ================================================== Abwesenheit-Dialog */

  function absenceDialog(o = {}) {
    const d = S.data;
    const abs = o.abs || null;
    if (!d.employees.length) {
      toast('Bitte zuerst Mitarbeitende anlegen.', { type: 'error' });
      return employeesDialog();
    }
    const vg = UP.viewHelpers.groups();
    const firstEmp = (vg[0] && vg[0].emps[0]) || d.employees[0];
    const today = D.today();
    const defStart = o.start || (today.startsWith(String(S.prefs.year)) ? today : `${S.prefs.year}-01-01`);
    const draft = abs
      ? { ...abs }
      : {
          id: null,
          employeeId: o.empId || firstEmp.id,
          typeId: o.typeId && d.types.some((t) => t.id === o.typeId) ? o.typeId : d.types[0].id,
          start: defStart,
          end: o.end || defStart,
          halfDay: false,
          status: d.settings.defaultStatus || 'geplant',
          note: ''
        };

    const typeBtns = d.types
      .map((t) => `<button type="button" class="type-opt" data-type="${esc(t.id)}" style="--c:${esc(t.color)}" aria-pressed="${t.id === draft.typeId}"><span class="sw"></span><span>${esc(t.name)}</span></button>`)
      .join('');
    const statusBtns = UP.STATUSES.map((s) => `<button type="button" data-status="${s.id}" aria-pressed="${s.id === draft.status}" title="${esc(s.hint)}">${esc(s.name)}</button>`).join('');

    const dlg = openDialog({
      title: abs ? 'Eintrag bearbeiten' : 'Neuer Eintrag',
      subtitle: abs ? esc(UP.viewHelpers.absLabel(abs)) : 'Abwesenheit planen, beantragen oder genehmigen',
      body: `
        <form class="form-grid" id="abs-form" autocomplete="off">
          <div class="field span-2"><label for="f-emp">Mitarbeiter/in</label><select id="f-emp">${employeeOptions(draft.employeeId)}</select></div>
          <div class="field span-2"><span class="lbl">Art der Abwesenheit</span><div class="type-picker">${typeBtns}</div></div>
          <div class="field"><label for="f-start">Von</label><input type="date" id="f-start" value="${draft.start}" required></div>
          <div class="field"><label for="f-end">Bis</label><input type="date" id="f-end" value="${draft.end}" required></div>
          <div class="span-2 quick-row"><span class="lbl">Schnellwahl:</span>
            <button type="button" class="chip" data-quick="1d">1 Tag</button>
            <button type="button" class="chip" data-quick="1w">bis Freitag</button>
            <button type="button" class="chip" data-quick="2w">2 Wochen</button>
            <button type="button" class="chip" data-quick="3w">3 Wochen</button>
            <span style="flex:1"></span>
            <label class="check" id="half-wrap"><input type="checkbox" id="f-half" ${draft.halfDay ? 'checked' : ''}> Halber Tag</label>
          </div>
          <div class="field span-2"><span class="lbl">Status</span><div class="seg full">${statusBtns}</div></div>
          <div class="field span-2"><label for="f-note">Notiz</label><input type="text" id="f-note" maxlength="200" value="${esc(draft.note)}" placeholder="z. B. Vertretung, Kongressname, Rückfragen …"></div>
        </form>
        <div class="summary" id="abs-summary"></div>
        <div class="alerts" id="abs-alerts"></div>`,
      footer: `${abs ? `<button class="btn danger" data-del>${icon('trash', 'sm')}Löschen</button><button class="btn ghost" data-dup title="Als neuen Eintrag kopieren">${icon('copy', 'sm')}Duplizieren</button>` : ''}
        <div class="spacer"></div><button class="btn" data-close>Abbrechen</button>
        <button class="btn primary" data-save>${icon('check', 'sm')}${abs ? 'Speichern' : 'Eintragen'}</button>`,
      init(el) {
        const f = {
          emp: $('#f-emp', el), start: $('#f-start', el), end: $('#f-end', el),
          half: $('#f-half', el), note: $('#f-note', el), save: $('[data-save]', el)
        };
        const update = () => {
          draft.employeeId = f.emp.value;
          draft.start = f.start.value;
          draft.end = f.end.value;
          draft.note = f.note.value;
          const single = draft.start && draft.start === draft.end;
          f.half.disabled = !single;
          $('#half-wrap', el).classList.toggle('disabled', !single);
          if (!single) f.half.checked = false;
          draft.halfDay = single && f.half.checked;
          $$('[data-type]', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.type === draft.typeId));
          $$('[data-status]', el).forEach((b) => b.setAttribute('aria-pressed', b.dataset.status === draft.status));
          renderSummary(el, draft, abs, f.save);
        };
        el.addEventListener('input', update);
        el.addEventListener('change', (e) => {
          if (e.target === f.start && f.end.value && f.end.value < f.start.value) f.end.value = f.start.value;
          update();
        });
        el.addEventListener('click', (e) => {
          const t = e.target.closest('[data-type],[data-status],[data-quick],[data-del],[data-dup],[data-save]');
          if (!t) return;
          if (t.dataset.type) draft.typeId = t.dataset.type;
          if (t.dataset.status) draft.status = t.dataset.status;
          if (t.dataset.quick && D.valid(f.start.value)) {
            const s = f.start.value;
            f.end.value = t.dataset.quick === '1d' ? s : D.fridayAfter(s, +t.dataset.quick[0]);
          }
          if (t.hasAttribute('data-del')) {
            dlg.close();
            UP.app.deleteAbsence(abs);
            return;
          }
          if (t.hasAttribute('data-dup')) {
            dlg.close();
            absenceDialog({ empId: abs.employeeId, start: abs.start, end: abs.end, typeId: abs.typeId });
            return;
          }
          if (t.hasAttribute('data-save')) return save();
          update();
        });
        $('#abs-form', el).addEventListener('submit', (e) => {
          e.preventDefault();
          save();
        });
        el.addEventListener('keydown', (e) => {
          if (e.key !== 'Enter' || e.target.tagName === 'TEXTAREA') return;
          if (e.target.tagName === 'BUTTON' && !e.target.closest('[data-type],[data-status],[data-quick]')) return;
          e.preventDefault();
          save();
        });
        function save() {
          update();
          if (f.save.disabled) return;
          const t = S.type(draft.typeId);
          const emp = S.employee(draft.employeeId);
          const approvedNow = draft.status === 'genehmigt' && !(abs && abs.status === 'genehmigt');
          if (abs) {
            UP.timeline.focusAbs = abs.id;
            if (approvedNow) UP.timeline.flipAbs = abs.id;
            S.commit('Eintrag geändert', (data) => {
              Object.assign(data.absences.find((a) => a.id === abs.id), { ...draft, id: abs.id });
            });
            UP.app.undoToast(`${t.name} für ${emp.name} gespeichert`);
          } else {
            const id = S.uid();
            UP.timeline.flashAbs = id;
            S.commit(`${t.name} angelegt`, (data) => data.absences.push({ ...draft, id }));
            UP.app.undoToast(`${t.name} für ${emp.name}: ${D.range(draft.start, draft.end)}`);
          }
          if (approvedNow && UP.fx) UP.fx.celebrate(f.save);
          dlg.close();
        }
        update();
        f.save.focus();
      }
    });
  }

  function renderSummary(el, draft, abs, saveBtn) {
    const d = S.data;
    const emp = S.employee(draft.employeeId);
    const t = S.type(draft.typeId);
    const alerts = [];
    let ok = true;
    if (!D.valid(draft.start) || !D.valid(draft.end)) {
      ok = false;
      alerts.push(['error', 'alert', 'Bitte gültiges Start- und Enddatum angeben.']);
    } else if (draft.end < draft.start) {
      ok = false;
      alerts.push(['error', 'alert', 'Das Enddatum liegt vor dem Startdatum.']);
    } else if (D.diff(draft.start, draft.end) > 366) {
      ok = false;
      alerts.push(['error', 'alert', 'Ein Eintrag darf höchstens ein Jahr umfassen.']);
    }
    let summary = '';
    if (ok && emp) {
      const days = UP.absenceDays(draft, emp, d.settings);
      const cal = D.diff(draft.start, draft.end) + 1;
      const hols = [];
      for (let iso = draft.start; iso <= draft.end; iso = D.add(iso, 1)) {
        const h = UP.holidays.holiday(iso, { fronleichnam: d.settings.fronleichnam });
        if (h && UP.date.weekday(iso) % 6 !== 0) hols.push(h.name);
      }
      // Urlaubskonto
      let balance = '';
      const years = [];
      for (let y = +draft.start.slice(0, 4); y <= +draft.end.slice(0, 4); y++) years.push(y);
      years.forEach((y) => {
        const st = S.stats(emp, y);
        const oldIn = abs && abs.employeeId === emp.id && S.type(abs.typeId).counts ? UP.absenceDays(abs, emp, d.settings, y) : 0;
        const newIn = t.counts ? UP.absenceDays(draft, emp, d.settings, y) : 0;
        const before = st.rest + oldIn;
        const after = before - newIn;
        if (t.counts) {
          balance += `<div>Resturlaub ${y}: <b>${fd(before)}</b> → <b style="color:${after < 0 ? 'var(--danger)' : 'var(--ok)'}">${fd(after)} Tage</b></div>`;
          if (after < 0) alerts.push(['warn', 'alert', `Der Urlaubsanspruch ${y} wird um ${fd(-after)} Tag${after === -1 ? '' : 'e'} überschritten.`]);
        }
      });
      if (!t.counts) balance = `<div style="color:var(--muted)">„${esc(t.name)}“ wird nicht auf den Urlaubsanspruch angerechnet.</div>`;
      summary = `<div class="big">${fd(days)}<small>Arbeitstag${days === 1 ? '' : 'e'}</small></div>
        <div class="det"><div>${cal} Kalendertag${cal === 1 ? '' : 'e'} · ${D.fmt(draft.start, 'medium')}${cal > 1 ? ` – ${D.fmt(draft.end, 'medium')}` : ''}</div>
        ${hols.length ? `<div>enthält Feiertag${hols.length > 1 ? 'e' : ''}: ${esc(hols.join(', '))}</div>` : ''}${balance}</div>`;

      const ov = S.overlaps(emp.id, draft.start, draft.end, abs && abs.id);
      if (ov.length) {
        ok = false;
        alerts.push(['error', 'alert', `Überschneidung mit bestehendem Eintrag: ${ov.map((a) => `${esc(S.type(a.typeId).name)} ${D.range(a.start, a.end)}`).join('; ')}.`]);
      }
      if (days === 0) alerts.push(['warn', 'info', 'Der Zeitraum enthält keine Arbeitstage dieser Person.']);
      // Besetzung
      const g = S.group(emp.group);
      if (g && g.minPresent > 0 && emp.active && !draft.halfDay) {
        const low = [];
        for (let iso = draft.start; iso <= draft.end; iso = D.add(iso, 1)) {
          if (UP.dayValue(iso, emp, d.settings) === 0) continue;
          const p = S.presence(g.id, iso, { ...draft, id: abs ? abs.id : '__draft' });
          if (p.present < g.minPresent) low.push(iso);
        }
        if (low.length) alerts.push(['warn', 'users', `Mindestbesetzung ${esc(g.short || g.name)} (${g.minPresent}) unterschritten an ${low.length} Tag${low.length === 1 ? '' : 'en'}: ${compactDates(low)}.`]);
      }
      // Sperrzeiten
      (d.settings.events || [])
        .filter((ev) => ev.kind === 'sperre' && ev.start <= draft.end && ev.end >= draft.start)
        .forEach((ev) => alerts.push(['warn', 'lock', `Urlaubssperre „${esc(ev.name)}“ (${D.range(ev.start, ev.end)}).`]));
      // Weitere Abwesende
      const others = new Set();
      d.absences.forEach((a) => {
        if (a.employeeId !== emp.id && a.start <= draft.end && a.end >= draft.start) {
          const e = S.employee(a.employeeId);
          if (e && e.active) others.add(e.name);
        }
      });
      if (others.size) alerts.push(['info', 'users', `Im Zeitraum ebenfalls abwesend: ${esc([...others].join(', '))}.`]);
      const sch = UP.SCHOOL_HOLIDAYS_SN.filter((s) => s.start <= draft.end && s.end >= draft.start);
      if (sch.length) alerts.push(['info', 'school', `Fällt in: ${sch.map((s) => esc(s.name) + ' ' + D.range(s.start, s.end)).join(', ')}.`]);
    }
    $('#abs-summary', el).innerHTML = summary;
    $('#abs-summary', el).style.display = summary ? '' : 'none';
    $('#abs-alerts', el).innerHTML = alerts.map(([k, ic, m]) => `<div class="alert ${k === 'error' ? 'error' : k}">${icon(ic, 'sm')}<span>${m}</span></div>`).join('');
    saveBtn.disabled = !ok;
  }

  /* ================================================== Mitarbeitende */

  function employeesDialog() {
    let unsub;
    const renderList = (el) => {
      const d = S.data;
      const y = S.prefs.year;
      const list = d.employees
        .map((e, i) => {
          const g = S.group(e.group);
          const st = S.stats(e, y);
          const n = d.absences.filter((a) => a.employeeId === e.id).length;
          return `<div class="emp-row ${e.active ? '' : 'inactive'}">
            <div class="order"><button data-up="${i}" ${i === 0 ? 'disabled' : ''} title="Nach oben">${icon('chevron-up', 'xs')}</button><button data-down="${i}" ${i === d.employees.length - 1 ? 'disabled' : ''} title="Nach unten">${icon('chevron-down', 'xs')}</button></div>
            <span class="avatar" style="--c:${esc(g ? g.color : '#64748b')}">${esc(initials(e.name))}</span>
            <div class="nm"><b>${esc(e.name)}</b><small>${esc(e.position || '–')} · ${esc(g ? g.name : 'ohne Gruppe')} · ${fd(st.total)} T Anspruch ${y} · ${n} Einträge</small></div>
            <label class="switch" title="${e.active ? 'Aktiv' : 'Inaktiv'}"><input type="checkbox" data-active="${esc(e.id)}" ${e.active ? 'checked' : ''}><span></span></label>
            <button class="btn sm ghost icon-only" data-edit="${esc(e.id)}" title="Bearbeiten">${icon('pencil', 'sm')}</button>
            <button class="btn sm ghost icon-only" data-del="${esc(e.id)}" title="Löschen">${icon('trash', 'sm')}</button>
          </div>`;
        })
        .join('');
      $('#emp-list', el).innerHTML = list || `<div class="empty">${icon('users')}<div>Noch keine Mitarbeitenden.</div></div>`;
    };
    const dlg = openDialog({
      title: 'Mitarbeitende',
      subtitle: 'Reihenfolge, Gruppen, Urlaubsanspruch und Arbeitstage verwalten',
      size: 'lg',
      body: `<div class="edit-list" id="emp-list"></div>`,
      footer: `<span style="font-size:12px;color:var(--muted)">Inaktive Personen werden ausgeblendet und nicht in der Besetzung gezählt.</span><div class="spacer"></div><button class="btn" data-close>Schließen</button><button class="btn primary" data-add>${icon('plus', 'sm')}Person hinzufügen</button>`,
      init(el) {
        renderList(el);
        unsub = S.subscribe(() => renderList(el));
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-add')) return employeeDialog(null);
          if (b.dataset.edit) return employeeDialog(S.employee(b.dataset.edit));
          if (b.dataset.up || b.dataset.down) {
            const i = +(b.dataset.up || b.dataset.down);
            const j = b.dataset.up ? i - 1 : i + 1;
            S.commit('Reihenfolge geändert', (d) => {
              const [x] = d.employees.splice(i, 1);
              d.employees.splice(j, 0, x);
            });
          }
          if (b.dataset.del) deleteEmployee(S.employee(b.dataset.del));
        });
        el.addEventListener('change', (e) => {
          const id = e.target.dataset.active;
          if (!id) return;
          S.commit(e.target.checked ? 'Person aktiviert' : 'Person deaktiviert', (d) => {
            d.employees.find((x) => x.id === id).active = e.target.checked;
          });
        });
      },
      onClose() {
        if (unsub) unsub();
      }
    });
    return dlg;
  }

  async function deleteEmployee(emp) {
    if (!emp) return;
    const n = S.data.absences.filter((a) => a.employeeId === emp.id).length;
    const ok = await confirmDialog({
      title: `${emp.name} löschen?`,
      message: `Die Person wird mit allen ${n} Einträgen entfernt. Tipp: Statt zu löschen kann die Person auch deaktiviert werden.`,
      confirm: 'Endgültig löschen',
      danger: true
    });
    if (!ok) return;
    S.commit(`${emp.name} gelöscht`, (d) => {
      d.employees = d.employees.filter((e) => e.id !== emp.id);
      d.absences = d.absences.filter((a) => a.employeeId !== emp.id);
    });
    UP.app.undoToast(`${emp.name} gelöscht`);
  }

  function employeeDialog(emp) {
    const d = S.data;
    const y = S.prefs.year;
    const isNew = !emp;
    const e = emp
      ? JSON.parse(JSON.stringify(emp))
      : { id: S.uid(), name: '', position: '', group: (d.groups[0] || {}).id || '', entitlement: d.settings.defaultEntitlement, years: {}, workdays: [1, 2, 3, 4, 5], active: true, note: '' };
    const yr = e.years[y] || {};
    const wdLabels = [[1, 'Mo'], [2, 'Di'], [3, 'Mi'], [4, 'Do'], [5, 'Fr'], [6, 'Sa'], [0, 'So']];
    const prevRest = isNew ? null : S.stats(emp, y - 1).rest;
    const dlg = openDialog({
      title: isNew ? 'Person hinzufügen' : `${emp.name} bearbeiten`,
      subtitle: isNew ? '' : `Urlaubskonto ${y}: Rest ${fd(S.stats(emp, y).rest)} Tage`,
      body: `
        <form class="form-grid" id="emp-form" autocomplete="off">
          <div class="field"><label for="e-name">Name</label><input type="text" id="e-name" value="${esc(e.name)}" placeholder="z. B. Dr. Muster" required></div>
          <div class="field"><label for="e-pos">Position / Kürzel</label><input type="text" id="e-pos" list="pos-list" value="${esc(e.position)}" placeholder="z. B. FA, FÄ, OA, AA">
            <datalist id="pos-list"><option value="CA"><option value="OA"><option value="FA"><option value="FÄ"><option value="AA"><option value="AÄ"><option value="MTR"></datalist></div>
          <div class="field span-2"><label for="e-group">Gruppe (für Mindestbesetzung)</label><select id="e-group">${d.groups.map((g) => `<option value="${esc(g.id)}" ${g.id === e.group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select></div>
          <div class="field"><label for="e-ent">Standard-Jahresurlaub</label><input type="number" id="e-ent" min="0" max="60" step="0.5" value="${esc(e.entitlement)}"><span class="hint">Tage pro Jahr (Vorgabe für alle Jahre)</span></div>
          <div class="field"><label for="e-ent-y">Anspruch ${y} (abweichend)</label><input type="number" id="e-ent-y" min="0" max="80" step="0.5" value="${yr.entitlement != null ? esc(yr.entitlement) : ''}" placeholder="${esc(e.entitlement)}"><span class="hint">leer = Standard; z. B. bei Eintritt im Jahr</span></div>
          <div class="field span-2"><label for="e-carry">Übertrag aus ${y - 1}</label>
            <div class="inline"><input type="number" id="e-carry" min="-30" max="80" step="0.5" value="${yr.carryover != null ? esc(yr.carryover) : ''}" placeholder="0" style="max-width:140px">
            ${prevRest != null ? `<button type="button" class="btn sm" data-calc>${icon('copy', 'sm')}Rest ${y - 1} übernehmen (${fd(prevRest)} T)</button>` : ''}</div></div>
          <div class="field span-2"><span class="lbl">Arbeitstage</span><div class="wd-picker">${wdLabels.map(([v, l]) => `<label><input type="checkbox" data-wd="${v}" ${e.workdays.includes(v) ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div><span class="hint">Nur an Arbeitstagen werden Urlaubstage gezählt (z. B. Teilzeit).</span></div>
          <div class="field span-2"><label for="e-note">Notiz</label><input type="text" id="e-note" value="${esc(e.note)}" placeholder="optional"></div>
          <div class="span-2"><label class="check"><input type="checkbox" id="e-active" ${e.active ? 'checked' : ''}> Aktiv (in Planung und Besetzung berücksichtigen)</label></div>
        </form>`,
      footer: `${isNew ? '' : `<button class="btn danger" data-del>${icon('trash', 'sm')}Löschen</button>`}<div class="spacer"></div><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-save>${icon('check', 'sm')}Speichern</button>`,
      init(el) {
        const name = $('#e-name', el);
        name.focus();
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('button');
          if (!b) return;
          if (b.hasAttribute('data-calc')) $('#e-carry', el).value = Math.max(0, prevRest);
          if (b.hasAttribute('data-del')) {
            dlg.close();
            deleteEmployee(emp);
          }
          if (b.hasAttribute('data-save')) save();
        });
        $('#emp-form', el).addEventListener('submit', (ev) => {
          ev.preventDefault();
          save();
        });
        el.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') {
            ev.preventDefault();
            save();
          }
        });
        function save() {
          const nm = name.value.trim();
          if (!nm) {
            name.focus();
            toast('Bitte einen Namen eingeben.', { type: 'error' });
            return;
          }
          const wds = $$('[data-wd]', el).filter((c) => c.checked).map((c) => +c.dataset.wd);
          if (!wds.length) {
            toast('Mindestens ein Arbeitstag muss gewählt sein.', { type: 'error' });
            return;
          }
          const entY = $('#e-ent-y', el).value, carry = $('#e-carry', el).value;
          const years = { ...e.years };
          const yy = {};
          if (entY !== '') yy.entitlement = +entY;
          if (carry !== '') yy.carryover = +carry;
          if (Object.keys(yy).length) years[y] = yy;
          else delete years[y];
          const upd = {
            ...e,
            name: nm,
            position: $('#e-pos', el).value.trim(),
            group: $('#e-group', el).value,
            entitlement: +$('#e-ent', el).value || 0,
            years,
            workdays: wds,
            active: $('#e-active', el).checked,
            note: $('#e-note', el).value.trim()
          };
          S.commit(isNew ? `${nm} angelegt` : `${nm} geändert`, (data) => {
            if (isNew) data.employees.push(upd);
            else Object.assign(data.employees.find((x) => x.id === e.id), upd);
          });
          toast(isNew ? `${nm} hinzugefügt` : 'Änderungen gespeichert', { type: 'ok' });
          dlg.close();
        }
      }
    });
  }

  /* ================================================== Einstellungen */

  const SETTINGS_TABS = [
    ['allgemein', 'sliders', 'Allgemein'],
    ['darstellung', 'palette', 'Darstellung'],
    ['besetzung', 'users', 'Gruppen & Besetzung'],
    ['arten', 'flag', 'Abwesenheitsarten'],
    ['termine', 'lock', 'Sperrzeiten & Termine'],
    ['kalender', 'calendar', 'Feiertage & Ferien'],
    ['daten', 'db', 'Daten & Sicherung']
  ];

  function settingsDialog(tab = 'allgemein') {
    let cur = tab, unsub;
    const sw = (id, checked, title, sub) => `<div class="switch-row"><div class="txt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</div><label class="switch"><input type="checkbox" data-sw="${id}" ${checked ? 'checked' : ''}><span></span></label></div>`;

    const panes = {
      allgemein() {
        const s = S.data.settings;
        return `<h3>Allgemein</h3><p class="lead">Region, Zählregeln und Verhalten beim Eintragen.</p>
          <div class="section"><div class="section-title">Region</div>
            <div class="notice info" style="margin-bottom:10px">${icon('flag', 'sm')}<span>Feiertage und Schulferien für <b>Freistaat Sachsen</b> (inkl. Reformationstag und Buß- und Bettag).</span></div>
            ${sw('fronleichnam', s.fronleichnam, 'Fronleichnam als Feiertag', 'Nur in Teilen der Landkreise Bautzen und Görlitz (sorbisches Siedlungsgebiet)')}
          </div>
          <div class="section"><div class="section-title">Zählregeln</div>
            <div class="form-grid">
              <div class="field"><label>24.12. und 31.12.</label><select data-set="xmasRule">
                <option value="voll" ${s.xmasRule === 'voll' ? 'selected' : ''}>zählen als ganzer Urlaubstag</option>
                <option value="halb" ${s.xmasRule === 'halb' ? 'selected' : ''}>zählen als halber Urlaubstag</option>
                <option value="frei" ${s.xmasRule === 'frei' ? 'selected' : ''}>arbeitsfrei (zählen nicht)</option></select></div>
              <div class="field"><label>Standard-Jahresurlaub (neue Personen)</label><input type="number" min="0" max="60" step="0.5" data-set="defaultEntitlement" value="${s.defaultEntitlement}"></div>
            </div>
          </div>
          <div class="section"><div class="section-title">Eintragen</div>
            <div class="form-grid" style="margin-bottom:6px">
              <div class="field"><label>Vorausgewählte Art beim Markieren</label><select data-set="defaultType">${S.data.types.map((x) => `<option value="${esc(x.id)}" ${S.defaultTypeId() === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><span class="hint">gilt bei jedem Start der App</span></div>
              <div class="field"><label>Status neuer Einträge</label><select data-set="defaultStatus">${UP.STATUSES.map((x) => `<option value="${x.id}" ${s.defaultStatus === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></div>
            </div>
            ${sw('quickCreate', s.quickCreate, 'Schnellerfassung', 'Markierte Zeiträume in der Übersicht sofort anlegen, ohne Dialog (mit Rückgängig-Option)')}
          </div>`;
      },
      darstellung() {
        const p = S.prefs;
        return `<h3>Darstellung</h3><p class="lead">Diese Einstellungen gelten nur für diesen Browser.</p>
          <div class="section"><div class="section-title">Farbschema</div>
            <div class="seg" id="theme-seg">${[['auto', 'monitor', 'System'], ['light', 'sun', 'Hell'], ['dark', 'moon', 'Dunkel']].map(([v, ic, l]) => `<button data-theme-set="${v}" aria-pressed="${p.theme === v}">${icon(ic, 'sm')}${l}</button>`).join('')}</div></div>
          <div class="section"><div class="section-title">Zeilenhöhe</div>
            <div class="seg">${[['comfort', 'Komfortabel'], ['compact', 'Kompakt']].map(([v, l]) => `<button data-density="${v}" aria-pressed="${p.density === v}">${l}</button>`).join('')}</div></div>
          <div class="section"><div class="section-title">Einblendungen</div>
            ${sw('p:showSchool', p.showSchool, 'Schulferien Sachsen', 'Farbige Bänder und Spaltenhinterlegung')}
            ${sw('p:showBridges', p.showBridges, 'Brückentage markieren', 'Grüner Punkt an Tagen mit hoher Urlaubseffizienz')}
            ${sw('p:showKW', p.showKW, 'Kalenderwochen', 'Zeile mit KW-Nummern in der Übersicht')}
            ${sw('p:showInactive', p.showInactive, 'Inaktive Personen anzeigen', '')}
            ${sw('p:effects', p.effects !== false, 'Animationen & 3D-Effekte', 'Bewegter Hintergrund, Tilt-Effekte, Konfetti beim Genehmigen')}
          </div>`;
      },
      besetzung() {
        const rows = S.data.groups
          .map(
            (g, i) => `<div class="edit-row">
            <input type="color" data-g="${i}" data-k="color" value="${esc(g.color)}" title="Farbe">
            <input class="input sm grow" data-g="${i}" data-k="name" value="${esc(g.name)}" placeholder="Name">
            <input class="input sm w-s" data-g="${i}" data-k="short" value="${esc(g.short)}" placeholder="Kürzel" maxlength="4">
            <input class="input sm w-s" type="number" min="0" max="99" data-g="${i}" data-k="minPresent" value="${g.minPresent}" title="Mindestens anwesend">
            <span class="badge">${S.data.employees.filter((e) => e.group === g.id).length} Pers.</span>
            <button class="btn sm ghost icon-only" data-gdel="${i}" title="Gruppe löschen">${icon('trash', 'sm')}</button></div>`
          )
          .join('');
        return `<h3>Gruppen &amp; Mindestbesetzung</h3><p class="lead">Je Gruppe wird in der Übersicht täglich die Anzahl anwesender Personen angezeigt. Wird die Mindestbesetzung unterschritten, erscheint eine Warnung.</p>
          <div class="edit-list"><div class="edit-head"><span style="width:34px"></span><span class="grow">Name</span><span class="w-s">Kürzel</span><span class="w-s">Min.</span><span style="width:110px"></span></div>${rows}</div>
          <div style="margin-top:10px"><button class="btn sm" data-gadd>${icon('plus', 'sm')}Gruppe hinzufügen</button></div>`;
      },
      arten() {
        const rows = S.data.types
          .map(
            (t, i) => `<div class="edit-row">
            <input type="color" data-t="${i}" data-k="color" value="${esc(t.color)}" title="Farbe">
            <input class="input sm grow" data-t="${i}" data-k="name" value="${esc(t.name)}" placeholder="Bezeichnung">
            <input class="input sm w-s" data-t="${i}" data-k="short" value="${esc(t.short)}" placeholder="Kürzel" maxlength="3">
            <label class="check" style="width:150px;font-size:12.5px"><input type="checkbox" data-t="${i}" data-k="counts" ${t.counts ? 'checked' : ''}> zählt als Urlaub</label>
            <button class="btn sm ghost icon-only" data-tdel="${i}" title="Löschen" ${S.data.types.length < 2 ? 'disabled' : ''}>${icon('trash', 'sm')}</button></div>`
          )
          .join('');
        return `<h3>Abwesenheitsarten</h3><p class="lead">Farben und Kürzel erscheinen in Übersicht, Kalender und Druck. Nur Arten mit „zählt als Urlaub“ werden vom Anspruch abgezogen. Tastenkürzel 1–9 wählen die Art zum Eintragen.</p>
          <div class="edit-list"><div class="edit-head"><span style="width:34px"></span><span class="grow">Bezeichnung</span><span class="w-s">Kürzel</span><span style="width:190px"></span></div>${rows}</div>
          <div style="margin-top:10px"><button class="btn sm" data-tadd>${icon('plus', 'sm')}Art hinzufügen</button></div>`;
      },
      termine() {
        const evs = S.data.settings.events;
        const rows = evs
          .map(
            (ev, i) => `<div class="edit-row">
            <input class="input sm grow" data-ev="${i}" data-k="name" value="${esc(ev.name)}" placeholder="Bezeichnung">
            <input class="input sm w-date" type="date" data-ev="${i}" data-k="start" value="${ev.start}">
            <input class="input sm w-date" type="date" data-ev="${i}" data-k="end" value="${ev.end}">
            <select class="input sm w-m" data-ev="${i}" data-k="kind"><option value="sperre" ${ev.kind === 'sperre' ? 'selected' : ''}>Urlaubssperre</option><option value="info" ${ev.kind !== 'sperre' ? 'selected' : ''}>Termin / Hinweis</option></select>
            <button class="btn sm ghost icon-only" data-evdel="${i}" title="Löschen">${icon('trash', 'sm')}</button></div>`
          )
          .join('');
        return `<h3>Sperrzeiten &amp; Termine</h3><p class="lead">Urlaubssperren werden schraffiert hinterlegt und beim Eintragen gewarnt. Termine (z. B. Audit, Umzug, Gerätewechsel) erscheinen als Band in der Übersicht.</p>
          ${rows ? `<div class="edit-list">${rows}</div>` : `<div class="empty" style="padding:20px">${icon('lock')}<div>Noch keine Sperrzeiten oder Termine.</div></div>`}
          <div style="margin-top:10px"><button class="btn sm" data-evadd>${icon('plus', 'sm')}Eintrag hinzufügen</button></div>`;
      },
      kalender() {
        const y = S.prefs.year;
        const Y = UP.viewHelpers.year();
        return `<h3>Feiertage &amp; Schulferien ${y}</h3><p class="lead">Gesetzliche Feiertage werden für jedes Jahr berechnet. Schulferien: amtliche Termine des Sächsischen Staatsministeriums für Kultus (bis Sommer 2030 hinterlegt).</p>
          <div class="section"><div class="section-title">Gesetzliche Feiertage</div><ul class="dlist">${Y.holidays.map((h) => `<li><span class="mark hol"></span><span class="when">${D.fmt(h.date, 'medium')}</span><span class="what">${esc(h.name)}</span></li>`).join('')}</ul></div>
          <div class="section"><div class="section-title">Schulferien</div><ul class="dlist">${Y.school.map((s) => `<li><span class="mark sch"></span><span class="when">${D.range(s.start, s.end)}</span><span class="what">${esc(s.name)}</span></li>`).join('') || '<li>Keine Daten verfügbar.</li>'}</ul></div>`;
      },
      daten() {
        const n = S.data.absences.length;
        let size = 0;
        try {
          size = (localStorage.getItem('urlaubsplaner.data.v1') || '').length;
        } catch (e) {
          /* */
        }
        return `<h3>Daten &amp; Sicherung</h3><p class="lead">Alle Daten werden automatisch lokal in diesem Browser gespeichert (${S.data.employees.length} Personen, ${n} Einträge, ${(size / 1024).toFixed(1)} KB). Für die gemeinsame Nutzung oder einen Gerätewechsel eine Sicherung exportieren und dort importieren.</p>
          <div class="section"><div class="section-title">Sicherung</div><div class="inline">
            <button class="btn" data-io="export">${icon('download', 'sm')}Sicherung exportieren (.json)</button>
            <button class="btn" data-io="import">${icon('upload', 'sm')}Sicherung importieren</button></div></div>
          <div class="section"><div class="section-title">Export</div><div class="inline">
            <button class="btn" data-io="csv">${icon('file', 'sm')}Einträge als CSV (Excel)</button>
            <button class="btn" data-io="csvstats">${icon('file', 'sm')}Urlaubskonten als CSV</button>
            <button class="btn" data-io="ics">${icon('calendar', 'sm')}Kalenderdatei (.ics)</button></div></div>
          <div class="section"><div class="section-title">Beispiel &amp; Zurücksetzen</div><div class="inline">
            <button class="btn" data-io="demo">${icon('bulb', 'sm')}Beispieleinträge ${S.prefs.year} erzeugen</button>
            <button class="btn danger" data-io="reset">${icon('trash', 'sm')}Alle Daten zurücksetzen</button></div></div>`;
      }
    };

    const dlg = openDialog({
      title: 'Einstellungen',
      size: 'xl',
      raw: true,
      body: `<div class="settings"><nav role="tablist">${SETTINGS_TABS.map(([id, ic, l]) => `<button role="tab" data-tab="${id}">${icon(ic, 'sm')}${l}</button>`).join('')}</nav><div class="pane" id="set-pane"></div></div>`,
      footer: `<span style="font-size:12px;color:var(--muted)">Änderungen werden sofort übernommen und können mit Strg+Z rückgängig gemacht werden.</span><div class="spacer"></div><button class="btn primary" data-close>Fertig</button>`,
      init(el) {
        const pane = $('#set-pane', el);
        const show = (t, keepScroll) => {
          cur = t;
          const st = pane.scrollTop;
          $$('[data-tab]', el).forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
          pane.innerHTML = panes[t]();
          if (keepScroll) pane.scrollTop = st;
        };
        show(cur);
        unsub = S.subscribe(() => {
          // Nicht neu rendern, während ein Textfeld bearbeitet wird
          const a = document.activeElement;
          if (a && pane.contains(a) && (a.type === 'text' || a.type === 'number' || a.type === 'date' || a.type === 'color')) return;
          show(cur, true);
        });
        el.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          if (b.dataset.tab) return show(b.dataset.tab);
          if (b.dataset.themeSet) return UP.app.setTheme(b.dataset.themeSet);
          if (b.dataset.density) {
            S.setPref('density', b.dataset.density);
            document.documentElement.dataset.density = b.dataset.density;
            return;
          }
          if (b.hasAttribute('data-gadd')) S.commit('Gruppe hinzugefügt', (d) => d.groups.push({ id: S.uid(), name: 'Neue Gruppe', short: 'NG', color: '#8a4fd1', minPresent: 0 }));
          if (b.dataset.gdel) {
            const g = S.data.groups[+b.dataset.gdel];
            if (S.data.employees.some((x) => x.group === g.id)) return toast('Gruppe enthält noch Personen – bitte zuerst umziehen.', { type: 'error' });
            S.commit('Gruppe gelöscht', (d) => d.groups.splice(+b.dataset.gdel, 1));
          }
          if (b.hasAttribute('data-tadd')) S.commit('Art hinzugefügt', (d) => d.types.push({ id: S.uid(), name: 'Neue Art', short: 'N', color: '#0ea5e9', counts: false }));
          if (b.dataset.tdel) {
            const t = S.data.types[+b.dataset.tdel];
            const n = S.data.absences.filter((a) => a.typeId === t.id).length;
            confirmDialog({ title: `„${t.name}“ löschen?`, message: n ? `${n} Einträge dieser Art werden in „${S.data.types.find((x) => x.id !== t.id).name}“ umgewandelt.` : 'Die Art wird entfernt.', confirm: 'Löschen', danger: true }).then((ok) => {
              if (!ok) return;
              S.commit('Art gelöscht', (d) => {
                const fallback = d.types.find((x) => x.id !== t.id).id;
                d.types = d.types.filter((x) => x.id !== t.id);
                d.absences.forEach((a) => a.typeId === t.id && (a.typeId = fallback));
              });
              if (S.prefs.brush === t.id) S.setPref('brush', S.defaultTypeId());
            });
          }
          if (b.hasAttribute('data-evadd')) {
            const y = S.prefs.year;
            S.commit('Termin hinzugefügt', (d) => d.settings.events.push({ id: S.uid(), name: 'Urlaubssperre', start: `${y}-12-01`, end: `${y}-12-05`, kind: 'sperre' }));
          }
          if (b.dataset.evdel) S.commit('Termin gelöscht', (d) => d.settings.events.splice(+b.dataset.evdel, 1));
          if (b.dataset.io) UP.io.action(b.dataset.io);
        });
        el.addEventListener('change', (e) => {
          const t = e.target;
          if (t.dataset.sw) {
            const k = t.dataset.sw;
            if (k.startsWith('p:')) S.setPref(k.slice(2), t.checked);
            else S.commit('Einstellung geändert', (d) => (d.settings[k] = t.checked));
            return;
          }
          if (t.dataset.set) {
            const k = t.dataset.set;
            const v = t.type === 'number' ? +t.value : t.value;
            S.commit('Einstellung geändert', (d) => (d.settings[k] = v));
            if (k === 'defaultType') S.setPref('brush', v);
            return;
          }
          const k = t.dataset.k;
          if (t.dataset.g != null) {
            S.commit('Gruppe geändert', (d) => {
              const g = d.groups[+t.dataset.g];
              g[k] = k === 'minPresent' ? Math.max(0, +t.value || 0) : t.value;
            });
          } else if (t.dataset.t != null) {
            S.commit('Abwesenheitsart geändert', (d) => {
              const ty = d.types[+t.dataset.t];
              ty[k] = k === 'counts' ? t.checked : t.value;
            });
          } else if (t.dataset.ev != null) {
            S.commit('Termin geändert', (d) => {
              const ev = d.settings.events[+t.dataset.ev];
              ev[k] = t.value;
              if (D.valid(ev.start) && D.valid(ev.end) && ev.end < ev.start) ev.end = ev.start;
            });
          }
          show(cur, true);
        });
      },
      onClose() {
        if (unsub) unsub();
      }
    });
  }

  /* ================================================== Hilfe */

  function helpDialog() {
    const k = (...keys) => `<span class="keys">${keys.map((x) => `<kbd>${x}</kbd>`).join('')}</span>`;
    openDialog({
      title: 'Hilfe & Tastenkürzel',
      size: 'lg',
      body: `
        <div class="help-steps">
          <div class="help-step"><b><span class="n">1</span>Art wählen</b>Oben die Abwesenheitsart anklicken (oder Taste 1–9).</div>
          <div class="help-step"><b><span class="n">2</span>Zeitraum ziehen</b>In der Zeile einer Person mit gedrückter Maustaste über die Tage ziehen.</div>
          <div class="help-step"><b><span class="n">3</span>Anpassen</b>Balken verschieben, an den Rändern verlängern, Rechtsklick für Status &amp; Art.</div>
        </div>
        <div class="shortcuts">
          <div>Neuer Eintrag ${k('N')}</div>
          <div>Rückgängig ${k('Strg', 'Z')}</div>
          <div>Wiederholen ${k('Strg', 'Y')}</div>
          <div>Vorjahr / Folgejahr ${k('Alt', '←')}${k('Alt', '→')}</div>
          <div>Zu heute springen ${k('T')}</div>
          <div>Ganzes Jahr ein/aus ${k('G')}</div>
          <div>Horizontal scrollen ${k('←')}${k('→')} Woche</div>
          <div>Monat vor / zurück ${k('⇧', '←')}${k('⇧', '→')}</div>
          <div>Jahresanfang / -ende ${k('Pos1')}${k('Ende')}</div>
          <div>Scrollen mit Mausrad ${k('Rad')} / ${k('⇧', 'Rad')}</div>
          <div>Ansicht ziehen: Kopfzeile oder ${k('Mitteltaste')}</div>
          <div>Ansicht: Übersicht ${k('Z')}</div>
          <div>Ansicht: Kalender ${k('K')}</div>
          <div>Ansicht: Auswertung ${k('A')}</div>
          <div>Abwesenheitsart wählen ${k('1')}…${k('9')}</div>
          <div>Vergrößern / Verkleinern ${k('+')}${k('−')}</div>
          <div>Zoomen mit Mausrad ${k('Strg', 'Rad')}</div>
          <div>Suche ${k('/')}</div>
          <div>Drucken ${k('Strg', 'P')}</div>
          <div>Eintrag (fokussiert) verschieben ${k('←')}${k('→')}</div>
          <div>Eintrag verlängern / kürzen ${k('⇧', '←')}${k('⇧', '→')}</div>
          <div>Eintrag öffnen / löschen ${k('↵')}${k('Entf')}</div>
          <div>Diese Hilfe ${k('?')}</div>
        </div>
        <div class="alerts" style="margin-top:16px">
          <div class="alert info">${icon('info', 'sm')}<span><b>Status:</b> Geplant (umrandet), Beantragt (schraffiert), Genehmigt (vollflächig). Aufgehellte Felder innerhalb eines Balkens sind Wochenenden/Feiertage und zählen nicht als Urlaubstage.</span></div>
          <div class="alert info">${icon('db', 'sm')}<span><b>Speicherung:</b> Automatisch im Browser. Über „Export“ eine Sicherung erstellen, um Daten zu teilen oder zu archivieren.</span></div>
        </div>`,
      footer: `<div class="spacer"></div><button class="btn primary" data-close>Verstanden</button>`
    });
  }

  /* ================================================== Import / Export */

  const csvCell = (v) => {
    const s = String(v == null ? '' : v);
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = (rows) => '\ufeff' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
  const stamp = () => D.today();

  const IO = (UP.io = {
    action(k) {
      ({ export: IO.exportJSON, import: IO.importJSON, csv: IO.csvAbsences, csvstats: IO.csvStats, ics: IO.ics, print: IO.print, demo: IO.demo, reset: IO.reset })[k]();
    },
    exportJSON() {
      download(`urlaubsplaner-sicherung-${stamp()}.json`, S.exportJSON(), 'application/json');
      toast('Sicherung wurde heruntergeladen.', { type: 'ok' });
    },
    importJSON() {
      const inp = $('#file-import');
      inp.value = '';
      inp.onchange = () => {
        const file = inp.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = async () => {
          try {
            const raw = JSON.parse(r.result);
            const nd = S.normalize(raw);
            const ok = await confirmDialog({
              title: 'Sicherung importieren?',
              message: `„${esc(file.name)}“ enthält ${nd.employees.length} Personen und ${nd.absences.length} Einträge. Die aktuellen Daten werden ersetzt (rückgängig machbar).`,
              confirm: 'Importieren'
            });
            if (!ok) return;
            S.replaceData(raw);
            UP.app.undoToast('Sicherung importiert');
          } catch (e) {
            toast(`Import fehlgeschlagen: ${e.message}`, { type: 'error' });
          }
        };
        r.readAsText(file);
      };
      inp.click();
    },
    csvAbsences() {
      const y = S.prefs.year;
      const rows = [['Mitarbeiter/in', 'Position', 'Gruppe', 'Art', 'Status', 'Von', 'Bis', 'Arbeitstage', 'Arbeitstage ' + y, 'Halber Tag', 'Notiz']];
      S.absencesInYear(y)
        .sort((a, b) => (a.start < b.start ? -1 : 1))
        .forEach((a) => {
          const e = S.employee(a.employeeId), t = S.type(a.typeId), g = S.group(e.group);
          rows.push([e.name, e.position, g ? g.name : '', t.name, cap(a.status), D.fmt(a.start), D.fmt(a.end), fd(UP.absenceDays(a, e, S.data.settings)), fd(UP.absenceDays(a, e, S.data.settings, y)), a.halfDay ? 'ja' : '', a.note]);
        });
      download(`urlaubsplanung-${y}-eintraege.csv`, csv(rows), 'text/csv;charset=utf-8');
      toast('CSV-Export erstellt.', { type: 'ok' });
    },
    csvStats() {
      const y = S.prefs.year;
      const types = S.data.types;
      const rows = [['Mitarbeiter/in', 'Position', 'Gruppe', 'Anspruch', 'Übertrag', 'Gesamt', 'Genehmigt', 'Beantragt', 'Geplant', 'Rest', ...types.filter((t) => !t.counts).map((t) => t.name)]];
      S.data.employees.forEach((e) => {
        const st = S.stats(e, y), g = S.group(e.group);
        rows.push([e.name, e.position, g ? g.name : '', fd(st.entitlement), fd(st.carryover), fd(st.total), fd(st.genehmigt), fd(st.beantragt), fd(st.geplant), fd(st.rest), ...types.filter((t) => !t.counts).map((t) => fd(st.byType[t.id] || 0))]);
      });
      download(`urlaubskonten-${y}.csv`, csv(rows), 'text/csv;charset=utf-8');
      toast('CSV-Export erstellt.', { type: 'ok' });
    },
    ics() {
      const y = S.prefs.year;
      const e2 = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
      const dt = (iso) => iso.replace(/-/g, '');
      const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
      const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Urlaubsplaner Sachsen//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:Urlaubsplanung ${y}`];
      S.absencesInYear(y).forEach((a) => {
        const e = S.employee(a.employeeId), t = S.type(a.typeId);
        lines.push('BEGIN:VEVENT', `UID:${a.id}@urlaubsplaner`, `DTSTAMP:${now}`, `DTSTART;VALUE=DATE:${dt(a.start)}`, `DTEND;VALUE=DATE:${dt(D.add(a.end, 1))}`,
          `SUMMARY:${e2(`${e.name} – ${t.name}${a.halfDay ? ' (½)' : ''}`)}`, `DESCRIPTION:${e2(`Status: ${cap(a.status)}${a.note ? '\n' + a.note : ''}`)}`, 'TRANSP:TRANSPARENT', `CATEGORIES:${e2(t.name)}`, 'END:VEVENT');
      });
      lines.push('END:VCALENDAR');
      download(`urlaubsplanung-${y}.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8');
      toast('Kalenderdatei erstellt.', { type: 'ok' });
    },
    async reset() {
      const ok = await confirmDialog({ title: 'Alle Daten zurücksetzen?', message: 'Alle Einträge, Einstellungen und Änderungen an Mitarbeitenden werden auf den Ausgangszustand gesetzt. Dies kann mit Strg+Z rückgängig gemacht werden.', confirm: 'Zurücksetzen', danger: true });
      if (!ok) return;
      S.resetData();
      UP.app.undoToast('Daten zurückgesetzt');
    },
    /** Erzeugt plausible Beispieleinträge für das aktuelle Jahr */
    demo() {
      const y = S.prefs.year;
      let seed = y * 7919;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
      const statuses = ['genehmigt', 'genehmigt', 'genehmigt', 'beantragt', 'geplant'];
      const created = [];
      S.commit(`Beispieleinträge ${y} erzeugt`, (d) => {
        const busy = (empId, s, e) => d.absences.concat(created).some((a) => a.employeeId === empId && a.start <= e && a.end >= s);
        const monday = (iso) => D.add(iso, -((D.weekday(iso) + 6) % 7));
        d.employees.filter((e) => e.active).forEach((e, idx) => {
          const plans = [
            [6, 7, 2], [1, 3, 1], [9, 10, 1], [4, 5, 1]
          ];
          plans.forEach(([m1, m2, weeks], k) => {
            for (let tries = 0; tries < 8; tries++) {
              const m = m1 + Math.floor(rnd() * (m2 - m1 + 1));
              const start = monday(D.iso(y, m, 1 + Math.floor(rnd() * 24)));
              if (!start.startsWith(String(y))) continue;
              const end = D.add(start, 7 * weeks - 3);
              if (busy(e.id, D.add(start, -3), D.add(end, 3))) continue;
              created.push({ id: S.uid(), employeeId: e.id, typeId: 'urlaub', start, end, halfDay: false, status: k === 0 && idx % 4 === 1 ? 'beantragt' : pick(statuses), note: '' });
              break;
            }
          });
          // Brückentag nutzen
          const Y = UP.buildYear(y, d.settings);
          const br = Y.bridges[(idx * 3) % Math.max(1, Y.bridges.length)];
          if (br && !busy(e.id, br.days[0], br.days[br.days.length - 1])) created.push({ id: S.uid(), employeeId: e.id, typeId: 'urlaub', start: br.days[0], end: br.days[br.days.length - 1], halfDay: false, status: 'genehmigt', note: 'Brückentag' });
          // Fortbildung
          if (rnd() < 0.75) {
            const s = D.add(monday(D.iso(y, Math.floor(rnd() * 11), 1 + Math.floor(rnd() * 20))), 2);
            const en = D.add(s, Math.floor(rnd() * 3));
            if (s.startsWith(String(y)) && !busy(e.id, s, en)) created.push({ id: S.uid(), employeeId: e.id, typeId: 'fortbildung', start: s, end: en, halfDay: false, status: 'genehmigt', note: pick(['RSNA', 'Deutscher Röntgenkongress', 'MRT-Refresher', 'Interventionskurs', 'DeGIR-Kurs']) });
          }
        });
        d.absences.push(...created);
      });
      UP.app.undoToast(`${created.length} Beispieleinträge erzeugt`);
    },

    /** Druck: Übersicht quartalsweise als Tabelle, andere Ansichten direkt */
    print() {
      if (S.prefs.view !== 'timeline') {
        window.print();
        return;
      }
      const d = S.data;
      const Y = UP.viewHelpers.year();
      const groups = UP.viewHelpers.groups();
      const absIdx = new Map();
      groups.forEach(({ emps }) =>
        emps.forEach((e) => {
          const arr = new Array(Y.n).fill(null);
          S.absencesOf(e.id, Y.y).forEach((a) => {
            const i0 = Math.max(0, D.diff(Y.start, a.start)), i1 = Math.min(Y.n - 1, D.diff(Y.start, a.end));
            for (let i = i0; i <= i1; i++) arr[i] = a;
          });
          absIdx.set(e.id, arr);
        })
      );
      let html = '';
      for (let q = 0; q < 4; q++) {
        const ms = Y.months.slice(q * 3, q * 3 + 3);
        const from = ms[0].start, to = ms[2].start + ms[2].len - 1;
        const range = Y.days.slice(from, to + 1);
        const cls = (day) => (day.holiday ? 'hol' : day.weekend ? 'we' : S.prefs.showSchool && day.school ? 'sch' : '');
        let thead = `<tr><th class="nm"></th>${ms.map((m) => `<th class="mo" colspan="${m.len}">${D.MONTHS[m.m]} ${Y.y}</th>`).join('')}</tr>`;
        thead += `<tr><th class="nm">Mitarbeiter/in</th>${range.map((day) => `<th class="${cls(day)}">${day.d}</th>`).join('')}</tr>`;
        thead += `<tr><th class="nm">Wochentag</th>${range.map((day) => `<th class="${cls(day)}">${D.WD_LETTER[day.wd]}</th>`).join('')}</tr>`;
        let tbody = '';
        groups.forEach(({ g, emps }) => {
          tbody += `<tr><td class="nm" colspan="${range.length + 1}" style="background:#f1f3f6;font-size:8px;text-transform:uppercase;letter-spacing:.05em">${esc(g.name)}</td></tr>`;
          emps.forEach((e) => {
            const arr = absIdx.get(e.id);
            tbody += `<tr><td class="nm">${esc(e.name)}</td>${range
              .map((day) => {
                const a = arr[day.i];
                if (a && !day.holiday && UP.dayValue(day.iso, e, d.settings) > 0) {
                  const t = S.type(a.typeId);
                  return `<td class="a ${a.status}" style="background:${esc(t.color)}">${esc(a.halfDay ? '½' : t.short)}</td>`;
                }
                return `<td class="${cls(day)}"></td>`;
              })
              .join('')}</tr>`;
          });
        });
        html += `<section class="pr-page"><div class="pr-head"><h1>Urlaubsplanung ${Y.y} · ${q + 1}. Quartal</h1><span>Sachsen · Stand ${D.fmt(D.today())}</span></div>
          <table class="pr"><thead>${thead}</thead><tbody>${tbody}</tbody></table>
          <div class="pr-legend">${d.types.map((t) => `<span><i style="background:${esc(t.color)}"></i>${esc(t.short)} = ${esc(t.name)}</span>`).join('')}
            <span><i style="background:#f9d3d6"></i>Feiertag</span><span><i style="background:#fbeec4"></i>Schulferien</span><span><i style="background:#eceef2"></i>Wochenende</span><span>blass = geplant</span></div></section>`;
      }
      $('#print-root').innerHTML = html;
      document.body.classList.add('print-timeline');
      const done = () => {
        document.body.classList.remove('print-timeline');
        $('#print-root').innerHTML = '';
        window.removeEventListener('afterprint', done);
      };
      window.addEventListener('afterprint', done);
      setTimeout(() => window.print(), 50);
    }
  });

  UP.dialogs = { absence: absenceDialog, employees: employeesDialog, employee: employeeDialog, settings: settingsDialog, help: helpDialog };
})(window.UP = window.UP || {});
