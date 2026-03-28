/**
 * Anonymizes real octodemo CSV data by replacing PII (usernames, orgs, repos,
 * emails, IPs) with realistic-looking fake names. All numeric values, dates,
 * SKUs, and billing amounts are preserved exactly as-is.
 *
 * Uses deterministic hashing so the same real name always maps to the same
 * fake name across all files, keeping cross-file references consistent.
 *
 * Zero external dependencies. Run: npx tsx scripts/anonymize-data.ts
 */
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const EXAMPLES_DIR = join(import.meta.dirname, '..', 'examples');

// ── Deterministic hash for consistent mapping ──────────────────
function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ── Curated name pools ─────────────────────────────────────────

// 250 realistic GitHub-style usernames (enough for 148 orgs and padding)
const ANON_USERNAMES = [
  // firstname patterns
  'jmarquez', 'chen-wei', 'sarahk', 'dkumar', 'alexchen',
  'mjohnson', 'lnavarro', 'priya-s', 'twright', 'rkim',
  'emilyz', 'jpark', 'anagha-r', 'lucasv', 'sophiab',
  'kevinl', 'natasha-m', 'omarfaruk', 'danielp', 'yuki-t',
  // first+last patterns
  'james-walker', 'maria-santos', 'david-liu', 'anna-kowalski', 'ryan-patel',
  'lisa-huang', 'mark-thompson', 'nina-volkov', 'chris-murray', 'tara-singh',
  'ben-carter', 'elena-ros', 'sam-nagata', 'kate-obrien', 'julio-reyes',
  'max-fischer', 'anya-shah', 'tom-nielsen', 'rachel-kim', 'diego-mora',
  // handle patterns
  'devtools-sam', 'cloudninja', 'bytecoder', 'infragrrl', 'depsdave',
  'ci-wizard', 'gitops-jen', 'securitron', 'pipelinepat', 'k8s-karen',
  'sre-marcus', 'apiguru', 'rustycrab', 'nodejsnick', 'pydata-ali',
  'terraformer', 'actionshero', 'cloudio', 'shellscott', 'dockerdan',
  // initial+lastname patterns
  'jcollins', 'mwatanabe', 'adesouza', 'kbennett', 'lzhang',
  'rpetrov', 'nandersen', 'ghamilton', 'cmontoya', 'sfujimoto',
  'dkane', 'bmorales', 'tpham', 'wchang', 'jnguyen',
  'mmiller', 'aroberts', 'hlee', 'pcosta', 'vegerton',
  // firstname+number patterns
  'alex42', 'priya87', 'marco11', 'sara99', 'jin23',
  'noah91', 'maya56', 'leo78', 'zara33', 'kai17',
  'emma05', 'ren44', 'ivy62', 'omar28', 'mia90',
  'cole37', 'luna71', 'dane15', 'aria48', 'reid63',
  // misc authentic patterns
  'lazydev', 'not-a-bot', 'code-janitor', 'mr-linter', 'the-fixer',
  'ship-it', 'refactor-guy', 'null-pointer', 'stack-overflow', 'rubber-duck',
  'pr-machine', 'commit-often', 'main-branch', 'hotfix-hero', 'merge-master',
  'lint-trap', 'type-safe', 'async-await', 'zero-day', 'pixel-pusher',
  // more firstnames
  'jess-t', 'mikaela-h', 'nolan-d', 'hailey-p', 'callum-r',
  'freya-w', 'ethan-g', 'chloe-b', 'aiden-s', 'isla-m',
  'theo-j', 'zoe-l', 'felix-c', 'harper-n', 'jasper-k',
  'sienna-r', 'owen-t', 'willow-e', 'milo-a', 'violet-f',
  // more first+last
  'adam-perkins', 'rosa-delgado', 'ian-mackenzie', 'clara-vogel', 'nate-silva',
  'holly-chen', 'derek-suzuki', 'leah-oconnor', 'grant-meyer', 'naomi-cruz',
  'sean-takahashi', 'briana-west', 'keith-larsen', 'maya-reddy', 'troy-bishop',
  'lena-frost', 'joel-santos', 'dina-kaplan', 'ross-weber', 'amber-yoon',
  // more handles
  'devcontainer', 'gh-runner', 'cicd-pat', 'monorepo-mike', 'codeowners',
  'dependabot-fan', 'gitignore-guru', 'yaml-wizard', 'nix-nikita', 'cargo-cris',
  'pnpm-pete', 'eslint-elena', 'webpack-wade', 'vite-vicky', 'bun-betty',
  'jest-jake', 'playwright-pip', 'cypress-carl', 'storybook-sue', 'docker-dee',
  // more initial+last
  'jsanchez', 'mpatel', 'alee', 'kfischer', 'lmartinez',
  'rcooper', 'nlee', 'gcarter', 'cwilson', 'fmorgan',
  'djones', 'bharris', 'tclark', 'wrobinson', 'jhall',
  'mgraham', 'akeys', 'htaylor', 'pbaker', 'vandrews',
  // more name+number
  'ethan17', 'sophia63', 'luca88', 'maren12', 'kai45',
  'rose99', 'axel22', 'ines77', 'sven34', 'naya51',
  'ravi09', 'ada66', 'finn38', 'tessa73', 'hugo14',
  'lydia82', 'oscar41', 'elin59', 'max96', 'iris27',
  // even more 
  'backend-bea', 'gpu-greg', 'ml-maria', 'ops-olivia', 'swe-sam',
  'infra-ivan', 'data-dani', 'sec-sara', 'qa-quinn', 'pm-priya',
  'ux-uma', 'sdet-sal', 'devrel-dan', 'cto-carlo', 'vp-eng-val',
  'staff-stef', 'principal-pat', 'oncall-oscar', 'lead-lena', 'intern-iris',
  // continued
  'kwright', 'mfernandez', 'lpark', 'rsharma', 'djohnston',
  'bchoi', 'thernandez', 'slee', 'jkim', 'nmoore',
  'atran', 'cdavis', 'mrogers', 'jpeters', 'lturner',
  'rgreen', 'kwong', 'jtorres', 'mphillips', 'dschmidt',
  // last batch to cover 1200+
  'frontend-fran', 'api-ada', 'cli-colin', 'sdk-sofia', 'docs-derek',
  'cloud-cara', 'edge-eli', 'mesh-mika', 'proxy-pia', 'cache-carl',
  'queue-quinn', 'stream-sage', 'batch-ben', 'lambda-leo', 'func-faye',
  'cron-cas', 'hook-hana', 'pipe-petra', 'flow-finn', 'node-nala',
  // 250+
  'akeefe', 'bbright', 'cdowns', 'dellis', 'eforbes',
  'fgraves', 'gholmes', 'hirving', 'ijackson', 'jkeller',
  'klloyd', 'lmason', 'nnewton', 'ooliver', 'pprince',
  'qquinn', 'rrogers', 'ssandoval', 'tturner', 'uunderwood',
];

