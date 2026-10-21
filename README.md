# Urlaubsplaner · Jahresplanung Sachsen

Webanwendung zur Planung des Jahresurlaubs aller Mitarbeitenden – mit **gesetzlichen Feiertagen** und **Schulferien in Sachsen**, Besetzungskontrolle, Urlaubskonten und Antragsworkflow. Klare, aufgeräumte Oberfläche im Aero-Milchglas-Design mit einem 3D-WebGL-Hintergrund, 3D-Seitenübergängen und hellem und dunklem Farbschema.

Die App ist rein statisch (HTML/CSS/JavaScript, ohne Build-Schritt und ohne Server) und läuft direkt im Browser. Über einen Webserver ausgeliefert, ist sie zusätzlich installierbar und offline nutzbar (PWA).

## Schnellstart

1. Repository herunterladen bzw. klonen.
2. `index.html` im Browser öffnen (Chrome, Edge, Firefox oder Safari in aktueller Version).

Optional als lokaler Webserver: `npx serve .` und dann `http://localhost:3000` aufrufen. Für den Teamzugriff kann der Ordner auch über GitHub Pages oder einen Intranet-Webserver bereitgestellt werden. Über `http(s)` ausgeliefert, lässt sich die App im Browser **installieren** (Symbol in der Adressleiste) und funktioniert danach auch **ohne Internet**.

## Funktionen

### Ansichten

| Ansicht | Inhalt |
|---|---|
| **Übersicht** (Standard) | Alle Mitarbeitenden als Zeilen über das **ganze Jahr auf einen Blick**, nach Gruppen gegliedert. Wochenenden, Feiertage (rot), Schulferien (gelb), Brückentage (grün), Urlaubssperren (schraffiert) und die Linie für „Heute“ sind farbig hinterlegt. Am unteren Rand steht je Gruppe die tägliche Anzahl Anwesender, Unterschreitungen der Mindestbesetzung sind rot markiert. |
| **Kalender** | Klassischer 12-Monats-Jahreskalender mit Kalenderwochen. Für „Alle“ steht an jedem Tag die Anzahl Abwesender, für eine einzelne Person ihre Einträge. Seitenleiste mit Feiertagen, Schulferien, Brückentagen sowie Sperrzeiten und Terminen. |
| **Auswertung** | Kennzahlen, Urlaubskonten je Person (Anspruch, Übertrag, genehmigt, beantragt, geplant, Rest), Engpassliste, Monatsdiagramm und eine Liste aller Einträge mit „Genehmigen“ (einzeln oder alle). |

### Planen und bearbeiten

- **Eintragen per Ziehen:** Abwesenheitsart wählen (Leiste oben oder Tasten `1`–`9`), dann in der Zeile einer Person über die gewünschten Tage ziehen. Im Kalender funktioniert das ebenso.
- **Verschieben und verlängern:** Balken mit der Maus verschieben oder an den Rändern ziehen. Überschneidungen werden verhindert.
- **Kontextmenü (Rechtsklick):** Bearbeiten, Duplizieren, Status und Art ändern, Löschen.
- **Dialog mit Live-Prüfung:** Arbeitstage, Kalendertage, enthaltene Feiertage, Resturlaub vorher und nachher, Warnung bei Unterschreitung der Mindestbesetzung, bei Urlaubssperren und bei überzogenem Anspruch. Zusätzlich Hinweis, wer im selben Zeitraum abwesend ist und welche Schulferien betroffen sind. Schnellwahl für 1 Tag, bis Freitag, 2 oder 3 Wochen. Halbe Tage sind möglich.
- **Status:** *Geplant* (umrandet), *Beantragt* (schraffiert), *Genehmigt* (vollflächig).
- **Rückgängig/Wiederholen** für alle Datenänderungen (`Strg+Z` / `Strg+Y`), dazu Rückgängig-Knopf in jeder Bestätigung.
- **Zoom:** „Ganzes Jahr“ (Taste `G`), Klick auf einen Monat zoomt hinein, `Strg`+Mausrad, Schieberegler, `+`/`−`.
- **Filter:** nach Gruppe (FA/AÄ) oder Name (über die Befehlspalette); Gruppen lassen sich auf- und zuklappen.

### Befehlspalette (`Strg+K` / `⌘K`)

Ein Suchfeld für alles: Aktionen, Ansichten, Export, Einstellungen und Personen (Kalender öffnen, Eintrag anlegen). Datumseingaben wie `24.12.` oder `15.07.2027` springen direkt zum Tag oder legen dort einen Eintrag an; eine Jahreszahl wie `2027` wechselt das Jahr. Bedienung komplett per Tastatur (`↑` `↓` `Enter`).

