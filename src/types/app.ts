// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Kurse {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    kursname?: string;
    kurstyp?: LookupValue;
    schwierigkeitsgrad?: LookupValue;
    dauer_minuten?: number;
    kursleiter?: string;
    max_teilnehmer?: number;
    beschreibung?: string;
    aktiv?: boolean;
  };
}

export interface Termine {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    kurs?: string; // applookup -> URL zu 'Kurse' Record
    datum_uhrzeit?: string; // Format: YYYY-MM-DD oder ISO String
    raum?: string;
    status?: LookupValue;
    angemeldete_teilnehmer?: number;
    notizen?: string;
  };
}

export interface Anmeldungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    termin?: string; // applookup -> URL zu 'Termine' Record
    vorname?: string;
    nachname?: string;
    email?: string;
    telefon?: string;
    anmeldedatum?: string; // Format: YYYY-MM-DD oder ISO String
    anmeldequelle?: LookupValue;
    status_anmeldung?: LookupValue;
    notizen_anmeldung?: string;
  };
}

export const APP_IDS = {
  KURSE: '6a685028fbdec1017e116825',
  TERMINE: '6a68502d9f94f73b1d91afc0',
  ANMELDUNGEN: '6a68502e907aa30b71a8c551',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'kurse': {
    kurstyp: [{ key: "vinyasa", label: "Vinyasa Yoga" }, { key: "yin", label: "Yin Yoga" }, { key: "restorative", label: "Restorative Yoga" }, { key: "ashtanga", label: "Ashtanga Yoga" }, { key: "kundalini", label: "Kundalini Yoga" }, { key: "power", label: "Power Yoga" }, { key: "meditation", label: "Meditation" }, { key: "sonstiges", label: "Sonstiges" }, { key: "hatha", label: "Hatha Yoga" }],
    schwierigkeitsgrad: [{ key: "anfaenger", label: "Anfänger" }, { key: "mittelstufe", label: "Mittelstufe" }, { key: "fortgeschritten", label: "Fortgeschritten" }, { key: "alle_levels", label: "Alle Levels" }],
  },
  'termine': {
    status: [{ key: "geplant", label: "Geplant" }, { key: "abgesagt", label: "Abgesagt" }, { key: "durchgefuehrt", label: "Durchgeführt" }],
  },
  'anmeldungen': {
    anmeldequelle: [{ key: "online", label: "Online" }, { key: "telefonisch", label: "Telefonisch" }, { key: "vor_ort", label: "Vor Ort" }],
    status_anmeldung: [{ key: "neu", label: "Neu / Ausstehend" }, { key: "bestaetigt", label: "Bestätigt" }, { key: "abgesagt", label: "Abgesagt" }, { key: "warteliste", label: "Warteliste" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'kurse': {
    'kursname': 'string/text',
    'kurstyp': 'lookup/select',
    'schwierigkeitsgrad': 'lookup/radio',
    'dauer_minuten': 'number',
    'kursleiter': 'string/text',
    'max_teilnehmer': 'number',
    'beschreibung': 'string/textarea',
    'aktiv': 'bool',
  },
  'termine': {
    'kurs': 'applookup/select',
    'datum_uhrzeit': 'date/datetimeminute',
    'raum': 'string/text',
    'status': 'lookup/select',
    'angemeldete_teilnehmer': 'number',
    'notizen': 'string/textarea',
  },
  'anmeldungen': {
    'termin': 'applookup/select',
    'vorname': 'string/text',
    'nachname': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'anmeldedatum': 'date/datetimeminute',
    'anmeldequelle': 'lookup/radio',
    'status_anmeldung': 'lookup/select',
    'notizen_anmeldung': 'string/textarea',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateKurse = StripLookup<Kurse['fields']>;
export type CreateTermine = StripLookup<Termine['fields']>;
export type CreateAnmeldungen = StripLookup<Anmeldungen['fields']>;