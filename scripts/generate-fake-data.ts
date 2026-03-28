/**
 * Generates fake example CSVs using @faker-js/faker.
 * Run: npx tsx scripts/generate-fake-data.ts
 */
import { faker } from '@faker-js/faker';
import { writeFileSync } from 'fs';
import { join } from 'path';

faker.seed(42); // deterministic output

const EXAMPLES_DIR = join(import.meta.dirname, '..', 'examples');

// ── Shared pools ────────────────────────────────────────────────

const ORGS = [
  'acme-corp', 'globex-inc', 'initech', 'hooli', 'piedpiper',
  'waynetech', 'starkindustries', 'umbrella-corp', 'cyberdyne-sys',
  'aperture-labs', 'oscorp', 'daily-planet-dev', 'wonka-factory',
  'springfield-nuclear', 'Bluth-Company', 'dunder-mifflin-tech',
  'prestige-worldwide', 'vandelay-industries', 'massive-dynamic',
  'soylent-corp',
];

const COST_CENTERS = [
  '', '', '', '', '', // weighted empty
  'platform-team', 'security-ops', 'ml-infra', 'devex',
  'frontend-guild', 'cloud-native', 'compliance', 'data-eng',
];

function generateUsernames(count: number): string[] {
  const set = new Set<string>();
  while (set.size < count) {
    const style = faker.number.int({ min: 0, max: 3 });
    let name: string;
    switch (style) {
      case 0: name = faker.internet.username().toLowerCase(); break;
      case 1: name = faker.person.firstName().toLowerCase() + faker.number.int({ min: 10, max: 99 }); break;
      case 2: name = faker.person.lastName().toLowerCase() + '-' + faker.word.adjective().slice(0, 5); break;
      default: name = faker.hacker.adjective().replace(/\s/g, '') + faker.person.lastName(); break;
    }
    // sanitize to github-valid
    name = name.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 20);
    if (name.length > 2) set.add(name);
  }
  return [...set];
}

const USERS = generateUsernames(120);

