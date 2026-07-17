import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider } from '@primer/react';
import { ScheduleDialog } from './ScheduleDialog';
import * as serverData from '../lib/server-data';
import type { ScheduleConfig, ScheduleEntry } from '../lib/server-data';

// Render-only smoke tests. Driving clicks through the Primer Dialog's focus-trap
// hangs under jsdom (both userEvent and fireEvent), so the interaction paths are
// verified elsewhere: the pure helpers in schedule-format.test.ts, the API
// client in server-data.test.ts, and an end-to-end browser check of the real
// build against the backend (toggle → save → persisted config).
vi.mock('../lib/server-data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/server-data')>()),
  getSchedules: vi.fn(),
  putSchedules: vi.fn(),
}));

const getSchedules = vi.mocked(serverData.getSchedules);

function entry(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    enabled: false,
    hour: 9,
    minute: 0,
    day_of_week: 'mon',
    day_of_month: 1,
    cron: '',
    channels: null,
    ...overrides,
  };
}

function config(overrides: Partial<ScheduleConfig> = {}): ScheduleConfig {
  return {
    timezone: 'UTC',
    entries: { daily: entry({ enabled: true }), weekly: entry(), monthly: entry() },
    channels_enabled: ['slack', 'email'],
    weekdays: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
    jobs: [{ id: 'report-daily', next_run: '2026-03-27T09:00:00Z' }],
    ...overrides,
  };
}

function renderDialog() {
  return render(
    <ThemeProvider>
      <ScheduleDialog onDismiss={vi.fn()} onSaved={vi.fn()} />
    </ThemeProvider>,
  );
}

beforeEach(() => {
  getSchedules.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ScheduleDialog', () => {
  it('loads the config and renders a section per frequency', async () => {
    getSchedules.mockResolvedValue(config());
    renderDialog();

    expect(await screen.findByText('Scheduled reports')).toBeInTheDocument();
    expect(screen.getByText('Daily')).toBeInTheDocument();
    expect(screen.getByText('Weekly')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    // The enabled daily schedule shows its next run.
    expect(screen.getByText(/Next run:/)).toBeInTheDocument();
  });

  it('warns when no channels are configured', async () => {
    getSchedules.mockResolvedValue(config({ channels_enabled: [] }));
    renderDialog();
    expect(
      await screen.findByText(/no notification channels are configured/i),
    ).toBeInTheDocument();
  });

  it('surfaces a load failure', async () => {
    getSchedules.mockResolvedValue(null);
    renderDialog();
    expect(
      await screen.findByText(/could not load the schedule configuration/i),
    ).toBeInTheDocument();
  });

});
