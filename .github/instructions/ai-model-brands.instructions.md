---
description: "Use when working with AI model colors, model branding, chart theming, model icons, or provider logos. Covers Claude, GPT, Gemini, Grok/xAI, and GitHub Copilot brand assets. Use when: model color, brand color, model icon, model avatar, provider logo, chart theme, model breakdown."
applyTo: "**/chart-theme.ts"
---

# AI Model Provider Brand Reference

When rendering model names, charts, badges, or avatars in the GitHub Usage Report Viewer, use these official brand colors and assets.

## Brand Colors

| Provider | Model Family | Primary Hex | Chart Base | Icon/Avatar |
|----------|-------------|-------------|------------|-------------|
| **Anthropic** | Claude | `#D97757` | `#D97757` (terracotta) | ![Claude](https://simpleicons.org/icons/anthropic.svg) |
| **OpenAI** | GPT | `#10A37F` | `#10A37F` (green) | ![GPT](https://simpleicons.org/icons/openai.svg) |
| **OpenAI** | o-series (o1/o3/o4) | `#0D8C6D` | `#0D8C6D` (dark teal) | ![OpenAI](https://simpleicons.org/icons/openai.svg) |
| **Google** | Gemini | `#4285F4` | `#4285F4` (blue) | ![Gemini](https://simpleicons.org/icons/googlegemini.svg) |
| **xAI** | Grok | `#000000` | `#1A1A1A` (near-black) | ![xAI](https://simpleicons.org/icons/x.svg) |
| **GitHub** | Copilot / Code Review | `#8534F3` | `#8250df` (purple) | ![Copilot](https://simpleicons.org/icons/githubcopilot.svg) |
| **GitHub** | Coding Agent | `#6639ba` | `#6639ba` (deep purple) | ![GitHub](https://simpleicons.org/icons/github.svg) |

## Extended Palette (Official Sources)

### Anthropic / Claude
- UI accent (coral/tan): `#D4A27F`
- Warm terracotta (chat UI): `#CC785C`, `#D97757`
- Corporate dark: `#191919`
- No public brand page

### OpenAI / GPT
- Primary: Black `#000000` (B&W brand — Blossom logo)
- ChatGPT green accent: `#10A37F`
- Font: OpenAI Sans (custom)
- Brand page: https://openai.com/brand
- Logo: "Blossom" mark — must be black or white only

### Google / Gemini
- Gemini purple: `#8E75B2`
- Google Blue: `#4285F4`, Red: `#EA4335`, Yellow: `#FBBC04`, Green: `#34A853`
- Brand page: https://about.google/brand-resource-center/

### xAI / Grok
- Brand is strictly B&W: `#000000` / `#FFFFFF`
- Current logo: black hole motif with "To understand" tagline (since Feb 2025)
- No public brand page

### GitHub / Copilot
- GitHub Green: `#0FBF3E`
- Copilot Purple: `#8534F3`
- Security Blue: `#3094FF`
- Full color system: https://brand.github.com/foundations/color
- Logo download: https://brand.github.com/GitHub_Logos.zip

## Chart Theme Rules

1. Use `buildColorMap(names)` to assign colors — pass the full list of series names once, get a `Map<string, string>` back. This is stateless, deterministic, and shared across ALL chart types.
2. Match model names case-insensitively via `includes()` on these keys:
   - `claude` → Anthropic terracotta
   - `gpt` → OpenAI green
   - `o1`, `o3`, `o4` → OpenAI reasoning teal
   - `gemini` → Google blue
   - `grok` → xAI dark
   - `copilot`, `code review`, `coding agent` → GitHub purple
3. Within a family, siblings are auto-shaded using `Highcharts.color(base).brighten(offset)`
4. Non-matching names fall back to `GITHUB_COLORS_RESOLVED` data-viz palette
5. **Do NOT** use `getModelColor`/`resetModelColors` (deprecated mutable API) — use `buildColorMap` instead

## SVG Icon URLs (Simple Icons CDN)

```
Anthropic:      https://cdn.simpleicons.org/anthropic/D97757
OpenAI:         https://cdn.simpleicons.org/openai/10A37F
Google Gemini:  https://cdn.simpleicons.org/googlegemini/4285F4
GitHub Copilot: https://cdn.simpleicons.org/githubcopilot/8534F3
GitHub:         https://cdn.simpleicons.org/github/000000
```

These URLs accept a hex color suffix to tint the icon, e.g. `/anthropic/D97757`.
