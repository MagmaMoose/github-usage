/**
 * Editor for the automatic (scheduled) report delivery, opened from the
 * ServerControls toolbar. It reads the current config from GET /api/schedules,
 * lets the operator turn daily / weekly / monthly delivery on or off, pick the
 * time (and weekday / day-of-month), choose which channels each schedule targets
 * and the timezone, then persists via PUT /api/schedules — which takes effect
 * immediately, no redeploy.
 *
 * This is the dashboard-native way to configure what previously required setting
 * SCHEDULE_* environment variables and restarting the pod.
 */
import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Dialog, Flash, FormControl, Select, Spinner, Text, TextInput, ToggleSwitch } from '@primer/react';
import {
  getSchedules,
  putSchedules,
  type Frequency,
  type ScheduleConfig,
  type ScheduleEntry,
} from '../lib/server-data';
import {
  formatNextRun,
  normalizeChannels,
  parseTimeValue,
  timezoneOptions,
  toTimeValue,
} from '../lib/schedule-format';

const FREQUENCIES: Frequency[] = ['daily', 'weekly', 'monthly'];

const FREQUENCY_LABELS: Record<Frequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

const WEEKDAY_LABELS: Record<string, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const CHANNEL_LABELS: Record<string, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  email: 'Email',
};

interface ScheduleDialogProps {
  onDismiss: () => void;
  /** Called with the saved config so the toolbar can refresh its status. */
  onSaved?: (config: ScheduleConfig) => void;
}

export function ScheduleDialog({ onDismiss, onSaved }: ScheduleDialogProps) {
  const [config, setConfig] = useState<ScheduleConfig | null>(null);
  const [timezone, setTimezone] = useState('UTC');
  const [entries, setEntries] = useState<Record<Frequency, ScheduleEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const cfg = await getSchedules();
      if (cancelled) return;
      if (!cfg) {
        setError('Could not load the schedule configuration.');
        setLoading(false);
        return;
      }
      setConfig(cfg);
      setTimezone(cfg.timezone);
      setEntries(cfg.entries);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const channelsEnabled = useMemo(() => config?.channels_enabled ?? [], [config]);
  const weekdays = config?.weekdays ?? Object.keys(WEEKDAY_LABELS);
  const tzOptions = useMemo(() => timezoneOptions(timezone), [timezone]);
  const nextRunByFreq = useMemo(() => {
    const map: Partial<Record<Frequency, string>> = {};
    for (const j of config?.jobs ?? []) {
      const freq = j.id.replace('report-', '') as Frequency;
      if (j.next_run) map[freq] = j.next_run;
    }
    return map;
  }, [config]);

  const patchEntry = useCallback((freq: Frequency, patch: Partial<ScheduleEntry>) => {
    setEntries((prev) => (prev ? { ...prev, [freq]: { ...prev[freq], ...patch } } : prev));
  }, []);

  const handleSave = useCallback(async () => {
    if (!entries) return;
    setSaving(true);
    setError(null);
    const body = {
      timezone,
      entries: FREQUENCIES.reduce(
        (acc, freq) => {
          const e = entries[freq];
          acc[freq] = {
            ...e,
            channels: normalizeChannels(e.channels ?? channelsEnabled, channelsEnabled),
          };
          return acc;
        },
        {} as Record<Frequency, ScheduleEntry>,
      ),
    };
    const result = await putSchedules(body);
    setSaving(false);
    if (!result) {
      setError('Could not reach the server. Your changes were not saved.');
      return;
    }
    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSaved?.(result.config);
    onDismiss();
  }, [entries, timezone, channelsEnabled, onSaved, onDismiss]);

  return (
    <Dialog
      title="Scheduled reports"
      subtitle="Deliver a usage report automatically on a recurring schedule. Changes apply immediately."
      onClose={onDismiss}
      width="large"
      footerButtons={[
        { content: 'Cancel', onClick: onDismiss },
        {
          content: saving ? 'Saving…' : 'Save schedule',
          buttonType: 'primary',
          onClick: () => void handleSave(),
          disabled: loading || saving || !entries,
        },
      ]}
    >
      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
          <Spinner />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <Flash variant="danger">{error}</Flash>}

          {channelsEnabled.length === 0 && (
            <Flash variant="warning">
              No notification channels are configured, so scheduled reports have nowhere to go.
              Set a Slack/Teams webhook or SMTP settings (env or Helm values) to enable delivery.
            </Flash>
          )}

          <FormControl>
            <FormControl.Label>Timezone</FormControl.Label>
            <Select
              value={timezone}
              onChange={(e) => setTimezone(e.currentTarget.value)}
              aria-label="Timezone"
            >
              {tzOptions.map((tz) => (
                <Select.Option key={tz} value={tz}>
                  {tz}
                </Select.Option>
              ))}
            </Select>
            <FormControl.Caption>Schedules fire in this timezone.</FormControl.Caption>
          </FormControl>

          {entries &&
            FREQUENCIES.map((freq) => (
              <FrequencyRow
                key={freq}
                freq={freq}
                entry={entries[freq]}
                weekdays={weekdays}
                channelsEnabled={channelsEnabled}
                nextRun={nextRunByFreq[freq] ?? null}
                onPatch={(patch) => patchEntry(freq, patch)}
              />
            ))}
        </div>
      )}
    </Dialog>
  );
}

