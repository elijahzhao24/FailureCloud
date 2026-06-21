# FailureCloud Design Context

Reference for UX/UI decisions. Desktop-first (1280–1600px). Minimal YC / hackathon aesthetic inspired by [Kaaro](https://www.kaaro.ai/), [Nexus](https://nexusapp.tech/), and [OnDeck](https://ondeckai.com/) — not copied.

## Product split

| Surface | Route | Theme |
|---------|-------|-------|
| Marketing | `/` | Dark cinematic landing |
| Application | `/app/*` | Light workspace |
| Legacy | `/legacy` | Old single-page console (temporary) |

## Visual direction

**Tone:** Restrained, futuristic, honest. Black-and-white foundations with one sparse accent. Large typography, generous spacing, thin borders, rounded outlined surfaces. No clutter, no fake social proof.

**Avoid:** Purple gradients, heavy shadows, neon overload, Barlow/industrial console aesthetic, lime-green dominance, uppercase micro-label spam.

## Color tokens

### Landing (dark)

```css
--fc-black:        #050505   /* page background */
--fc-black-soft:   #0c0c0c   /* elevated surfaces */
--fc-white:        #f4f4f2   /* primary text */
--fc-gray-light:   #a3a3a0   /* secondary text */
--fc-gray-mid:     #5c5c58   /* tertiary / labels */
--fc-gray-line:    #222220   /* borders, grid lines */
--fc-gray-line-hi: #333330   /* hover borders */
--fc-mint:         #6ee7b7   /* accent — use sparingly */
--fc-mint-dim:     rgb(110 231 183 / 12%)
--fc-mint-glow:    rgb(110 231 183 / 25%)
```

### Workspace (light)

```css
--fc-bg:           #f7f7f5
--fc-surface:      #ffffff
--fc-surface-soft: #f2f2ef
--fc-ink:          #0a0a09
--fc-copy:         #4a4a47
--fc-muted:        #8a8a86
--fc-border:       #e4e4e0
--fc-border-strong:#cacac4
--fc-accent:       #6ee7b7   /* same mint, used on badges/focus only */
--fc-accent-ink:   #0d3d2a
```

### Semantic (both)

- Success: `#22c55e`
- Warning: `#d97706`
- Error: `#ef4444`

## Typography

| Role | Font | Usage |
|------|------|-------|
| Display & UI | **Instrument Sans Variable** | Headlines, body, buttons, nav |
| Technical | **IBM Plex Mono** | Sensor values, IDs, JSON, step numbers |

**Scale (desktop):**

- Hero display: `clamp(52px, 5.5vw, 76px)` / weight 500 / tracking `-0.04em`
- Section title: `clamp(32px, 3vw, 44px)` / weight 500
- Body: `16–18px` / line-height `1.55`
- Label: `11–12px` / weight 500 / optional `0.04em` tracking
- Mono data: `11–13px`

Do **not** use Barlow Condensed or all-caps label stacks.

## Spacing & shape

- Page max-width: `1200px` (landing), `1180px` (workspace content)
- Section vertical rhythm: `120–160px`
- Card padding: `24–32px`
- Border radius: `12px` (sm), `16px` (md), `20px` (lg), `999px` (pill)
- Border width: `1px` always — never chunky 2px except focus rings

## Motion

- Page load: staggered fade-up (`600ms`, `cubic-bezier(0.16, 1, 0.3, 1)`)
- Ambient: slow grid drift (`40s linear infinite`) — subtle, not distracting
- Hover: border-color shift + `150ms ease`
- No bouncing, no parallax overload

## Shared components

| Component | Landing | Workspace |
|-----------|---------|-----------|
| Brand mark | White SVG chevron stack | Same mark, dark ink |
| Primary button | White fill, black text | Black fill, white text |
| Secondary button | Outlined, gray border | Outlined, gray border |
| Card | `black-soft` + `gray-line` border | White + soft shadow |
| Badge | Mint outline or muted fill | Mint tint or muted |
| Step indicator | Horizontal pills (landing) | Vertical rail list (app) |

## Landing page sections (`/`)

1. **Nav** — Brand, anchor links (Workflow, Artifacts, Exports), "Launch app" → `/app`
2. **Hero** — "Find failures before robots do." + animated flow diagram
3. **Workflow** — Seven steps: Describe → Choose → Edit → Preview → Run → Results → Export
4. **Artifacts** — What gets generated (scenario, sensors, eval, exports)
5. **Exports** — Honest status cards (Ready / Preview / Coming soon)
6. **CTA + Footer** — Single launch action, minimal footer

## Workspace shell (`/app`)

- Sticky header: brand, workspace label, legacy link
- Left rail: test name + 7-step workflow (active state = white card + mint dot)
- Main: step content on soft gray background

## Content rules

- No fabricated testimonials, user counts, or unsupported integration claims
- Other robot types/environments: disabled, labeled "Coming soon"
- Reactor preview: always marked "Illustrative"
- Export cards use honest status labels

## File map

```
apps/web/
  design/DESIGN_CONTEXT.md     ← this file
  app/tokens.css                 ← shared CSS variables
  app/landing.css                ← dark marketing styles
  app/workspace.css              ← light app styles
  components/landing/            ← landing page components
  components/workspace/          ← app shell + step pages
```

## Workflow routes (planned)

```
/                          Landing
/app                       Describe (generate)
/app/tests                 Choose (5 suggestions)
/app/tests/[id]/edit       Edit scenario
/app/tests/[id]/preview    Preview schematic
/app/runs/[id]             Run + results playback
/app/runs/[id]/export      Export bundle
/legacy                    Old console (remove after E2E pass)
```
