/*
 * Stammdaten des Urlaubsplaners
 * - Schulferien Sachsen (amtliche Termine des SMK/KMK, bezogen über die OpenHolidays API)
 * - Standard-Abwesenheitsarten, Gruppen und Mitarbeitende (aus Mitarbeitende.txt)
 */
(function (UP) {
  'use strict';

  // Schulferien Sachsen inkl. unterrichtsfreier Tage. Enddatum jeweils inklusive.
  UP.SCHOOL_HOLIDAYS_SN = [
    { name: 'Weihnachtsferien', start: '2023-12-23', end: '2024-01-02' },
    { name: 'Winterferien', start: '2024-02-12', end: '2024-02-23' },
    { name: 'Osterferien', start: '2024-03-28', end: '2024-04-05' },
    { name: 'Unterrichtsfreier Tag', start: '2024-05-10', end: '2024-05-10' },
    { name: 'Pfingstferien', start: '2024-05-18', end: '2024-05-21' },
    { name: 'Sommerferien', start: '2024-06-20', end: '2024-08-02' },
    { name: 'Herbstferien', start: '2024-10-07', end: '2024-10-19' },
    { name: 'Weihnachtsferien', start: '2024-12-23', end: '2025-01-03' },
    { name: 'Winterferien', start: '2025-02-17', end: '2025-03-01' },
    { name: 'Osterferien', start: '2025-04-18', end: '2025-04-25' },
    { name: 'Unterrichtsfreier Tag', start: '2025-05-30', end: '2025-05-30' },
    { name: 'Sommerferien', start: '2025-06-28', end: '2025-08-08' },
    { name: 'Herbstferien', start: '2025-10-06', end: '2025-10-18' },
    { name: 'Weihnachtsferien', start: '2025-12-22', end: '2026-01-02' },
    { name: 'Winterferien', start: '2026-02-09', end: '2026-02-21' },
    { name: 'Osterferien', start: '2026-04-03', end: '2026-04-10' },
    { name: 'Unterrichtsfreier Tag', start: '2026-05-15', end: '2026-05-15' },
    { name: 'Sommerferien', start: '2026-07-04', end: '2026-08-14' },
    { name: 'Herbstferien', start: '2026-10-12', end: '2026-10-24' },
    { name: 'Weihnachtsferien', start: '2026-12-23', end: '2027-01-02' },
    { name: 'Winterferien', start: '2027-02-08', end: '2027-02-19' },
    { name: 'Osterferien', start: '2027-03-26', end: '2027-04-02' },
    { name: 'Unterrichtsfreier Tag', start: '2027-05-07', end: '2027-05-07' },
    { name: 'Pfingstferien', start: '2027-05-15', end: '2027-05-18' },
    { name: 'Sommerferien', start: '2027-07-10', end: '2027-08-20' },
    { name: 'Herbstferien', start: '2027-10-11', end: '2027-10-23' },
    { name: 'Weihnachtsferien', start: '2027-12-23', end: '2028-01-01' },
    { name: 'Winterferien', start: '2028-02-14', end: '2028-02-26' },
    { name: 'Osterferien', start: '2028-04-14', end: '2028-04-22' },
    { name: 'Unterrichtsfreier Tag', start: '2028-05-26', end: '2028-05-26' },
    { name: 'Sommerferien', start: '2028-07-22', end: '2028-09-01' },
    { name: 'Herbstferien', start: '2028-10-23', end: '2028-11-03' },
    { name: 'Weihnachtsferien', start: '2028-12-23', end: '2029-01-03' },
    { name: 'Winterferien', start: '2029-02-05', end: '2029-02-16' },
    { name: 'Osterferien', start: '2029-03-29', end: '2029-04-06' },
    { name: 'Unterrichtsfreier Tag', start: '2029-05-11', end: '2029-05-11' },
    { name: 'Pfingstferien', start: '2029-05-19', end: '2029-05-22' },
    { name: 'Sommerferien', start: '2029-07-21', end: '2029-08-31' },
    { name: 'Herbstferien', start: '2029-10-22', end: '2029-11-02' },
    { name: 'Weihnachtsferien', start: '2029-12-22', end: '2030-01-04' },
    { name: 'Winterferien', start: '2030-02-18', end: '2030-03-01' },
    { name: 'Osterferien', start: '2030-04-19', end: '2030-04-26' },
    { name: 'Unterrichtsfreier Tag', start: '2030-05-31', end: '2030-05-31' },
    { name: 'Pfingstferien', start: '2030-06-08', end: '2030-06-11' },
    { name: 'Sommerferien', start: '2030-07-13', end: '2030-08-23' }
  ];
  // Letztes Datum, bis zu dem amtliche Ferientermine vorliegen
  UP.SCHOOL_DATA_UNTIL = '2030-08-23';

  UP.DEFAULT_TYPES = [
    { id: 'urlaub', name: 'Urlaub', short: 'U', color: '#2f74e0', counts: true },
    { id: 'fza', name: 'Freizeitausgleich', short: 'FZ', color: '#0f9e8e', counts: false },
    { id: 'fortbildung', name: 'Fortbildung / Kongress', short: 'FB', color: '#8a4fd1', counts: false },
    { id: 'krank', name: 'Krankheit', short: 'K', color: '#e2662b', counts: false },
    { id: 'sonder', name: 'Sonderurlaub', short: 'SU', color: '#d6409f', counts: false },
    { id: 'sonstiges', name: 'Sonstige Abwesenheit', short: 'S', color: '#64748b', counts: false }
  ];

  UP.DEFAULT_GROUPS = [
    { id: 'fa', name: 'Fachärztinnen & Fachärzte', short: 'FA', color: '#2f6fde', minPresent: 3 },
    { id: 'aa', name: 'Assistenzärztinnen & Assistenzärzte', short: 'AÄ', color: '#0f9e8e', minPresent: 1 }
  ];

  // Aus Mitarbeitende.txt übernommen
  UP.DEFAULT_EMPLOYEES = [
    { name: 'Prof. Schäfer', position: 'FA', group: 'fa' },
    { name: 'Dr. Lurz', position: 'FA', group: 'fa' },
    { name: 'Dr. Polednia', position: 'FA', group: 'fa' },
    { name: 'Fr. Dalitz', position: 'FÄ', group: 'fa' },
    { name: 'Dr. Becker', position: 'FÄ', group: 'fa' },
    { name: 'Dr. Hellmann', position: 'FÄ', group: 'fa' },
    { name: 'Dr. Martin', position: 'FA', group: 'fa' },
    { name: 'Fr. Licenji', position: 'AÄ', group: 'aa' },
    { name: 'Hr. Sebastian', position: 'AA', group: 'aa' },
    { name: 'Hr. Safari', position: 'AA', group: 'aa' }
  ];

  UP.STATUSES = [
    { id: 'geplant', name: 'Geplant', hint: 'Vorläufige Planung' },
    { id: 'beantragt', name: 'Beantragt', hint: 'Antrag gestellt, Entscheidung offen' },
    { id: 'genehmigt', name: 'Genehmigt', hint: 'Verbindlich genehmigt' }
  ];
})(window.UP = window.UP || {});
