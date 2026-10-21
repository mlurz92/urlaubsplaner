/*
 * Datums-Hilfsfunktionen, Feiertage (Sachsen), Schulferien, Brückentage
 * und Berechnung von Arbeitstagen.
 * Alle Daten werden als ISO-Strings "YYYY-MM-DD" verarbeitet (zeitzonenneutral über UTC).
 */
(function (UP) {
  'use strict';

  const MS_DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  const D = (UP.date = {
    MONTHS: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    MONTHS_SHORT: ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'],
    WEEKDAYS: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    WD_SHORT: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
    WD_LETTER: ['S', 'M', 'D', 'M', 'D', 'F', 'S'],

    iso(y, m, d) {
      return `${y}-${pad(m + 1)}-${pad(d)}`;
    },
    parts(iso) {
      return [+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)];
    },
    valid(iso) {
      if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
      const [y, m, d] = D.parts(iso);
      return m >= 0 && m < 12 && d >= 1 && d <= D.daysInMonth(y, m);
    },
    utc(iso) {
      const [y, m, d] = D.parts(iso);
      return Date.UTC(y, m, d);
    },
    fromUtc(ms) {
      const dt = new Date(ms);
      return D.iso(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate());
    },
    add(iso, n) {
      return D.fromUtc(D.utc(iso) + n * MS_DAY);
    },
    diff(a, b) {
      return Math.round((D.utc(b) - D.utc(a)) / MS_DAY);
    },
    weekday(iso) {
      return new Date(D.utc(iso)).getUTCDay();
    },
    daysInYear(y) {
      return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365;
    },
    daysInMonth(y, m) {
      return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    },
    isoWeek(iso) {
      const t = new Date(D.utc(iso));
      const dayNr = (t.getUTCDay() + 6) % 7;
      t.setUTCDate(t.getUTCDate() - dayNr + 3);
      const firstThursday = t.valueOf();
      t.setUTCMonth(0, 1);
      if (t.getUTCDay() !== 4) t.setUTCMonth(0, 1 + ((4 - t.getUTCDay() + 7) % 7));
      return 1 + Math.ceil((firstThursday - t) / (7 * MS_DAY));
    },
    today() {
      const n = new Date();
      return D.iso(n.getFullYear(), n.getMonth(), n.getDate());
    },
    min(a, b) {
      return a < b ? a : b;
    },
    max(a, b) {
      return a > b ? a : b;
    },
    /** Formatierung: short "06.07.", date "06.07.2026", medium "Mo, 06.07.2026", long "Montag, 6. Juli 2026" */
    fmt(iso, style = 'date') {
      if (!iso) return '';
      const [y, m, d] = D.parts(iso);
      switch (style) {
        case 'short':
          return `${pad(d)}.${pad(m + 1)}.`;
        case 'medium':
          return `${D.WD_SHORT[D.weekday(iso)]}, ${pad(d)}.${pad(m + 1)}.${y}`;
        case 'long':
          return `${D.WEEKDAYS[D.weekday(iso)]}, ${d}. ${D.MONTHS[m]} ${y}`;
        case 'dm':
          return `${d}. ${D.MONTHS[m]}`;
        default:
          return `${pad(d)}.${pad(m + 1)}.${y}`;
      }
    },
    range(a, b) {
      if (a === b) return D.fmt(a);
      if (a.slice(0, 4) === b.slice(0, 4)) return `${D.fmt(a, 'short')}–${D.fmt(b)}`;
      return `${D.fmt(a)}–${D.fmt(b)}`;
    },
    /** Freitag der Woche von iso + (weeks-1) Wochen */
    fridayAfter(iso, weeks) {
      const wd = (D.weekday(iso) + 6) % 7; // Mo=0
      let fri = D.add(iso, 4 - wd);
      if (fri < iso) fri = D.add(fri, 7);
      return D.add(fri, 7 * (weeks - 1));
    }
  });

  /* ---------------------------------------------------------------- Feiertage */

  function easter(y) {
    const a = y % 19, b = Math.floor(y / 100), c = y % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return D.iso(y, month - 1, day);
  }

  // Buß- und Bettag: Mittwoch vor dem 23. November
  function bussUndBettag(y) {
    const nov22 = D.iso(y, 10, 22);
    return D.add(nov22, -((D.weekday(nov22) - 3 + 7) % 7));
  }

  const holidayCache = new Map();

  const H = (UP.holidays = {
    easter,
    /** Gesetzliche Feiertage Sachsen (+ optional Fronleichnam im sorbischen Siedlungsgebiet) */
    publicHolidays(y, opts = {}) {
      const key = `${y}|${opts.fronleichnam ? 1 : 0}`;
      if (holidayCache.has(key)) return holidayCache.get(key);
      const e = easter(y);
      const list = [
        { date: D.iso(y, 0, 1), name: 'Neujahr' },
        { date: D.add(e, -2), name: 'Karfreitag' },
        { date: D.add(e, 1), name: 'Ostermontag' },
        { date: D.iso(y, 4, 1), name: 'Tag der Arbeit' },
        { date: D.add(e, 39), name: 'Christi Himmelfahrt' },
        { date: D.add(e, 50), name: 'Pfingstmontag' },
        { date: D.iso(y, 9, 3), name: 'Tag der Deutschen Einheit' },
        { date: D.iso(y, 9, 31), name: 'Reformationstag' },
        { date: bussUndBettag(y), name: 'Buß- und Bettag' },
        { date: D.iso(y, 11, 25), name: '1. Weihnachtsfeiertag' },
        { date: D.iso(y, 11, 26), name: '2. Weihnachtsfeiertag' }
      ].map((h) => ({ ...h, kind: 'gesetzlich' }));
      if (opts.fronleichnam) {
        list.push({ date: D.add(e, 60), name: 'Fronleichnam', kind: 'regional' });
      }
      list.sort((a, b) => (a.date < b.date ? -1 : 1));
      const map = new Map(list.map((h) => [h.date, h]));
      const res = { list, map };
      holidayCache.set(key, res);
      return res;
    },
    /** Besondere, nicht gesetzliche Tage */
    observances(y) {
      const e = easter(y);
      return [
        { date: D.add(e, 0), name: 'Ostersonntag' },
        { date: D.add(e, 49), name: 'Pfingstsonntag' },
        { date: D.iso(y, 11, 24), name: 'Heiligabend' },
        { date: D.iso(y, 11, 31), name: 'Silvester' }
      ];
    },
    holiday(iso, opts) {
      return H.publicHolidays(+iso.slice(0, 4), opts).map.get(iso) || null;
    },
    /** Schulferien, die das Jahr y berühren */
    schoolHolidays(y) {
      const a = `${y}-01-01`, b = `${y}-12-31`;
      return UP.SCHOOL_HOLIDAYS_SN.filter((s) => s.end >= a && s.start <= b);
    },
    hasSchoolData(y) {
      return `${y}-12-31` <= UP.SCHOOL_DATA_UNTIL;
    }
  });

  /* ------------------------------------------------------------ Jahresmodell */

  const yearCache = new Map();

  /**
   * Liefert für ein Jahr alle Tage mit Kalenderinformationen.
   * settings: { fronleichnam, events: [{id,name,start,end,kind}] }
   */
  UP.buildYear = function (y, settings) {
    const opts = { fronleichnam: !!settings.fronleichnam };
    const evKey = JSON.stringify(settings.events || []);
    const key = `${y}|${opts.fronleichnam}|${evKey}`;
    if (yearCache.has(key)) return yearCache.get(key);
    if (yearCache.size > 12) yearCache.clear();

    const n = D.daysInYear(y);
    const start = `${y}-01-01`;
    const hol = H.publicHolidays(y, opts);
    const obs = new Map(H.observances(y).map((o) => [o.date, o]));
    const school = H.schoolHolidays(y);
    const events = (settings.events || []).filter((ev) => ev.end >= start && ev.start <= `${y}-12-31`);

    const days = [];
    for (let i = 0; i < n; i++) {
      const iso = D.add(start, i);
      const [, m, d] = D.parts(iso);
      const wd = D.weekday(iso);
      const sch = school.find((s) => iso >= s.start && iso <= s.end) || null;
      days.push({
        i, iso, m, d, wd,
        kw: D.isoWeek(iso),
        weekend: wd === 0 || wd === 6,
        holiday: hol.map.get(iso) || null,
        observance: obs.get(iso) || null,
        school: sch,
        events: events.filter((ev) => iso >= ev.start && iso <= ev.end),
        bridge: null
      });
    }

    // Monate
    const months = [];
    for (let m = 0, off = 0; m < 12; m++) {
      const len = D.daysInMonth(y, m);
      months.push({ m, start: off, len });
      off += len;
    }

    // Brückentage: 1–2 Arbeitstage zwischen freien Blöcken, von denen mindestens einer einen Feiertag enthält
    const isOff = (iso) => {
      const wd = D.weekday(iso);
      return wd === 0 || wd === 6 || !!H.holiday(iso, opts);
    };
    const bridges = [];
    const from = D.add(start, -10), to = D.add(`${y}-12-31`, 10);
    const span = D.diff(from, to);
    let cur = 0;
    const runs = [];
    while (cur <= span) {
      const iso = D.add(from, cur);
      const off = isOff(iso);
      let len = 1;
      while (cur + len <= span && isOff(D.add(from, cur + len)) === off) len++;
      const days2 = [];
      for (let k = 0; k < len; k++) days2.push(D.add(from, cur + k));
      runs.push({ off, days: days2, hasHoliday: off && days2.some((x) => H.holiday(x, opts)) });
      cur += len;
    }
    for (let r = 1; r < runs.length - 1; r++) {
      const run = runs[r];
      if (run.off || run.days.length > 2) continue;
      const left = runs[r - 1], right = runs[r + 1];
      if (!left.hasHoliday && !right.hasHoliday) continue;
      const cost = run.days.length;
      const gain = left.days.length + cost + right.days.length;
      const b = {
        days: run.days, cost, gain,
        from: left.days[0], to: right.days[right.days.length - 1],
        reason: (left.hasHoliday ? left : right).days.map((x) => H.holiday(x, opts)).filter(Boolean)[0].name
      };
      if (run.days.some((x) => x.startsWith(String(y)))) bridges.push(b);
      run.days.forEach((x) => {
        if (x.startsWith(String(y))) days[D.diff(start, x)].bridge = b;
      });
    }

    const res = { y, n, start, days, months, holidays: hol.list, school, events, bridges, opts };
    yearCache.set(key, res);
    return res;
  };

  /* ------------------------------------------------------------- Berechnung */

  /**
   * Wert eines Kalendertags für eine Person: 0 (frei), 0.5 oder 1 Arbeitstag.
   * settings.xmasRule: 'voll' | 'halb' | 'frei' für 24.12. und 31.12.
   */
  UP.dayValue = function (iso, emp, settings) {
    const wd = D.weekday(iso);
    const workdays = emp && emp.workdays && emp.workdays.length ? emp.workdays : [1, 2, 3, 4, 5];
    if (!workdays.includes(wd)) return 0;
    if (H.holiday(iso, { fronleichnam: !!settings.fronleichnam })) return 0;
    const md = iso.slice(5);
    if (md === '12-24' || md === '12-31') {
      if (settings.xmasRule === 'frei') return 0;
      if (settings.xmasRule === 'halb') return 0.5;
    }
    return 1;
  };

  /** Arbeitstage einer Abwesenheit (optional nur innerhalb des Jahres y) */
  UP.absenceDays = function (abs, emp, settings, y) {
    let a = abs.start, b = abs.end;
    if (y) {
      a = D.max(a, `${y}-01-01`);
      b = D.min(b, `${y}-12-31`);
    }
    if (a > b) return 0;
    let sum = 0;
    for (let iso = a; iso <= b; iso = D.add(iso, 1)) sum += UP.dayValue(iso, emp, settings);
    return abs.halfDay ? sum * 0.5 : sum;
  };

  UP.fmtDays = function (n) {
    const r = Math.round(n * 2) / 2;
    return (Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ','));
  };
})(window.UP = window.UP || {});
