/*
 * Ortsunabhängige Speicherung über Firebase (Anleitung: docs/firebase-sync.md).
 * Solange apiKey/projectId leer sind, arbeitet die App rein lokal im Browser.
 * teamKey: langer Zufallsschlüssel (32–64 Zeichen: A–Z, a–z, 0–9, - _). Alle Geräte mit diesem
 * Schlüssel teilen denselben Datenstand – ohne Anmeldung. Wie ein Passwort behandeln.
 */
window.UP_SYNC_CONFIG = {
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    appId: ''
  },
  teamKey: ''
};
