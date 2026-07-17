/**
 * A small toolbar shown ONLY when the FastAPI backend is present (see
 * useServerData). It surfaces where the data came from (live GitHub vs demo),
 * when it was last fetched, a manual "Refresh from GitHub", and an on-demand
 * "Send report" over the configured Slack/Teams/Email channels.
 *
 * On static hosting the backend is absent, `state.available` is false, and this
 * renders nothing.
 */
import { useMemo, useState } from 'react';
import { ActionList, ActionMenu, IconButton, Label, Spinner, Text, Tooltip } from '@primer/react';
import {
  AlertFillIcon,
  CheckCircleFillIcon,
  ClockIcon,
  GearIcon,
  PaperAirplaneIcon,
  SyncIcon,
} from '@primer/octicons-react';
import type { ServerDataState } from '../hooks/useServerData';
import { ScheduleDialog } from './ScheduleDialog';

const CHANNEL_LABELS: Record<string, string> = {
  slack: 'Slack',
  teams: 'Microsoft Teams',
  email: 'Email',
};

function relativeTime(epochSeconds: number | null): string {
  if (!epochSeconds) return '';
  const secs = Math.max(0, Date.now() / 1000 - epochSeconds);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function ServerControls({ state }: { state: ServerDataState }) {
  const { available, status, source, fetchedAt, loading, refreshing, sending, sendResult, error } = state;
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const channels = status?.channels ?? [];
  const scheduleSummary = useMemo(() => {
    const s = status?.schedules;
    if (!s) return '';
    const parts = [
      s.daily && 'daily',
      s.weekly && 'weekly',
      s.monthly && 'monthly',
    ].filter(Boolean);
    return parts.length ? `Scheduled: ${parts.join(', ')} (${s.timezone})` : '';
  }, [status]);

  if (!available) return null;

  return (
    <>
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 16,
        zIndex: 3,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        borderRadius: 8,
        border: '1px solid var(--borderColor-default, var(--color-border-default))',
        background: 'var(--overlay-bgColor, var(--bgColor-default, var(--color-canvas-overlay)))',
        boxShadow: 'var(--shadow-resting-medium, 0 1px 3px rgba(0,0,0,0.12))',
        fontSize: 12,
        maxWidth: 'min(92vw, 520px)',
        flexWrap: 'wrap',
      }}
    >
      <Label variant={source === 'live' ? 'success' : 'secondary'}>
        {source === 'live' ? 'Live' : source === 'demo' ? 'Demo' : '…'}
      </Label>

      {loading ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Spinner size="small" />
          <Text style={{ color: 'var(--fgColor-muted)' }}>Loading usage…</Text>
        </span>
      ) : (
        <Text style={{ color: 'var(--fgColor-muted)' }}>
          {fetchedAt ? `Updated ${relativeTime(fetchedAt)}` : 'No data yet'}
        </Text>
      )}

      <Tooltip text="Refresh usage from GitHub" direction="s">
        <IconButton
          aria-label="Refresh from GitHub"
          icon={SyncIcon}
          size="small"
          variant="invisible"
          onClick={() => void state.refresh()}
          disabled={refreshing}
        />
      </Tooltip>

      {channels.length > 0 && (
        <ActionMenu>
          <ActionMenu.Button size="small" variant="invisible" leadingVisual={PaperAirplaneIcon} disabled={sending}>
            Send report
          </ActionMenu.Button>
          <ActionMenu.Overlay width="small">
            <ActionList>
              <ActionList.Item onSelect={() => void state.send()}>
                All channels
                <ActionList.Description>{channels.map((c) => CHANNEL_LABELS[c] ?? c).join(', ')}</ActionList.Description>
              </ActionList.Item>
              <ActionList.Divider />
              {channels.map((c) => (
                <ActionList.Item key={c} onSelect={() => void state.send([c])}>
                  {CHANNEL_LABELS[c] ?? c}
                </ActionList.Item>
              ))}
            </ActionList>
          </ActionMenu.Overlay>
        </ActionMenu>
      )}

      {sending && <Spinner size="small" />}

      {sendResult && !sending && (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            color:
              sendResult.status === 'ok'
                ? 'var(--fgColor-success, var(--color-success-fg))'
                : 'var(--fgColor-attention, var(--color-attention-fg))',
          }}
        >
          {sendResult.status === 'ok' ? (
            <CheckCircleFillIcon size={14} />
          ) : (
            <AlertFillIcon size={14} />
          )}
          <Text style={{ color: 'var(--fgColor-muted)' }}>
            {sendResult.status === 'ok'
              ? 'Report sent'
              : sendResult.status === 'skipped'
                ? (sendResult.reason ?? 'No channels')
                : sendResult.status === 'partial'
                  ? 'Partially sent'
                  : 'Send failed'}
          </Text>
        </span>
      )}

      {error && (
        <Text style={{ color: 'var(--fgColor-danger, var(--color-danger-fg))' }} title={error}>
          {error}
        </Text>
      )}

      {scheduleSummary && (
        <Tooltip text={scheduleSummary} direction="s">
          <span style={{ display: 'inline-flex', alignItems: 'center', color: 'var(--fgColor-muted)' }}>
            <ClockIcon size={14} />
          </span>
        </Tooltip>
      )}

      <Tooltip text="Configure scheduled reports" direction="s">
        <IconButton
          aria-label="Configure scheduled reports"
          icon={GearIcon}
          size="small"
          variant="invisible"
          onClick={() => setScheduleOpen(true)}
        />
      </Tooltip>
    </div>

    {scheduleOpen && (
      <ScheduleDialog
        onDismiss={() => setScheduleOpen(false)}
        onSaved={() => void state.reloadStatus()}
      />
    )}
    </>
  );
}
