/**
 * Lazily load example CSV files. These are code-split by Vite
 * and only fetched when explicitly requested (e.g. from the tour prompt).
 * Zero impact on normal users' bundle size.
 */
export async function loadSampleData(): Promise<Array<{ name: string; content: string }>> {
  const samples = await Promise.all([
    import('../../examples/usageReport_1_7f2ed6006ee54fb8af73f5cbb7ac1f1d.csv?raw').then(
      (m) => ({ name: 'usageReport.csv', content: m.default }),
    ),
    import('../../examples/premiumRequestUsageReport_1_c6fca30f0acd458098a95808eaf43399.csv?raw').then(
      (m) => ({ name: 'premiumRequestUsageReport.csv', content: m.default }),
    ),
    import('../../examples/Token.Usage.Report.csv?raw').then(
      (m) => ({ name: 'Token.Usage.Report.csv', content: m.default }),
    ),
    import('../../examples/octodemo-seat-activity-1774680875.csv?raw').then(
      (m) => ({ name: 'seat-activity.csv', content: m.default }),
    ),
    import('../../examples/ghas_active_committers_octodemo_2026-03-27T1521.csv?raw').then(
      (m) => ({ name: 'ghas-active-committers.csv', content: m.default }),
    ),
    import('../../examples/export-octodemo-1774679438.csv?raw').then(
      (m) => ({ name: 'enterprise-members.csv', content: m.default }),
    ),
  ]);
  return samples;
}