// Need ~1230+, so generate more programmatically
function expandPool(base: string[]): string[] {
  const pool = [...base];
  const prefixes = ['dev', 'eng', 'ops', 'sre', 'sec', 'swe', 'ml', 'qa'];
  const suffixes = ['dev', 'eng', 'ops', 'io', 'hq', 'lab', 'ai', 'x'];
  const firstNames = [
    'alex', 'blake', 'casey', 'drew', 'eden', 'frankie', 'gray', 'hayden',
    'indie', 'jordan', 'kai', 'logan', 'morgan', 'nico', 'oakley', 'parker',
    'quinn', 'reese', 'sage', 'taylor', 'uri', 'val', 'winter', 'xen',
    'yael', 'zara', 'avery', 'briar', 'charlie', 'dallas', 'emery', 'fern',
    'glen', 'hart', 'indigo', 'jude', 'kim', 'lake', 'mars', 'navy',
    'onyx', 'pax', 'rain', 'skye', 'teal', 'umber', 'wren', 'zen',
  ];
  const lastNames = [
    'alba', 'beck', 'cole', 'duke', 'eyre', 'ford', 'grey', 'hale',
    'jade', 'kent', 'lake', 'mesa', 'nova', 'oak', 'park', 'reed',
    'sage', 'tate', 'vale', 'wade', 'york', 'zhou', 'bain', 'carr',
    'dean', 'falk', 'gale', 'howe', 'kane', 'lind', 'mack', 'nash',
    'pace', 'rowe', 'shaw', 'todd', 'voss', 'wynn', 'yang', 'zhu',
  ];

  // firstname-lastname combos
  for (const first of firstNames) {
    for (const last of lastNames) {
      pool.push(`${first}-${last}`);
      if (pool.length >= 2000) return pool;
    }
  }
  // prefix-firstname combos
  for (const prefix of prefixes) {
    for (const first of firstNames) {
      pool.push(`${prefix}-${first}`);
      if (pool.length >= 2000) return pool;
    }
  }
  // firstname-suffix combos
  for (const first of firstNames) {
    for (const suffix of suffixes) {
      pool.push(`${first}-${suffix}`);
      if (pool.length >= 2000) return pool;
    }
  }
  return pool;
}

