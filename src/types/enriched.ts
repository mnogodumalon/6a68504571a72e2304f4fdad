import type { Anmeldungen, Termine } from './app';

export type EnrichedTermine = Termine & {
  kursName: string;
};

export type EnrichedAnmeldungen = Anmeldungen & {
  terminName: string;
};
