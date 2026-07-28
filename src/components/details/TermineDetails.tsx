import type { Termine, Kurse, Anmeldungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface TermineDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Termine;
  /** N:1-Ziel „Kurse": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  kurseList: Kurse[];
  /** Klick auf die Kurse-Relation → overlay.push auf dessen Detail. */
  onOpenKurse?: (record: Kurse) => void;
  /** 1:N „Anmeldungen": VOLLE Liste — der Block filtert auf diesen Record. */
  anmeldungenList: Anmeldungen[];
  /** Zeilen-Klick → overlay.push auf das Anmeldungen-Detail (nie der Edit-Dialog). */
  onOpenAnmeldungen: (record: Anmeldungen) => void;
  /** Kontextuelles „+": öffnet den Anmeldungen-Dialog mit diesem Record vorgesetzt. */
  onAddAnmeldungen: () => void;
}

export function TermineDetails({
  record,
  kurseList,
  onOpenKurse,
  anmeldungenList,
  onOpenAnmeldungen,
  onAddAnmeldungen,
}: TermineDetailsProps) {
  const kursTarget = kurseList.find(r => r.record_id === extractRecordId(record.fields.kurs));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Datum und Uhrzeit" value={record.fields.datum_uhrzeit} format="datetime" />
        <RecordField label="Raum / Ort" value={record.fields.raum} format="text" />
        <RecordField label="Status" value={record.fields.status} format="pill" />
        <RecordField label="Anzahl Anmeldungen" value={record.fields.angemeldete_teilnehmer} format="text" />
        <RecordField label="Notizen" value={record.fields.notizen} format="longtext" className="md:col-span-2" />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={1}>
        <RecordRelation
          label="Kurs"
          name={kursTarget?.fields.kursname ?? '—'}
          meta={[kursTarget?.fields.kursleiter].filter(Boolean).join(' · ') || undefined}
          onClick={kursTarget && onOpenKurse ? () => onOpenKurse!(kursTarget!) : undefined}
        />
      </RecordSection>

      <SatelliteSection
        title="Anmeldungen"
        items={anmeldungenList.filter(r => extractRecordId(r.fields.termin) === record.record_id)}
        map={r => ({ name: r.fields.vorname ?? 'Anmeldungen', meta: r.fields.anmeldedatum })}
        onOpen={onOpenAnmeldungen}
        onAdd={onAddAnmeldungen}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.TERMINE} recordId={record.record_id} />
    </>
  );
}