interface FrequencyRowProps {
  freq: Frequency;
  entry: ScheduleEntry;
  weekdays: string[];
  channelsEnabled: string[];
  nextRun: string | null;
  onPatch: (patch: Partial<ScheduleEntry>) => void;
}

function FrequencyRow({
  freq,
  entry,
  weekdays,
  channelsEnabled,
  nextRun,
  onPatch,
}: FrequencyRowProps) {
  const labelId = useId();
  // While editing we keep channels as an explicit list; null means "all".
  const selectedChannels = entry.channels ?? channelsEnabled;
  // Show every configured channel, plus any the schedule targets that is no
  // longer configured (so we never silently drop it).
  const channelChoices = Array.from(new Set([...channelsEnabled, ...(entry.channels ?? [])]));

  const time = toTimeValue(entry.hour, entry.minute);
  const onTimeChange = (value: string) => {
    const parsed = parseTimeValue(value);
    if (parsed) onPatch(parsed);
  };

  const toggleChannel = (channel: string, checked: boolean) => {
    const set = new Set(selectedChannels);
    if (checked) set.add(channel);
    else set.delete(channel);
    onPatch({ channels: Array.from(set) });
  };

  return (
    <section
      style={{
        border: '1px solid var(--borderColor-default, var(--color-border-default))',
        borderRadius: 8,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <Text id={labelId} style={{ fontWeight: 600 }}>
            {FREQUENCY_LABELS[freq]}
          </Text>
          {entry.enabled && nextRun && (
            <Text style={{ fontSize: 12, color: 'var(--fgColor-muted)' }}>
              Next run: {formatNextRun(nextRun)}
            </Text>
          )}
        </div>
        <ToggleSwitch
          size="small"
          aria-labelledby={labelId}
          checked={entry.enabled}
          // A *controlled* Primer ToggleSwitch (checked provided) does NOT fire
          // onChange on click — its click handler only updates internal state
          // when uncontrolled. So we flip our own state from onClick instead.
          onClick={() => onPatch({ enabled: !entry.enabled })}
        />
      </div>

      {entry.enabled && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <FormControl>
              <FormControl.Label>Time</FormControl.Label>
              <TextInput
                type="time"
                value={time}
                onChange={(e) => onTimeChange(e.currentTarget.value)}
                aria-label={`${FREQUENCY_LABELS[freq]} time`}
              />
            </FormControl>

            {freq === 'weekly' && (
              <FormControl>
                <FormControl.Label>Day of week</FormControl.Label>
                <Select
                  value={entry.day_of_week}
                  onChange={(e) => onPatch({ day_of_week: e.currentTarget.value })}
                  aria-label="Day of week"
                >
                  {weekdays.map((d) => (
                    <Select.Option key={d} value={d}>
                      {WEEKDAY_LABELS[d] ?? d}
                    </Select.Option>
                  ))}
                </Select>
              </FormControl>
            )}

            {freq === 'monthly' && (
              <FormControl>
                <FormControl.Label>Day of month</FormControl.Label>
                <Select
                  value={String(entry.day_of_month)}
                  onChange={(e) => onPatch({ day_of_month: Number(e.currentTarget.value) })}
                  aria-label="Day of month"
                >
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <Select.Option key={d} value={String(d)}>
                      {d}
                    </Select.Option>
                  ))}
                </Select>
              </FormControl>
            )}
          </div>

          {channelChoices.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <Text style={{ fontSize: 12, color: 'var(--fgColor-muted)' }}>Send to</Text>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {channelChoices.map((channel) => {
                  const configured = channelsEnabled.includes(channel);
                  return (
                    <label
                      key={channel}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14 }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedChannels.includes(channel)}
                        onChange={(e) => toggleChannel(channel, e.currentTarget.checked)}
                      />
                      {CHANNEL_LABELS[channel] ?? channel}
                      {!configured && (
                        <Text style={{ fontSize: 11, color: 'var(--fgColor-muted)' }}>
                          (not configured)
                        </Text>
                      )}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <details open={Boolean(entry.cron)}>
            <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--fgColor-muted)' }}>
              Advanced: custom cron
            </summary>
            <div style={{ marginTop: 8 }}>
              <TextInput
                block
                placeholder="e.g. 0 9 * * 1  (min hour day month weekday)"
                value={entry.cron}
                onChange={(e) => onPatch({ cron: e.currentTarget.value })}
                aria-label={`${FREQUENCY_LABELS[freq]} custom cron`}
              />
              <Text as="p" style={{ fontSize: 12, color: 'var(--fgColor-muted)', marginTop: 4 }}>
                When set, this 5-field cron overrides the time fields above.
              </Text>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
