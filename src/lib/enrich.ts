import type { EnrichedAnmeldungen, EnrichedTermine } from '@/types/enriched';
import type { Anmeldungen, Kurse, Termine } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface TermineMaps {
  kurseMap: Map<string, Kurse>;
}

export function enrichTermine(
  termine: Termine[],
  maps: TermineMaps
): EnrichedTermine[] {
  return termine.map(r => ({
    ...r,
    kursName: resolveDisplay(r.fields.kurs, maps.kurseMap, 'kursname'),
  }));
}

interface AnmeldungenMaps {
  termineMap: Map<string, Termine>;
}

export function enrichAnmeldungen(
  anmeldungen: Anmeldungen[],
  maps: AnmeldungenMaps
): EnrichedAnmeldungen[] {
  return anmeldungen.map(r => ({
    ...r,
    terminName: resolveDisplay(r.fields.termin, maps.termineMap, 'raum'),
  }));
}
