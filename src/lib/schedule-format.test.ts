import { describe, it, expect } from 'vitest';
import {
  formatNextRun,
  normalizeChannels,
  pad2,
  parseTimeValue,
  timezoneOptions,
  toTimeValue,
} from './schedule-format';

describe('pad2 / toTimeValue', () => {
  it('zero-pads single digits', () => {
    expect(pad2(0)).toBe('00');
    expect(pad2(9)).toBe('09');
    expect(pad2(23)).toBe('23');
  });

  it('builds an HH:MM time value', () => {
    expect(toTimeValue(9, 0)).toBe('09:00');
    expect(toTimeValue(23, 45)).toBe('23:45');
  });
});

describe('parseTimeValue', () => {
  it('parses a valid HH:MM string', () => {
    expect(parseTimeValue('09:30')).toEqual({ hour: 9, minute: 30 });
    expect(parseTimeValue('00:00')).toEqual({ hour: 0, minute: 0 });
  });

  it('returns null for malformed input', () => {
    expect(parseTimeValue('')).toBeNull();
    expect(parseTimeValue('nope')).toBeNull();
    expect(parseTimeValue(':')).toBeNull();
  });
});

describe('formatNextRun', () => {
  it('returns empty string for null or unparseable input', () => {
    expect(formatNextRun(null)).toBe('');
    expect(formatNextRun('not-a-date')).toBe('');
  });

  it('formats a valid ISO timestamp to a non-empty local string', () => {
    const out = formatNextRun('2026-03-27T15:21:00Z');
    expect(out).not.toBe('');
    expect(typeof out).toBe('string');
  });
});

describe('normalizeChannels', () => {
  const enabled = ['slack', 'teams', 'email'];

  it('maps an empty selection to null (all channels)', () => {
    expect(normalizeChannels([], enabled)).toBeNull();
  });

  it('maps a full selection to null (all channels)', () => {
    expect(normalizeChannels(['slack', 'teams', 'email'], enabled)).toBeNull();
  });

  it('keeps a genuine subset', () => {
    expect(normalizeChannels(['slack'], enabled)).toEqual(['slack']);
  });

  it('drops channels that are no longer configured', () => {
    expect(normalizeChannels(['slack', 'sms'], enabled)).toEqual(['slack']);
  });

  it('treats a selection of only-unconfigured channels as all', () => {
    expect(normalizeChannels(['sms'], enabled)).toBeNull();
  });
});

describe('timezoneOptions', () => {
  it('always includes UTC and the current tz, de-duplicated, current-first', () => {
    const opts = timezoneOptions('Europe/Amsterdam');
    expect(opts[0]).toBe('Europe/Amsterdam');
    expect(opts).toContain('UTC');
    expect(new Set(opts).size).toBe(opts.length);
  });

  it('includes an unusual current tz not in the shortlist', () => {
    const opts = timezoneOptions('Pacific/Chatham');
    expect(opts).toContain('Pacific/Chatham');
  });
});