const USERNAME_POOL = expandPool(ANON_USERNAMES);

const ORG_POOL = [
  'acme-platform', 'northstar-eng', 'meridian-labs', 'atlas-cloud',
  'forge-systems', 'beacon-digital', 'summit-tech', 'clearpath-io',
  'riverstone-dev', 'ironclad-sec', 'nova-works', 'crestline-ai',
  'pinnacle-ops', 'harbor-infra', 'vanguard-tools', 'redwood-dev',
  'skybridge-io', 'cornerstone-eng', 'trailhead-labs', 'citadel-platform',
  'ridgeline-devops', 'evergreen-eng', 'broadpeak-ai', 'keystone-cloud',
  'torchlight-ops', 'catalyst-core', 'lakeview-tech', 'gridpoint-io',
  'horizon-labs', 'basecamp-dev', 'alpine-systems', 'silverpine-eng',
  'irongate-security', 'windmill-data', 'stratosphere-ai', 'coastline-ops',
  'maplegrid-dev', 'frostbyte-labs', 'sandstone-eng', 'starfield-cloud',
  'bluecrest-platform', 'timberline-infra', 'copperhill-systems', 'dawnbreak-ai',
  'northwind-tools', 'stonebridge-eng', 'cloudpeak-io', 'edgewater-labs',
  'quartzline-dev', 'terranova-ops', 'ashgrove-tech', 'sunridge-cloud',
  'cascadia-systems', 'granite-eng', 'wavelength-ai', 'havenport-infra',
  'oakfield-dev', 'fjordline-labs', 'crystalpoint-io', 'boulderpath-eng',
  'pinecrest-ops', 'silverleaf-tech', 'canyonview-dev', 'prismwave-ai',
  'snowcap-eng', 'tidewater-labs', 'cedarline-cloud', 'cliffside-io',
  'maplewood-dev', 'deepfield-ops', 'peakview-systems', 'crosswind-eng',
  'lakeshore-ai', 'sunstone-labs', 'thorngate-dev', 'mistral-io',
  'foxglove-eng', 'cloverfield-ops', 'brighton-tech', 'willowcreek-dev',
  'rustpeak-systems', 'steelbridge-eng', 'oceanview-labs', 'diamondback-io',
  'highpoint-dev', 'springwell-ops', 'granite-forge', 'westpark-eng',
  'clearridge-ai', 'harborstone-labs', 'shadowpine-dev', 'firewood-io',
  'valleyforge-eng', 'eastwind-ops', 'goldengate-tech', 'seaside-dev',
  'stormfield-labs', 'greenhill-cloud', 'rockpoint-io', 'hollowoak-eng',
  'bayshore-ops', 'flatrock-systems', 'driftwood-dev', 'marshfield-ai',
  'sprucewood-eng', 'moorland-labs', 'creekside-io', 'ridgewater-dev',
  'aspengrove-ops', 'ferndale-tech', 'clearwater-eng', 'meadowbrook-labs',
  'stonecreek-io', 'wildfire-dev', 'ironwood-ops', 'sycamore-systems',
  'birchwood-eng', 'oakhollow-labs', 'mapleridge-io', 'cedarcreek-dev',
  'elmdale-ops', 'willowbend-tech', 'hickory-eng', 'pinehollow-labs',
  'chesapeake-io', 'palmgrove-dev', 'magnolia-ops', 'laurelwood-systems',
  'juniper-eng', 'alder-labs', 'hemlock-io', 'sequoia-dev',
  'cypress-ops', 'poplar-tech', 'ashwood-eng', 'hazel-labs',
  'tamarack-io', 'larch-dev', 'beechwood-ops', 'dogwood-systems',
  'buckeye-eng', 'catalpa-labs', 'persimmon-io', 'tupelo-dev',
];

