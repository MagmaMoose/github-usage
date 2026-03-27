---
description: "Use when working with example CSV files, usage report formats, billing data schemas, or parsing CSV columns. Covers all report types: Actions usage, Copilot premium requests, Copilot token/AIU usage, and GHAS active committers."
applyTo: "examples/**"
---

# Example CSV Files

The `examples/` directory contains sample CSV exports from GitHub's billing and usage systems. These are real report formats used by enterprise customers.

## Report Types

### Actions Usage Report (`usageReport_*.csv`)
GitHub Actions metered usage (minutes, storage, etc).

Columns: `date`, `product`, `sku`, `quantity`, `unit_type`, `applied_cost_per_quantity`, `gross_amount`, `discount_amount`, `net_amount`, `username`, `organization`, `repository`, `workflow_path`, `cost_center_name`

Example rows:
```csv
"date","product","sku","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","username","organization","repository","workflow_path","cost_center_name"
"2026-02-01","actions","actions_linux","3","minutes","0.006","0.018000000000000002","0.018000000000000002","0","dependabot[bot]","octodemo","sennap-books-1-23",".github/workflows/pr_code_coverage.yml",""
"2026-02-01","actions","actions_custom_image_storage","49152","gigabyte-hours","9.4086E-05","4.6245150719999994","4.6245150719999994","0","","octodemo","","",""
"2026-02-01","actions","actions_linux_16_core","10","minutes","0.006","0.06","0.06","0","copilot-pull-request-reviewer[bot]","octodemo","octocat_supply-congenial-enigma","dynamic/copilot-pull-request-reviewer/copilot-pull-request-reviewer",""
```

- This report contains ALL metered products, not just Actions. Products include: `actions`, `copilot` (seat billing like `copilot_enterprise`, `copilot_for_business`), `spark`, `git_lfs`, `packages`
- SKUs for runners: `actions_linux`, `actions_windows`, `actions_macos`, `actions_linux_arm`, `actions_linux_slim`, `actions_linux_4_core`, `actions_linux_8_core`, `actions_linux_16_core`, `actions_linux_32_core`, `actions_linux_64_core`, `actions_self_hosted_linux`, `actions_self_hosted_windows`
- Storage/bandwidth SKUs: `actions_storage`, `actions_custom_image_storage`, `git_lfs_storage`, `git_lfs_bandwidth`, `packages_storage`, `packages_bandwidth`
- `unit_type` varies: `minutes` for runner compute, `gigabyte-hours` for storage
- `applied_cost_per_quantity` can be in scientific notation (e.g. `9.4086E-05`)
- `gross_amount` values have floating point precision noise (e.g. `0.018000000000000002`)
- `username` can be empty (for org-level storage rows) or contain bot suffixes like `[bot]`
- `workflow_path` can be a standard `.github/workflows/*.yml` path, a `dynamic/` path (for GitHub-managed workflows like CodeQL, Dependabot, Copilot PR reviewer), or a `required/` path (for required workflows)
- `discount_amount` equals `gross_amount` when net is `0` (fully discounted/included usage)

### Copilot Premium Request Report (`premiumRequestUsageReport_*.csv`)
Legacy Copilot billing report measuring usage in premium requests.

Columns: `date`, `username`, `product`, `sku`, `model`, `quantity`, `unit_type`, `applied_cost_per_quantity`, `gross_amount`, `discount_amount`, `net_amount`, `exceeds_quota`, `total_monthly_quota`, `organization`, `cost_center_name`, `aic_quantity`, `aic_gross_amount`

Example rows:
```csv
"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","exceeds_quota","total_monthly_quota","organization","cost_center_name","aic_quantity","aic_gross_amount"
"2026-03-01","siddjoshi","copilot","copilot_premium_request","Claude Opus 4.6","366","requests","0.04","14.639999999999995","14.639999999999995","0","False","1000","octodemo","","0","0"
"2026-03-01","Josumah","spark","spark_premium_request","Claude Opus 4.5","4","requests","0.04","0.16","0.16","0","False","1000","sbt-tf","","0","0"
"2026-03-01","patrick-knight","copilot","coding_agent_premium_request","Coding Agent model","1","requests","0.04","0.04","0.04","0","False","1000","octodemo","","0","0"
```

