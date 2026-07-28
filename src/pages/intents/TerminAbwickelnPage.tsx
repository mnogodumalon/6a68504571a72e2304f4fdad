/**
 * Termin abwickeln — 3-Schritt-Wizard.
 * Steps: 1) Termin auswählen → 2) Anmeldungen verwalten & neue Teilnehmer hinzufügen → 3) Termin abschließen.
 * Reads: termine, kurse, anmeldungen. Writes: anmeldungen (createAnmeldungenEntry, updateAnmeldungenEntry), termine (updateTermineEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { enrichTermine, enrichAnmeldungen } from '@/lib/enrich';
import type { EnrichedTermine, EnrichedAnmeldungen } from '@/types/enriched';
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
import { IconCalendarEvent, IconUsers, IconCheck, IconPlus, IconX, IconLoader2 } from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Termin wählen' },
  { label: 'Anmeldungen' },
  { label: 'Abschließen' },
];

const statusAnmeldungOptions = LOOKUP_OPTIONS['anmeldungen']['status_anmeldung'] ?? [];
const anmeldequelleOptions = LOOKUP_OPTIONS['anmeldungen']['anmeldequelle'] ?? [];
const terminStatusOptions = LOOKUP_OPTIONS['termine']['status'] ?? [];

function formatDatum(datum: string | undefined): string {
  if (!datum) return '–';
  try {
    return format(parseISO(datum), 'dd.MM.yyyy HH:mm', { locale: de });
  } catch {
    return datum;
  }
}

export default function TerminAbwickelnPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { termine, anmeldungen, kurseMap, termineMap, loading, error, fetchAll } = useDashboardData();

  // Step state — initialize from URL
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const [step, setStep] = useState<number>(
    initialStep >= 1 && initialStep <= 3 ? initialStep : 1
  );

  const initialTerminId = searchParams.get('terminId') ?? null;
  const [selectedTerminId, setSelectedTerminId] = useState<string | null>(initialTerminId);

  // Step 2 — new registration form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newVorname, setNewVorname] = useState('');
  const [newNachname, setNewNachname] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newTelefon, setNewTelefon] = useState('');
  const [savingNew, setSavingNew] = useState(false);
  const [newError, setNewError] = useState<string | null>(null);

  // Inline status update tracking
  const [updatingStatus, setUpdatingStatus] = useState<Set<string>>(new Set());

  // Step 3 — termin update
  const [terminStatus, setTerminStatus] = useState<string>('');
  const [terminNotizen, setTerminNotizen] = useState<string>('');
  const [savingTermin, setSavingTermin] = useState(false);
  const [terminSaveError, setTerminSaveError] = useState<string | null>(null);
  const [terminSaved, setTerminSaved] = useState(false);

  // Sync step to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('step', String(step));
    if (selectedTerminId) {
      params.set('terminId', selectedTerminId);
    } else {
      params.delete('terminId');
    }
    setSearchParams(params, { replace: true });
  }, [step, selectedTerminId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Enriched data
  const enrichedTermine: EnrichedTermine[] = useMemo(
    () => enrichTermine(termine, { kurseMap }),
    [termine, kurseMap]
  );

  const enrichedAnmeldungen: EnrichedAnmeldungen[] = useMemo(
    () => enrichAnmeldungen(anmeldungen, { termineMap }),
    [anmeldungen, termineMap]
  );

  // Selected termin data
  const selectedTermin = useMemo(
    () => enrichedTermine.find(t => t.record_id === selectedTerminId) ?? null,
    [enrichedTermine, selectedTerminId]
  );

  // Anmeldungen for selected termin
  const terminAnmeldungen: EnrichedAnmeldungen[] = useMemo(() => {
    if (!selectedTerminId) return [];
    return enrichedAnmeldungen.filter(
      a => extractRecordId(a.fields.termin) === selectedTerminId
    );
  }, [enrichedAnmeldungen, selectedTerminId]);

  // Counts
  const confirmedCount = useMemo(
    () => terminAnmeldungen.filter(a => a.fields.status_anmeldung?.key === 'bestaetigt').length,
    [terminAnmeldungen]
  );

  const maxTeilnehmer = useMemo(() => {
    if (!selectedTerminId) return 0;
    const terminRecord = termineMap.get(selectedTerminId);
    const kursId = extractRecordId(terminRecord?.fields.kurs);
    if (!kursId) return 0;
    return kurseMap.get(kursId)?.fields.max_teilnehmer ?? 0;
  }, [selectedTerminId, termineMap, kurseMap]);

  // Status counts for step 3
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    terminAnmeldungen.forEach(a => {
      const key = a.fields.status_anmeldung?.key ?? 'unbekannt';
      counts[key] = (counts[key] ?? 0) + 1;
    });
    return counts;
  }, [terminAnmeldungen]);

  // Initialize step 3 fields when termin is selected
  useEffect(() => {
    if (selectedTermin) {
      setTerminStatus(selectedTermin.fields.status?.key ?? terminStatusOptions[0]?.key ?? '');
      setTerminNotizen(selectedTermin.fields.notizen ?? '');
    }
  }, [selectedTermin]);

  function handleStepChange(n: number) {
    setStep(n);
  }

  function handleTerminSelect(id: string) {
    setSelectedTerminId(id);
    setTerminSaved(false);
    setStep(2);
  }

  async function handleStatusChange(anmeldungId: string, newKey: string) {
    setUpdatingStatus(prev => new Set(prev).add(anmeldungId));
    try {
      await LivingAppsService.updateAnmeldungenEntry(anmeldungId, { status_anmeldung: newKey });
      await fetchAll();
    } finally {
      setUpdatingStatus(prev => {
        const next = new Set(prev);
        next.delete(anmeldungId);
        return next;
      });
    }
  }

  async function handleNewAnmeldung() {
    if (!selectedTerminId) return;
    if (!newVorname.trim() || !newNachname.trim()) {
      setNewError('Vor- und Nachname sind Pflichtfelder.');
      return;
    }
    setSavingNew(true);
    setNewError(null);
    try {
      const now = new Date();
      const anmeldedatum = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      await LivingAppsService.createAnmeldungenEntry({
        termin: createRecordUrl(APP_IDS.TERMINE, selectedTerminId),
        vorname: newVorname.trim(),
        nachname: newNachname.trim(),
        email: newEmail.trim() || undefined,
        telefon: newTelefon.trim() || undefined,
        anmeldedatum,
        anmeldequelle: anmeldequelleOptions[0]?.key ?? 'vor_ort',
        status_anmeldung: statusAnmeldungOptions[0]?.key ?? 'neu',
      });
      await fetchAll();
      setNewVorname('');
      setNewNachname('');
      setNewEmail('');
      setNewTelefon('');
      setShowNewForm(false);
    } catch (err) {
      setNewError(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setSavingNew(false);
    }
  }

  async function handleTerminAbschliessen() {
    if (!selectedTerminId) return;
    setSavingTermin(true);
    setTerminSaveError(null);
    try {
      await LivingAppsService.updateTermineEntry(selectedTerminId, {
        status: terminStatus,
        notizen: terminNotizen || undefined,
        angemeldete_teilnehmer: confirmedCount,
      });
      await fetchAll();
      setTerminSaved(true);
    } catch (err) {
      setTerminSaveError(err instanceof Error ? err.message : 'Fehler beim Speichern.');
    } finally {
      setSavingTermin(false);
    }
  }

  function handleReset() {
    setSelectedTerminId(null);
    setTerminSaved(false);
    setTerminStatus('');
    setTerminNotizen('');
    setShowNewForm(false);
    setNewVorname('');
    setNewNachname('');
    setNewEmail('');
    setNewTelefon('');
    setNewError(null);
    setTerminSaveError(null);
    setStep(1);
  }

  // Capacity bar percentage
  const capacityPercent = maxTeilnehmer > 0
    ? Math.min(Math.round((terminAnmeldungen.length / maxTeilnehmer) * 100), 100)
    : 0;
  const capacityBarColor =
    capacityPercent >= 100 ? 'bg-red-500' :
    capacityPercent >= 80 ? 'bg-amber-500' :
    'bg-primary';

  return (
    <IntentWizardShell
      title="Termin abwickeln"
      subtitle="Anmeldungen verwalten, Teilnehmer hinzufügen und Termin abschließen"
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ────────────────── Step 1: Termin auswählen ────────────────── */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Wähle den Termin aus, den du abwickeln möchtest.
          </p>
          <EntitySelectStep
            items={enrichedTermine.map(t => ({
              id: t.record_id,
              title: `${formatDatum(t.fields.datum_uhrzeit)}${t.fields.raum ? ' · ' + t.fields.raum : ''}`,
              subtitle: t.kursName || '–',
              status: t.fields.status
                ? { key: t.fields.status.key, label: t.fields.status.label }
                : undefined,
              stats: [
                { label: 'Angemeldet', value: t.fields.angemeldete_teilnehmer ?? 0 },
              ],
              icon: <IconCalendarEvent size={20} className="text-primary" />,
            }))}
            onSelect={handleTerminSelect}
            searchPlaceholder="Termin suchen..."
            emptyIcon={<IconCalendarEvent size={32} />}
            emptyText="Keine Termine gefunden."
          />
        </div>
      )}

      {/* ────────────────── Step 2: Anmeldungen & Teilnehmerliste ────────────────── */}
      {step === 2 && selectedTermin && (
        <div className="space-y-5">
          {/* Termin-Info */}
          <div className="rounded-2xl border bg-card p-4 overflow-hidden">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconCalendarEvent size={20} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm truncate">
                  {formatDatum(selectedTermin.fields.datum_uhrzeit)}
                  {selectedTermin.fields.raum ? ` · ${selectedTermin.fields.raum}` : ''}
                </p>
                <p className="text-xs text-muted-foreground truncate">{selectedTermin.kursName || '–'}</p>
              </div>
              {selectedTermin.fields.status && (
                <div className="ml-auto shrink-0">
                  <StatusBadge
                    statusKey={selectedTermin.fields.status.key}
                    label={selectedTermin.fields.status.label}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Kapazitäts-Anzeige */}
          <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IconUsers size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">Kapazität</span>
              </div>
              <span className="text-sm font-bold">
                {terminAnmeldungen.length}
                {maxTeilnehmer > 0 && (
                  <span className="text-muted-foreground font-normal"> / {maxTeilnehmer} Plätze</span>
                )}
              </span>
            </div>
            {maxTeilnehmer > 0 && (
              <>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${capacityBarColor}`}
                    style={{ width: `${capacityPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Bestätigt:{' '}
                    <span className="font-semibold text-foreground">{confirmedCount}</span>
                  </span>
                  <span>{capacityPercent}% belegt</span>
                </div>
              </>
            )}
          </div>

          {/* Teilnehmerliste */}
          <div className="rounded-2xl border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b">
              <h3 className="font-semibold text-sm">
                Anmeldungen ({terminAnmeldungen.length})
              </h3>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setShowNewForm(v => !v)}
                className="gap-1.5"
              >
                {showNewForm ? (
                  <>
                    <IconX size={14} />
                    Abbrechen
                  </>
                ) : (
                  <>
                    <IconPlus size={14} />
                    Neue Anmeldung
                  </>
                )}
              </Button>
            </div>

            {/* Inline-Formular neue Anmeldung */}
            {showNewForm && (
              <div className="px-4 py-4 border-b bg-secondary/30 space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Neue Anmeldung erfassen
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    placeholder="Vorname *"
                    value={newVorname}
                    onChange={e => setNewVorname(e.target.value)}
                    className="w-full"
                  />
                  <Input
                    placeholder="Nachname *"
                    value={newNachname}
                    onChange={e => setNewNachname(e.target.value)}
                    className="w-full"
                  />
                  <Input
                    type="email"
                    placeholder="E-Mail (optional)"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    className="w-full"
                  />
                  <Input
                    type="tel"
                    placeholder="Telefon (optional)"
                    value={newTelefon}
                    onChange={e => setNewTelefon(e.target.value)}
                    className="w-full"
                  />
                </div>
                {newError && (
                  <p className="text-xs text-destructive">{newError}</p>
                )}
                <Button
                  onClick={handleNewAnmeldung}
                  disabled={savingNew}
                  className="gap-1.5"
                >
                  {savingNew ? (
                    <IconLoader2 size={14} className="animate-spin" />
                  ) : (
                    <IconCheck size={14} />
                  )}
                  Anmeldung speichern
                </Button>
              </div>
            )}

            {terminAnmeldungen.length === 0 ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                Noch keine Anmeldungen für diesen Termin.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Name</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs hidden sm:table-cell">E-Mail</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs hidden md:table-cell">Telefon</th>
                      <th className="px-4 py-2 text-left font-medium text-muted-foreground text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {terminAnmeldungen.map(a => (
                      <tr key={a.record_id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <span className="font-medium truncate max-w-[160px] block">
                            {[a.fields.vorname, a.fields.nachname].filter(Boolean).join(' ') || '–'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                          <span className="truncate max-w-[180px] block">{a.fields.email || '–'}</span>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                          {a.fields.telefon || '–'}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {updatingStatus.has(a.record_id) ? (
                              <IconLoader2 size={14} className="animate-spin text-muted-foreground" />
                            ) : null}
                            <Select
                              value={a.fields.status_anmeldung?.key ?? ''}
                              onValueChange={val => handleStatusChange(a.record_id, val)}
                              disabled={updatingStatus.has(a.record_id)}
                            >
                              <SelectTrigger className="w-full min-w-[130px] h-8 text-xs">
                                <SelectValue>
                                  {a.fields.status_anmeldung ? (
                                    <StatusBadge
                                      statusKey={a.fields.status_anmeldung.key}
                                      label={a.fields.status_anmeldung.label}
                                    />
                                  ) : (
                                    <span className="text-muted-foreground">Status wählen</span>
                                  )}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                {statusAnmeldungOptions.map(opt => (
                                  <SelectItem key={opt.key} value={opt.key}>
                                    {opt.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Navigation */}
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" onClick={() => setStep(1)}>
              Zurück
            </Button>
            <Button onClick={() => setStep(3)} className="gap-1.5">
              Weiter zum Abschluss
              <IconCheck size={15} />
            </Button>
          </div>
        </div>
      )}

      {/* ────────────────── Step 3: Termin abschließen ────────────────── */}
      {step === 3 && selectedTermin && (
        <div className="space-y-5">
          {terminSaved ? (
            /* Erfolgs-Zustand */
            <div className="rounded-2xl border bg-card p-8 text-center space-y-4 overflow-hidden">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <IconCheck size={28} className="text-green-600" stroke={2.5} />
              </div>
              <div>
                <h3 className="text-lg font-bold">Termin aktualisiert!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {formatDatum(selectedTermin.fields.datum_uhrzeit)}
                  {selectedTermin.fields.raum ? ` · ${selectedTermin.fields.raum}` : ''}
                </p>
              </div>
              {/* Abschluss-Statistiken */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-2xl font-bold">{terminAnmeldungen.length}</p>
                  <p className="text-xs text-muted-foreground">Gesamt angemeldet</p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3">
                  <p className="text-2xl font-bold text-green-600">{confirmedCount}</p>
                  <p className="text-xs text-muted-foreground">Bestätigt</p>
                </div>
                <div className="rounded-xl bg-secondary/50 p-3 col-span-2 sm:col-span-1">
                  <p className="text-sm font-semibold truncate">
                    {terminStatusOptions.find(o => o.key === terminStatus)?.label ?? terminStatus}
                  </p>
                  <p className="text-xs text-muted-foreground">Gesetzter Status</p>
                </div>
              </div>
              <div className="flex gap-3 justify-center flex-wrap pt-2">
                <Button onClick={handleReset} variant="outline">
                  Neuen Termin abwickeln
                </Button>
                <a href="#/">
                  <Button>Zurück zum Dashboard</Button>
                </a>
              </div>
            </div>
          ) : (
            <>
              {/* Zusammenfassung */}
              <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
                <h3 className="font-semibold text-sm">Zusammenfassung</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Kurs:</span>{' '}
                    <span className="font-medium">{selectedTermin.kursName || '–'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Datum:</span>{' '}
                    <span className="font-medium">{formatDatum(selectedTermin.fields.datum_uhrzeit)}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Raum:</span>{' '}
                    <span className="font-medium">{selectedTermin.fields.raum || '–'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Anmeldungen gesamt:</span>{' '}
                    <span className="font-medium">{terminAnmeldungen.length}</span>
                  </div>
                </div>
                {/* Status-Aufschlüsselung */}
                {Object.keys(statusCounts).length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {statusAnmeldungOptions
                      .filter(opt => statusCounts[opt.key] != null)
                      .map(opt => (
                        <span key={opt.key} className="inline-flex items-center gap-1 text-xs rounded-full border px-2 py-0.5 bg-muted">
                          <StatusBadge statusKey={opt.key} label={opt.label} />
                          <span className="font-semibold ml-1">{statusCounts[opt.key]}</span>
                        </span>
                      ))}
                  </div>
                )}
              </div>

              {/* Termin-Status & Notizen */}
              <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
                <h3 className="font-semibold text-sm">Termin aktualisieren</h3>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Status
                  </label>
                  <Select value={terminStatus} onValueChange={setTerminStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Status wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {terminStatusOptions.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Notizen (optional)
                  </label>
                  <Textarea
                    placeholder="Notizen zum Termin..."
                    value={terminNotizen}
                    onChange={e => setTerminNotizen(e.target.value)}
                    rows={3}
                    className="w-full resize-none"
                  />
                </div>

                <div className="text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
                  Bestätigte Anmeldungen werden automatisch als{' '}
                  <span className="font-semibold text-foreground">{confirmedCount}</span>{' '}
                  angemeldete Teilnehmer gesetzt.
                </div>

                {terminSaveError && (
                  <p className="text-sm text-destructive">{terminSaveError}</p>
                )}
              </div>

              {/* Navigation */}
              <div className="flex gap-3 flex-wrap">
                <Button variant="outline" onClick={() => setStep(2)}>
                  Zurück
                </Button>
                <Button
                  onClick={handleTerminAbschliessen}
                  disabled={savingTermin || !terminStatus}
                  className="gap-1.5"
                >
                  {savingTermin ? (
                    <IconLoader2 size={15} className="animate-spin" />
                  ) : (
                    <IconCheck size={15} />
                  )}
                  Termin aktualisieren
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
