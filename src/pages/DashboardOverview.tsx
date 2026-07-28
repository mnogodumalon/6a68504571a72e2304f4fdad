import { useState, useMemo, useCallback } from 'react';
import { de } from 'date-fns/locale';
import { format, parseISO, isToday, isBefore, startOfToday } from 'date-fns';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichTermine, enrichAnmeldungen } from '@/lib/enrich';
import type { EnrichedTermine, EnrichedAnmeldungen } from '@/types/enriched';
import type { Kurse, Termine, Anmeldungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime } from '@/lib/formatters';
import { lookupKey } from '@/lib/formatters';
import { DashboardSkeleton, DashboardError } from '@/components/DashboardStates';
import { DashboardGrid } from '@/components/DashboardGrid';
import { WorkList } from '@/components/WorkList';
import { HeroBanner } from '@/components/HeroBanner';
import { StatStrip, StatStripItem } from '@/components/StatCard';
import { Button } from '@/components/ui/button';
import {
  RecordOverlayHost,
  RecordHeader,
  useRecordOverlayStack,
} from '@/components/widgets/RecordView';
import { KurseDetails } from '@/components/details/KurseDetails';
import { TermineDetails } from '@/components/details/TermineDetails';
import { AnmeldungenDetails } from '@/components/details/AnmeldungenDetails';
import {
  CalendarWidget,
  type CalendarEvent,
  type CalendarTone,
} from '@/components/widgets/CalendarWidget';
import { KurseDialog } from '@/components/dialogs/KurseDialog';
import { TermineDialog } from '@/components/dialogs/TermineDialog';
import { AnmeldungenDialog } from '@/components/dialogs/AnmeldungenDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { useClock, gruss, namen, undoToast } from '@/lib/polish';
import {
  IconCalendar,
  IconUserPlus,
  IconAlertTriangle,
  IconPlus,
  IconUsers,
  IconCheck,
} from '@tabler/icons-react';

// Overlay-Stack-Typen
type OverlayItem =
  | { type: 'termin'; id: string }
  | { type: 'kurs'; id: string }
  | { type: 'anmeldung'; id: string };

// Dialog-Zustände
type TermineDefaults = { kurs?: string; datum_uhrzeit?: string };
type AnmeldungenDefaults = { termin?: string };

