import { describe, it, expect } from 'vitest';
import {
  getReportSchema,
  pageTypeForReport,
  PAGE_TYPES,
  PAGE_REPORT_TYPES,
  PRODUCT_METRIC_OPTIONS,
} from './report-schema';
import { REPORT_TYPES } from './types';

// These tests verify the schema registry and page routing work correctly.
// If a new report type is added without a schema, or a page→report mapping
// is wrong, these catch it.

describe('schema registry completeness', () => {
  it('every REPORT_TYPE has a matching schema', () => {
    for (const type of Object.values(REPORT_TYPES)) {
      const schema = getReportSchema(type);
      expect(schema.type).toBe(type);
    }
  });

  it('every schema has filterable fields that exist in real data', () => {
    // Known columns across report types
    const knownColumns = new Set([
      'username', 'model', 'organization', 'sku', 'costCenterName', 'product',
      'repository', 'workflowPath', 'unitType', 'userLogin', 'login', 'role',
      'lastSurfaceUsed', 'exceedsQuota', 'twoFactorEnabled', 'outsideCollaborator',
      'licenseType', 'githubComUser', 'enterpriseServerUser', 'enterpriseRoles',
      'twoFactorAuth', 'advancedSecurityUser',
    ]);

    for (const type of Object.values(REPORT_TYPES)) {
      const schema = getReportSchema(type);
      for (const field of schema.filterableFields) {
        expect(knownColumns).toContain(field);
      }
    }
  });
});

describe('page → report type mapping', () => {
  it('copilot page handles both premium_request and token_usage', () => {
    expect(pageTypeForReport(REPORT_TYPES.PREMIUM_REQUEST)).toBe(PAGE_TYPES.COPILOT);
    expect(pageTypeForReport(REPORT_TYPES.TOKEN_USAGE)).toBe(PAGE_TYPES.COPILOT);
  });

  it('every report type maps to a valid page', () => {
    const validPages = new Set(Object.values(PAGE_TYPES));
    for (const type of Object.values(REPORT_TYPES)) {
      const page = pageTypeForReport(type);
      expect(validPages).toContain(page);
    }
  });

  it('PAGE_REPORT_TYPES is inverse of pageTypeForReport', () => {
    for (const [page, reportTypes] of Object.entries(PAGE_REPORT_TYPES)) {
      for (const rt of reportTypes!) {
        expect(pageTypeForReport(rt)).toBe(page);
      }
    }
  });
});

describe('product metric options', () => {
  it('copilot product has a seat filter that checks unitType', () => {
    const copilot = PRODUCT_METRIC_OPTIONS['copilot'];
    const seatMetric = copilot.find(o => o.key === 'seats');
    expect(seatMetric).toBeTruthy();
    // The filter should match user-months (seat rows) but not requests
    expect(seatMetric!.rowFilter!({ unitType: 'user-months' })).toBe(true);
    expect(seatMetric!.rowFilter!({ unitType: 'requests' })).toBe(false);
  });

  it('actions product has minutes metric', () => {
    const actions = PRODUCT_METRIC_OPTIONS['actions'];
    expect(actions.some(o => o.label === 'Minutes')).toBe(true);
  });
});