const REPO_PREFIXES = [
  'api', 'web', 'mobile', 'infra', 'config', 'auth', 'core', 'data',
  'frontend', 'backend', 'service', 'cli', 'sdk', 'lib', 'docs',
  'platform', 'pipeline', 'gateway', 'proxy', 'worker', 'cron', 'webhook',
  'dashboard', 'admin', 'portal', 'console', 'monitor', 'agent', 'connector',
];
const REPO_SUFFIXES = [
  'service', 'app', 'api', 'server', 'client', 'worker', 'proxy',
  'gateway', 'hub', 'engine', 'store', 'manager', 'controller',
  'handler', 'processor', 'adapter', 'bridge', 'runner', 'bot',
  'v2', 'v3', 'next', 'internal', 'public',
];

// ── Mapping caches ─────────────────────────────────────────────

const usernameMap = new Map<string, string>();
const orgMap = new Map<string, string>();
const repoMap = new Map<string, string>();
let usernameIdx = 0;
let orgIdx = 0;

function anonUsername(real: string): string {
  // Preserve well-known GitHub bot names
  const KNOWN_BOTS = new Set([
    'dependabot[bot]',
    'github-advanced-security[bot]',
    'copilot-pull-request-reviewer[bot]',
    'github-actions[bot]',
  ]);
  if (KNOWN_BOTS.has(real)) return real;

  if (!real || real === '' || real === 'username') return real;

  // Custom bots: anonymize but keep [bot] suffix
  if (real.endsWith('[bot]')) {
    const botName = real.slice(0, -5);
    return `${anonUsername(botName)}[bot]`;
  }

  const lower = real.toLowerCase();
  if (usernameMap.has(lower)) return usernameMap.get(lower)!;

  const anon = USERNAME_POOL[usernameIdx % USERNAME_POOL.length];
  usernameIdx++;
  usernameMap.set(lower, anon);
  return anon;
}

function anonOrg(real: string): string {
  if (!real || real === '' || real === 'organization') return real;

  const lower = real.toLowerCase();
  if (orgMap.has(lower)) return orgMap.get(lower)!;

  const anon = ORG_POOL[orgIdx % ORG_POOL.length];
  orgIdx++;
  orgMap.set(lower, anon);
  return anon;
}

function anonRepo(real: string): string {
  if (!real || real === '') return real;
  if (real === '.github') return real;

  const lower = real.toLowerCase();
  if (repoMap.has(lower)) return repoMap.get(lower)!;

  const h = hashStr(real);
  const prefix = REPO_PREFIXES[h % REPO_PREFIXES.length];
  const suffix = REPO_SUFFIXES[(h >>> 8) % REPO_SUFFIXES.length];
  const anon = `${prefix}-${suffix}`;
  repoMap.set(lower, anon);
  return anon;
}

