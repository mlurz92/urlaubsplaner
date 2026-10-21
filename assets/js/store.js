/*
 * Zustandsverwaltung: Daten (rückgängig machbar) und Ansichtseinstellungen,
 * Speicherung im localStorage, Import/Export-Validierung, Statistiken.
 */
(function (UP) {
  'use strict';

  const D = UP.date;
  const DATA_KEY = 'urlaubsplaner.data.v1';
  const PREFS_KEY = 'urlaubsplaner.prefs.v1';
  const SCHEMA = 1;
  const MAX_HISTORY = 100;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function defaultData() {
    return {
      schema: SCHEMA,
      settings: {
        fronleichnam: false,
        xmasRule: 'voll',
        defaultEntitlement: 30,
        defaultStatus: 'geplant',
        quickCreate: false,
        events: []
      },
      groups: clone(UP.DEFAULT_GROUPS),
      types: clone(UP.DEFAULT_TYPES),
      employees: UP.DEFAULT_EMPLOYEES.map((e) => ({
        id: uid(),
        name: e.name,
        position: e.position,
        group: e.group,
        entitlement: 30,
        years: {},
        workdays: [1, 2, 3, 4, 5],
        active: true,
        note: ''
      })),
      absences: []
    };
  }

  function defaultPrefs() {
    return {
      year: new Date().getFullYear(),
      view: 'timeline',
      v: 3,
      zoom: 28,
      fit: false,
      theme: 'auto',
      density: 'comfort',
      brush: 'urlaub',
      groupFilter: 'all',
      search: '',
      showKW: true,
      showSchool: true,
      showBridges: true,
      showInactive: false,
      collapsed: {},
      calPerson: 'all',
      statsSort: { key: 'order', dir: 1 },
      listFilter: 'all'
    };
  }

  /** Prüft und ergänzt importierte bzw. gespeicherte Daten */
  function normalize(raw) {
    const def = defaultData();
    if (!raw || typeof raw !== 'object') throw new Error('Ungültiges Datenformat');
    if (!Array.isArray(raw.employees) || !Array.isArray(raw.absences)) {
      throw new Error('Die Datei enthält keine Mitarbeitenden bzw. Abwesenheiten.');
    }
    const d = {
      schema: SCHEMA,
      settings: { ...def.settings, ...(raw.settings || {}) },
      groups: Array.isArray(raw.groups) && raw.groups.length ? raw.groups : def.groups,
      types: Array.isArray(raw.types) && raw.types.length ? raw.types : def.types,
      employees: raw.employees,
      absences: raw.absences
    };
    if (!Array.isArray(d.settings.events)) d.settings.events = [];
    d.settings.events = d.settings.events.filter((e) => e && D.valid(e.start) && D.valid(e.end));
    d.groups = d.groups.map((g) => ({ id: String(g.id || uid()), name: String(g.name || 'Gruppe'), short: String(g.short || ''), color: g.color || '#64748b', minPresent: Math.max(0, +g.minPresent || 0) }));
    d.types = d.types.map((t) => ({ id: String(t.id || uid()), name: String(t.name || 'Abwesenheit'), short: String(t.short || '?').slice(0, 3), color: t.color || '#64748b', counts: !!t.counts }));
    d.employees = d.employees.map((e) => ({
      id: String(e.id || uid()),
      name: String(e.name || 'Unbenannt'),
      position: String(e.position || ''),
      group: String(e.group || (d.groups[0] && d.groups[0].id) || ''),
      entitlement: Number.isFinite(+e.entitlement) ? +e.entitlement : 30,
      years: e.years && typeof e.years === 'object' ? e.years : {},
      workdays: Array.isArray(e.workdays) && e.workdays.length ? e.workdays.map(Number) : [1, 2, 3, 4, 5],
      active: e.active !== false,
      note: String(e.note || '')
    }));
    const empIds = new Set(d.employees.map((e) => e.id));
    const typeIds = new Set(d.types.map((t) => t.id));
    d.absences = d.absences
      .filter((a) => a && empIds.has(String(a.employeeId)) && D.valid(a.start) && D.valid(a.end))
      .map((a) => ({
        id: String(a.id || uid()),
        employeeId: String(a.employeeId),
        typeId: typeIds.has(a.typeId) ? a.typeId : d.types[0].id,
        start: a.start <= a.end ? a.start : a.end,
        end: a.start <= a.end ? a.end : a.start,
        halfDay: !!a.halfDay && a.start === a.end,
        status: ['geplant', 'beantragt', 'genehmigt'].includes(a.status) ? a.status : 'geplant',
        note: String(a.note || '')
      }));
    return d;
  }

  let data, prefs;
  const undoStack = [], redoStack = [];
  const listeners = new Set();
  let storageOk = true;

  function load() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      data = raw ? normalize(JSON.parse(raw)) : defaultData();
    } catch (e) {
      console.warn('Daten konnten nicht geladen werden', e);
      data = defaultData();
    }
    try {
      const raw = localStorage.getItem(PREFS_KEY);
      const saved = raw ? JSON.parse(raw) : {};
      prefs = { ...defaultPrefs(), ...saved };
      // v3: Übersicht startet tageweise und horizontal scrollbar statt „Ganzes Jahr“
      if (raw && !(saved.v >= 3)) Object.assign(prefs, { v: 3, fit: false, zoom: 28 });
    } catch (e) {
      prefs = defaultPrefs();
    }
  }

  function persist() {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      storageOk = true;
    } catch (e) {
      storageOk = false;
      console.error(e);
    }
  }
  function persistPrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch (e) {
      /* nicht kritisch */
    }
  }

  function emit(kind) {
    listeners.forEach((fn) => fn(kind));
  }

  const S = (UP.store = {
    uid,
    get data() {
      return data;
    },
    get prefs() {
      return prefs;
    },
    get storageOk() {
      return storageOk;
    },
    init() {
      load();
      persist();
      window.addEventListener('storage', (ev) => {
        if (ev.key === DATA_KEY && ev.newValue) {
          try {
            data = normalize(JSON.parse(ev.newValue));
            emit('data');
          } catch (e) {
            /* ignorieren */
          }
        }
      });
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    /** Datenänderung mit Undo-Eintrag */
    commit(label, fn) {
      const before = JSON.stringify(data);
      const result = fn(data);
      if (JSON.stringify(data) === before) return result;
      undoStack.push({ label, snap: before });
      if (undoStack.length > MAX_HISTORY) undoStack.shift();
      redoStack.length = 0;
      persist();
      emit('data');
      return result;
    },
    undo() {
      const e = undoStack.pop();
      if (!e) return null;
      redoStack.push({ label: e.label, snap: JSON.stringify(data) });
      data = JSON.parse(e.snap);
      persist();
      emit('data');
      return e.label;
    },
    redo() {
      const e = redoStack.pop();
      if (!e) return null;
      undoStack.push({ label: e.label, snap: JSON.stringify(data) });
      data = JSON.parse(e.snap);
      persist();
      emit('data');
      return e.label;
    },
    get canUndo() {
      return undoStack.length > 0;
    },
    get canRedo() {
      return redoStack.length > 0;
    },
    get undoLabel() {
      return undoStack.length ? undoStack[undoStack.length - 1].label : '';
    },
    get redoLabel() {
      return redoStack.length ? redoStack[redoStack.length - 1].label : '';
    },
    setPref(key, value) {
      if (prefs[key] === value) return;
      prefs[key] = value;
      persistPrefs();
      emit('prefs');
    },
    setPrefs(obj) {
      Object.assign(prefs, obj);
      persistPrefs();
      emit('prefs');
    },
    replaceData(raw, label = 'Daten importiert') {
      const nd = normalize(raw);
      S.commit(label, (d) => {
        Object.keys(d).forEach((k) => delete d[k]);
        Object.assign(d, nd);
      });
    },
    resetData() {
      S.commit('Alle Daten zurückgesetzt', (d) => {
        const nd = defaultData();
        Object.keys(d).forEach((k) => delete d[k]);
        Object.assign(d, nd);
      });
    },
    exportJSON() {
      return JSON.stringify({ app: 'urlaubsplaner', exportedAt: new Date().toISOString(), ...data }, null, 2);
    },
    normalize,

    /* ---------------------------------------------------------- Abfragen */
    employee(id) {
      return data.employees.find((e) => e.id === id) || null;
    },
    type(id) {
      return data.types.find((t) => t.id === id) || data.types[0];
    },
    group(id) {
      return data.groups.find((g) => g.id === id) || null;
    },
    absencesOf(empId, y) {
      return data.absences
        .filter((a) => a.employeeId === empId && (!y || (a.end >= `${y}-01-01` && a.start <= `${y}-12-31`)))
        .sort((a, b) => (a.start < b.start ? -1 : 1));
    },
    absencesInYear(y) {
      return data.absences.filter((a) => a.end >= `${y}-01-01` && a.start <= `${y}-12-31`);
    },
    /** Überschneidung mit anderen Einträgen derselben Person */
    overlaps(empId, start, end, excludeId) {
      return data.absences.filter((a) => a.employeeId === empId && a.id !== excludeId && a.start <= end && a.end >= start);
    },
    entitlement(emp, y) {
      const yr = emp.years && emp.years[y];
      return yr && yr.entitlement != null && yr.entitlement !== '' ? +yr.entitlement : +emp.entitlement || 0;
    },
    carryover(emp, y) {
      const yr = emp.years && emp.years[y];
      return yr && yr.carryover != null && yr.carryover !== '' ? +yr.carryover : 0;
    },
    /** Urlaubsbilanz einer Person für ein Jahr */
    stats(emp, y) {
      const settings = data.settings;
      const today = D.today();
      const st = {
        entitlement: S.entitlement(emp, y),
        carryover: S.carryover(emp, y),
        geplant: 0, beantragt: 0, genehmigt: 0,
        taken: 0,
        byType: {}
      };
      st.total = st.entitlement + st.carryover;
      S.absencesOf(emp.id, y).forEach((a) => {
        const t = S.type(a.typeId);
        const days = UP.absenceDays(a, emp, settings, y);
        st.byType[t.id] = (st.byType[t.id] || 0) + days;
        if (t.counts) {
          st[a.status] += days;
          if (a.start <= today) {
            const until = D.min(a.end, today);
            st.taken += UP.absenceDays({ ...a, end: until }, emp, settings, y);
          }
        }
      });
      st.used = st.geplant + st.beantragt + st.genehmigt;
      st.rest = st.total - st.used;
      return st;
    },
    /** Abwesende Personen an einem Tag */
    absentOn(iso) {
      return data.absences.filter((a) => a.start <= iso && a.end >= iso);
    },
    /**
     * Anwesende einer Gruppe an einem Tag (Personen, für die der Tag ein Arbeitstag ist
     * und die nicht ganztägig abwesend sind). draft: optionaler Entwurf eines Eintrags.
     */
    presence(groupId, iso, draft) {
      let total = 0, present = 0;
      data.employees.forEach((e) => {
        if (!e.active || e.group !== groupId) return;
        if (UP.dayValue(iso, e, data.settings) === 0) return;
        total++;
        const absent = data.absences.some((a) => a.employeeId === e.id && a.start <= iso && a.end >= iso && !a.halfDay && (!draft || a.id !== draft.id));
        const draftAbsent = draft && draft.employeeId === e.id && !draft.halfDay && draft.start <= iso && draft.end >= iso;
        if (!absent && !draftAbsent) present++;
      });
      return { total, present };
    }
  });
})(window.UP = window.UP || {});
