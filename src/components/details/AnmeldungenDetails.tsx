import type { Anmeldungen, Termine } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';

export interface AnmeldungenDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Anmeldungen;
  /** N:1-Ziel „Termine": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  termineList: Termine[];
  /** Klick auf die Termine-Relation → overlay.push auf dessen Detail. */
  onOpenTermine?: (record: Termine) => void;
}

export function AnmeldungenDetails({
  record,
  termineList,
  onOpenTermine,
}: AnmeldungenDetailsProps) {
  const terminTarget = termineList.find(r => r.record_id === extractRecordId(record.fields.termin));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Vorname" value={record.fields.vorname} format="text" />
        <RecordField label="Nachname" value={record.fields.nachname} format="text" />
        <RecordField label="E-Mail-Adresse" value={record.fields.email} format="email" />
        <RecordField label="Telefonnummer" value={record.fields.telefon} format="text" />
        <RecordField label="Anmeldedatum und -uhrzeit" value={record.fields.anmeldedatum} format="datetime" />
        <RecordField label="Anmeldequelle" value={record.fields.anmeldequelle} format="pill" />
        <RecordField label="Status der Anmeldung" value={record.fields.status_anmeldung} format="pill" />
        <RecordField label="Notizen" value={record.fields.notizen_anmeldung} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={1}>
        <RecordRelation
          label="Termin"
          name={terminTarget?.fields.raum ?? '—'}
          meta={undefined}
          onClick={terminTarget && onOpenTermine ? () => onOpenTermine!(terminTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.ANMELDUNGEN} recordId={record.record_id} />
    </>
  );
}