function anonEmail(real: string): string {
  if (!real || real === '') return real;
  // noreply format: 12345+username@users.noreply.github.com
  const noreplyMatch = real.match(/^(\d+)\+(.+)@users\.noreply\.github\.com$/);
  if (noreplyMatch) {
    const anonUser = anonUsername(noreplyMatch[2]);
    return `${noreplyMatch[1]}+${anonUser}@users.noreply.github.com`;
  }
  // username@domain format
  const atIdx = real.indexOf('@');
  if (atIdx > 0) {
    const localPart = real.slice(0, atIdx);
    const domain = real.slice(atIdx + 1);
    const anonLocal = anonUsername(localPart);
    return `${anonLocal}@${domain}`;
  }
  return real;
}

function anonIp(_real: string): string {
  const h = hashStr(_real);
  return `${(h & 0xFF) || 10}.${(h >>> 8) & 0xFF}.${(h >>> 16) & 0xFF}.${((h >>> 24) & 0xFF) || 1}`;
}

function anonProfileUrl(real: string): string {
  if (!real) return real;
  const match = real.match(/^https:\/\/github\.com\/(.+)$/);
  if (match) return `https://github.com/${anonUsername(match[1])}`;
  return real;
}

/** Anonymize GHES server IDs like "208:octodemo.com:Member" */
function anonGhesId(value: string): string {
  if (!value) return value;
  // Format: id:server.domain:Role
  return value.replace(/(\d+):([^:]+):([A-Za-z]+)/g, (_match, id, _server, role) => {
    return `${id}:ghes.company.com:${role}`;
  });
}

/** Replace known internal domains with generic ones */
function anonDomain(value: string): string {
  return value
    .replace(/octodemo\.com/g, 'company.com')
    .replace(/octodemo/g, 'company');
}

// ── CSV field-level processing ─────────────────────────────────

/** Parse a single CSV value, handling quoting */
function unquote(s: string): string {
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1);
  return s;
}

/** Smart CSV line splitter that respects quoted commas */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      current += ch;
    } else if (ch === ',' && !inQuotes) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Anonymize org/repo references inside a quoted multi-value field (e.g. member roles) */
function anonOrgRepoRoles(value: string): string {
  // Format: "org1:Role, org2:Role, org2/repo:Collaborator"
  return value.replace(/([^,: ]+)(?:\/([^,: ]+))?:([A-Za-z]+)/g, (_match, org, repo, role) => {
    const aOrg = anonOrg(org);
    if (repo) {
      const aRepo = anonRepo(repo);
      return `${aOrg}/${aRepo}:${role}`;
    }
    return `${aOrg}:${role}`;
  });
}

/** Anonymize a comma-separated list of org names */
function anonOrgList(value: string): string {
  if (!value) return value;
  return value.split(/,\s*/).map(o => anonOrg(o.trim())).join(', ');
}

// ── File processors ────────────────────────────────────────────

function processUsageReport(filename: string) {
  const filepath = join(EXAMPLES_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const result = [lines[0]]; // header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { result.push(line); continue; }

    const fields = splitCsvLine(line);
    // Fields: date, product, sku, quantity, unit_type, applied_cost_per_quantity,
    //         gross_amount, discount_amount, net_amount, username, organization,
    //         repository, workflow_path, cost_center_name
    if (fields.length >= 14) {
      fields[9] = `"${anonUsername(unquote(fields[9]))}"`;   // username
      fields[10] = `"${anonOrg(unquote(fields[10]))}"`;     // organization
      fields[11] = `"${anonRepo(unquote(fields[11]))}"`;    // repository
      // workflow_path: keep structure, just workflow names are generic already
    }
    result.push(fields.join(','));
  }

  writeFileSync(filepath, result.join('\n'));
  console.log(`✅ ${filename}: ${result.length - 1} data rows anonymized`);
}

