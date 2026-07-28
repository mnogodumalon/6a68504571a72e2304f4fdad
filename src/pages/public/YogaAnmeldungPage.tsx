import { useState, useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { format, parseISO, isAfter, startOfToday } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  IconLoader2,
  IconCircleCheck,
  IconCalendar,
  IconMapPin,
  IconClock,
  IconUsers,
  IconChevronLeft,
} from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  loadPublicPagesConfig,
  listPublicRecords,
  createPublicRecord,
  prepareChallenge,
  PageUnavailableError,
  RateLimitedError,
  FieldValidationError,
  type PublicPagesConfig,
} from '@/lib/publicClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KursInfo {
  kursname: string;
  kurstyp: string;
  kursleiter: string;
  dauer_minuten: number | null;
  max_teilnehmer: number | null;
}

interface TerminInfo {
  id: string;
  datum_uhrzeit: string;
  raum: string | null;
  angemeldete_teilnehmer: number | null;
  kurs: KursInfo | null;
}

type Phase = 'loading' | 'select' | 'form' | 'submitting' | 'done' | 'unavailable';

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------

function extractIdFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const parts = url.split('/');
  const idx = parts.indexOf('records');
  if (idx !== -1 && parts[idx + 1]) return parts[idx + 1];
  return parts[parts.length - 1] || null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function YogaAnmeldungPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [termine, setTermine] = useState<TerminInfo[]>([]);
  const [selectedTermin, setSelectedTermin] = useState<TerminInfo | null>(null);
  const [vorname, setVorname] = useState('');
  const [nachname, setNachname] = useState('');
  const [email, setEmail] = useState('');
  const [telefon, setTelefon] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [config, setConfig] = useState<PublicPagesConfig | null>(null);
  const preparedRef = useRef(false);

  useEffect(() => {
    (async () => {
      const cfg = await loadPublicPagesConfig();
      if (!cfg) { setPhase('unavailable'); return; }

      const terminePage = cfg.pages['yoga-termine-liste'];
      if (!terminePage) { setPhase('unavailable'); return; }

      setConfig(cfg);

      try {
        const today = startOfToday();
        const kursePage = cfg.pages['yoga-kurse-liste'];

        const [termineRaw, kurseRaw] = await Promise.all([
          listPublicRecords(cfg, terminePage, { limit: 200 }),
          kursePage
            ? listPublicRecords(cfg, kursePage, { limit: 200 }).catch(() => ({}))
            : Promise.resolve({} as Record<string, { fields: Record<string, unknown> }>),
        ]);

        // Build kurs lookup map
        const kursMap = new Map<string, KursInfo>();
        for (const [kursId, rec] of Object.entries(kurseRaw)) {
          const f = rec.fields;
          const kt = f.kurstyp as { label?: string } | null | undefined;
          kursMap.set(kursId, {
            kursname: String(f.kursname ?? ''),
            kurstyp: kt?.label ?? String(f.kurstyp ?? ''),
            kursleiter: String(f.kursleiter ?? ''),
            dauer_minuten: f.dauer_minuten != null ? Number(f.dauer_minuten) : null,
            max_teilnehmer: f.max_teilnehmer != null ? Number(f.max_teilnehmer) : null,
          });
        }

        // Map & filter termine
        const mapped: TerminInfo[] = Object.entries(termineRaw)
          .map(([id, rec]) => {
            const f = rec.fields;
            const datumUhrzeit = String(f.datum_uhrzeit ?? '');
            const kursId = extractIdFromUrl(String(f.kurs ?? ''));
            return {
              id,
              datum_uhrzeit: datumUhrzeit,
              raum: f.raum ? String(f.raum) : null,
              angemeldete_teilnehmer: f.angemeldete_teilnehmer != null ? Number(f.angemeldete_teilnehmer) : null,
              kurs: kursId ? (kursMap.get(kursId) ?? null) : null,
            };
          })
          .filter(t => {
            if (!t.datum_uhrzeit) return false;
            try { return isAfter(parseISO(t.datum_uhrzeit), today); } catch { return false; }
          })
          .sort((a, b) => a.datum_uhrzeit.localeCompare(b.datum_uhrzeit));

        setTermine(mapped);
        setPhase('select');
      } catch {
        setPhase('unavailable');
      }
    })();
  }, []);

  const handleSelectTermin = (termin: TerminInfo) => {
    setSelectedTermin(termin);
    setPhase('form');
    preparedRef.current = false;
  };

  const handleFirstInteraction = () => {
    if (preparedRef.current || !config) return;
    const anmeldungPage = config.pages['yoga-anmeldung'];
    if (!anmeldungPage) return;
    preparedRef.current = true;
    prepareChallenge(config, anmeldungPage, 'POST', `/apps/${anmeldungPage.app_id}/records`);
  };

  const clearError = (key: string) =>
    setFieldErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!config || !selectedTermin || phase === 'submitting') return;

    const errs: Record<string, string> = {};
    if (!vorname.trim()) errs.vorname = 'Bitte gib deinen Vornamen ein.';
    if (!nachname.trim()) errs.nachname = 'Bitte gib deinen Nachnamen ein.';
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }

    setFieldErrors({});
    setSubmitError(null);
    setPhase('submitting');

    const anmeldungPage = config.pages['yoga-anmeldung'];
    if (!anmeldungPage) {
      setPhase('form');
      setSubmitError('Anmeldeformular ist derzeit nicht verfügbar.');
      return;
    }

    try {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const anmeldedatum = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;

      const fields: Record<string, unknown> = {
        termin: `/apps/6a68502d9f94f73b1d91afc0/records/${selectedTermin.id}`,
        vorname: vorname.trim(),
        nachname: nachname.trim(),
        anmeldedatum,
      };
      if (email.trim()) fields.email = email.trim();
      if (telefon.trim()) fields.telefon = telefon.trim();

      await createPublicRecord(config, anmeldungPage, fields);
      setPhase('done');
    } catch (err) {
      setPhase('form');
      if (err instanceof PageUnavailableError) {
        setSubmitError('Diese Seite ist derzeit nicht verfügbar.');
      } else if (err instanceof RateLimitedError) {
        setSubmitError('Zu viele Versuche — bitte warte einen Moment und versuche es erneut.');
      } else if (err instanceof FieldValidationError) {
        setSubmitError('Bitte überprüfe deine Eingaben und versuche es erneut.');
      } else {
        setSubmitError('Etwas ist schiefgelaufen. Bitte versuche es erneut.');
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Shell (no sidebar, no auth — mobile-first public layout)
  // ---------------------------------------------------------------------------

  const shell = (children: ReactNode) => (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="px-4 py-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <span className="text-base leading-none">🧘</span>
        </div>
        <span className="font-medium text-foreground">Yogastudio</span>
      </header>
      <main className="flex-1 w-full max-w-lg mx-auto px-4 py-6 sm:py-10">
        {children}
      </main>
      <footer className="py-4 text-center text-xs text-muted-foreground">
        Powered by Klar
      </footer>
    </div>
  );

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (phase === 'loading') {
    return shell(
      <div className="flex flex-col items-center justify-center pt-20 gap-3">
        <IconLoader2 size={32} stroke={1.5} className="animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Termine werden geladen…</p>
      </div>,
    );
  }

  // ---------------------------------------------------------------------------
  // Unavailable
  // ---------------------------------------------------------------------------

  if (phase === 'unavailable') {
    return shell(
      <div className="rounded-[27px] bg-card border border-border shadow-sm p-8 text-center mt-6">
        <IconCalendar size={40} stroke={1.5} className="mx-auto mb-3 text-muted-foreground" />
        <h1 className="text-lg font-medium mb-2">Nicht verfügbar</h1>
        <p className="text-muted-foreground text-sm">Diese Anmeldeseite ist derzeit nicht verfügbar.</p>
      </div>,
    );
  }

  // ---------------------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------------------

  if (phase === 'done') {
    return shell(
      <div className="rounded-[27px] bg-card border border-border shadow-sm p-8 text-center mt-6">
        <IconCircleCheck size={52} stroke={1.5} className="mx-auto mb-4 text-primary" />
        <h1 className="text-xl font-medium mb-2">Anmeldung erfolgreich!</h1>
        <p className="text-muted-foreground mb-1">
          Danke, {vorname}! Deine Anmeldung wurde entgegengenommen.
        </p>
        {selectedTermin && (
          <p className="text-sm text-muted-foreground mt-1 mb-6">
            {selectedTermin.kurs?.kursname ? <>{selectedTermin.kurs.kursname} · </> : null}
            {(() => {
              try {
                return format(parseISO(selectedTermin.datum_uhrzeit), "EEEE, d. MMMM 'um' HH:mm 'Uhr'", { locale: de });
              } catch { return selectedTermin.datum_uhrzeit; }
            })()}
          </p>
        )}
        <p className="text-xs text-muted-foreground mb-6">
          Wir freuen uns auf dich! 🙏
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setVorname('');
            setNachname('');
            setEmail('');
            setTelefon('');
            setSelectedTermin(null);
            setPhase('select');
          }}
        >
          Weiteren Termin buchen
        </Button>
      </div>,
    );
  }

  // ---------------------------------------------------------------------------
  // Form (phase: form | submitting)
  // ---------------------------------------------------------------------------

  if (phase === 'form' || phase === 'submitting') {
    return shell(
      <div>
        <button
          type="button"
          disabled={phase === 'submitting'}
          onClick={() => setPhase('select')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <IconChevronLeft size={16} stroke={2} className="shrink-0" />
          Andere Zeit wählen
        </button>

        {selectedTermin && (
          <div className="rounded-[20px] bg-primary/5 border border-primary/20 p-4 mb-6">
            <p className="font-medium text-foreground">
              {selectedTermin.kurs?.kursname ?? 'Yoga-Kurs'}
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <IconCalendar size={14} stroke={1.5} className="shrink-0" />
                {(() => {
                  try {
                    return format(parseISO(selectedTermin.datum_uhrzeit), "EEE, d. MMM 'um' HH:mm 'Uhr'", { locale: de });
                  } catch { return selectedTermin.datum_uhrzeit; }
                })()}
              </span>
              {selectedTermin.raum ? (
                <span className="flex items-center gap-1">
                  <IconMapPin size={14} stroke={1.5} className="shrink-0" />
                  {selectedTermin.raum}
                </span>
              ) : null}
              {selectedTermin.kurs?.kursleiter ? (
                <span className="flex items-center gap-1">
                  <IconUsers size={14} stroke={1.5} className="shrink-0" />
                  {selectedTermin.kurs.kursleiter}
                </span>
              ) : null}
            </div>
          </div>
        )}

        <h1 className="text-2xl font-normal mb-1">Jetzt anmelden</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Füll das Formular aus — wir freuen uns auf dich!
        </p>

        <form
          className="rounded-[27px] bg-card border border-border shadow-sm p-6 space-y-4"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="vorname">Vorname *</Label>
              <Input
                id="vorname"
                value={vorname}
                onChange={e => { setVorname(e.target.value); clearError('vorname'); }}
                onFocus={handleFirstInteraction}
                autoComplete="given-name"
                className="max-sm:h-11"
                disabled={phase === 'submitting'}
              />
              {fieldErrors.vorname ? (
                <p className="text-xs text-destructive">{fieldErrors.vorname}</p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nachname">Nachname *</Label>
              <Input
                id="nachname"
                value={nachname}
                onChange={e => { setNachname(e.target.value); clearError('nachname'); }}
                autoComplete="family-name"
                className="max-sm:h-11"
                disabled={phase === 'submitting'}
              />
              {fieldErrors.nachname ? (
                <p className="text-xs text-destructive">{fieldErrors.nachname}</p>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email">
              E-Mail{' '}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              className="max-sm:h-11"
              disabled={phase === 'submitting'}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="telefon">
              Telefon{' '}
              <span className="text-muted-foreground font-normal text-xs">(optional)</span>
            </Label>
            <Input
              id="telefon"
              type="tel"
              value={telefon}
              onChange={e => setTelefon(e.target.value)}
              autoComplete="tel"
              className="max-sm:h-11"
              disabled={phase === 'submitting'}
            />
          </div>

          {submitError ? (
            <p className="text-sm text-destructive" role="alert">{submitError}</p>
          ) : null}

          <Button
            type="submit"
            className="w-full max-sm:h-11"
            disabled={phase === 'submitting'}
          >
            {phase === 'submitting' ? (
              <span className="inline-flex items-center gap-2">
                <IconLoader2 size={16} stroke={1.5} className="animate-spin" />
                Wird gesendet…
              </span>
            ) : (
              'Anmelden'
            )}
          </Button>
        </form>
      </div>,
    );
  }

  // ---------------------------------------------------------------------------
  // Select (phase: select) — list of upcoming classes grouped by day
  // ---------------------------------------------------------------------------

  type DayGroup = { day: string; termine: TerminInfo[] };
  const dayMap = new Map<string, TerminInfo[]>();
  for (const t of termine) {
    const day = t.datum_uhrzeit.slice(0, 10);
    const existing = dayMap.get(day);
    if (existing) existing.push(t);
    else dayMap.set(day, [t]);
  }
  const groups: DayGroup[] = Array.from(dayMap.entries()).map(([day, ts]) => ({ day, termine: ts }));

  return shell(
    <div>
      <h1 className="text-2xl font-normal mb-1">Kursanmeldung</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Wähle deinen Wunschtermin und melde dich direkt an.
      </p>

      {termine.length === 0 ? (
        <div className="rounded-[27px] bg-card border border-border shadow-sm p-10 text-center">
          <IconCalendar size={44} stroke={1.5} className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-medium mb-1">Keine Termine verfügbar</p>
          <p className="text-sm text-muted-foreground">
            Aktuell sind keine Kurstermine zur Anmeldung freigeschaltet. Schau bald wieder rein!
          </p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map(({ day, termine: dayTermine }) => {
            let dayLabel = day;
            try {
              dayLabel = format(parseISO(day), 'EEEE, d. MMMM yyyy', { locale: de });
            } catch { /* fallback to day string */ }

            return (
              <div key={day}>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
                  {dayLabel}
                </p>
                <div className="space-y-2">
                  {dayTermine.map(t => {
                    const maxTN = t.kurs?.max_teilnehmer ?? null;
                    const angemeldet = t.angemeldete_teilnehmer ?? 0;
                    const isFull = maxTN != null && angemeldet >= maxTN;
                    const frei = maxTN != null ? maxTN - angemeldet : null;

                    let timeStr = '';
                    try {
                      timeStr = format(parseISO(t.datum_uhrzeit), 'HH:mm');
                    } catch { /* skip */ }

                    return (
                      <button
                        key={t.id}
                        type="button"
                        disabled={isFull}
                        onClick={() => handleSelectTermin(t)}
                        className={[
                          'w-full text-left rounded-[20px] border p-4 transition-all',
                          isFull
                            ? 'bg-muted/40 border-border opacity-60 cursor-not-allowed'
                            : 'bg-card border-border hover:border-primary hover:bg-primary/5 active:scale-[0.99] cursor-pointer',
                        ].join(' ')}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {t.kurs?.kursname ?? 'Yoga-Kurs'}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1.5 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <IconClock size={13} stroke={1.5} className="shrink-0" />
                                {timeStr}
                                {t.kurs?.dauer_minuten ? ` · ${t.kurs.dauer_minuten} Min.` : ''}
                              </span>
                              {t.raum ? (
                                <span className="flex items-center gap-1">
                                  <IconMapPin size={13} stroke={1.5} className="shrink-0" />
                                  {t.raum}
                                </span>
                              ) : null}
                              {t.kurs?.kursleiter ? (
                                <span className="flex items-center gap-1">
                                  <IconUsers size={13} stroke={1.5} className="shrink-0" />
                                  {t.kurs.kursleiter}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {isFull ? (
                              <span className="text-xs bg-muted text-muted-foreground rounded-full px-2.5 py-1 whitespace-nowrap">
                                Ausgebucht
                              </span>
                            ) : frei != null ? (
                              <span
                                className={[
                                  'text-xs rounded-full px-2.5 py-1 whitespace-nowrap',
                                  frei <= 3
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-green-100 text-green-700',
                                ].join(' ')}
                              >
                                {frei} {frei === 1 ? 'Platz frei' : 'Plätze frei'}
                              </span>
                            ) : (
                              <span className="text-xs bg-primary/10 text-primary rounded-full px-2.5 py-1 whitespace-nowrap">
                                Anmelden →
                              </span>
                            )}
                          </div>
                        </div>
                        {t.kurs?.kurstyp ? (
                          <p className="text-xs text-muted-foreground mt-2">{t.kurs.kurstyp}</p>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>,
  );
}