export default function DashboardOverview() {
  const clock = useClock();

  const {
    kurse, setKurse,
    termine, setTermine,
    anmeldungen, setAnmeldungen,
    kurseMap, termineMap,
    loading, error, fetchAll,
  } = useDashboardData();

  // Alle Hooks VOR den early returns
  const enrichedTermine = useMemo(
    () => enrichTermine(termine, { kurseMap }),
    [termine, kurseMap],
  );
  const enrichedAnmeldungen = useMemo(
    () => enrichAnmeldungen(anmeldungen, { termineMap }),
    [anmeldungen, termineMap],
  );

  const overlay = useRecordOverlayStack<OverlayItem>();

  // Dialog-Zustände
  const [kurseDialogOpen, setKurseDialogOpen] = useState(false);
  const [editKurs, setEditKurs] = useState<Kurse | undefined>();
  const [termineDialogOpen, setTermineDialogOpen] = useState(false);
  const [termineDefaults, setTermineDefaults] = useState<TermineDefaults | undefined>();
  const [editTermin, setEditTermin] = useState<Termine | undefined>();
  const [anmeldungenDialogOpen, setAnmeldungenDialogOpen] = useState(false);
  const [anmeldungenDefaults, setAnmeldungenDefaults] = useState<AnmeldungenDefaults | undefined>();
  const [editAnmeldung, setEditAnmeldung] = useState<Anmeldungen | undefined>();

  // Abgeleitete Daten
  const today = format(clock, 'yyyy-MM-dd');

  const termineHeute = useMemo(
    () => enrichedTermine.filter(t => t.fields.datum_uhrzeit?.startsWith(today)),
    [enrichedTermine, today],
  );

  const termineKuenftig = useMemo(
    () => enrichedTermine.filter(t => {
      if (!t.fields.datum_uhrzeit) return false;
      return t.fields.datum_uhrzeit >= today;
    }),
    [enrichedTermine, today],
  );

  const termineAbgesagt = useMemo(
    () => enrichedTermine.filter(t => lookupKey(t.fields.status) === 'abgesagt'),
    [enrichedTermine],
  );

  const anmeldungenNeu = useMemo(
    () => enrichedAnmeldungen.filter(a => lookupKey(a.fields.status_anmeldung) === 'neu'),
    [enrichedAnmeldungen],
  );

  // CalendarEvents
  const events = useMemo<CalendarEvent[]>(() =>
    enrichedTermine
      .filter(t => !!t.fields.datum_uhrzeit)
      .map(t => {
        const statusKey = lookupKey(t.fields.status);
        let tone: CalendarTone = 'primary';
        if (statusKey === 'abgesagt') tone = 'destructive';
        else if (statusKey === 'durchgefuehrt') tone = 'success';

        return {
          id: `termin:${t.record_id}`,
          start: t.fields.datum_uhrzeit!,
          title: t.kursName || t.fields.raum || 'Kurs',
          subtitle: t.fields.raum ?? undefined,
          tone,
        };
      }),
    [enrichedTermine],
  );

  // Termin bestätigen (Status → durchgefuehrt)
  const advanceTermin = useCallback(async (t: Termine) => {
    const prev = [...termine];
    setTermine(prev.map(r =>
      r.record_id === t.record_id
        ? { ...r, fields: { ...r.fields, status: { key: 'durchgefuehrt', label: 'Durchgeführt' } } }
        : r,
    ));
    undoToast(`Termin als "Durchgeführt" markiert`, async () => {
      setTermine(prev);
      await LivingAppsService.updateTermineEntry(t.record_id, { status: 'geplant' });
    });
    try {
      await LivingAppsService.updateTermineEntry(t.record_id, { status: 'durchgefuehrt' });
    } catch {
      await fetchAll();
    }
  }, [termine, setTermine, fetchAll]);

  // Anmeldung bestätigen
  const confirmAnmeldung = useCallback(async (a: Anmeldungen) => {
    const prev = [...anmeldungen];
    setAnmeldungen(prev.map(r =>
      r.record_id === a.record_id
        ? { ...r, fields: { ...r.fields, status_anmeldung: { key: 'bestaetigt', label: 'Bestätigt' } } }
        : r,
    ));
    undoToast(`${a.fields.vorname ?? 'Anmeldung'} bestätigt`, async () => {
      setAnmeldungen(prev);
      await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status_anmeldung: 'neu' });
    });
    try {
      await LivingAppsService.updateAnmeldungenEntry(a.record_id, { status_anmeldung: 'bestaetigt' });
    } catch {
      await fetchAll();
    }
  }, [anmeldungen, setAnmeldungen, fetchAll]);

  // Drag-Reschedule
  const reschedule = useCallback(async (eventId: string, newStart: string) => {
    const rid = eventId.split(':')[1];
    if (!rid) return;
    const prev = [...termine];
    setTermine(prev.map(t =>
      t.record_id === rid ? { ...t, fields: { ...t.fields, datum_uhrzeit: newStart } } : t,
    ));
    undoToast('Termin verschoben', async () => {
      setTermine(prev);
      const original = prev.find(t => t.record_id === rid);
      if (original?.fields.datum_uhrzeit) {
        await LivingAppsService.updateTermineEntry(rid, { datum_uhrzeit: original.fields.datum_uhrzeit });
      }
    });
    try {
      await LivingAppsService.updateTermineEntry(rid, { datum_uhrzeit: newStart });
    } catch {
      await fetchAll();
    }
  }, [termine, setTermine, fetchAll]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  // Kontextzeile
  const naechsteTermine = termineHeute.length > 0
    ? namen(termineHeute.map(t => t.kursName || t.fields.raum || ''))
    : termineKuenftig.length > 0
      ? (termineKuenftig[0].kursName || termineKuenftig[0].fields.raum || '')
      : null;

  const kontextzeile = termineHeute.length > 0
    ? `Heute ${termineHeute.length} Termin${termineHeute.length !== 1 ? 'e' : ''}: ${naechsteTermine}.`
    : anmeldungenNeu.length > 0
      ? `${anmeldungenNeu.length} neue Anmeldung${anmeldungenNeu.length !== 1 ? 'en' : ''} warten auf Bestätigung.`
      : 'Alles ruhig — kein Termin heute.';

  // Hero: abgesagte Termine oder unbestätigte Anmeldungen
  const hero = termineAbgesagt.length > 0 ? (
    <HeroBanner
      icon={<IconAlertTriangle size={18} />}
      action={{
        label: 'Termin reaktivieren',
        onClick: () => {
          const t = termineAbgesagt[0];
          const prev = [...termine];
          setTermine(prev.map(r =>
            r.record_id === t.record_id
              ? { ...r, fields: { ...r.fields, status: { key: 'geplant', label: 'Geplant' } } }
              : r,
          ));
          LivingAppsService.updateTermineEntry(t.record_id, { status: 'geplant' })
            .catch(() => fetchAll());
          undoToast('Termin reaktiviert', async () => {
            setTermine(prev);
            await LivingAppsService.updateTermineEntry(t.record_id, { status: 'abgesagt' });
          });
        },
      }}
    >
      <b>{namen(termineAbgesagt.map(t => t.kursName || t.fields.raum || ''))}</b>
      {' '}— {termineAbgesagt.length === 1 ? 'ein Termin ist' : `${termineAbgesagt.length} Termine sind`} abgesagt.
    </HeroBanner>
  ) : undefined;

  // Lookup-Helfer für den Overlay
  const getTerminById = (id: string): Termine | undefined => termineMap.get(id);
  const getKursById = (id: string): Kurse | undefined => kurseMap.get(id);

  return (
    <>
      {/* Seitenheader */}
      <div className="mb-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">{gruss(clock)}</h1>
            <p className="text-muted-foreground mt-0.5 text-sm">{kontextzeile}</p>
          </div>
          <Button onClick={() => { setTermineDefaults(undefined); setEditTermin(undefined); setTermineDialogOpen(true); }} className="shrink-0">
            <IconPlus size={16} className="shrink-0 mr-1.5" />
            Neuer Termin
          </Button>
        </div>
      </div>

      <DashboardGrid
        variant="wide"
        hero={hero}
        kpis={
          <StatStrip>
            <StatStripItem
              title="Heute"
              value={termineHeute.length}
              icon={<IconCalendar size={16} />}
              tone={termineHeute.length > 0 ? 'primary' : 'default'}
            />
            <StatStripItem
              title="Neue Anmeldungen"
              value={anmeldungenNeu.length}
              icon={<IconUserPlus size={16} />}
              tone={anmeldungenNeu.length > 0 ? 'warning' : 'default'}
            />
            <StatStripItem
              title="Kurse aktiv"
              value={kurse.filter(k => k.fields.aktiv !== false).length}
              icon={<IconUsers size={16} />}
            />
          </StatStrip>
        }
        primary={
          <CalendarWidget
            events={events}
            defaultView="week"
            locale={de}
            weekDays={7}
            dayStartHour={7}
            dayEndHour={22}
            onEventClick={ev => {
              const id = ev.id.split(':')[1];
              if (id) overlay.replace({ type: 'termin', id });
            }}
            onEventDrop={(eventId, newStart) => reschedule(eventId, newStart)}
            onEmptyClick={date => {
              setTermineDefaults({ datum_uhrzeit: format(date, "yyyy-MM-dd'T'HH:mm") });
              setEditTermin(undefined);
              setTermineDialogOpen(true);
            }}
          />
        }
        aside={
          <>
            <WorkList
              title="Neue Anmeldungen"
              items={anmeldungenNeu.slice(0, 8).map(a => ({
                id: a.record_id,
                title: `${a.fields.vorname ?? ''} ${a.fields.nachname ?? ''}`.trim() || '—',
                secondLine: (
                  <>
                    <span className="text-muted-foreground text-xs">{a.terminName || '—'}</span>
                  </>
                ),
                action: {
                  label: '✓ Bestätigen',
                  onClick: () => confirmAnmeldung(a),
                },
              }))}
              onItemClick={id => overlay.replace({ type: 'anmeldung', id })}
              empty={{
                text: 'Alle Anmeldungen bestätigt',
                action: {
                  label: 'Neue Anmeldung',
                  onClick: () => { setAnmeldungenDefaults(undefined); setEditAnmeldung(undefined); setAnmeldungenDialogOpen(true); },
                },
              }}
            />
            <WorkList
              title="Heute fällige Termine"
              items={termineHeute.slice(0, 6).map(t => {
                const statusKey = lookupKey(t.fields.status);
                const isDone = statusKey === 'durchgefuehrt';
                return {
                  id: t.record_id,
                  title: t.kursName || t.fields.raum || '—',
                  secondLine: (
                    <>
                      <span className={isDone ? 'text-success font-medium' : 'text-muted-foreground'}>
                        {isDone ? 'Durchgeführt' : t.fields.status?.label ?? 'Geplant'}
                      </span>
                      {t.fields.datum_uhrzeit && (
                        <span className="text-muted-foreground"> · {formatDateTime(t.fields.datum_uhrzeit)}</span>
                      )}
                    </>
                  ),
                  action: isDone ? undefined : {
                    label: '✓ Fertig',
                    onClick: () => advanceTermin(t),
                  },
                };
              })}
              onItemClick={id => overlay.replace({ type: 'termin', id })}
              empty={{
                text: termineKuenftig.length > 0
                  ? `Nächster Termin: ${termineKuenftig[0].kursName || termineKuenftig[0].fields.raum || '—'}`
                  : 'Keine Termine geplant',
                action: {
                  label: 'Termin anlegen',
                  onClick: () => { setTermineDefaults(undefined); setEditTermin(undefined); setTermineDialogOpen(true); },
                },
              }}
            />
          </>
        }
      />

      {/* Overlays */}
      <RecordOverlayHost
        overlay={overlay}
        render={top => {
          if (top.type === 'termin') {
            const t = getTerminById(top.id);
            if (!t) return null;
            const kursId = extractRecordId(t.fields.kurs);
            return (
              <>
                <RecordHeader
                  title={enrichedTermine.find(e => e.record_id === t.record_id)?.kursName || t.fields.raum || 'Termin'}
                  subtitle={t.fields.raum ?? undefined}
                  meta={t.fields.datum_uhrzeit ? formatDateTime(t.fields.datum_uhrzeit) : undefined}
                />
                <TermineDetails
                  record={t}
                  kurseList={kurse}
                  onOpenKurse={k => overlay.push({ type: 'kurs', id: k.record_id })}
                  anmeldungenList={anmeldungen}
                  onOpenAnmeldungen={a => overlay.push({ type: 'anmeldung', id: a.record_id })}
                  onAddAnmeldungen={() => {
                    setAnmeldungenDefaults({ termin: t.record_id });
                    setEditAnmeldung(undefined);
                    setAnmeldungenDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'kurs') {
            const k = getKursById(top.id);
            if (!k) return null;
            return (
              <>
                <RecordHeader
                  title={k.fields.kursname ?? 'Kurs'}
                  subtitle={k.fields.kurstyp?.label ?? undefined}
                  meta={k.fields.kursleiter ?? undefined}
                />
                <KurseDetails
                  record={k}
                  termineList={termine}
                  onOpenTermine={t => overlay.push({ type: 'termin', id: t.record_id })}
                  onAddTermine={() => {
                    setTermineDefaults({ kurs: k.record_id });
                    setEditTermin(undefined);
                    setTermineDialogOpen(true);
                  }}
                />
              </>
            );
          }
          if (top.type === 'anmeldung') {
            const a = anmeldungen.find(r => r.record_id === top.id);
            if (!a) return null;
            return (
              <>
                <RecordHeader
                  title={`${a.fields.vorname ?? ''} ${a.fields.nachname ?? ''}`.trim() || 'Anmeldung'}
                  subtitle={a.fields.email ?? undefined}
                  meta={a.fields.status_anmeldung?.label ?? undefined}
                />
                <AnmeldungenDetails
                  record={a}
                  termineList={termine}
                  onOpenTermine={t => overlay.push({ type: 'termin', id: t.record_id })}
                />
              </>
            );
          }
          return null;
        }}
        footer={top => {
          if (top.type === 'termin') {
            const t = getTerminById(top.id);
            if (!t) return null;
            const statusKey = lookupKey(t.fields.status);
            if (statusKey === 'durchgefuehrt' || statusKey === 'abgesagt') return null;
            return {
              label: '✓ Als durchgeführt markieren',
              onClick: () => { advanceTermin(t); overlay.close(); },
            };
          }
          if (top.type === 'anmeldung') {
            const a = anmeldungen.find(r => r.record_id === top.id);
            if (!a) return null;
            const statusKey = lookupKey(a.fields.status_anmeldung);
            if (statusKey === 'bestaetigt') return null;
            return {
              label: '✓ Anmeldung bestätigen',
              onClick: () => { confirmAnmeldung(a); overlay.close(); },
            };
          }
          return undefined;
        }}
        onEdit={top => {
          if (top.type === 'termin') {
            const t = getTerminById(top.id);
            if (t) { setEditTermin(t); setTermineDefaults(undefined); setTermineDialogOpen(true); overlay.close(); }
          } else if (top.type === 'kurs') {
            const k = getKursById(top.id);
            if (k) { setEditKurs(k); setKurseDialogOpen(true); overlay.close(); }
          } else if (top.type === 'anmeldung') {
            const a = anmeldungen.find(r => r.record_id === top.id);
            if (a) { setEditAnmeldung(a); setAnmeldungenDefaults(undefined); setAnmeldungenDialogOpen(true); overlay.close(); }
          }
        }}
      />

      {/* Dialogs */}
      <TermineDialog
        open={termineDialogOpen}
        onClose={() => { setTermineDialogOpen(false); setEditTermin(undefined); setTermineDefaults(undefined); }}
        onSubmit={async fields => {
          if (editTermin) {
            await LivingAppsService.updateTermineEntry(editTermin.record_id, fields);
          } else {
            await LivingAppsService.createTermineEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editTermin ? editTermin.fields as any : termineDefaults}
        recordId={editTermin?.record_id}
        kurseList={kurse}
        enablePhotoScan={AI_PHOTO_SCAN['Termine']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Termine']}
      />

      <KurseDialog
        open={kurseDialogOpen}
        onClose={() => { setKurseDialogOpen(false); setEditKurs(undefined); }}
        onSubmit={async fields => {
          if (editKurs) {
            await LivingAppsService.updateKurseEntry(editKurs.record_id, fields);
          } else {
            await LivingAppsService.createKurseEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editKurs?.fields as any}
        recordId={editKurs?.record_id}
        enablePhotoScan={AI_PHOTO_SCAN['Kurse']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Kurse']}
      />

      <AnmeldungenDialog
        open={anmeldungenDialogOpen}
        onClose={() => { setAnmeldungenDialogOpen(false); setEditAnmeldung(undefined); setAnmeldungenDefaults(undefined); }}
        onSubmit={async fields => {
          if (editAnmeldung) {
            await LivingAppsService.updateAnmeldungenEntry(editAnmeldung.record_id, fields);
          } else {
            await LivingAppsService.createAnmeldungenEntry(fields);
          }
          fetchAll();
        }}
        defaultValues={editAnmeldung ? editAnmeldung.fields as any : anmeldungenDefaults}
        recordId={editAnmeldung?.record_id}
        termineList={termine}
        enablePhotoScan={AI_PHOTO_SCAN['Anmeldungen']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Anmeldungen']}
      />
    </>
  );
}