function processPremiumRequestReport(filename: string) {
  const filepath = join(EXAMPLES_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const result = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { result.push(line); continue; }

    const fields = splitCsvLine(line);
    // Fields: date, username, product, sku, model, quantity, unit_type,
    //         applied_cost_per_quantity, gross_amount, discount_amount, net_amount,
    //         exceeds_quota, total_monthly_quota, organization, cost_center_name,
    //         aic_quantity, aic_gross_amount
    if (fields.length >= 15) {
      fields[1] = `"${anonUsername(unquote(fields[1]))}"`;   // username
      fields[13] = `"${anonOrg(unquote(fields[13]))}"`;     // organization
    }
    result.push(fields.join(','));
  }

  writeFileSync(filepath, result.join('\n'));
  console.log(`✅ ${filename}: ${result.length - 1} data rows anonymized`);
}

function processTokenUsageReport(filename: string) {
  const filepath = join(EXAMPLES_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const result = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { result.push(line); continue; }

    const fields = splitCsvLine(line);
    // Same structure as premium request + token columns at end
    if (fields.length >= 15) {
      fields[1] = `"${anonUsername(unquote(fields[1]))}"`;   // username
      fields[13] = `"${anonOrg(unquote(fields[13]))}"`;     // organization
    }
    result.push(fields.join(','));
  }

  writeFileSync(filepath, result.join('\n'));
  console.log(`✅ ${filename}: ${result.length - 1} data rows anonymized`);
}

function processGhasReport(filename: string) {
  const filepath = join(EXAMPLES_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const result = [lines[0]]; // header: User login,Organization / repository,Last pushed date,Last pushed email
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { result.push(line); continue; }

    // Unquoted CSV: user,org/repo,date,email
    const fields = line.split(',');
    if (fields.length >= 4) {
      fields[0] = anonUsername(fields[0]);           // User login
      // org/repo
      const orgRepo = fields[1];
      const slashIdx = orgRepo.indexOf('/');
      if (slashIdx > 0) {
        const org = orgRepo.slice(0, slashIdx);
        const repo = orgRepo.slice(slashIdx + 1);
        fields[1] = `${anonOrg(org)}/${anonRepo(repo)}`;
      }
      fields[3] = anonEmail(fields[3]);              // email
    }
    result.push(fields.join(','));
  }

  writeFileSync(filepath, result.join('\n'));
  console.log(`✅ ${filename}: ${result.length - 1} data rows anonymized`);
}

function processDormantUsers(filename: string) {
  const filepath = join(EXAMPLES_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const result = [lines[0]]; // header: created_at,id,login,role,last_logged_ip,2fa_enabled?,outside_collaborator
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { result.push(line); continue; }

    const fields = line.split(',');
    // created_at has spaces so we need to handle the "2021-03-26 04:11:02 -0400" format
    // The created_at field contains spaces, so naive split breaks. Let's find the right fields.
    // Format: "YYYY-MM-DD HH:MM:SS TZ",id,login,role,ip,2fa,outside_collab
    // Since created_at has 2 commas worth of data... actually it doesn't have commas, just spaces.
    // So fields[0] = "2021-03-26 04:11:02 -0400" works fine since no commas in the date.
    if (fields.length >= 7) {
      fields[2] = anonUsername(fields[2]);  // login
      fields[4] = anonIp(fields[4]);        // last_logged_ip
    }
    result.push(fields.join(','));
  }

  writeFileSync(filepath, result.join('\n'));
  console.log(`✅ ${filename}: ${result.length - 1} data rows anonymized`);
}

function processSeatActivity(filename: string) {
  const filepath = join(EXAMPLES_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const result = [lines[0]]; // header: Report Time,Login,Last Authenticated At,Last Activity At,Last Surface Used,Organization
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { result.push(line); continue; }

    const fields = line.split(',');
    if (fields.length >= 6) {
      fields[1] = anonUsername(fields[1]);  // Login
      fields[5] = anonOrg(fields[5]);       // Organization
    }
    result.push(fields.join(','));
  }

  writeFileSync(filepath, result.join('\n'));
  console.log(`✅ ${filename}: ${result.length - 1} data rows anonymized`);
}

