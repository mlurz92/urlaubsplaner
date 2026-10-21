# Geräteübergreifende Synchronisierung mit Firebase

Diese Anleitung erweitert den Urlaubsplaner so, dass alle Geräte (Arbeitsplatz-PC, Laptop, Smartphone) **denselben Planungsstand in Echtzeit** sehen. Grundlage sind **Firebase Authentication** (Anmeldung) und **Cloud Firestore** (Datenspeicher) von Google. Zeitaufwand: etwa 45–60 Minuten.

> **Ergebnis:** Oben rechts erscheint ein Wolken-Symbol. Nach der Anmeldung wird jede Änderung nach weniger als einer Sekunde auf alle angemeldeten Geräte übertragen. Gleichzeitige Änderungen werden **pro Eintrag zusammengeführt**, offline bearbeitete Daten werden beim Wiederverbinden nachgetragen.

---

## Inhalt

0. [Vorab: Datenschutz und Freigaben](#0-vorab-datenschutz-und-freigaben)
1. [Firebase-Projekt anlegen](#1-firebase-projekt-anlegen)
2. [Web-App registrieren](#2-web-app-registrieren)
3. [Anmeldung (Authentication) einrichten](#3-anmeldung-authentication-einrichten)
4. [Datenbank (Firestore) und Teammitglieder anlegen](#4-datenbank-firestore-und-teammitglieder-anlegen)
5. [Sicherheitsregeln veröffentlichen](#5-sicherheitsregeln-veröffentlichen)
6. [Code in den Urlaubsplaner einbauen](#6-code-in-den-urlaubsplaner-einbauen)
7. [Anwendung bereitstellen (Hosting)](#7-anwendung-bereitstellen-hosting)
8. [Erste Inbetriebnahme](#8-erste-inbetriebnahme)
9. [Testen](#9-testen)
10. [Verhalten im Alltag](#10-verhalten-im-alltag)
11. [Grenzen, Kosten, Fehlerbehebung](#11-grenzen-kosten-fehlerbehebung)
12. [Alternativen ohne Google-Cloud](#12-alternativen-ohne-google-cloud)

---

## Funktionsprinzip

```
 Gerät A (Browser)                     Cloud Firestore                       Gerät B (Browser)
 ┌──────────────────┐   Änderung     ┌───────────────────────────────┐    Echtzeit    ┌──────────────────┐
 │ Urlaubsplaner    │ ─────────────▶ │ teams/{teamId}/state/main     │ ─────────────▶ │ Urlaubsplaner    │
 │ localStorage     │  Transaktion   │  json (Datenstand)            │   onSnapshot   │ localStorage     │
 │ + Abgleichstand  │ ◀───────────── │  rev  (Revisionsnummer)       │ ◀───────────── │ + Abgleichstand  │
 └──────────────────┘                │  updatedAt, updatedBy         │                └──────────────────┘
                                     └───────────────────────────────┘
```

- Der gesamte Datenstand (Mitarbeitende, Einträge, Arten, Gruppen, Einstellungen) liegt als **ein Dokument** in Firestore. Bei 10 Personen und mehreren Hundert Einträgen sind das wenige Kilobyte; die Obergrenze eines Dokuments liegt bei 1 MiB.
- Jedes Gerät merkt sich den zuletzt abgeglichenen Stand. Hat ein anderes Gerät zwischenzeitlich gespeichert, werden die **eigenen Änderungen je Eintrag** auf den neuen Serverstand übertragen statt ihn zu überschreiben.
- **Ansichtseinstellungen** (Jahr, Zoom, Farbschema usw.) bleiben bewusst **pro Gerät**.
- Ohne Konfiguration bleibt die App unverändert lokal; die Synchronisierung ist ein reines Zusatzmodul.

---

## 0. Vorab: Datenschutz und Freigaben

> **Wichtig – vor dem Einrichten klären.** Urlaubs- und Abwesenheitsdaten sind personenbezogene Beschäftigtendaten. Die Abwesenheitsart **„Krankheit“ ist ein Gesundheitsdatum (Art. 9 DSGVO)** und damit besonders geschützt.

| Punkt | Empfehlung |
|---|---|
| **Datenschutzbeauftragte(r) / Klinik-IT** | Vorhaben vorstellen, Freigabe einholen. In vielen Kliniken ist die Nutzung externer Cloud-Dienste für Personaldaten genehmigungspflichtig. |
| **Personalrat / Betriebsrat** | Elektronische Urlaubsplanung und -auswertung ist mitbestimmungspflichtig (§ 87 Abs. 1 Nr. 5 und 6 BetrVG bzw. Personalvertretungsrecht, in Sachsen SächsPersVG). |
| **Auftragsverarbeitung** | In Firebase unter *Projekteinstellungen → Datenschutz* die **Datenverarbeitungsbedingungen** (Data Processing and Security Terms) akzeptieren und dokumentieren. Google LLC ist ein US-Unternehmen (Drittlandbezug, EU-US Data Privacy Framework). |
| **Speicherort** | Firestore beim Anlegen auf **`europe-west3` (Frankfurt)** setzen. Der Standort ist später **nicht änderbar**. Anmeldedaten (E-Mail-Adressen) verarbeitet Firebase Authentication global. |
| **Datensparsamkeit** | **Krankheitszeiten nicht in der Cloud führen**: Art „Krankheit“ unter *Einstellungen → Abwesenheitsarten* löschen oder in eine neutrale Art (z. B. „Abwesend“) umbenennen. Notizen ohne Diagnosen oder Gründe. |
| **Zugang** | Nur namentlich angelegte Konten; keine Selbstregistrierung; starke Passwörter. |

Liegt keine Freigabe vor, siehe [Abschnitt 12](#12-alternativen-ohne-google-cloud) (Varianten im Kliniknetz).

---

## 1. Firebase-Projekt anlegen

1. <https://console.firebase.google.com> öffnen und mit einem Google-Konto anmelden (idealerweise ein Funktionskonto der Abteilung, nicht privat).
2. **Projekt hinzufügen** → Name, z. B. `urlaubsplaner-radiologie`.
3. **Google Analytics deaktivieren** (wird nicht benötigt).
4. **Projekt erstellen**.

Der Tarif **Spark (kostenlos)** genügt, siehe [Kosten](#kosten).

## 2. Web-App registrieren

1. In der Projektübersicht auf das Web-Symbol **`</>`** klicken.
2. App-Spitzname, z. B. `Urlaubsplaner`. Die Option „Firebase Hosting einrichten“ kann aktiviert werden (siehe Schritt 7).
3. **App registrieren**. Firebase zeigt jetzt einen Codeblock mit `const firebaseConfig = { apiKey: …, authDomain: …, projectId: …, … }`.
4. Diese Werte für Schritt 6.1 notieren. Später auffindbar unter *Projekteinstellungen → Allgemein → Meine Apps*.

> Der `apiKey` ist **kein Geheimnis**, er identifiziert nur das Projekt. Geschützt werden die Daten durch Anmeldung und Sicherheitsregeln (Schritt 5).

## 3. Anmeldung (Authentication) einrichten

1. Menü **Build → Authentication → Jetzt starten**.
2. Reiter **Anmeldemethode** → **E-Mail-Adresse/Passwort** → aktivieren → speichern. (*E-Mail-Link* nicht aktivieren.)
3. Reiter **Nutzer** → **Nutzer hinzufügen**: für jede Person, die planen darf, E-Mail-Adresse und ein Startpasswort eintragen. Passwörter können die Personen später über „Passwort vergessen?“ im Anmeldedialog selbst neu setzen.
4. Spalte **Nutzer-UID** je Person notieren (wird in Schritt 4 benötigt).
5. Reiter **Einstellungen → Nutzeraktionen**: **„Erstellen (Registrierung) aktivieren“ ausschalten**, falls angeboten. Unabhängig davon verhindern die Sicherheitsregeln aus Schritt 5, dass fremde Konten Daten lesen oder schreiben.

## 4. Datenbank (Firestore) und Teammitglieder anlegen

1. **Build → Firestore Database → Datenbank erstellen**.
2. Standort **`europe-west3 (Frankfurt)`** wählen.
3. **Im Produktionsmodus starten** (alles gesperrt, bis die Regeln aus Schritt 5 aktiv sind).
4. Reiter **Daten → Sammlung starten**:
   - Sammlungs-ID: `teams`
   - Dokument-ID: die Team-Kennung, z. B. `radiologie` (frei wählbar, nur Kleinbuchstaben, Ziffern, Bindestrich)
   - Feld: `name` (string) = `Radiologie` → **Speichern**
5. Im Dokument `radiologie` → **Sammlung starten**:
   - Sammlungs-ID: `members`
   - Dokument-ID: die **Nutzer-UID** der ersten Person aus Schritt 3
   - Feld: `email` (string) = E-Mail-Adresse → **Speichern**
6. Für jede weitere Person in `members` ein Dokument mit ihrer UID anlegen.

Ergebnisstruktur:

```
teams/
  radiologie/                 name: "Radiologie"
    members/
      <UID Person 1>          email: "…"
      <UID Person 2>          email: "…"
    state/
      main                    ← wird von der App automatisch angelegt
```

Zugang entziehen: Dokument der Person in `members` löschen und das Konto unter *Authentication → Nutzer* deaktivieren.

## 5. Sicherheitsregeln veröffentlichen

**Firestore Database → Regeln**, Inhalt vollständig ersetzen und **Veröffentlichen**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Angemeldet und als Mitglied des Teams eingetragen
    function isMember(teamId) {
      return request.auth != null
        && exists(/databases/$(database)/documents/teams/$(teamId)/members/$(request.auth.uid));
    }

    // Planungsstand: lesen und schreiben nur für Mitglieder, nur gültige Struktur,
    // Revisionsnummer muss bei jedem Schreiben genau um 1 steigen (kein blindes Überschreiben)
    match /teams/{teamId}/state/{docId} {
      allow read: if isMember(teamId);
      allow write: if isMember(teamId)
        && request.resource.data.keys().hasOnly(['json', 'rev', 'updatedAt', 'updatedBy'])
        && request.resource.data.json is string
        && request.resource.data.json.size() < 900000
        && request.resource.data.rev is int
        && (resource == null || request.resource.data.rev == resource.data.rev + 1);
    }

    // Mitgliederliste: jede Person darf nur ihren eigenen Eintrag lesen, Pflege nur über die Konsole
    match /teams/{teamId}/members/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Mit dem **Regel-Playground** (Schaltfläche in der Regelansicht) lässt sich prüfen: anonymer Lesezugriff auf `teams/radiologie/state/main` → *abgelehnt*; angemeldet mit eingetragener UID → *erlaubt*.

<details>
<summary>Optional: Personen nur mit Leserecht</summary>

Im `members`-Dokument zusätzlich das Feld `role` (string) = `lesen` setzen und die Schreibregel ergänzen:

```
      allow write: if isMember(teamId)
        && get(/databases/$(database)/documents/teams/$(teamId)/members/$(request.auth.uid)).data.get('role', '') != 'lesen'
        && …   // restliche Bedingungen wie oben
```

Solche Personen sehen alle Änderungen, ihre eigenen Änderungen werden aber nicht übertragen (Wolken-Symbol rot).
</details>

---

## 6. Code in den Urlaubsplaner einbauen

Fünf kleine Änderungen, alle im Projektordner. Die Synchronisierung wird nur aktiv, wenn `sync-config.js` ausgefüllt ist.

### 6.1 Neue Datei `assets/js/sync-config.js`

Werte aus Schritt 2 und die Team-Kennung aus Schritt 4 eintragen:

```js
/* Zugangsdaten für die Synchronisierung (aus der Firebase-Konsole, Schritt 2) */
window.UP_SYNC_CONFIG = {
  firebase: {
    apiKey: 'AIza…',
    authDomain: 'urlaubsplaner-radiologie.firebaseapp.com',
    projectId: 'urlaubsplaner-radiologie',
    appId: '1:…:web:…'
  },
  teamId: 'radiologie'
};
```

### 6.2 Neue Datei `assets/js/sync.js`

```js
/*
 * Geräteübergreifende Synchronisierung über Firebase (Authentication + Cloud Firestore).
 * Wird nur aktiv, wenn assets/js/sync-config.js ausgefüllt ist und das Firebase-SDK geladen wurde.
 *
 * Datenmodell: ein Dokument teams/{teamId}/state/main mit
 *   json      – kompletter Datenstand der App als JSON-Text
 *   rev       – Revisionsnummer (wird bei jedem Schreiben um 1 erhöht)
 *   updatedAt – Serverzeit, updatedBy – E-Mail der ändernden Person
 * Konflikte (zwei Geräte ändern gleichzeitig) werden je Eintrag zusammengeführt.
 */
(function (UP) {
  'use strict';

  const cfg = window.UP_SYNC_CONFIG;
  if (!cfg || !cfg.firebase || !cfg.firebase.apiKey || !window.firebase) return;

  const BASE_KEY = 'urlaubsplaner.sync.base.v1';
  const COLLECTIONS = ['employees', 'absences', 'types', 'groups'];

  /** JSON mit sortierten Schlüsseln – für reihenfolgeunabhängige Vergleiche */
  const stable = (v) =>
    Array.isArray(v)
      ? `[${v.map(stable).join(',')}]`
      : v && typeof v === 'object'
        ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
        : JSON.stringify(v);
  const same = (a, b) => stable(a) === stable(b);
  const clone = (o) => JSON.parse(JSON.stringify(o));

  /**
   * Überträgt die lokalen Änderungen (lokal gegenüber base) auf den Serverstand (remote).
   * Je Eintrag gilt: lokal geändert/neu → lokaler Stand; lokal gelöscht → entfernt; sonst Serverstand.
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
  UP.syncMerge = merge; // für Tests

  function init() {
    const { toast, openDialog, confirmDialog, menu, $ } = UP.ui;
    const S = UP.store;
    const btn = document.getElementById('btn-sync');

    firebase.initializeApp(cfg.firebase);
    const auth = firebase.auth();
    const db = firebase.firestore();
    const ref = db.collection('teams').doc(cfg.teamId).collection('state').doc('main');
    const stamp = () => firebase.firestore.FieldValue.serverTimestamp();

    let base = null; // { team, rev, data } – zuletzt mit dem Server abgeglichener Stand
    try {
      base = JSON.parse(localStorage.getItem(BASE_KEY));
      if (!base || base.team !== cfg.teamId) base = null;
    } catch (e) {
      base = null;
    }
    const saveBase = (rev, data) => {
      base = { team: cfg.teamId, rev, data: clone(data) };
      try {
        localStorage.setItem(BASE_KEY, JSON.stringify(base));
      } catch (e) {
        /* Speicher voll – Abgleich funktioniert trotzdem bis zum Neuladen */
      }
    };

    let applying = false, timer = null, retry = null, unsub = null, pending = false;
    const isOffline = (e) => !navigator.onLine || ['unavailable', 'deadline-exceeded'].includes(e && e.code);

    const LABELS = {
      'signed-out': 'Nicht angemeldet – klicken zum Anmelden',
      sync: 'Wird abgeglichen …',
      pending: 'Änderungen werden übertragen …',
      ok: 'Synchronisiert',
      offline: 'Offline – Änderungen werden später übertragen',
      error: 'Fehler – Details in der Browser-Konsole'
    };
    function setState(s, err) {
      if (err) console.warn('[Sync]', err);
      if (!btn) return;
      btn.dataset.sync = s;
      btn.title = `Synchronisierung: ${LABELS[s]}`;
    }

    function apply(data) {
      applying = true;
      try {
        S.applyRemote(data);
      } finally {
        applying = false;
      }
    }

    /** Lokalen Stand per Transaktion übertragen (mit Zusammenführung bei Konflikt) */
    async function push() {
      const user = auth.currentUser;
      if (!user || applying || !base) return;
      const local = clone(S.data);
      setState('pending');
      try {
        const result = await db.runTransaction(async (tx) => {
          const snap = await tx.get(ref);
          const rev = snap.exists ? snap.data().rev : 0;
          const remote = snap.exists ? JSON.parse(snap.data().json) : null;
          const next = remote && rev !== base.rev ? S.normalize(merge(remote, local, base.data)) : local;
          if (remote && same(next, remote)) return { rev, data: remote };
          tx.set(ref, { json: JSON.stringify(next), rev: rev + 1, updatedAt: stamp(), updatedBy: user.email || user.uid });
          return { rev: rev + 1, data: next };
        });
        saveBase(result.rev, result.data);
        pending = false;
        if (same(S.data, local)) {
          if (!same(result.data, local)) apply(result.data); // Änderungen anderer Geräte übernehmen
          setState('ok');
        } else {
          // Während der Übertragung wurde weiter bearbeitet: neue Änderungen auf den Serverstand setzen
          apply(S.normalize(merge(result.data, clone(S.data), local)));
          schedule();
        }
      } catch (e) {
        pending = true;
        setState(isOffline(e) ? 'offline' : 'error', e);
        clearTimeout(retry);
        retry = setTimeout(() => pending && push(), 15000); // automatisch erneut versuchen
      }
    }
    const schedule = () => {
      clearTimeout(timer);
      setState('pending');
      timer = setTimeout(push, 800);
    };

    /** Änderungen anderer Geräte in Echtzeit übernehmen */
    function listen() {
      unsub = ref.onSnapshot(
        (snap) => {
          if (!snap.exists || snap.metadata.hasPendingWrites) return;
          const d = snap.data();
          if (base && d.rev <= base.rev) return;
          if (base && !same(S.data, base.data)) return push(); // eigene offene Änderungen → zusammenführen
          const remote = JSON.parse(d.json);
          saveBase(d.rev, remote);
          apply(remote);
          if (auth.currentUser && d.updatedBy !== auth.currentUser.email) toast(`Aktualisiert von ${d.updatedBy || 'anderem Gerät'}`);
          setState('ok');
        },
        (e) => setState('error', e)
      );
    }

    /** Nach der Anmeldung: Erstabgleich, danach Echtzeit-Abgleich */
    async function start() {
      setState('sync');
      const snap = await ref.get();
      if (!snap.exists) {
        // Erstes Gerät: lokalen Stand als Ausgangsstand hochladen
        await ref.set({ json: JSON.stringify(S.data), rev: 1, updatedAt: stamp(), updatedBy: auth.currentUser.email || auth.currentUser.uid });
        saveBase(1, S.data);
      } else if (!base) {
        // Neues Gerät: Cloud-Stand übernehmen (nach Rückfrage, falls hier schon Einträge existieren)
        const d = snap.data();
        const remote = JSON.parse(d.json);
        if (S.data.absences.length && !same(remote, S.data)) {
          const ok = await confirmDialog({
            title: 'Cloud-Stand übernehmen?',
            message: `In der Cloud liegen ${remote.absences.length} Einträge, in diesem Browser ${S.data.absences.length}. Der Stand dieses Browsers wird durch den Cloud-Stand ersetzt. Tipp: vorher über „Export“ eine Sicherung erstellen.`,
            confirm: 'Cloud-Stand übernehmen'
          });
          if (!ok) {
            await auth.signOut();
            return;
          }
        }
        saveBase(d.rev, remote);
        apply(remote);
      } else {
        // Bekanntes Gerät: zwischenzeitliche (Offline-)Änderungen zusammenführen
        await push();
      }
      listen();
      setState('ok');
    }

    S.subscribe((kind) => {
      if (kind === 'data' && !applying && auth.currentUser && base) schedule();
    });
    window.addEventListener('online', () => pending && push());

    auth.onAuthStateChanged((user) => {
      if (unsub) {
        unsub();
        unsub = null;
      }
      if (user) start().catch((e) => setState(isOffline(e) ? 'offline' : 'error', e));
      else setState('signed-out');
    });

    function loginDialog() {
      const dlg = openDialog({
        title: 'Anmelden zur Synchronisierung',
        subtitle: 'Mit dem Konto, das in Firebase für Ihr Team angelegt wurde',
        size: 'sm',
        body: `<form class="form-grid" id="sync-form" autocomplete="on">
            <div class="field span-2"><label for="sy-mail">E-Mail</label><input class="input" type="email" id="sy-mail" autocomplete="username" required></div>
            <div class="field span-2"><label for="sy-pw">Passwort</label><input class="input" type="password" id="sy-pw" autocomplete="current-password" required></div>
          </form>`,
        footer: `<button class="btn ghost" data-reset>Passwort vergessen?</button><div class="spacer"></div><button class="btn" data-close>Abbrechen</button><button class="btn primary" data-login>Anmelden</button>`,
        init(el) {
          const mail = $('#sy-mail', el), pw = $('#sy-pw', el);
          const go = async () => {
            try {
              await auth.signInWithEmailAndPassword(mail.value.trim(), pw.value);
              dlg.close();
              toast('Angemeldet – Synchronisierung aktiv', { type: 'ok' });
            } catch (e) {
              toast(`Anmeldung fehlgeschlagen (${e.code || e.message})`, { type: 'error' });
            }
          };
          el.querySelector('[data-login]').addEventListener('click', go);
          $('#sync-form', el).addEventListener('submit', (e) => {
            e.preventDefault();
            go();
          });
          el.querySelector('[data-reset]').addEventListener('click', async () => {
            if (!mail.value.trim()) return toast('Bitte zuerst die E-Mail-Adresse eingeben.', { type: 'error' });
            try {
              await auth.sendPasswordResetEmail(mail.value.trim());
              toast('E-Mail zum Zurücksetzen wurde versendet.', { type: 'ok' });
            } catch (e) {
              toast(`Nicht möglich (${e.code || e.message})`, { type: 'error' });
            }
          });
          mail.focus();
        }
      });
    }

    if (btn) {
      btn.hidden = false;
      btn.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) return loginDialog();
        menu.open(0, 0, [
          { title: user.email || 'Angemeldet' },
          { label: 'Jetzt abgleichen', icon: 'redo', fn: () => push() },
          { label: 'Abmelden', icon: 'x', fn: () => auth.signOut() }
        ], btn);
      });
    }
  }

  // Nach der App-Initialisierung starten (app.js registriert seinen Listener vorher)
  document.addEventListener('DOMContentLoaded', init);
})(window.UP = window.UP || {});
```

### 6.3 `assets/js/store.js` – Fremdstand übernehmen

Im Objekt `UP.store` direkt **vor** der Methode `resetData() {` einfügen:

```js
    /** Stand eines anderen Geräts übernehmen (ohne Undo-Eintrag, Verlauf wird geleert) */
    applyRemote(raw) {
      data = normalize(raw);
      undoStack.length = 0;
      redoStack.length = 0;
      persist();
      emit('data');
    },
```

### 6.4 `index.html` – Symbol, Schaltfläche, Skripte

**a)** Im SVG-Block bei den anderen `<symbol>`-Einträgen ergänzen:

```html
    <symbol id="i-cloud" viewBox="0 0 24 24"><path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/></symbol>
```

**b)** In der Kopfzeile direkt **vor** der Schaltfläche `data-action="settings"`:

```html
        <button class="btn ghost icon-only" id="btn-sync" hidden title="Synchronisierung"><svg class="icon"><use href="#i-cloud"/></svg></button>
```

**c)** Am Ende von `<body>` direkt **nach** `<script src="assets/js/app.js"></script>`:

```html
  <!-- Geräteübergreifende Synchronisierung (Firebase) -->
  <script src="assets/js/sync-config.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>
  <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js"></script>
  <script src="assets/js/sync.js"></script>
```

Die *compat*-Variante des SDK wird verwendet, weil der Urlaubsplaner ohne Build-Schritt mit klassischen `<script>`-Dateien arbeitet.

### 6.5 `assets/css/app.css` – Statuspunkt am Wolken-Symbol

Am Dateiende anfügen:

```css
/* Synchronisierungsstatus am Wolken-Symbol */
#btn-sync {
  position: relative;
}
#btn-sync::after {
  content: '';
  position: absolute;
  top: 6px;
  right: 6px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--faint);
  box-shadow: 0 0 0 2px var(--surface);
}
#btn-sync[data-sync='ok']::after {
  background: var(--ok);
}
#btn-sync[data-sync='sync']::after,
#btn-sync[data-sync='pending']::after {
  background: var(--warn);
}
#btn-sync[data-sync='offline']::after,
#btn-sync[data-sync='error']::after {
  background: var(--danger);
}
```

### 6.6 `sw.js` – Offline-Cache ergänzen

Damit die App auch offline startet, die neuen Dateien und das Firebase-SDK in den Cache aufnehmen:

```js
const CACHE = 'urlaubsplaner-v4';            // Versionsnummer erhöhen
const APP = [
  // … bisherige Einträge …
  'assets/js/sync-config.js',
  'assets/js/sync.js'
];
```

und in der `fetch`-Behandlung die Zeile mit den CDN-Hosts erweitern:

```js
  } else if (/cdnjs\.cloudflare\.com|fonts\.(googleapis|gstatic)\.com|www\.gstatic\.com/.test(url.host)) {
```

---

## 7. Anwendung bereitstellen (Hosting)

Firebase Authentication funktioniert **nur über `http(s)`**, nicht beim direkten Öffnen von `index.html` (`file://`). Die App muss daher über einen Webserver erreichbar sein.

### Variante A: Firebase Hosting (empfohlen)

Voraussetzung: [Node.js](https://nodejs.org) ist installiert.

```bash
npm install -g firebase-tools
firebase login
cd urlaubsplaner
firebase init hosting
```

Antworten im Assistenten:

| Frage | Antwort |
|---|---|
| Use an existing project | das Projekt aus Schritt 1 |
| What do you want to use as your public directory? | `.` |
| Configure as a single-page app? | `No` |
| Set up automatic builds and deploys with GitHub? | nach Wunsch |
| File ./index.html already exists. Overwrite? | **`No`** |

Anschließend `firebase.json` so anpassen, dass nur die App veröffentlicht wird:

```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**", "docs/**", "*.md", "Mitarbeitende.txt"],
    "headers": [{ "source": "sw.js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] }]
  }
}
```

Veröffentlichen (bei jeder Änderung erneut):

```bash
firebase deploy --only hosting
```

Die App ist danach unter `https://<projekt-id>.web.app` erreichbar. Diese Domain ist für die Anmeldung automatisch freigegeben.

### Variante B: GitHub Pages oder Intranet-Webserver

1. Repository-Einstellungen → *Pages* → Quelle `main` / Ordner `/ (root)` (bzw. Ordner auf den Webserver kopieren).
2. In Firebase unter **Authentication → Einstellungen → Autorisierte Domains** die Domain hinzufügen, z. B. `mlurz92.github.io` oder `urlaub.klinik.intern`.

> **Achtung:** Ein öffentliches GitHub-Repository macht den Code (nicht die Daten) öffentlich. Das ist unkritisch, solange keine Personaldaten im Repository liegen. `Mitarbeitende.txt` enthält Namen; für ein öffentliches Repository ggf. entfernen.

### Lokal testen

```bash
npx serve .
```

→ `http://localhost:3000` (die Domain `localhost` ist standardmäßig freigegeben).

---

## 8. Erste Inbetriebnahme

Reihenfolge beachten, damit kein Planungsstand verloren geht:

1. **Auf dem Gerät mit dem aktuellen Planungsstand** zuerst eine **Sicherung exportieren** (Export-Menü → „Sicherung exportieren“).
2. Die App über die neue Adresse öffnen. Liegt der bisherige Stand nur unter `file://` oder einer anderen Adresse, ist er dort nicht sichtbar (Browserdaten sind je Adresse getrennt). In diesem Fall zuerst die Sicherung **importieren**.
3. Auf das **Wolken-Symbol** klicken → anmelden. Da die Cloud noch leer ist, wird dieser Stand **als Ausgangsstand hochgeladen**.
4. Auf allen weiteren Geräten die Adresse öffnen, anmelden. Der Cloud-Stand wird übernommen. Liegen dort bereits lokale Einträge, fragt die App vorher nach.
5. Optional: App installieren (Installationssymbol in der Adressleiste bzw. „Zum Home-Bildschirm“).

### Statusanzeige am Wolken-Symbol

| Punkt | Bedeutung |
|---|---|
| grau | nicht angemeldet – Klick öffnet die Anmeldung |
| gelb | Abgleich bzw. Übertragung läuft |
| grün | synchronisiert |
| rot | offline oder Fehler – Änderungen bleiben lokal erhalten und werden automatisch nachgetragen (Wiederholung alle 15 s und beim Wiederverbinden) |

Klick im angemeldeten Zustand: Menü mit **Jetzt abgleichen** und **Abmelden**.

---

## 9. Testen

| Nr. | Test | Erwartung |
|---|---|---|
| 1 | Zwei Browser (z. B. Chrome und Edge oder ein privates Fenster), beide angemeldet. In A einen Urlaub eintragen. | Erscheint in B nach ca. 1 s, Hinweis „Aktualisiert von …“. |
| 2 | In A einen Eintrag löschen und **gleichzeitig** in B einen anderen anlegen. | Beide Geräte zeigen danach: gelöscht und neu angelegt. |
| 3 | In B das Netzwerk trennen (Entwicklertools → Netzwerk → *Offline*), eine Änderung machen; in A eine andere. B wieder verbinden. | Punkt in B wird rot, danach grün; beide Änderungen auf beiden Geräten. |
| 4 | Im **Regel-Playground** (Firestore → Regeln) einen Lesezugriff auf `teams/radiologie/state/main` ohne Anmeldung simulieren. | Zugriff verweigert. |
| 5 | Mit einem Konto anmelden, das **nicht** in `members` steht. | Punkt rot, Konsole meldet `permission-denied`, keine Daten. |

Diese Szenarien (1–3 sowie Bearbeitung während einer laufenden Übertragung) wurden mit zwei getrennten Browserkontexten gegen ein simuliertes Firestore-Backend automatisiert geprüft; die verwendeten SDK-Funktionen wurden mit dem echten Firebase-SDK 10.12.2 abgeglichen.

---

## 10. Verhalten im Alltag

| Situation | Verhalten |
|---|---|
| Änderung (Eintrag, Person, Einstellung) | wird nach 0,8 s übertragen; andere Geräte aktualisieren sich in Echtzeit |
| Zwei Geräte ändern **verschiedene** Einträge gleichzeitig | beide Änderungen bleiben erhalten (Zusammenführung je Eintrag) |
| Zwei Geräte ändern **denselben** Eintrag gleichzeitig | die zuletzt gespeicherte Fassung gilt |
| Einstellungen (z. B. Mindestbesetzung) | je Einstellungsfeld zusammengeführt |
| Offline arbeiten | uneingeschränkt; Übertragung beim Wiederverbinden |
| Änderung von einem anderen Gerät trifft ein | Anzeige aktualisiert sich; der Rückgängig-Verlauf wird geleert, damit keine veralteten Stände zurückgeschrieben werden |
| Abmelden | Daten bleiben im Browser dieses Geräts; an gemeinsam genutzten PCs zusätzlich die Browserdaten der Seite löschen |
| Ansichtseinstellungen (Jahr, Zoom, Farbschema) | bleiben je Gerät |
| Sicherung exportieren/importieren | funktioniert weiter; ein Import wird wie eine normale Änderung an alle Geräte übertragen |

---

## 11. Grenzen, Kosten, Fehlerbehebung

### Grenzen

- **Keine Rechte pro Person**: Alle Mitglieder dürfen alles ändern (Ausnahme: optionale Leserolle, Schritt 5).
- **Kein Änderungsprotokoll**: `updatedBy` und `updatedAt` zeigen nur die letzte Änderung. Regelmäßige JSON-Sicherungen bleiben sinnvoll.
- **Dokumentgröße** max. 1 MiB (Regel begrenzt auf ca. 900 KB) – entspricht weit über 5.000 Einträgen.
- Firebase Authentication mit E-Mail/Passwort bietet **keine Zwei-Faktor-Anmeldung**. Höherer Schutz: Anmeldung über Google- oder Microsoft-Konten (zusätzlicher Anbieter in Authentication, Anmeldecode entsprechend anpassen).

### Kosten

Der kostenlose **Spark-Tarif** reicht für ein Team dieser Größe deutlich aus. Freikontingent laut Firebase-Preisliste (vor Einrichtung aktuell prüfen):

| Leistung | Kostenlos pro Tag bzw. gesamt | Verbrauch Urlaubsplaner |
|---|---|---|
| Firestore Lesevorgänge | 50.000 / Tag | 1 je Änderung und angemeldetem Gerät |
| Firestore Schreibvorgänge | 20.000 / Tag | 1 je Änderung |
| Firestore Speicher | 1 GiB | wenige KB |
| Hosting | 10 GB Speicher, 360 MB Transfer / Tag | ca. 0,3 MB je Erstaufruf |

### Fehlerbehebung

| Meldung / Symptom | Ursache | Lösung |
|---|---|---|
| Wolken-Symbol erscheint nicht | `sync-config.js` fehlt oder leer, SDK nicht geladen (kein Internet beim ersten Start) | Konfiguration prüfen, Seite mit Internetverbindung neu laden |
| `auth/operation-not-supported-in-this-environment` | App über `file://` geöffnet | über Webserver öffnen (Schritt 7) |
| `auth/unauthorized-domain` | Domain nicht freigegeben | Authentication → Einstellungen → Autorisierte Domains |
| `auth/invalid-credential` | E-Mail oder Passwort falsch | „Passwort vergessen?“ im Anmeldedialog |
| `auth/operation-not-allowed` | E-Mail/Passwort nicht aktiviert | Schritt 3.2 |
| Punkt rot, Konsole `permission-denied` | UID fehlt in `members`, falsche `teamId` oder Regeln nicht veröffentlicht | Schritte 4 und 5 prüfen; `teamId` in `sync-config.js` = Dokument-ID unter `teams` |
| Punkt rot, Konsole `failed-precondition` / `unavailable` | keine Verbindung | wird automatisch wiederholt |
| Anderes Gerät zeigt alten Stand | Seite aus Cache, Service Worker veraltet | Seite neu laden; nach Code-Änderungen Cache-Version in `sw.js` erhöhen |

Details zu Fehlern stehen in der Browser-Konsole (F12) mit dem Präfix `[Sync]`.

---

## 12. Alternativen ohne Google-Cloud

Die Zusammenführungslogik in `sync.js` (Funktion `merge`) ist unabhängig vom Anbieter und lässt sich auf andere Backends übertragen.

| Variante | Aufwand | Echtzeit | Datenhaltung | Eignung |
|---|---|---|---|---|
| **JSON-Sicherung auf Netzlaufwerk** (bereits eingebaut: Export/Import) | keiner | nein | intern | eine planende Person, andere lesen |
| **Firebase** (diese Anleitung) | gering | ja | Google Cloud, Region Frankfurt wählbar | wenn Datenschutz-Freigabe vorliegt |
| **Supabase** | mittel | ja | EU-Cloud oder selbst betrieben | Alternative mit PostgreSQL und Zeilenrechten |
| **PocketBase auf einem Server im Kliniknetz** | mittel | ja | vollständig intern | datenschutzfreundlichste Echtzeit-Lösung, benötigt IT-Unterstützung |

---

## Zusammenfassung

1. **Datenschutz klären** (Gesundheitsdaten, Auftragsverarbeitung, Personalvertretung) und Krankheitszeiten möglichst nicht in die Cloud übernehmen.
2. **Firebase-Projekt** mit Authentication (E-Mail/Passwort, ohne Selbstregistrierung) und Firestore in **Frankfurt** anlegen; Teammitglieder per UID unter `teams/{teamId}/members` eintragen; **Sicherheitsregeln** veröffentlichen.
3. **Fünf Code-Änderungen**: `sync-config.js`, `sync.js`, `applyRemote` in `store.js`, Schaltfläche und Skripte in `index.html`, Statuspunkt in `app.css` (optional `sw.js`).
4. Über **Firebase Hosting** oder einen anderen Webserver bereitstellen; zuerst das Gerät mit dem aktuellen Stand anmelden, dann alle weiteren.
5. Ergebnis: **Echtzeit-Abgleich** mit Zusammenführung je Eintrag, Offline-Fähigkeit und Statusanzeige am Wolken-Symbol.