- Products: `copilot` (chat, completions, PR review) and `spark` (Copilot Workspace)
- SKUs: `copilot_premium_request`, `coding_agent_premium_request`, `spark_premium_request`, `copilot_ai_unit`, `coding_agent_ai_unit`, `spark_ai_unit`
- `model` includes both explicit model picks and `Auto:` prefixed models (e.g. `"Auto: Claude Sonnet 4.6"`, `"Auto: GPT-5.2-Codex"`)
- Special model names: `"Code Review model"`, `"Coding Agent model"` (not actual LLM names)
- `exceeds_quota` is a string `"True"` or `"False"`, not a boolean
- `total_monthly_quota` varies per org (commonly `1000` or `300`)
- `cost_center_name` is often empty string `""` when no cost center is assigned
- `aic_quantity` and `aic_gross_amount` are AI Credits fields (typically `0` in most rows)
- All values are double-quoted strings, including numbers

### Copilot Token Usage Report (`Token.Usage.Report.csv`)
New Copilot billing report with AIU (AI Unit) pricing and token-level detail.

Columns: `date`, `username`, `product`, `sku`, `model`, `quantity`, `unit_type`, `applied_cost_per_quantity`, `gross_amount`, `discount_amount`, `net_amount`, `exceeds_quota`, `total_monthly_quota`, `organization`, `cost_center_name`, `total_input_tokens`, `total_output_tokens`, `total_cache_creation_tokens`, `total_cache_read_tokens`

Example rows:
```csv
"date","username","product","sku","model","quantity","unit_type","applied_cost_per_quantity","gross_amount","discount_amount","net_amount","exceeds_quota","total_monthly_quota","organization","cost_center_name","total_input_tokens","total_output_tokens","total_cache_creation_tokens","total_cache_read_tokens"
"2026-02-01","gmondello","copilot","copilot_premium_request","Claude Opus 4.5","111","requests","0.04","4.440000000000003","4.440000000000003","0","False","1000","emea-avo-waffle","greg-test","44897","11976","1395060","1443242"
"2026-02-03","LindseyB","copilot","copilot_premium_request","GPT-5","15","requests","0.04","0.6","0.6","0","False","1000","evil-copilot-avocado","","80294","34849","0","116352"
"2026-02-02","optimisticjc","copilot","copilot_premium_request","Gemini 2.5 Pro","3","requests","0.04","0.12","0.12","0","False","1000","optimisticjc-ceviche","","10264","1170","0","9189"
```

- Replaces the premium request report with the same first 15 columns, plus 4 token columns
- Token columns: `total_input_tokens`, `total_output_tokens`, `total_cache_creation_tokens`, `total_cache_read_tokens`
- Cache tokens can be `0` for models/providers that don't support prompt caching
- Token counts are per-row aggregates (per user/model/day), not per-request
- This report has daily granularity in the `date` field (e.g. `2026-02-01`, `2026-02-02`) unlike the premium request report which is monthly (`2026-03-01`)
- File is named `Token.Usage.Report.csv` (dot-separated, PascalCase) unlike the other reports

### GHAS Active Committers (`ghas_active_committers_*.csv`)
GitHub Advanced Security active committer report.

Columns: `User login`, `Organization / repository`, `Last pushed date`, `Last pushed email`

Example rows:
```csv
User login,Organization / repository,Last pushed date,Last pushed email
ambilykk,octodemo/copilot-user-dashboard,2026-02-20,10282550+ambilykk@users.noreply.github.com
potaders,potaders-playground/copilot-metrics-dashboard,2026-03-27,potaders@github.com
ghsioux,ghsioux-octodemo/e2e-test-backend,2026-03-27,ghsioux@github.com
```

- Completely different format from the other reports: column names use spaces and slashes, values are NOT quoted
- `Organization / repository` is a combined `org/repo` field that needs splitting
- A single user can appear multiple times (one row per repo they committed to)
- The filename contains the enterprise/org name and a timestamp (e.g. `ghas_active_committers_octodemo_2026-03-27T1521.csv`)
- Emails use the GitHub noreply format (`ID+username@users.noreply.github.com`) or actual emails
- No cost/billing data in this report, it's purely activity-based
