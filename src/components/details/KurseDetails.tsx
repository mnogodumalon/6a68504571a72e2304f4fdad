import type { Kurse, Termine } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface KurseDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Kurse;
  /** 1:N „Termine": VOLLE Liste — der Block filtert auf diesen Record. */
  termineList: Termine[];
  /** Zeilen-Klick → overlay.push auf das Termine-Detail (nie der Edit-Dialog). */
  onOpenTermine: (record: Termine) => void;
  /** Kontextuelles „+": öffnet den Termine-Dialog mit diesem Record vorgesetzt. */
  onAddTermine: () => void;
}

export function KurseDetails({
  record,
  termineList,
  onOpenTermine,
  onAddTermine,
}: KurseDetailsProps) {
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Kursname" value={record.fields.kursname} format="text" />
        <RecordField label="Kurstyp" value={record.fields.kurstyp} format="pill" />
        <RecordField label="Schwierigkeitsgrad" value={record.fields.schwierigkeitsgrad} format="pill" />
        <RecordField label="Dauer (Minuten)" value={record.fields.dauer_minuten} format="text" />
        <RecordField label="Kursleiter/in" value={record.fields.kursleiter} format="text" />
        <RecordField label="Maximale Teilnehmerzahl" value={record.fields.max_teilnehmer} format="text" />
        <RecordField label="Kursbeschreibung" value={record.fields.beschreibung} format="longtext" className="md:col-span-2" />
        <RecordField label="Kurs aktiv" value={record.fields.aktiv} format="bool" />
      </RecordSection>

      <SatelliteSection
        title="Termine"
        items={termineList.filter(r => extractRecordId(r.fields.kurs) === record.record_id)}
        map={r => ({ name: r.fields.raum ?? 'Termine', meta: r.fields.datum_uhrzeit })}
        onOpen={onOpenTermine}
        onAdd={onAddTermine}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.KURSE} recordId={record.record_id} />
    </>
  );
}
