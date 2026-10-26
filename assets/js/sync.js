/*
 * Geräteübergreifende Synchronisierung über Firebase – ohne Anmeldung.
 * Die App meldet sich unsichtbar anonym an; Zugriff auf die Daten erhält, wer den Teamschlüssel kennt.
 * Aktiv nur, wenn assets/js/sync-config.js ausgefüllt ist (siehe docs/firebase-sync.md).
 *
 * Datenmodell: Dokument teams/{teamschlüssel}/state/main mit
 *   json – kompletter Datenstand als JSON-Text, rev – Revisionsnummer (+1 je Schreibvorgang),
 *   updatedAt – Serverzeit, updatedBy – Name des ändernden Geräts
 * Gleichzeitige Änderungen mehrerer Geräte werden je Eintrag zusammengeführt.
 */
(function (UP) {
  'use strict';

  const SDK = '10.12.2';
  const KEY_STORE = 'urlaubsplaner.sync.key';
  const BASE_STORE = 'urlaubsplaner.sync.base.v1';
  const DEVICE_STORE = 'urlaubsplaner.sync.device';
  const COLLECTIONS = ['employees', 'absences', 'types', 'groups'];

  /* ------------------------------------------------------------- Helfer */

  /** JSON mit sortierten Schlüsseln – für reihenfolgeunabhängige Vergleiche */
  const stable = (v) =>
    Array.isArray(v)
      ? `[${v.map(stable).join(',')}]`
      : v && typeof v === 'object'
        ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
        : JSON.stringify(v);
  const same = (a, b) => stable(a) === stable(b);
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const validKey = (k) => typeof k === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(k);

  function randomKey() {
    const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
    const bytes = crypto.getRandomValues(new Uint8Array(40));
    return Array.from(bytes, (b) => abc[b % abc.length]).join('');
  }

  function defaultDeviceName() {
    const ua = navigator.userAgent;
    const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac OS/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Gerät';
    const br = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
    return `${os} · ${br}`;
  }

  /**
   * Überträgt die lokalen Änderungen (lokal gegenüber base) auf den Serverstand (remote).
   * Je Eintrag: lokal geändert/neu → lokaler Stand; lokal gelöscht → entfernt; sonst Serverstand.
   * Einstellungen werden je Feld zusammengeführt.
   */
  function merge(remote, local, base) {
    const out = clone(remote);
    COLLECTIONS.forEach((k) => {
      const b = new Map((base[k] || []).map((x) => [x.id, x]));
      const l = new Map((local[k] || []).map((x) => [x.id, x]));
      let list = (out[k] || []).filter((x) => !(b.has(x.id) && !l.has(x.id)));
      l.forEach((item, id) => {
        if (b.has(id) && same(b.get(id), item)) return;
        const i = list.findIndex((x) => x.id === id);
        if (i >= 0) list[i] = item;
        else list.push(item);
      });
      const order = (arr) => (arr || []).map((x) => x.id).join('|');
      if (order(local[k]) !== order(base[k])) {
        const pos = new Map((local[k] || []).map((x, i) => [x.id, i]));
        const p = (x) => (pos.has(x.id) ? pos.get(x.id) : Infinity);
        list = list.map((x, i) => [x, i]).sort((a, c) => p(a[0]) - p(c[0]) || a[1] - c[1]).map((x) => x[0]);
      }
      out[k] = list;
    });
    out.settings = { ...(remote.settings || {}) };
    Object.keys(local.settings || {}).forEach((key) => {
      if (!same(local.settings[key], (base.settings || {})[key])) out.settings[key] = local.settings[key];
    });
    return out;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error(`Laden fehlgeschlagen: ${src}`));
      document.head.appendChild(s);
    });
  }

  /* ------------------------------------------------------------ Modul */

  const cfg = window.UP_SYNC_CONFIG || {};
  const configured = !!(cfg.firebase && cfg.firebase.apiKey && cfg.firebase.projectId);

  const sync = (UP.sync = {
    configured,
    merge,
    state: 'off',
    lastSync: null,
    key: null,
    base: null,
    applying: false,
    pending: false,
    unsub: null,

    get device() {
      try {
        return localStorage.getItem(DEVICE_STORE) || defaultDeviceName();
      } catch (e) {
        return defaultDeviceName();
      }
    },
    set device(v) {
      try {
        localStorage.setItem(DEVICE_STORE, String(v || '').trim().slice(0, 40) || defaultDeviceName());
      } catch (e) {
        /* */
      }
    },
    /** Einrichtungslink für weitere Geräte */
    get link() {
      return this.key ? `${location.origin}${location.pathname}#sync=${this.key}` : '';
    },

    async init() {
      this.btn = document.getElementById('btn-sync');
      if (!configured) return;
      this.btn.hidden = false;
      this.btn.addEventListener('click', () => this.dialog());

      // Schlüssel aus Einrichtungslink (#sync=…) übernehmen und aus der Adresszeile entfernen
      const m = location.hash.match(/(?:^#|&)sync=([A-Za-z0-9_-]+)/);
      if (m && validKey(m[1])) {
        this.storeKey(m[1]);
        history.replaceState(null, '', location.pathname + location.search);
        UP.ui.toast('Dieses Gerät ist jetzt mit dem Team verbunden.', { type: 'ok' });
      }
      try {
        this.key = localStorage.getItem(KEY_STORE) || null;
      } catch (e) {
        this.key = null;
      }
      if (!this.key && validKey(cfg.teamKey)) this.key = cfg.teamKey;
      this.loadBase();

      UP.store.subscribe((kind) => {
        if (kind === 'data' && !this.applying && this.ready && this.base) this.schedule();
      });
      window.addEventListener('online', () => this.pending && this.push());

      if (!this.key) return this.setState('setup');
      this.connect();
    },

    storeKey(k) {
      try {
        localStorage.setItem(KEY_STORE, k);
      } catch (e) {
        /* */
      }
      this.key = k;
    },
    loadBase() {
      try {
        const b = JSON.parse(localStorage.getItem(BASE_STORE));
        this.base = b && b.team === this.key ? b : null;
      } catch (e) {
        this.base = null;
      }
    },
    saveBase(rev, data) {
      this.base = { team: this.key, rev, data: clone(data) };
      this.lastSync = new Date();
      try {
        localStorage.setItem(BASE_STORE, JSON.stringify(this.base));
      } catch (e) {
        /* Speicher voll – Abgleich funktioniert bis zum Neuladen */
      }
    },

    setState(s, err) {
      if (err) console.warn('[Sync]', err);
      this.state = s;
      const LABELS = {
        setup: 'Nicht eingerichtet – klicken zum Einrichten',
        sync: 'Wird abgeglichen …',
        pending: 'Änderungen werden übertragen …',
        ok: 'Synchronisiert',
        offline: 'Offline – Änderungen werden später übertragen',
        error: 'Fehler – Details in der Browser-Konsole'
      };
      if (this.btn) {
        this.btn.dataset.sync = s;
        this.btn.title = `Synchronisierung: ${LABELS[s] || ''}`;
      }
      if (this.onState) this.onState();
    },
    isOffline(e) {
      return !navigator.onLine || ['unavailable', 'deadline-exceeded'].includes(e && e.code);
    },

    /** Firebase laden, unsichtbar anonym anmelden, abgleichen */
    async connect() {
      this.setState('sync');
      try {
        if (!window.firebase || !window.firebase.firestore) {
          await loadScript(`https://www.gstatic.com/firebasejs/${SDK}/firebase-app-compat.js`);
          await loadScript(`https://www.gstatic.com/firebasejs/${SDK}/firebase-auth-compat.js`);
          await loadScript(`https://www.gstatic.com/firebasejs/${SDK}/firebase-firestore-compat.js`);
        }
        if (!this.fb) {
          firebase.initializeApp(cfg.firebase);
          this.fb = { auth: firebase.auth(), db: firebase.firestore() };
        }
        if (!this.fb.auth.currentUser) await this.fb.auth.signInAnonymously();
        this.ref = this.fb.db.collection('teams').doc(this.key).collection('state').doc('main');
        await this.start();
      } catch (e) {
        this.setState(this.isOffline(e) || /Laden fehlgeschlagen/.test(e.message) ? 'offline' : 'error', e);
        clearTimeout(this.retry);
        this.retry = setTimeout(() => this.connect(), 20000);
      }
    },

    stamp() {
      return firebase.firestore.FieldValue.serverTimestamp();
    },

    async start() {
      const S = UP.store;
      const snap = await this.ref.get();
      if (!snap.exists) {
        // Erstes Gerät des Teams: lokalen Stand als Ausgangsstand hochladen
        await this.ref.set({ json: JSON.stringify(S.data), rev: 1, updatedAt: this.stamp(), updatedBy: this.device });
        this.saveBase(1, S.data);
      } else if (!this.base) {
        // Neues Gerät: Cloud-Stand übernehmen (nach Rückfrage, falls hier bereits Einträge existieren)
        const d = snap.data();
        const remote = JSON.parse(d.json);
        if (S.data.absences.length && !same(remote, S.data)) {
          const ok = await UP.ui.confirmDialog({
            title: 'Gemeinsamen Stand übernehmen?',
            message: `Im Team liegen ${remote.absences.length} Einträge, in diesem Browser ${S.data.absences.length}. Der Stand dieses Browsers wird durch den gemeinsamen Stand ersetzt. Tipp: vorher über „Export“ eine Sicherung erstellen.`,
            confirm: 'Übernehmen'
          });
          if (!ok) {
            this.setState('setup');
            return;
          }
        }
        this.saveBase(d.rev, remote);
        this.apply(remote);
      } else {
        // Bekanntes Gerät: zwischenzeitliche (Offline-)Änderungen zusammenführen
        this.ready = true;
        await this.push();
      }
      this.ready = true;
      this.listen();
      if (this.state !== 'error' && this.state !== 'offline') this.setState('ok');
    },

    apply(data) {
      this.applying = true;
      try {
        UP.store.applyRemote(data);
      } finally {
        this.applying = false;
      }
    },

    schedule() {
      clearTimeout(this.timer);
      this.setState('pending');
      this.timer = setTimeout(() => this.push(), 800);
    },

    /** Lokalen Stand per Transaktion übertragen (mit Zusammenführung bei Konflikt) */
    async push() {
      const S = UP.store;
      if (!this.ready || !this.base || this.applying || !this.ref) return;
      const local = clone(S.data);
      const base = this.base;
      this.setState('pending');
      try {
        const result = await this.fb.db.runTransaction(async (tx) => {
          const snap = await tx.get(this.ref);
          const rev = snap.exists ? snap.data().rev : 0;
          const remote = snap.exists ? JSON.parse(snap.data().json) : null;
          const next = remote && rev !== base.rev ? S.normalize(merge(remote, local, base.data)) : local;
          if (remote && same(next, remote)) return { rev, data: remote };
          tx.set(this.ref, { json: JSON.stringify(next), rev: rev + 1, updatedAt: this.stamp(), updatedBy: this.device });
          return { rev: rev + 1, data: next };
        });
        this.saveBase(result.rev, result.data);
        this.pending = false;
        if (same(S.data, local)) {
          if (!same(result.data, local)) this.apply(result.data); // Änderungen anderer Geräte übernehmen
          this.setState('ok');
        } else {
          // Während der Übertragung wurde weiter bearbeitet: neue Änderungen auf den Serverstand setzen
          this.apply(S.normalize(merge(result.data, clone(S.data), local)));
          this.schedule();
        }
      } catch (e) {
        this.pending = true;
        this.setState(this.isOffline(e) ? 'offline' : 'error', e);
        clearTimeout(this.retry);
        this.retry = setTimeout(() => this.pending && this.push(), 15000);
      }
    },

    /** Änderungen anderer Geräte in Echtzeit übernehmen */
    listen() {
      if (this.unsub) this.unsub();
      this.unsub = this.ref.onSnapshot(
        (snap) => {
          if (!snap.exists || snap.metadata.hasPendingWrites) return;
          const d = snap.data();
          if (this.base && d.rev <= this.base.rev) return;
          if (this.base && !same(UP.store.data, this.base.data)) return this.push(); // eigene offene Änderungen
          const remote = JSON.parse(d.json);
          this.saveBase(d.rev, remote);
          this.apply(remote);
          if (d.updatedBy !== this.device) UP.ui.toast(`Aktualisiert von ${d.updatedBy || 'anderem Gerät'}`);
          this.setState('ok');
        },
        (e) => this.setState(this.isOffline(e) ? 'offline' : 'error', e)
      );
    },

    /** Neues Team anlegen: zufälligen Schlüssel erzeugen, aktuellen Stand hochladen */
    createTeam() {
      this.storeKey(randomKey());
      this.base = null;
      this.connect();
    },
    /** Mit bestehendem Team verbinden (Link oder Schlüssel) */
    join(input) {
      const m = String(input || '').trim().match(/([A-Za-z0-9_-]{32,64})\s*$/);
      if (!m) return false;
      this.storeKey(m[1]);
      this.loadBase();
      this.connect();
      return true;
    },
    /** Dieses Gerät trennen (Daten bleiben lokal erhalten) */
    disconnect() {
      if (this.unsub) this.unsub();
      this.unsub = null;
      this.ready = false;
      clearTimeout(this.retry);
      try {
        localStorage.removeItem(KEY_STORE);
        localStorage.removeItem(BASE_STORE);
      } catch (e) {
        /* */
      }
      this.key = null;
      this.base = null;
      this.setState('setup');
    },

    /* --------------------------------------------------------- Dialog */
    dialog() {
      const { esc, icon, $, openDialog, toast, confirmDialog } = UP.ui;
      const fmtTime = (d) => (d ? d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–');
      const fixedKey = validKey(cfg.teamKey) && this.key === cfg.teamKey;
      let dlg;
      const body = () => {
        if (!this.key) {
          return `<p class="lead-text">Alle Geräte, die mit demselben Team verbunden sind, sehen denselben Planungsstand – ohne Anmeldung.</p>
            <div class="sync-choice">
              <button class="sync-opt" data-create>${icon('plus')}<b>Neues Team anlegen</b><span>Der Stand dieses Geräts wird zum gemeinsamen Ausgangsstand. Danach den Einrichtungslink an die anderen Geräte geben.</span></button>
              <div class="sync-opt as-form">${icon('users')}<b>Mit bestehendem Team verbinden</b><span>Einrichtungslink oder Teamschlüssel einfügen:</span>
                <div class="inline"><input class="input" id="sync-join" placeholder="https://…#sync=… oder Schlüssel" autocomplete="off" spellcheck="false"><button class="btn primary" data-join>Verbinden</button></div></div>
            </div>`;
        }
        const states = { ok: ['ok', 'Synchronisiert'], pending: ['warn', 'Überträgt …'], sync: ['warn', 'Gleicht ab …'], offline: ['danger', 'Offline'], error: ['danger', 'Fehler'], setup: ['', 'Nicht verbunden'] };
        const [cls, label] = states[this.state] || ['', this.state];
        return `<div class="sync-status"><span class="badge ${cls}">${label}</span><span>Letzter Abgleich: ${fmtTime(this.lastSync)}</span></div>
          <div class="form-grid" style="margin-top:14px">
            <div class="field span-2"><label for="sync-dev">Name dieses Geräts</label><input class="input" id="sync-dev" value="${esc(this.device)}" maxlength="40"><span class="hint">erscheint auf anderen Geräten bei „Aktualisiert von …“</span></div>
            ${fixedKey ? `<div class="span-2 notice info">${icon('info', 'sm')}<span>Der Teamschlüssel ist fest in der Konfiguration hinterlegt – alle Geräte, die diese Adresse öffnen, sind automatisch verbunden.</span></div>` : `
            <div class="field span-2"><label for="sync-link">Einrichtungslink für weitere Geräte</label>
              <div class="inline"><input class="input" id="sync-link" readonly value="${esc(this.link)}" style="flex:1;font-family:ui-monospace,monospace;font-size:12px"><button class="btn" data-copy>${icon('copy', 'sm')}Kopieren</button></div>
              <span class="hint">Einmal auf dem anderen Gerät öffnen – danach synchronisiert es dauerhaft. Wie ein Schlüssel behandeln: Wer den Link hat, kann die Planung sehen und ändern.</span></div>`}
          </div>`;
      };
      const footer = () =>
        this.key
          ? `${fixedKey ? '' : `<button class="btn danger" data-disconnect>${icon('x', 'sm')}Gerät trennen</button>`}<div class="spacer"></div><button class="btn" data-now>${icon('redo', 'sm')}Jetzt abgleichen</button><button class="btn primary" data-close>Fertig</button>`
          : `<div class="spacer"></div><button class="btn" data-close>Abbrechen</button>`;
      const render = () => {
        if (!dlg || !dlg.el.isConnected) return;
        $('.dlg-body', dlg.el).innerHTML = body();
        $('.dlg-foot', dlg.el).innerHTML = footer();
      };
      dlg = openDialog({
        title: 'Synchronisierung',
        subtitle: 'Planungsstand auf allen Geräten aktuell halten',
        body: body(),
        footer: footer(),
        onClose: () => (this.onState = null),
        init: (el) => {
          this.onState = () => {
            const a = document.activeElement;
            if (!(a && a.id === 'sync-dev')) render();
          };
          el.addEventListener('click', async (e) => {
            const b = e.target.closest('button');
            if (!b) return;
            if (b.hasAttribute('data-create')) this.createTeam();
            if (b.hasAttribute('data-join')) {
              if (!this.join($('#sync-join', el).value)) toast('Kein gültiger Einrichtungslink bzw. Schlüssel.', { type: 'error' });
            }
            if (b.hasAttribute('data-copy')) {
              const inp = $('#sync-link', el);
              try {
                await navigator.clipboard.writeText(inp.value);
              } catch (err) {
                inp.select();
                document.execCommand('copy');
              }
              toast('Einrichtungslink kopiert', { type: 'ok' });
            }
            if (b.hasAttribute('data-now')) this.push();
            if (b.hasAttribute('data-disconnect')) {
              const ok = await confirmDialog({ title: 'Gerät trennen?', message: 'Dieses Gerät synchronisiert danach nicht mehr. Die Daten bleiben in diesem Browser erhalten; die anderen Geräte sind nicht betroffen.', confirm: 'Trennen', danger: true });
              if (ok) this.disconnect();
            }
            render();
          });
          el.addEventListener('change', (e) => {
            if (e.target.id === 'sync-dev') this.device = e.target.value;
          });
          el.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && e.target.id === 'sync-join') {
              e.preventDefault();
              el.querySelector('[data-join]').click();
            }
          });
        }
      });
    }
  });

  // Nach der App-Initialisierung starten (app.js registriert seinen Listener vorher)
  document.addEventListener('DOMContentLoaded', () => sync.init());
})(window.UP = window.UP || {});
