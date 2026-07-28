/**
 * Termin anlegen — 4-Schritt-Wizard.
 * Steps: 1) Kurs auswählen → 2) Termin-Details erfassen → 3) Erste Anmeldungen (optional) → 4) Abschließen & anlegen.
 * Reads: kurse (gefiltert: aktiv === true). Writes: termine (createTermineEntry), anmeldungen (createAnmeldungenEntry).
 * Composes: IntentWizardShell, EntitySelectStep, BudgetTracker.
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { BudgetTracker } from '@/components/blocks/BudgetTracker';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kurse } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconCalendarPlus, IconTrash, IconUserPlus, IconCheck, IconArrowRight, IconArrowLeft } from '@tabler/icons-react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Participant {
  id: string;
  vorname: string;
  nachname: string;
  email: string;
  telefon: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const WIZARD_STEPS = [
  { label: 'Kurs' },
  { label: 'Termin' },
  { label: 'Anmeldungen' },
  { label: 'Abschließen' },
];

const STATUS_OPTIONS = LOOKUP_OPTIONS['termine']['status'] ?? [];
const ANMELDEQUELLE_OPTIONS = LOOKUP_OPTIONS['anmeldungen']['anmeldequelle'] ?? [];
const STATUS_ANMELDUNG_OPTIONS = LOOKUP_OPTIONS['anmeldungen']['status_anmeldung'] ?? [];

const DEFAULT_TERMIN_STATUS = STATUS_OPTIONS[0]?.key ?? 'geplant';
const DEFAULT_ANMELDEQUELLE = ANMELDEQUELLE_OPTIONS[0]?.key ?? 'online';
const DEFAULT_STATUS_ANMELDUNG = STATUS_ANMELDUNG_OPTIONS[0]?.key ?? 'neu';

// ─── Component ───────────────────────────────────────────────────────────────

export default function TerminAnlegenPage() {
  const { kurse, loading, error, fetchAll } = useDashboardData();
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Wizard step ────────────────────────────────────────────────────────────
  const [step, setStep] = useState<number>(() => {
    const s = parseInt(searchParams.get('step') ?? '1', 10);
    return s >= 1 && s <= 4 ? s : 1;
  });

  // ── Step 1: Kurs ───────────────────────────────────────────────────────────
  const [selectedKursId, setSelectedKursId] = useState<string>(
    searchParams.get('kursId') ?? ''
  );

  // ── Step 2: Termin-Details ─────────────────────────────────────────────────
  const [datumUhrzeit, setDatumUhrzeit] = useState('');
  const [raum, setRaum] = useState('');
  const [terminStatus, setTerminStatus] = useState(DEFAULT_TERMIN_STATUS);
  const [notizen, setNotizen] = useState('');
  const [step2Error, setStep2Error] = useState('');

  // ── Step 3: Anmeldungen ────────────────────────────────────────────────────
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVorname, setNewVorname] = useState('');
  const [newNachname, setNewNachname] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTelefon, setNewTelefon] = useState('');
  const [addFormError, setAddFormError] = useState('');

  // ── Step 4: Submit ─────────────────────────────────────────────────────────
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdTerminId, setCreatedTerminId] = useState('');
  const [success, setSuccess] = useState(false);

  // ── Sync step to URL ───────────────────────────────────────────────────────
  const handleStepChange = useCallback((newStep: number) => {
    setStep(newStep);
    const params = new URLSearchParams(searchParams);
    params.set('step', String(newStep));
    if (selectedKursId) params.set('kursId', selectedKursId);
    setSearchParams(params, { replace: true });
  }, [searchParams, setSearchParams, selectedKursId]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const selectedKurs: Kurse | undefined = kurse.find(k => k.record_id === selectedKursId);

  const activeKurse = kurse.filter(k => k.fields.aktiv === true);

  const handleKursSelect = (id: string) => {
    setSelectedKursId(id);
    const params = new URLSearchParams(searchParams);
    params.set('kursId', id);
    params.set('step', '2');
    setSearchParams(params, { replace: true });
    setStep(2);
  };

  const handleStep2Continue = () => {
    if (!datumUhrzeit) { setStep2Error('Bitte Datum und Uhrzeit angeben.'); return; }
    if (!raum.trim()) { setStep2Error('Bitte einen Raum angeben.'); return; }
    setStep2Error('');
    handleStepChange(3);
  };

  const handleAddParticipant = () => {
    if (!newVorname.trim() || !newNachname.trim()) {
      setAddFormError('Vor- und Nachname sind Pflichtfelder.');
      return;
    }
    const maxTeilnehmer = selectedKurs?.fields.max_teilnehmer ?? 0;
    if (maxTeilnehmer > 0 && participants.length >= maxTeilnehmer) {
      setAddFormError('Maximale Teilnehmerzahl bereits erreicht.');
      return;
    }
    setAddFormError('');
    setParticipants(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        vorname: newVorname.trim(),
        nachname: newNachname.trim(),
        email: newEmail.trim(),
        telefon: newTelefon.trim(),
      },
    ]);
    setNewVorname('');
    setNewNachname('');
    setNewEmail('');
    setNewTelefon('');
    setShowAddForm(false);
  };

  const handleRemoveParticipant = (id: string) => {
    setParticipants(prev => prev.filter(p => p.id !== id));
  };

  const handleSubmit = async () => {
    if (!selectedKursId) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      // 1. Termin anlegen
      const terminResult = await LivingAppsService.createTermineEntry({
        kurs: createRecordUrl(APP_IDS.KURSE, selectedKursId),
        datum_uhrzeit: datumUhrzeit.slice(0, 16),
        raum: raum.trim(),
        status: terminStatus,
        notizen: notizen.trim() || undefined,
      }) as { id?: string };

      const newTerminId = terminResult?.id ?? '';
      setCreatedTerminId(newTerminId);

      // 2. Anmeldungen anlegen
      if (newTerminId && participants.length > 0) {
        const now = new Date().toISOString().slice(0, 16);
        await Promise.all(
          participants.map(p =>
            LivingAppsService.createAnmeldungenEntry({
              termin: createRecordUrl(APP_IDS.TERMINE, newTerminId),
              vorname: p.vorname,
              nachname: p.nachname,
              email: p.email || undefined,
              telefon: p.telefon || undefined,
              anmeldedatum: now,
              anmeldequelle: DEFAULT_ANMELDEQUELLE,
              status_anmeldung: DEFAULT_STATUS_ANMELDUNG,
            })
          )
        );
      }

      await fetchAll();
      setSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Fehler beim Anlegen des Termins.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedKursId('');
    setDatumUhrzeit('');
    setRaum('');
    setTerminStatus(DEFAULT_TERMIN_STATUS);
    setNotizen('');
    setStep2Error('');
    setParticipants([]);
    setShowAddForm(false);
    setCreatedTerminId('');
    setSuccess(false);
    setSubmitError('');
    const params = new URLSearchParams();
    setSearchParams(params, { replace: true });
    setStep(1);
  };

  const maxTeilnehmer = selectedKurs?.fields.max_teilnehmer ?? 0;

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <IntentWizardShell
      title="Termin anlegen"
      subtitle="Neuen Kurstermin erstellen und erste Anmeldungen erfassen"
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Schritt 1: Kurs auswählen ──────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold mb-1">Kurs auswählen</h2>
            <p className="text-sm text-muted-foreground">
              Wähle den Kurs aus, für den du einen neuen Termin anlegen möchtest.
            </p>
          </div>
          <EntitySelectStep
            items={activeKurse.map(k => ({
              id: k.record_id,
              title: k.fields.kursname ?? '(ohne Name)',
              subtitle: [k.fields.kurstyp?.label, k.fields.kursleiter].filter(Boolean).join(' · '),
              icon: <IconCalendarPlus size={20} className="text-primary" />,
              stats: [
                { label: 'Dauer', value: k.fields.dauer_minuten ? `${k.fields.dauer_minuten} Min.` : '—' },
                { label: 'Max. Teilnehmer', value: k.fields.max_teilnehmer ?? '—' },
              ],
            }))}
            onSelect={handleKursSelect}
            searchPlaceholder="Kurs suchen..."
            emptyIcon={<IconCalendarPlus size={32} />}
            emptyText="Keine aktiven Kurse gefunden."
          />
        </div>
      )}

      {/* ── Schritt 2: Termin-Details ───────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold mb-1">Termin-Details</h2>
            <p className="text-sm text-muted-foreground">
              Lege Datum, Uhrzeit und Raum für den neuen Termin fest.
            </p>
          </div>

          {/* Kurs-Zusammenfassung */}
          {selectedKurs && (
            <div className="rounded-2xl border bg-card p-4 overflow-hidden">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">Ausgewählter Kurs</p>
              <p className="font-semibold text-foreground truncate">{selectedKurs.fields.kursname}</p>
              <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                {selectedKurs.fields.kursleiter && (
                  <span>Kursleiter: <span className="font-medium text-foreground">{selectedKurs.fields.kursleiter}</span></span>
                )}
                {selectedKurs.fields.dauer_minuten && (
                  <span>Dauer: <span className="font-medium text-foreground">{selectedKurs.fields.dauer_minuten} Min.</span></span>
                )}
                {selectedKurs.fields.max_teilnehmer && (
                  <span>Max. Teilnehmer: <span className="font-medium text-foreground">{selectedKurs.fields.max_teilnehmer}</span></span>
                )}
              </div>
            </div>
          )}

          {/* Mini-Formular */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="datum_uhrzeit">
                Datum & Uhrzeit <span className="text-destructive">*</span>
              </label>
              <input
                id="datum_uhrzeit"
                type="datetime-local"
                value={datumUhrzeit}
                onChange={e => setDatumUhrzeit(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="raum">
                Raum <span className="text-destructive">*</span>
              </label>
              <Input
                id="raum"
                value={raum}
                onChange={e => setRaum(e.target.value)}
                placeholder="z. B. Yoga-Saal 1"
                className="w-full"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="status">
                Status
              </label>
              <Select value={terminStatus} onValueChange={setTerminStatus}>
                <SelectTrigger id="status" className="w-full">
                  <SelectValue placeholder="Status wählen" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="notizen">
                Notizen <span className="text-muted-foreground text-xs">(optional)</span>
              </label>
              <Textarea
                id="notizen"
                value={notizen}
                onChange={e => setNotizen(e.target.value)}
                placeholder="Interne Hinweise zum Termin..."
                rows={3}
                className="w-full resize-none"
              />
            </div>
          </div>

          {step2Error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{step2Error}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleStepChange(1)}
              className="gap-1.5"
            >
              <IconArrowLeft size={16} />
              Zurück
            </Button>
            <Button onClick={handleStep2Continue} className="gap-1.5 flex-1">
              Weiter zu Anmeldungen
              <IconArrowRight size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Schritt 3: Erste Anmeldungen ───────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold mb-1">Erste Anmeldungen erfassen</h2>
            <p className="text-sm text-muted-foreground">(optional) — du kannst Anmeldungen auch später hinzufügen.</p>
          </div>

          {/* Kapazitäts-Tracker */}
          {maxTeilnehmer > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">
                Kapazität: <span className="text-primary">{participants.length}</span> von {maxTeilnehmer} Plätzen belegt
              </p>
              <BudgetTracker
                budget={maxTeilnehmer}
                booked={participants.length}
                label="Plätze"
                showRemaining={false}
              />
            </div>
          )}

          {/* Teilnehmerliste */}
          {participants.length > 0 && (
            <div className="space-y-2">
              {participants.map(p => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 overflow-hidden"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xs font-semibold text-primary">
                      {p.vorname.charAt(0)}{p.nachname.charAt(0)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.vorname} {p.nachname}</p>
                    {(p.email || p.telefon) && (
                      <p className="text-xs text-muted-foreground truncate">
                        {[p.email, p.telefon].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleRemoveParticipant(p.id)}
                    className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Entfernen"
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Formular: Neue Anmeldung */}
          {showAddForm ? (
            <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
              <p className="text-sm font-semibold">Neue Anmeldung</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Vorname *</label>
                  <Input
                    value={newVorname}
                    onChange={e => setNewVorname(e.target.value)}
                    placeholder="Vorname"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Nachname *</label>
                  <Input
                    value={newNachname}
                    onChange={e => setNewNachname(e.target.value)}
                    placeholder="Nachname"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">E-Mail</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="email@beispiel.de"
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Telefon</label>
                  <Input
                    type="tel"
                    value={newTelefon}
                    onChange={e => setNewTelefon(e.target.value)}
                    placeholder="+49 ..."
                    className="w-full"
                  />
                </div>
              </div>
              {addFormError && (
                <p className="text-xs text-destructive">{addFormError}</p>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => { setShowAddForm(false); setAddFormError(''); }} className="flex-1">
                  Abbrechen
                </Button>
                <Button onClick={handleAddParticipant} className="flex-1 gap-1.5">
                  <IconUserPlus size={15} />
                  Hinzufügen
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              onClick={() => setShowAddForm(true)}
              className="w-full gap-1.5"
              disabled={maxTeilnehmer > 0 && participants.length >= maxTeilnehmer}
            >
              <IconUserPlus size={16} />
              Anmeldung hinzufügen
            </Button>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleStepChange(2)}
              className="gap-1.5"
            >
              <IconArrowLeft size={16} />
              Zurück
            </Button>
            <Button
              variant="outline"
              onClick={() => handleStepChange(4)}
              className="flex-1"
            >
              Weiter ohne Anmeldungen
            </Button>
            {participants.length > 0 && (
              <Button onClick={() => handleStepChange(4)} className="flex-1 gap-1.5">
                Weiter ({participants.length})
                <IconArrowRight size={16} />
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ── Schritt 4: Zusammenfassung & Abschließen ────────────────────────── */}
      {step === 4 && !success && (
        <div className="space-y-5">
          <div>
            <h2 className="text-lg font-semibold mb-1">Zusammenfassung</h2>
            <p className="text-sm text-muted-foreground">Bitte prüfe alle Angaben vor dem Anlegen.</p>
          </div>

          {/* Zusammenfassungskarte */}
          <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
            {/* Kurs */}
            <div className="space-y-1">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Kurs</p>
              <p className="font-semibold text-foreground truncate">{selectedKurs?.fields.kursname ?? '—'}</p>
              {selectedKurs?.fields.kursleiter && (
                <p className="text-sm text-muted-foreground truncate">Kursleiter: {selectedKurs.fields.kursleiter}</p>
              )}
            </div>

            <div className="border-t" />

            {/* Termin */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Datum & Uhrzeit</p>
                <p className="text-sm font-medium text-foreground">
                  {datumUhrzeit
                    ? new Date(datumUhrzeit).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Raum</p>
                <p className="text-sm font-medium text-foreground truncate">{raum || '—'}</p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Status</p>
                <p className="text-sm font-medium text-foreground">
                  {STATUS_OPTIONS.find(o => o.key === terminStatus)?.label ?? terminStatus}
                </p>
              </div>
              {notizen && (
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-0.5">Notizen</p>
                  <p className="text-sm text-foreground line-clamp-2">{notizen}</p>
                </div>
              )}
            </div>

            {/* Anmeldungen */}
            <div className="border-t" />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
                Anmeldungen
              </p>
              {participants.length === 0 ? (
                <p className="text-sm text-muted-foreground">Keine Anmeldungen erfasst.</p>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">{participants.length} Teilnehmer</p>
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {participants.map(p => (
                      <li key={p.id} className="truncate">• {p.vorname} {p.nachname}{p.email ? ` (${p.email})` : ''}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {submitError && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">{submitError}</p>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleStepChange(3)}
              className="gap-1.5"
              disabled={submitting}
            >
              <IconArrowLeft size={16} />
              Zurück
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 gap-1.5"
            >
              {submitting ? 'Wird angelegt…' : 'Termin anlegen'}
              {!submitting && <IconCheck size={16} />}
            </Button>
          </div>
        </div>
      )}

      {/* ── Erfolgszustand ─────────────────────────────────────────────────── */}
      {step === 4 && success && (
        <div className="flex flex-col items-center justify-center py-12 gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <IconCheck size={28} className="text-primary" stroke={2.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground mb-1">Termin erfolgreich angelegt!</h2>
            <p className="text-sm text-muted-foreground max-w-xs">
              {participants.length > 0
                ? `Der Termin wurde angelegt und ${participants.length} Anmeldung${participants.length > 1 ? 'en wurden' : ' wurde'} erfasst.`
                : 'Der Termin wurde angelegt. Du kannst jetzt Anmeldungen hinzufügen.'}
            </p>
          </div>

          {createdTerminId && (
            <div className="text-xs text-muted-foreground font-mono bg-muted px-3 py-1.5 rounded-lg">
              Termin-ID: {createdTerminId}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button onClick={handleReset} variant="outline" className="flex-1 gap-1.5">
              <IconCalendarPlus size={16} />
              Weiteren Termin anlegen
            </Button>
            <a href="#/" className="flex-1">
              <Button variant="default" className="w-full">
                Zum Dashboard
              </Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