### Arbeitstage und Urlaubskonten

- Urlaubstage werden nur an **individuellen Arbeitstagen** der Person gezählt, ohne Wochenenden und Feiertage (Teilzeit wird über die Auswahl der Arbeitstage abgebildet).
- Jahresanspruch je Person (Standard und abweichend pro Jahr) sowie **Übertrag aus dem Vorjahr** – der Resturlaub des Vorjahres lässt sich per Klick übernehmen.
- Einstellbare Regel für 24.12./31.12.: ganzer Tag, halber Tag oder arbeitsfrei.
- Nur Abwesenheitsarten mit „zählt als Urlaub“ werden vom Anspruch abgezogen (Krankheit, Fortbildung, Freizeitausgleich usw. nicht).

### Feiertage und Schulferien Sachsen

- **Gesetzliche Feiertage** werden für jedes Jahr berechnet: Neujahr, Karfreitag, Ostermontag, 1. Mai, Christi Himmelfahrt, Pfingstmontag, Tag der Deutschen Einheit, **Reformationstag**, **Buß- und Bettag**, 1. und 2. Weihnachtsfeiertag. Optional kommt Fronleichnam hinzu (sorbisches Siedlungsgebiet).
- **Schulferien** (inkl. unterrichtsfreier Tage) sind von 2024 bis Sommer 2030 hinterlegt. Quelle sind die amtlichen Termine des Sächsischen Staatsministeriums für Kultus/KMK, bezogen über die [OpenHolidays API](https://www.openholidaysapi.org). Für spätere Jahre weist die App auf fehlende Daten hin; die Termine lassen sich in `assets/js/data.js` ergänzen.
- **Brückentage** werden automatisch erkannt und mit ihrer Effizienz angezeigt (z. B. „1 Tag → 4 frei“). Per Klick lassen sie sich direkt als Urlaub eintragen.

### Einstellungen

Region und Zählregeln, Standard-Status neuer Einträge, Schnellerfassung ohne Dialog, Farbschema (System/Hell/Dunkel), Zeilenhöhe, Einblendungen (Schulferien, Brückentage, KW, inaktive Personen), Animationen und 3D-Effekte, Gruppen mit **Mindestbesetzung**, frei definierbare **Abwesenheitsarten** (Name, Kürzel, Farbe, Anrechnung) sowie **Urlaubssperren und Termine**.

### Design, 3D und Animationen

- **3D-Hintergrund (WebGL, three.js):** schwebende Glaskörper mit Glanzlichtern, die dem Mauszeiger per Parallaxe folgen und beim Jahres- oder Ansichtswechsel einen „Warp“-Impuls erhalten. Die Datenflächen bestehen aus fast deckendem Milchglas; die 3D-Szene bleibt dahinter ein dezenter Farbschimmer und stört die Übersicht nicht.
- **3D-Seitenübergänge (View-Transitions-API):** Ansichtswechsel als rotierender **3D-Würfel**, Jahreswechsel als **umgeblättertes Kalenderblatt**, Wechsel des Farbschemas als **kreisförmige Enthüllung** vom Schalter aus.
- **Eintritts-Choreografie:** Mitarbeitendenzeilen klappen wie eine Fallblattanzeige auf, Abwesenheitsbalken fliegen als Welle von links nach rechts ein, Monatskarten im Kalender werden wie ein Kartenspiel ausgeteilt, Kennzahlen kippen ein und Diagrammbalken wachsen.
- **Interaktion:** Gezogene Balken heben sich in 3D an, neue Einträge erscheinen mit einem 3D-Effekt, genehmigte Einträge drehen sich einmal um die eigene Achse, dazu Konfetti. Kalenderkarten neigen sich unter dem Mauszeiger.
- **Abschaltbar** unter Einstellungen → Darstellung. Bei aktivierter Systemeinstellung „Bewegung reduzieren“ entfallen alle Animationen automatisch. Der 3D-Hintergrund pausiert in inaktiven Tabs und beim Ziehen.

### Mitarbeitende

Anlegen, bearbeiten, sortieren, deaktivieren und löschen. Voreingestellt sind die Personen aus `Mitarbeitende.txt`:

| Fachärztinnen & Fachärzte | Assistenzärztinnen & Assistenzärzte |
|---|---|
| Prof. Schäfer, Dr. Lurz, Dr. Polednia, Fr. Dalitz, Dr. Becker, Dr. Hellmann, Dr. Martin | Fr. Licenji, Hr. Sebastian, Hr. Safari |

### Export, Import und Druck

- **Sicherung** als JSON exportieren und importieren (z. B. für die Ablage auf einem Netzlaufwerk oder den Gerätewechsel).
- **CSV** (Excel-kompatibel, UTF-8 mit Semikolon) für Einträge und Urlaubskonten.
- **iCal (.ics)** für Outlook, Google oder Apple Kalender.
- **Drucken/PDF:** Die Übersicht wird quartalsweise im A4-Querformat mit Legende gedruckt; Kalender und Auswertung werden direkt gedruckt.

## Tastenkürzel

| Aktion | Taste |
|---|---|
| Neuer Eintrag | `N` |
| Rückgängig / Wiederholen | `Strg+Z` / `Strg+Y` |
| Vorjahr / Folgejahr | `Alt+←` / `Alt+→` |
| Heute | `T` |
| Ganzes Jahr einpassen | `G` |
| Ansicht Übersicht / Kalender / Auswertung | `Z` / `K` / `A` |
| Abwesenheitsart wählen | `1`–`9` |
| Zoom | `+` / `−`, `Strg`+Mausrad |
| Befehlspalette | `Strg+K` / `⌘K` oder `/` |
| Drucken | `Strg+P` |
| Fokussierten Eintrag verschieben / verlängern | `←` `→` / `⇧+←` `⇧+→` |
| Eintrag öffnen / löschen | `Enter` / `Entf` |
| Hilfe | `?` |

## Datenhaltung

- Alle Daten werden automatisch im **localStorage des Browsers** gespeichert. Es gibt keinen Server, und es werden keine Daten übertragen.
- Mehrere geöffnete Tabs desselben Browsers werden synchronisiert.
- Andere Browser oder Geräte sehen diese Daten **nicht**. Für die gemeinsame Nutzung im Team eine Sicherung exportieren und dort importieren, bzw. eine zentrale Sicherungsdatei pflegen.
- Gelöschte Browserdaten bedeuten Datenverlust – deshalb regelmäßig eine Sicherung exportieren.

## Technik und Projektstruktur

```
index.html              Einstieg, Icon-Sprite, Grundgerüst
manifest.webmanifest    Web-App-Manifest (Installation)
sw.js                   Service Worker (Offline-Betrieb)
assets/icon.svg         App-Symbol
assets/css/app.css      Design-System (Hell/Dunkel), Aero-Glas, 3D-Übergänge und -Animationen, Druck
assets/js/data.js       Schulferien Sachsen, Standard-Arten, -Gruppen, -Mitarbeitende
assets/js/calendar.js   Datumslogik, Feiertage (Osterformel, Buß- und Bettag), Brückentage, Arbeitstage
assets/js/store.js      Zustand, Undo/Redo, Persistenz, Validierung, Urlaubskonten, Besetzung
assets/js/ui.js         Tooltips, Kontextmenü, Dialoge, Toasts, Downloads
assets/js/views.js      Übersicht (Zeitstrahl), Jahreskalender, Auswertung
assets/js/dialogs.js    Eintrags-, Personen-, Einstellungs- und Hilfedialoge, Import/Export/Druck
assets/js/palette.js    Befehlspalette (Strg+K)
assets/js/scene3d.js    3D-Hintergrund (three.js/WebGL)
assets/js/app.js        Steuerung, Seitenübergänge, Werkzeugleiste, Legende, Tastatur, Effekte
Mitarbeitende.txt       Ursprüngliche Mitarbeitendenliste
```

- Kein Build-Schritt, kein Framework. Optional über CDN: [three.js](https://threejs.org) r128 für den 3D-Hintergrund, Schriftart *Inter* (Google Fonts) und [canvas-confetti](https://github.com/catdad/canvas-confetti) für den Konfetti-Effekt. Alle drei werden asynchron geladen; ohne Internet bleibt die App voll funktionsfähig (CSS-Hintergrund, Systemschrift, kein Konfetti).
- Moderne Browser-APIs mit Rückfallebene: View-Transitions-API (Chrome/Edge 111+, Safari 18+; sonst einfache Überblendung), `backdrop-filter`, `color-mix()`, `:has()`, natives `<dialog>`, Service Worker.
- Barrierearm: per Tastatur bedienbar, ARIA-Rollen, sichtbarer Fokus. `prefers-reduced-motion` wird berücksichtigt, und Animationen lassen sich abschalten.
- Responsive bis Smartphone-Breite; auf Touch-Geräten öffnet ein Tippen auf einen Tag den Eintragsdialog.