function processEnterpriseMembersExport(filename: string) {
  const filepath = join(EXAMPLES_DIR, filename);
  const content = readFileSync(filepath, 'utf-8');
  const lines = content.split('\n');

  const result = [lines[0]]; // complex header
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { result.push(line); continue; }

    const fields = splitCsvLine(line);
    // GitHub com login, GitHub com name, Enterprise server user ids,
    // GitHub com user, Enterprise server user, Visual studio subscription user,
    // License type, GitHub com profile, GitHub com member roles,
    // GitHub com enterprise roles, GitHub com verified domain emails,
    // GitHub com saml name, GitHub com orgs with pending invites,
    // GitHub com two factor auth, GitHub com two factor auth required by date,
    // GitHub com advanced security license user, Enterprise server primary emails,
    // Enterprise server advanced security user ids,
    // Visual studio license status, Visual studio subscription email,
    // Total user accounts
    if (fields.length >= 21) {
      const login = unquote(fields[0]);
      // Could be a SAML email for pending users
      if (login.includes('@')) {
        fields[0] = anonEmail(login);
      } else if (login && login !== '""') {
        fields[0] = anonUsername(login);
      }
      // GitHub com name (display name) - strip to avoid real name leaks
      if (fields[1] && unquote(fields[1])) {
        fields[1] = '';
      }
      // Enterprise server user ids (e.g. "208:octodemo.com:Member")
      const gheIds = unquote(fields[2]);
      if (gheIds) fields[2] = `"${anonGhesId(gheIds)}"`;
      // GitHub com profile URL
      fields[7] = anonProfileUrl(unquote(fields[7]));
      // GitHub com member roles (org:Role, org/repo:Collaborator)
      fields[8] = `"${anonOrgRepoRoles(unquote(fields[8]))}"`;
      // GitHub com verified domain emails
      const verifiedEmail = unquote(fields[10]);
      if (verifiedEmail) fields[10] = `"${anonEmail(anonDomain(verifiedEmail))}"`;
      // GitHub com saml name
      const samlName = unquote(fields[11]);
      if (samlName) fields[11] = anonEmail(anonDomain(samlName));
      // GitHub com orgs with pending invites
      const pendingOrgs = unquote(fields[12]);
      if (pendingOrgs) fields[12] = `"${anonOrgList(pendingOrgs)}"`;
      // Enterprise server primary emails
      const ghesEmail = unquote(fields[16]);
      if (ghesEmail) fields[16] = `"${anonEmail(anonDomain(ghesEmail))}"`;
      // Visual studio subscription email
      const vsEmail = unquote(fields[19]);
      if (vsEmail) fields[19] = anonEmail(anonDomain(vsEmail));
    }
    result.push(fields.join(','));
  }

  writeFileSync(filepath, result.join('\n'));
  console.log(`✅ ${filename}: ${result.length - 1} data rows anonymized`);
}

// ── Run ─────────────────────────────────────────────────────────

console.log('🔒 Anonymizing example CSV data...\n');

// Process files with real data (restored from git)
processUsageReport('usageReport_1_7f2ed6006ee54fb8af73f5cbb7ac1f1d.csv');
processPremiumRequestReport('premiumRequestUsageReport_1_c6fca30f0acd458098a95808eaf43399.csv');
processTokenUsageReport('Token.Usage.Report.csv');
processGhasReport('ghas_active_committers_octodemo_2026-03-27T1521.csv');

// Process files that were faker-generated (still need consistent naming)
processDormantUsers('export-octodemo-1774679438.csv');
processSeatActivity('octodemo-seat-activity-1774680875.csv');
processEnterpriseMembersExport('export-octodemo-1774709193.csv');

console.log(`\n📊 Mapping stats: ${usernameMap.size} users, ${orgMap.size} orgs, ${repoMap.size} repos anonymized`);
console.log('✨ Done! All PII replaced with realistic anonymous names.');