function pickUsers(n: number): string[] {
  return faker.helpers.arrayElements(USERS, n);
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function q(v: string | number): string {
  return `"${v}"`;
}

// intentional fp noise like real GitHub billing
function fpNoise(val: number): number {
  return parseFloat((val + Number.EPSILON * faker.number.int({ min: -100, max: 100 })).toPrecision(15));
}

function generateRepoName(): string {
  const patterns = [
    () => `${faker.word.adjective()}-${faker.word.noun()}`,
    () => `${faker.person.firstName().toLowerCase()}-bookstore-${faker.number.int({ min: 1, max: 30 })}`,
    () => `${faker.word.noun()}-${faker.word.verb()}-${faker.word.noun()}`,
    () => `octocat_supply-${faker.word.adjective()}-${faker.word.noun()}`,
    () => `${faker.word.noun()}-demo`,
    () => `${faker.word.adjective()}-${faker.word.noun()}-app`,
  ];
  return faker.helpers.arrayElement(patterns)().toLowerCase().replace(/\s+/g, '-').slice(0, 40);
}

function generateWorkflowPath(): string {
  const patterns = [
    () => `.github/workflows/${faker.helpers.arrayElement(['ci', 'cd', 'codeql', 'codeql-analysis', 'deploy', 'test', 'lint', 'build', 'release', 'stale', 'lock', 'dependency-review', 'pr_code_coverage', 'code_scanning', 'pmd'])}.yml`,
    () => `dynamic/github-code-scanning/codeql`,
    () => `dynamic/dependabot/dependabot-updates`,
    () => `dynamic/copilot-pull-request-reviewer/copilot-pull-request-reviewer`,
    () => `required/${faker.number.int({ min: 1000000000, max: 9999999999 })}/.github/workflows/dependency-review.yml`,
  ];
  return faker.helpers.arrayElement(patterns)();
}

// ── 1. Actions Usage Report ─────────────────────────────────────

function generateUsageReport() {
  const header = [
    'date', 'product', 'sku', 'quantity', 'unit_type',
    'applied_cost_per_quantity', 'gross_amount', 'discount_amount',
    'net_amount', 'username', 'organization', 'repository',
    'workflow_path', 'cost_center_name',
  ].map(q).join(',');

  type SkuDef = {
    product: string;
    sku: string;
    unitType: string;
    costPerQty: number | string;
    qtyRange: [number, number];
    needsRepo: boolean;
    needsUser: boolean;
  };

  const skuDefs: SkuDef[] = [
    // Runner SKUs
    { product: 'actions', sku: 'actions_linux', unitType: 'minutes', costPerQty: 0.006, qtyRange: [1, 30], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_linux_4_core', unitType: 'minutes', costPerQty: 0.024, qtyRange: [1, 20], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_linux_8_core', unitType: 'minutes', costPerQty: 0.048, qtyRange: [1, 15], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_linux_16_core', unitType: 'minutes', costPerQty: 0.096, qtyRange: [1, 12], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_linux_32_core', unitType: 'minutes', costPerQty: 0.192, qtyRange: [1, 8], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_linux_64_core', unitType: 'minutes', costPerQty: 0.384, qtyRange: [1, 5], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_linux_arm', unitType: 'minutes', costPerQty: 0.005, qtyRange: [1, 20], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_linux_slim', unitType: 'minutes', costPerQty: 0.003, qtyRange: [1, 25], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_windows', unitType: 'minutes', costPerQty: 0.012, qtyRange: [1, 15], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_macos', unitType: 'minutes', costPerQty: 0.06, qtyRange: [1, 10], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_self_hosted_linux', unitType: 'minutes', costPerQty: 0, qtyRange: [1, 60], needsRepo: true, needsUser: true },
    { product: 'actions', sku: 'actions_self_hosted_windows', unitType: 'minutes', costPerQty: 0, qtyRange: [1, 40], needsRepo: true, needsUser: true },
    // Storage SKUs
    { product: 'actions', sku: 'actions_storage', unitType: 'gigabyte-hours', costPerQty: '9.4086E-05', qtyRange: [100, 80000], needsRepo: false, needsUser: false },
    { product: 'actions', sku: 'actions_custom_image_storage', unitType: 'gigabyte-hours', costPerQty: '9.4086E-05', qtyRange: [10000, 80000], needsRepo: false, needsUser: false },
    { product: 'git_lfs', sku: 'git_lfs_storage', unitType: 'gigabyte-hours', costPerQty: '3.472E-04', qtyRange: [50, 5000], needsRepo: false, needsUser: false },
    { product: 'git_lfs', sku: 'git_lfs_bandwidth', unitType: 'gigabytes', costPerQty: 0.0875, qtyRange: [1, 50], needsRepo: false, needsUser: false },
    { product: 'packages', sku: 'packages_storage', unitType: 'gigabyte-hours', costPerQty: '3.472E-04', qtyRange: [50, 3000], needsRepo: false, needsUser: false },
    { product: 'packages', sku: 'packages_bandwidth', unitType: 'gigabytes', costPerQty: 0.0875, qtyRange: [1, 20], needsRepo: false, needsUser: false },
    // Copilot seat SKUs
    { product: 'copilot', sku: 'copilot_enterprise', unitType: 'seats', costPerQty: 39, qtyRange: [1, 1], needsRepo: false, needsUser: true },
    { product: 'copilot', sku: 'copilot_for_business', unitType: 'seats', costPerQty: 19, qtyRange: [1, 1], needsRepo: false, needsUser: true },
    // Copilot premium requests in usage report
    { product: 'copilot', sku: 'copilot_premium_request', unitType: 'requests', costPerQty: 0.04, qtyRange: [1, 50], needsRepo: false, needsUser: true },
    // Spark
    { product: 'spark', sku: 'spark_premium_request', unitType: 'requests', costPerQty: 0.04, qtyRange: [1, 10], needsRepo: false, needsUser: true },
  ];

  const botUsers = [
    'dependabot[bot]', 'github-advanced-security[bot]',
    'copilot-pull-request-reviewer[bot]', 'github-actions[bot]',
  ];

  const dates: string[] = [];
  // Generate 2 months: Feb + Mar 2026
  for (let m = 1; m <= 2; m++) {
    const daysInMonth = m === 1 ? 28 : 28;
    for (let d = 1; d <= daysInMonth; d++) {
      dates.push(`2026-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
    }
  }

  const rows: string[] = [header];

  // Storage/bandwidth rows (org-level, one per date-month typically)
  const storageSkus = skuDefs.filter(s => !s.needsRepo && !s.needsUser);
  for (const date of ['2026-02-01', '2026-03-01']) {
    for (const sku of storageSkus) {
      const qty = faker.number.int({ min: sku.qtyRange[0], max: sku.qtyRange[1] });
      const cost = typeof sku.costPerQty === 'string' ? parseFloat(sku.costPerQty) : sku.costPerQty;
      const gross = fpNoise(qty * cost);
      rows.push([
        q(date), q(sku.product), q(sku.sku), q(qty), q(sku.unitType),
        q(sku.costPerQty), q(gross), q(gross), q(0),
        q(''), q(faker.helpers.arrayElement(ORGS)), q(''), q(''),
        q(''),
      ].join(','));
    }
  }

  // Copilot seat rows
  const seatSkus = skuDefs.filter(s => s.sku === 'copilot_enterprise' || s.sku === 'copilot_for_business');
  const seatUsers = pickUsers(60);
  for (const date of ['2026-02-01', '2026-03-01']) {
    for (const user of seatUsers) {
      const sku = faker.helpers.arrayElement(seatSkus);
      const gross = sku.costPerQty as number;
      rows.push([
        q(date), q(sku.product), q(sku.sku), q(1), q(sku.unitType),
        q(sku.costPerQty), q(gross), q(gross), q(0),
        q(user), q(faker.helpers.arrayElement(ORGS)), q(''), q(''),
        q(faker.helpers.arrayElement(COST_CENTERS)),
      ].join(','));
    }
  }

  // Actions runner rows (the bulk)
  const runnerSkus = skuDefs.filter(s => s.product === 'actions' && s.needsRepo);

  // Weight heavily toward actions_linux
  const weightedSkus = [
    ...Array(40).fill(runnerSkus[0]), // actions_linux
    ...runnerSkus.slice(1),
  ];

  for (const date of dates) {
    const rowCount = faker.number.int({ min: 800, max: 1200 });
    for (let i = 0; i < rowCount; i++) {
      const sku = faker.helpers.arrayElement(weightedSkus);
      const isBot = faker.number.float() < 0.3;
      const username = isBot
        ? faker.helpers.arrayElement(botUsers)
        : faker.helpers.arrayElement(USERS);
      const org = faker.helpers.arrayElement(ORGS);
      const repo = generateRepoName();
      const workflow = generateWorkflowPath();
      const qty = faker.number.int({ min: sku.qtyRange[0], max: sku.qtyRange[1] });
      const cost = typeof sku.costPerQty === 'string' ? parseFloat(sku.costPerQty) : sku.costPerQty;
      const gross = fpNoise(qty * cost);
      const discounted = faker.number.float() < 0.7; // 70% fully discounted (included)
      const discount = discounted ? gross : fpNoise(gross * faker.number.float({ min: 0, max: 0.5 }));
      const net = fpNoise(gross - discount);

      rows.push([
        q(date), q(sku.product), q(sku.sku), q(qty), q(sku.unitType),
        q(cost), q(gross), q(discount), q(net),
        q(username), q(org), q(repo), q(workflow),
        q(faker.helpers.arrayElement(COST_CENTERS)),
      ].join(','));
    }
  }

  // Spark + copilot premium request rows in usage report
  const premiumSkus = skuDefs.filter(s => s.sku.includes('premium_request'));
  for (const date of dates) {
    const rowCount = faker.number.int({ min: 20, max: 60 });
    for (let i = 0; i < rowCount; i++) {
      const sku = faker.helpers.arrayElement(premiumSkus);
      const username = faker.helpers.arrayElement(USERS);
      const org = faker.helpers.arrayElement(ORGS);
      const qty = faker.number.int({ min: sku.qtyRange[0], max: sku.qtyRange[1] });
      const cost = sku.costPerQty as number;
      const gross = fpNoise(qty * cost);

      rows.push([
        q(date), q(sku.product), q(sku.sku), q(qty), q(sku.unitType),
        q(cost), q(gross), q(gross), q(0),
        q(username), q(org), q(''), q(''),
        q(faker.helpers.arrayElement(COST_CENTERS)),
      ].join(','));
    }
  }

  writeFileSync(
    join(EXAMPLES_DIR, 'usageReport_1_7f2ed6006ee54fb8af73f5cbb7ac1f1d.csv'),
    rows.join('\n') + '\n',
  );
  console.log(`✅ usageReport: ${rows.length} rows`);
}

// ── 2. Premium Request Usage Report ─────────────────────────────

function generatePremiumRequestReport() {
  const header = [
    'date', 'username', 'product', 'sku', 'model', 'quantity',
    'unit_type', 'applied_cost_per_quantity', 'gross_amount',
    'discount_amount', 'net_amount', 'exceeds_quota',
    'total_monthly_quota', 'organization', 'cost_center_name',
    'aic_quantity', 'aic_gross_amount',
  ].map(q).join(',');

  const models = [
    'Claude Opus 4.5', 'Claude Opus 4.6', 'Claude Sonnet 4.5', 'Claude Sonnet 4.6',
    'Claude Haiku 4.5', 'GPT-5', 'GPT-5.1', 'GPT-5.2', 'GPT-5.2-Codex',
    'GPT-5.3-Codex', 'Gemini 2.5 Pro', 'Gemini 3 Pro',
    'Code Review model', 'Coding Agent model',
  ];

  const autoModels = [
    'Auto: Claude Sonnet 4.5', 'Auto: Claude Sonnet 4.6',
    'Auto: GPT-5.2-Codex', 'Auto: GPT-5.3-Codex',
    'Auto: Gemini 3 Pro',
  ];

  const allModels = [...models, ...autoModels];

  const skuMap: Record<string, { product: string; sku: string }> = {
    'Code Review model': { product: 'copilot', sku: 'copilot_premium_request' },
    'Coding Agent model': { product: 'copilot', sku: 'coding_agent_premium_request' },
  };

  function getProductSku(model: string): { product: string; sku: string } {
    if (skuMap[model]) return skuMap[model];
    if (model.includes('spark') || faker.number.float() < 0.05) {
      return { product: 'spark', sku: 'spark_premium_request' };
    }
    return { product: 'copilot', sku: 'copilot_premium_request' };
  }

  const rows: string[] = [header];
  const activeUsers = pickUsers(70);

  // March 2026 monthly data (date is always first of month for this report)
  const monthDates = ['2026-03-01'];

  // Also sprinkle daily rows for 2026-03-02 through 2026-03-15 (for Auto: models and fractional qtys)
  const dailyDates: string[] = [];
  for (let d = 2; d <= 28; d++) {
    dailyDates.push(`2026-03-${String(d).padStart(2, '0')}`);
  }

  // Monthly aggregate rows
  for (const date of monthDates) {
    for (const user of activeUsers) {
      const modelCount = faker.number.int({ min: 1, max: 4 });
      const userModels = faker.helpers.arrayElements(models, modelCount);
      for (const model of userModels) {
        const { product, sku } = getProductSku(model);
        const qty = model === 'Code Review model' || model === 'Coding Agent model'
          ? faker.number.int({ min: 1, max: 10 })
          : faker.number.int({ min: 1, max: 400 });
        const gross = fpNoise(qty * 0.04);
        const quota = faker.helpers.arrayElement([300, 1000, 1000, 1000]);
        const exceeds = qty > quota;

        rows.push([
          q(date), q(user), q(product), q(sku), q(model), q(qty),
          q('requests'), q(0.04), q(gross), q(gross), q(0),
          q(exceeds ? 'True' : 'False'), q(quota),
          q(faker.helpers.arrayElement(ORGS)),
          q(faker.helpers.arrayElement(COST_CENTERS)),
          q(0), q(0),
        ].join(','));
      }
    }
  }

  // Daily rows with Auto: models and fractional quantities
  for (const date of dailyDates) {
    const dayUsers = faker.helpers.arrayElements(activeUsers, faker.number.int({ min: 15, max: 40 }));
    for (const user of dayUsers) {
      const model = faker.helpers.arrayElement([...allModels]);
      const isAuto = model.startsWith('Auto:');
      const { product, sku } = getProductSku(model);
      const qty = isAuto
        ? parseFloat((faker.number.float({ min: 0.3, max: 5 })).toFixed(2))
        : faker.number.int({ min: 1, max: 150 });
      const gross = fpNoise((typeof qty === 'number' ? qty : parseFloat(String(qty))) * 0.04);
      const quota = faker.helpers.arrayElement([300, 1000, 1000, 1000]);

      rows.push([
        q(date), q(user), q(product), q(sku), q(model), q(qty),
        q('requests'), q(0.04), q(gross), q(gross), q(0),
        q('False'), q(quota),
        q(faker.helpers.arrayElement(ORGS)),
        q(faker.helpers.arrayElement(COST_CENTERS)),
        q(0), q(0),
      ].join(','));
    }
  }

  writeFileSync(
    join(EXAMPLES_DIR, 'premiumRequestUsageReport_1_c6fca30f0acd458098a95808eaf43399.csv'),
    rows.join('\n') + '\n',
  );
  console.log(`✅ premiumRequestUsageReport: ${rows.length} rows`);
}

// ── 3. Token Usage Report ───────────────────────────────────────

function generateTokenUsageReport() {
  const header = [
    'date', 'username', 'product', 'sku', 'model', 'quantity',
    'unit_type', 'applied_cost_per_quantity', 'gross_amount',
    'discount_amount', 'net_amount', 'exceeds_quota',
    'total_monthly_quota', 'organization', 'cost_center_name',
    'total_input_tokens', 'total_output_tokens',
    'total_cache_creation_tokens', 'total_cache_read_tokens',
  ].map(q).join(',');

  const models = [
    'Claude Opus 4.5', 'Claude Opus 4.6', 'Claude Sonnet 4.5',
    'Claude Sonnet 4.6', 'Claude Haiku 4.5',
    'GPT-5', 'GPT-5.1', 'GPT-5.2',
    'Gemini 2.5 Pro', 'Gemini 3 Pro',
  ];

  // Models that support caching
  const cachingModels = new Set([
    'Claude Opus 4.5', 'Claude Opus 4.6', 'Claude Sonnet 4.5', 'Claude Sonnet 4.6', 'Claude Haiku 4.5',
  ]);

  const rows: string[] = [header];
  const activeUsers = pickUsers(40);

  // Daily granularity: Feb 1-28, 2026
  for (let d = 1; d <= 28; d++) {
    const date = `2026-02-${String(d).padStart(2, '0')}`;
    const dayUsers = faker.helpers.arrayElements(activeUsers, faker.number.int({ min: 8, max: 20 }));

    for (const user of dayUsers) {
      const model = faker.helpers.arrayElement(models);
      const qty = faker.number.int({ min: 1, max: 200 });
      const gross = fpNoise(qty * 0.04);
      const supportsCaching = cachingModels.has(model);
      const inputTokens = faker.number.int({ min: 50, max: 400000 });
      const outputTokens = faker.number.int({ min: 50, max: 50000 });
      const cacheCreation = supportsCaching
        ? faker.number.int({ min: 0, max: 4000000 })
        : 0;
      const cacheRead = supportsCaching
        ? faker.number.int({ min: 0, max: 4000000 })
        : faker.number.float() < 0.3 ? faker.number.int({ min: 0, max: 200000 }) : 0;

      const quota = faker.helpers.arrayElement([300, 1000, 1000, 1000]);
      const org = faker.helpers.arrayElement(ORGS);
      const cc = faker.helpers.arrayElement(COST_CENTERS);

      rows.push([
        q(date), q(user), q('copilot'), q('copilot_premium_request'), q(model),
        q(qty), q('requests'), q(0.04), q(gross), q(gross), q(0),
        q('False'), q(quota), q(org), q(cc),
        q(inputTokens), q(outputTokens), q(cacheCreation), q(cacheRead),
      ].join(','));
    }
  }

  writeFileSync(
    join(EXAMPLES_DIR, 'Token.Usage.Report.csv'),
    rows.join('\n') + '\n',
  );
  console.log(`✅ Token.Usage.Report: ${rows.length} rows`);
}

// ── 4. GHAS Active Committers ───────────────────────────────────

function generateGhasReport() {
  // NOTE: this report is NOT quoted and uses different column style
  const header = 'User login,Organization / repository,Last pushed date,Last pushed email';
  const rows: string[] = [header];

  const committers = pickUsers(50);

  for (const user of committers) {
    const repoCount = faker.number.int({ min: 1, max: 8 });
    const userId = faker.number.int({ min: 1000000, max: 120000000 });
    const useNoreply = faker.number.float() < 0.6;
    const email = useNoreply
      ? `${userId}+${user}@users.noreply.github.com`
      : `${user}@${faker.helpers.arrayElement(['github.com', 'company.dev', 'acme.io'])}`;

    for (let r = 0; r < repoCount; r++) {
      const org = faker.helpers.arrayElement(ORGS);
      const repo = generateRepoName();
      const daysAgo = faker.number.int({ min: 0, max: 85 });
      const pushDate = new Date(2026, 2, 27); // March 27 2026
      pushDate.setDate(pushDate.getDate() - daysAgo);

      rows.push(`${user},${org}/${repo},${fmtDate(pushDate)},${email}`);
    }
  }

  writeFileSync(
    join(EXAMPLES_DIR, 'ghas_active_committers_octodemo_2026-03-27T1521.csv'),
    rows.join('\n') + '\n',
  );
  console.log(`✅ ghas_active_committers: ${rows.length} rows`);
}

// ── 5. Enterprise Members Export ────────────────────────────────

function generateDormantUsers() {
  // Unquoted CSV
  const header = 'created_at,id,login,role,last_logged_ip,2fa_enabled?,outside_collaborator';
  const rows: string[] = [header];

  const memberUsers = pickUsers(100);

  for (const user of memberUsers) {
    const yearOffset = faker.number.int({ min: 0, max: 17 });
    const created = new Date(2008 + yearOffset, faker.number.int({ min: 0, max: 11 }), faker.number.int({ min: 1, max: 28 }));
    const hour = faker.number.int({ min: 0, max: 23 });
    const minute = faker.number.int({ min: 0, max: 59 });
    const second = faker.number.int({ min: 0, max: 59 });
    const tz = faker.helpers.arrayElement(['-0400', '-0500']);
    const createdStr = `${created.getFullYear()}-${String(created.getMonth() + 1).padStart(2, '0')}-${String(created.getDate()).padStart(2, '0')} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')} ${tz}`;
    const id = faker.number.int({ min: 100, max: 120000000 });
    const role = faker.helpers.weightedArrayElement([
      { value: 'user', weight: 0.85 },
      { value: 'admin', weight: 0.15 },
    ]);
    const ip = faker.internet.ipv4();
    const twoFa = faker.helpers.weightedArrayElement([
      { value: 'true', weight: 0.75 },
      { value: 'false', weight: 0.25 },
    ]);
    const outsideCollab = faker.helpers.weightedArrayElement([
      { value: 'false', weight: 0.9 },
      { value: 'true', weight: 0.1 },
    ]);

    rows.push(`${createdStr},${id},${user},${role},${ip},${twoFa},${outsideCollab}`);
  }

  writeFileSync(
    join(EXAMPLES_DIR, 'export-octodemo-1774679438.csv'),
    rows.join('\n') + '\n',
  );
  console.log(`✅ export-octodemo: ${rows.length} rows`);
}

// ── 6. Copilot Seat Activity Report ─────────────────────────────

function generateSeatActivityReport() {
  // Unquoted CSV
  const header = 'Report Time,Login,Last Authenticated At,Last Activity At,Last Surface Used,Organization';
  const rows: string[] = [header];

  const reportTime = '2026-03-28T06:54:33Z';
  const seatUsers = pickUsers(90);

  // IDE surface strings with realistic version patterns
  const vscodeSurfaces = [
    'vscode/1.110.0/copilot-chat/0.38.2',
    'vscode/1.111.0/copilot-chat/0.39.2',
    'vscode/1.112.0/copilot-chat/0.40.1',
    'vscode/1.113.0/copilot-chat/0.41.1',
    'vscode/1.113.0/copilot-chat/0.41.2',
    'vscode/1.114.0-insider/copilot-chat/0.42.2026032703',
    'vscode/1.113.0-insider/copilot-chat/0.42.2026032701',
    'vscode/1.112.0-insider/copilot-chat/0.40.2026031702',
  ];

  const jetbrainsSurfaces = [
    'JetBrains-IU/261.22158.277/copilot-intellij/1.6.2-nightly.19625-243',
  ];

  const vsSurfaces = [
    'VisualStudio/18.5.0-insiders/copilot-vs/18.5.39050.51798',
    'VisualStudio/18.6.0-insiders/copilot-vs/18.6.39133.14867',
    'VisualStudio/17.14.28/copilot-vs/17.14.1601.40145',
  ];

  const otherSurfaces = [
    'copilot-chat', 'copilot-chat-platform', 'copilot-cli',
    'copilot-developer', 'copilot-mobile-ios', 'copilot-pr-reviews',
    'copilot_pr_review', 'copilot_pull_request_review',
    'github_spark', 'Unspecified surface', 'None', '/unknown',
    'Xcode/26.4/copilot-xcode/0.47.0',
  ];

  const allSurfaces = [
    ...vscodeSurfaces, ...vscodeSurfaces, ...vscodeSurfaces, // weight vscode heavily
    ...jetbrainsSurfaces,
    ...vsSurfaces,
    ...otherSurfaces,
  ];

  for (const user of seatUsers) {
    // Each user gets 1-3 org assignments
    const orgCount = faker.number.int({ min: 1, max: 3 });
    const userOrgs = faker.helpers.arrayElements(ORGS, orgCount);

    for (const org of userOrgs) {
      // Last authenticated: within last 90 days
      const authDaysAgo = faker.number.int({ min: 0, max: 90 });
      const authDate = new Date(2026, 2, 28); // March 28
      authDate.setDate(authDate.getDate() - authDaysAgo);
      authDate.setHours(faker.number.int({ min: 0, max: 23 }));
      authDate.setMinutes(faker.number.int({ min: 0, max: 59 }));
      authDate.setSeconds(faker.number.int({ min: 0, max: 59 }));

      // Last activity: same or before auth date
      const activityDaysAgo = authDaysAgo + faker.number.int({ min: 0, max: 30 });
      const activityDate = new Date(2026, 2, 28);
      activityDate.setDate(activityDate.getDate() - activityDaysAgo);
      activityDate.setHours(faker.number.int({ min: 0, max: 23 }));
      activityDate.setMinutes(faker.number.int({ min: 0, max: 59 }));
      activityDate.setSeconds(faker.number.int({ min: 0, max: 59 }));

      const surface = faker.helpers.arrayElement(allSurfaces);

      rows.push([
        reportTime,
        user,
        authDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        activityDate.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        surface,
        org,
      ].join(','));
    }
  }

  writeFileSync(
    join(EXAMPLES_DIR, 'octodemo-seat-activity-1774680875.csv'),
    rows.join('\n') + '\n',
  );
  console.log(`✅ octodemo-seat-activity: ${rows.length} rows`);
}

// ── 7. Enterprise Members / License Export ──────────────────────

function generateEnterpriseMembersExport() {
  const header = [
    'GitHub com login', 'GitHub com name', 'Enterprise server user ids',
    'GitHub com user', 'Enterprise server user', 'Visual studio subscription user',
    'License type', 'GitHub com profile', 'GitHub com member roles',
    'GitHub com enterprise roles', 'GitHub com verified domain emails',
    'GitHub com saml name', 'GitHub com orgs with pending invites',
    'GitHub com two factor auth', 'GitHub com two factor auth required by date',
    'GitHub com advanced security license user', 'Enterprise server primary emails',
    'Enterprise server advanced security user ids',
    'Visual studio license status', 'Visual studio subscription email',
    'Total user accounts',
  ].join(',');

  const rows: string[] = [header];

  const enterpriseRoles = ['Owner', 'Member'];
  const memberRoles = ['Owner', 'Member'];

  function randomDate(startYear: number, endYear: number): string {
    const y = faker.number.int({ min: startYear, max: endYear });
    const m = faker.number.int({ min: 1, max: 12 });
    const d = faker.number.int({ min: 1, max: 28 });
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  function buildOrgRoles(username: string, orgCount: number): string {
    const assignments: string[] = [];
    const userOrgs = faker.helpers.arrayElements(ORGS, orgCount);
    for (const org of userOrgs) {
      const role = faker.helpers.weightedArrayElement([
        { value: 'Owner', weight: 0.3 },
        { value: 'Member', weight: 0.7 },
      ]);
      assignments.push(`${org}:${role}`);
    }
    // Occasionally add repo-level collaborator entries
    if (faker.number.float() < 0.15) {
      const collabOrg = faker.helpers.arrayElement(ORGS);
      const collabRepo = generateRepoName();
      assignments.push(`${collabOrg}/${collabRepo}:Collaborator`);
    }
    return assignments.join(', ');
  }

  // ── GitHub.com users (the bulk) ──
  const ghUsers = pickUsers(100);
  for (const user of ghUsers) {
    const fullName = faker.number.float() < 0.9
      ? faker.person.fullName()
      : ''; // some users have no display name

    const hasGHES = faker.number.float() < 0.15;
    const gheId = hasGHES
      ? `${faker.number.int({ min: 100, max: 1500 })}:octodemo.com:Member`
      : '';

    const orgCount = faker.number.int({ min: 1, max: 6 });
    const orgRoles = buildOrgRoles(user, orgCount);

    const entRoleCount = faker.number.int({ min: 1, max: 2 });
    const entRoles = faker.helpers.arrayElements(enterpriseRoles, entRoleCount).join(', ');

    const hasPending = faker.number.float() < 0.2;
    const pendingOrgs = hasPending
      ? faker.helpers.arrayElements(ORGS, faker.number.int({ min: 1, max: 3 })).join(', ')
      : '';

    // Add "Pending invitation" to enterprise roles if they have pending orgs
    const finalEntRoles = hasPending && !entRoles.includes('Pending invitation')
      ? `${entRoles}, Pending invitation`
      : entRoles;

    const twoFa = faker.helpers.weightedArrayElement([
      { value: 'true', weight: 0.85 },
      { value: 'false', weight: 0.15 },
    ]);

    const twoFaDate = twoFa === 'true' ? randomDate(2023, 2025) : '';

    const ghasSeat = faker.helpers.weightedArrayElement([
      { value: 'false', weight: 0.7 },
      { value: 'true', weight: 0.3 },
    ]);

    const samlName = faker.number.float() < 0.1
      ? `${user}@${faker.helpers.arrayElement(['company.com', 'corp.dev'])}`
      : '';

    const verifiedEmail = faker.number.float() < 0.1
      ? `${user}@octodemo.com`
      : '';

    const gheEmail = hasGHES ? `${user}@github.com` : '';

    const totalAccounts = hasGHES ? 2 : 1;

    rows.push([
      user,
      fullName,
      `"${gheId}"`,
      'true',
      hasGHES ? 'true' : 'false',
      'false',
      'Enterprise',
      `https://github.com/${user}`,
      `"${orgRoles}"`,
      `"${finalEntRoles}"`,
      `"${verifiedEmail}"`,
      samlName,
      `"${pendingOrgs}"`,
      twoFa,
      twoFaDate,
      ghasSeat,
      `"${gheEmail}"`,
      '""',
      '',
      '',
      totalAccounts,
    ].join(','));
  }

  // ── Enterprise Server-only users (no GitHub.com login) ──
  const gheOnlyCount = faker.number.int({ min: 30, max: 60 });
  for (let i = 0; i < gheOnlyCount; i++) {
    const gheId = faker.number.int({ min: 3, max: 1500 });
    const emailUser = faker.internet.username().toLowerCase();
    const emailDomain = faker.helpers.arrayElement([
      'github.com', 'company.dev', 'gmail.com',
    ]);
    const email = `${emailUser}@${emailDomain}`;

    rows.push([
      '""',
      '',
      `${gheId}:octodemo.com:Member`,
      'false',
      'true',
      'false',
      'Enterprise',
      '',
      '""',
      '""',
      '""',
      '',
      '""',
      '',
      '',
      'false',
      email,
      '""',
      '',
      '',
      1,
    ].join(','));
  }

  // ── SAML-pending users (no GitHub.com login, pending invite) ──
  const samlPendingCount = faker.number.int({ min: 1, max: 5 });
  for (let i = 0; i < samlPendingCount; i++) {
    const samlEmail = `${faker.internet.username().toLowerCase()}@${faker.helpers.arrayElement(['company.onmicrosoft.com', 'corp.okta.com'])}`;
    const pendingOrg = faker.helpers.arrayElement(ORGS);

    rows.push([
      samlEmail,
      '',
      '""',
      'false',
      'false',
      'false',
      'Enterprise',
      '',
      '""',
      'Pending invitation',
      '""',
      '',
      pendingOrg,
      '',
      '',
      'false',
      '""',
      '""',
      '',
      '',
      0,
    ].join(','));
  }

  writeFileSync(
    join(EXAMPLES_DIR, 'export-octodemo-1774709193.csv'),
    rows.join('\n') + '\n',
  );
  console.log(`✅ export-octodemo-members: ${rows.length} rows`);
}

// ── Run all ─────────────────────────────────────────────────────

console.log('🎲 Generating fake example data...\n');

generateDormantUsers();
generateUsageReport();
generatePremiumRequestReport();
generateTokenUsageReport();
generateGhasReport();
generateSeatActivityReport();
generateEnterpriseMembersExport();

console.log('\n✨ Done! All example CSVs regenerated with fake data.');
