# Ortsunabhängige Speicherung mit Firebase (ohne Anmeldung)

Der Urlaubsplaner kann seinen Datenstand zusätzlich zum Browser in **Google Firebase (Cloud Firestore)** ablegen. Dann sehen alle Geräte (Arbeitsplatz-PC, Laptop, Smartphone) **denselben Planungsstand**, Änderungen erscheinen auf den anderen Geräten nach etwa einer Sekunde. Eine **Anmeldung in der App gibt es nicht**: Die App verbindet sich unsichtbar im Hintergrund.

Die Funktion ist **bereits eingebaut**. Es muss nur einmalig ein Firebase-Projekt angelegt und `assets/js/sync-config.js` ausgefüllt werden. Zeitaufwand: etwa 30 Minuten.

> Solange `sync-config.js` leer ist, arbeitet die App wie bisher rein lokal im Browser.

---

## Inhalt

0. [Vorab: Sicherheit und Datenschutz](#0-vorab-sicherheit-und-datenschutz)
1. [Firebase-Projekt anlegen](#1-firebase-projekt-anlegen)
2. [Web-App registrieren](#2-web-app-registrieren)
3. [Anonyme Anmeldung aktivieren](#3-anonyme-anmeldung-aktivieren)
4. [Datenbank anlegen](#4-datenbank-anlegen)
5. [Sicherheitsregeln veröffentlichen](#5-sicherheitsregeln-veröffentlichen)
6. [Konfiguration eintragen](#6-konfiguration-eintragen)
7. [Anwendung bereitstellen](#7-anwendung-bereitstellen)
8. [Erste Inbetriebnahme](#8-erste-inbetriebnahme)
9. [Verhalten im Alltag](#9-verhalten-im-alltag)
10. [Grenzen, Kosten, Fehlerbehebung](#10-grenzen-kosten-fehlerbehebung)
11. [Alternativen ohne Google-Cloud](#11-alternativen-ohne-google-cloud)

---

## Funktionsprinzip

```
 Gerät A (Browser)                    Cloud Firestore (Frankfurt)                 Gerät B (Browser)
 ┌──────────────────┐   Änderung    ┌──────────────────────────────────┐  Echtzeit  ┌──────────────────┐
 │ Urlaubsplaner    │ ────────────▶ │ teams/{Teamschlüssel}/state/main │ ─────────▶ │ Urlaubsplaner    │
 │ lokale Kopie     │ ◀──────────── │  json · rev · updatedAt · …      │ ◀───────── │ lokale Kopie     │
 └──────────────────┘               └──────────────────────────────────┘            └──────────────────┘
```

- Der komplette Datenstand liegt als **ein Dokument** in Firestore, adressiert über einen langen, zufälligen **Teamschlüssel**. Wer den Schlüssel kennt, hat Zugriff; ohne Schlüssel ist das Dokument nicht auffindbar.
- Die App meldet sich **unsichtbar anonym** bei Firebase an (keine Eingabe, kein Konto).
- Jedes Gerät behält eine lokale Kopie: Die App startet sofort und funktioniert **auch offline**; Änderungen werden beim Wiederverbinden nachgetragen.
- Ändern zwei Geräte gleichzeitig, werden die Änderungen **je Eintrag zusammengeführt** statt sich gegenseitig zu überschreiben.
- **Ansichtseinstellungen** (Jahr, Zoom, Farbschema) bleiben je Gerät.

---

## 0. Vorab: Sicherheit und Datenschutz

> **Wichtig:** Ohne Anmeldung schützt **allein der Teamschlüssel** die Daten. Steht der Schlüssel in `sync-config.js`, kann **jede Person, die die App-Adresse öffnen kann**, ihn aus dem Quelltext lesen und damit die Planung sehen und ändern.

| Punkt | Empfehlung |
|---|---|
| **Wo die App liegt** | Die App **nicht öffentlich** bereitstellen, sondern im **Kliniknetz** (Intranet-Webserver) oder hinter einem Zugangsschutz. Öffentliches Hosting (Firebase Hosting, GitHub Pages) nur mit der Variante **Einrichtungslink** (Abschnitt 6, Variante B), bei der der Schlüssel nicht im Quelltext steht. |
| **Teamschlüssel** | Mindestens 32 zufällige Zeichen, wie ein Passwort behandeln, nicht per unverschlüsselter E-Mail an Externe senden. Bei Verdacht auf Weitergabe neuen Schlüssel erzeugen (Abschnitt 10). |
| **Gesundheitsdaten** | Die Art **„Krankheit“ ist ein Gesundheitsdatum (Art. 9 DSGVO)**. Krankheitszeiten nicht in der Cloud führen: Art unter *Einstellungen → Abwesenheitsarten* löschen oder neutral umbenennen (z. B. „Abwesend“). Keine Diagnosen in Notizen. |
| **Freigaben** | Datenschutzbeauftragte(r) und Klinik-IT einbeziehen; elektronische Urlaubsplanung ist mitbestimmungspflichtig (§ 87 Abs. 1 Nr. 5 und 6 BetrVG bzw. SächsPersVG). |
| **Auftragsverarbeitung** | In Firebase unter *Projekteinstellungen → Datenschutz* die **Datenverarbeitungsbedingungen** akzeptieren. Datenbank in **Frankfurt (`europe-west3`)** anlegen. |

---

## 1. Firebase-Projekt anlegen

1. <https://console.firebase.google.com> öffnen, mit einem Google-Konto anmelden (am besten ein Funktionskonto der Abteilung).
2. **Projekt hinzufügen** → Name, z. B. `urlaubsplaner-radiologie`.
3. **Google Analytics deaktivieren** → **Projekt erstellen**.

## 2. Web-App registrieren

1. In der Projektübersicht auf das Web-Symbol **`</>`** klicken, Spitzname `Urlaubsplaner` → **App registrieren**.
2. Aus dem angezeigten Block `firebaseConfig` die Werte **`apiKey`, `authDomain`, `projectId`, `appId`** notieren (später auch unter *Projekteinstellungen → Allgemein → Meine Apps*).

> Der `apiKey` ist kein Geheimnis, er bezeichnet nur das Projekt. Geschützt wird über Sicherheitsregeln und Teamschlüssel.

## 3. Anonyme Anmeldung aktivieren

1. **Build → Authentication → Jetzt starten**.
2. Reiter **Anmeldemethode** → **Anonym** → aktivieren → **Speichern**.

Weitere Anbieter (E-Mail, Google …) werden nicht benötigt. Personen müssen nichts eingeben.

## 4. Datenbank anlegen

1. **Build → Firestore Database → Datenbank erstellen**.
2. Standort **`europe-west3 (Frankfurt)`** – später nicht mehr änderbar.
3. **Im Produktionsmodus starten**.

Sammlungen und Dokumente legt die App selbst an.

## 5. Sicherheitsregeln veröffentlichen

**Firestore Database → Regeln**, Inhalt vollständig ersetzen, **Veröffentlichen**:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Zugriff nur über die App (anonym angemeldet) und nur mit langem Teamschlüssel.
    // Es gibt keine Regel für /teams selbst – die Liste der Teams ist damit nicht abrufbar.
    match /teams/{teamKey}/state/{docId} {
      allow get: if request.auth != null && teamKey.size() >= 32;
      allow create, update: if request.auth != null
        && teamKey.size() >= 32
        && docId == 'main'
        && request.resource.data.keys().hasOnly(['json', 'rev', 'updatedAt', 'updatedBy'])
        && request.resource.data.json is string
        && request.resource.data.json.size() < 900000
        && request.resource.data.rev is int
        && (resource == null || request.resource.data.rev == resource.data.rev + 1);
    }
  }
}
```

Bedeutung: nur Einzelabruf mit bekanntem Schlüssel (kein Auflisten), nur gültige Struktur, die Revisionsnummer muss bei jedem Schreiben genau um 1 steigen (kein blindes Überschreiben), Löschen ist gesperrt.

## 6. Konfiguration eintragen

### Variante A (empfohlen im Kliniknetz): Schlüssel fest hinterlegen – null Klicks

1. Einen Teamschlüssel erzeugen, z. B. mit einem der Befehle:

   ```bash
   # Node.js
   node -e "console.log(require('crypto').randomBytes(30).toString('base64url'))"
   ```

   ```powershell
   # Windows PowerShell
   -join ((48..57)+(65..90)+(97..122) | Get-Random -Count 40 | % {[char]$_})
   ```

2. `assets/js/sync-config.js` ausfüllen:

   ```js
   window.UP_SYNC_CONFIG = {
     firebase: {
       apiKey: 'AIza…',
       authDomain: 'urlaubsplaner-radiologie.firebaseapp.com',
       projectId: 'urlaubsplaner-radiologie',
       appId: '1:…:web:…'
     },
     teamKey: 'hier-der-erzeugte-schluessel-mit-mindestens-32-zeichen'
   };
   ```

Jedes Gerät, das die App über diese Adresse öffnet, ist automatisch verbunden.

### Variante B (bei öffentlichem Hosting): Einrichtungslink

`firebase` wie oben ausfüllen, **`teamKey` leer lassen**. Dann:

1. Auf dem ersten Gerät das **Wolken-Symbol** (oben rechts) → **Neues Team anlegen**. Die App erzeugt einen Schlüssel und lädt den aktuellen Stand hoch.
2. Im selben Dialog **Einrichtungslink kopieren** und auf jedem weiteren Gerät **einmal öffnen** (z. B. per Teams-Nachricht, QR-Code-Generator im Intranet). Danach synchronisiert das Gerät dauerhaft; der Schlüssel steht nicht im Quelltext.

Alternativ lässt sich der Link im Dialog unter „Mit bestehendem Team verbinden“ einfügen.

## 7. Anwendung bereitstellen

Die Synchronisierung funktioniert nur, wenn die App über **`http(s)`** geöffnet wird, nicht beim direkten Öffnen von `index.html` als Datei.

| Variante | Vorgehen |
|---|---|
| **Intranet-Webserver** (empfohlen mit Variante A) | Projektordner auf einen internen Webserver (IIS, Apache, nginx) kopieren. |
| **Firebase Hosting** (mit Variante B) | `npm install -g firebase-tools` → `firebase login` → im Projektordner `firebase init hosting` (öffentliches Verzeichnis `.`, Single-Page-App *No*, `index.html` überschreiben **No**) → `firebase deploy --only hosting`. Adresse: `https://<projekt-id>.web.app`. |
| **Lokal testen** | `npx serve .` → `http://localhost:3000` |

Für Firebase Hosting in `firebase.json` unter `hosting.ignore` zusätzlich `"docs/**", "*.md", "Mitarbeitende.txt"` eintragen.

## 8. Erste Inbetriebnahme

1. Auf dem Gerät mit dem **aktuellen Planungsstand** zuerst **Sicherung exportieren** (Export-Menü).
2. App über die neue Adresse öffnen. Liegt der bisherige Stand unter einer anderen Adresse (z. B. `file://`), dort exportieren und hier **importieren** – Browserdaten sind je Adresse getrennt.
3. Ist die Cloud noch leer, wird der Stand dieses Geräts **automatisch als gemeinsamer Ausgangsstand hochgeladen**.
4. Auf allen weiteren Geräten die Adresse öffnen (Variante B: Einrichtungslink). Der gemeinsame Stand wird übernommen; existieren dort bereits eigene Einträge, fragt die App vorher nach.

### Statuspunkt am Wolken-Symbol

| Punkt | Bedeutung |
|---|---|
| grün | synchronisiert |
| gelb | Abgleich bzw. Übertragung läuft |
| rot | offline oder Fehler – Daten bleiben lokal erhalten und werden automatisch nachgetragen |
| grau | nicht eingerichtet (nur Variante B) – Klick öffnet die Einrichtung |

Ein Klick auf das Symbol zeigt Status, letzten Abgleich, den Gerätenamen (erscheint bei anderen als „Aktualisiert von …“) und **Jetzt abgleichen**.

---

## 9. Verhalten im Alltag

| Situation | Verhalten |
|---|---|
| Änderung (Eintrag, Person, Einstellung) | nach 0,8 s gespeichert, auf anderen Geräten in ca. 1 s sichtbar |
| Zwei Geräte ändern **verschiedene** Einträge gleichzeitig | beide Änderungen bleiben erhalten |
| Zwei Geräte ändern **denselben** Eintrag gleichzeitig | die zuletzt gespeicherte Fassung gilt |
| Einstellungen (z. B. Mindestbesetzung) | je Einstellungsfeld zusammengeführt |
| Ohne Internet | uneingeschränkt weiterarbeiten; Übertragung beim Wiederverbinden (zusätzlich Wiederholung alle 15 s) |
| Änderung eines anderen Geräts trifft ein | Anzeige aktualisiert sich; der Rückgängig-Verlauf wird geleert, damit kein veralteter Stand zurückgeschrieben wird |
| Sicherung importieren | wird wie eine normale Änderung an alle Geräte verteilt |

Die Abläufe (Erstabgleich, Echtzeit-Übernahme, gleichzeitiges Löschen und Anlegen, Einstellungs-Zusammenführung, Offline-Änderung, Bearbeitung während laufender Übertragung) wurden mit zwei getrennten Browserkontexten gegen ein simuliertes Firestore-Backend automatisiert geprüft; die verwendeten SDK-Funktionen entsprechen dem Firebase-SDK 10.12.2.

---

## 10. Grenzen, Kosten, Fehlerbehebung

### Grenzen

- **Kein Rechte- und Personenkonzept**: Wer den Schlüssel hat, darf alles. Regelmäßige JSON-Sicherungen bleiben sinnvoll.
- **Dokumentgröße** max. ca. 900 KB – entspricht weit über 5.000 Einträgen.
- **Schlüssel wechseln** (z. B. nach Weitergabe): neuen Schlüssel in `sync-config.js` eintragen (Variante A) bzw. auf allen Geräten *Wolken-Symbol → Gerät trennen* und ein neues Team anlegen (Variante B). Der neue Schlüssel startet mit dem Stand des ersten verbundenen Geräts. Das alte Dokument in der Firebase-Konsole unter *Firestore → Daten* löschen.

### Kosten

Der kostenlose **Spark-Tarif** genügt (Freikontingent laut Firebase-Preisliste, vor Einrichtung prüfen): 50.000 Lese- und 20.000 Schreibvorgänge pro Tag, 1 GiB Speicher. Verbrauch: je Änderung 1 Schreibvorgang plus 1 Lesevorgang pro geöffnetem Gerät.

### Fehlerbehebung

| Symptom | Ursache | Lösung |
|---|---|---|
| Kein Wolken-Symbol | `sync-config.js` unvollständig (`apiKey`, `projectId`) | Werte aus Schritt 2 eintragen, Seite neu laden |
| Punkt rot, Konsole `auth/admin-restricted-operation` oder `auth/operation-not-allowed` | anonyme Anmeldung nicht aktiviert | Schritt 3 |
| Punkt rot, Konsole `permission-denied` | Regeln nicht veröffentlicht oder Schlüssel kürzer als 32 Zeichen | Schritte 5 und 6 |
| Punkt rot beim Öffnen als Datei | `file://` wird nicht unterstützt | über Webserver öffnen (Schritt 7) |
| Punkt rot, `unavailable` | keine Verbindung | wird automatisch nachgeholt |
| Anderes Gerät zeigt alten Stand | Seite aus dem Cache | neu laden; nach Code-Änderungen Cache-Version in `sw.js` erhöhen |

Details stehen in der Browser-Konsole (F12) mit dem Präfix `[Sync]`.

---

## 11. Alternativen ohne Google-Cloud

| Variante | Aufwand | Echtzeit | Datenhaltung |
|---|---|---|---|
| JSON-Sicherung auf Netzlaufwerk (Export/Import, bereits eingebaut) | keiner | nein | intern |
| **Firebase** (diese Anleitung) | gering | ja | Google Cloud, Region Frankfurt |
| Supabase | mittel | ja | EU-Cloud oder selbst betrieben |
| PocketBase auf einem Server im Kliniknetz | mittel | ja | vollständig intern |

Die Zusammenführungslogik in `assets/js/sync.js` (`UP.sync.merge`) ist anbieterunabhängig und lässt sich auf andere Speicher übertragen.

---

## Zusammenfassung

1. **Sicherheit klären:** Schlüssel = Zugang; App im Kliniknetz bereitstellen oder Einrichtungslink verwenden; Krankheitszeiten nicht in die Cloud.
2. **Firebase:** Projekt, Web-App, **anonyme Anmeldung**, Firestore in **Frankfurt**, Sicherheitsregeln.
3. **`assets/js/sync-config.js`** mit Firebase-Werten und Teamschlüssel füllen.
4. App über `http(s)` bereitstellen – fertig: Alle Geräte teilen denselben Stand, ohne Anmeldung, mit Offline-Fähigkeit.
