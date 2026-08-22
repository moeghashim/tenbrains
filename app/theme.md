---
title: Warm Graphite Workbench Theme
description: Portable model-facing theme specification for implementing PIUI's Codex-inspired visual language in another software tool.
status: ready-to-share
version: 1.0.0
last_reviewed: 2026-08-15
portable: true
---

# Warm Graphite Workbench Theme

This is a self-contained visual theme specification for another coding agent, product team, or implementation model. It describes a quiet, Codex-inspired desktop workbench without depending on PIUI's components, data model, or terminology.

Share this entire file with the implementing model. The model should apply the visual language to the target tool's existing information architecture rather than cloning PIUI's screens.

## Implementation directive

```text
Implement the Warm Graphite Workbench theme described in this file.

Preserve the target product's existing features, terminology, routes, data model,
and interaction semantics. Change presentation and layout only where required to
express this theme. Do not invent unavailable functionality, replace real controls
with mock controls, or hard-code sample data.

First inventory the target's existing surfaces and states. Map them to the semantic
tokens and component recipes in this specification. Reuse the target's icon library
and component primitives when possible. Implement dark, light, and system modes,
responsive behavior, keyboard focus, reduced motion, loading, empty, disabled,
success, warning, and error states.

After implementation, test the primary workflow at 1440x900, approximately 700x900,
and 390x844. Verify there is no clipped essential control, no horizontal overflow,
all form controls remain usable, and serious/critical accessibility violations are zero.
```

## 1. Theme identity

Theme name: **Warm Graphite Workbench**

The theme should feel:

- focused rather than decorative;
- technical without looking like a terminal emulator;
- compact without feeling cramped;
- warm rather than blue-gray or stark monochrome;
- calm during long-running work;
- honest about system state;
- desktop-native while remaining fully responsive.

The visual signature is a warm graphite canvas, low-contrast structural boundaries, cream text, restrained orange actions, semantic green health indicators, monospace-led typography, a narrow reading column, and one or two gently elevated work surfaces.

Do not imitate proprietary branding, logos, exact product copy, or private assets. The inspiration is the hierarchy and tone of a modern coding workbench, not a pixel-identical clone.

## 2. Core design rules

1. **Primary work dominates.** The editor, conversation, document, task, or other main content surface receives the most space and contrast.
2. **Navigation is quieter.** Sidebars and toolbars are visible but should recede until hovered or active.
3. **Elevation is scarce.** Reserve obvious elevation for the primary input/composer, floating dialogs, and an optional context panel.
4. **State is explicit.** Pair color with labels, icons, disabled behavior, or accessible state attributes.
5. **Metadata remains readable.** Small text is allowed, but low-priority text must still meet accessible contrast.
6. **One warm accent.** Use orange for deliberate action and selection. Do not scatter multiple decorative accent colors.
7. **Green means healthy.** Reserve green for connected, successful, complete, or valid states.
8. **Borders organize, not decorate.** Prefer faint separators and subtle fills over outlined boxes around every element.
9. **Responsive design removes secondary chrome before shrinking primary work.**
10. **The target product stays itself.** Apply this theme to its actual workflows and vocabulary.

## 3. Theme tokens

### 3.1 Dark palette

Use dark mode as the reference implementation.

| Semantic token | Value | Purpose |
| --- | --- | --- |
| `canvas` | `#2f353b` | Main application background |
| `navigation` | `#41464a` | Sidebar or persistent navigation |
| `surface` | `#383e43` | Primary control/composer surface |
| `surfaceRaised` | `#3b4145` | Optional context panel or elevated region |
| `surfaceHover` | `#3f454a` | Hover and secondary surface |
| `surfaceActive` | `#484e52` | Selected or pressed surface |
| `textPrimary` | `#e5ddca` | Titles and primary content |
| `textSecondary` | `#d0c7b1` | Body text and control labels |
| `textMuted` | `#c2baa7` | Secondary labels |
| `textDim` | `#bbb4a3` | Metadata and tertiary labels |
| `border` | `rgba(221, 214, 195, 0.13)` | Meaningful boundaries |
| `borderSubtle` | `rgba(221, 214, 195, 0.075)` | Grouping separators |
| `accent` | `#f08a52` | Selected states and emphasized actions |
| `accentHover` | `#f2a176` | Hovered primary action |
| `accentSoft` | `rgba(240, 138, 82, 0.11)` | Accent background |
| `success` | `#9bd27c` | Healthy, complete, connected |
| `successSoft` | `rgba(155, 210, 124, 0.11)` | Success background |
| `warning` | `#f0a95d` | Caution and in-progress warning |
| `warningSoft` | `rgba(240, 169, 93, 0.09)` | Warning background |
| `danger` | `#d97d7d` | Error, abort, destructive action |
| `dangerSoft` | `rgba(217, 125, 125, 0.12)` | Danger background |
| `focus` | `#f09a6a` | Keyboard focus outline |
| `shadow` | `rgba(0, 0, 0, 0.14)` | Standard elevation |
| `shadowStrong` | `rgba(0, 0, 0, 0.30)` | Dialog elevation |

### 3.2 Light palette

Light mode is a warm off-white translation, not a pure-white inversion.

| Semantic token | Value | Purpose |
| --- | --- | --- |
| `canvas` | `#f5f5f2` | Main application background |
| `navigation` | `#e9e9e5` | Sidebar or persistent navigation |
| `surface` | `#ffffff` | Primary control/composer surface |
| `surfaceRaised` | `#edede9` | Optional context panel |
| `surfaceHover` | `#ecece8` | Hover and secondary surface |
| `surfaceActive` | `#e2e2dd` | Selected or pressed surface |
| `textPrimary` | `#252625` | Titles and primary content |
| `textSecondary` | `#383936` | Body text and control labels |
| `textMuted` | `#555751` | Secondary labels |
| `textDim` | `#62645e` | Metadata and tertiary labels |
| `border` | `rgba(31, 32, 30, 0.15)` | Meaningful boundaries |
| `borderSubtle` | `rgba(31, 32, 30, 0.085)` | Grouping separators |
| `accent` | `#a44b22` | Accessible selected/action color |
| `accentHover` | `#873a19` | Hovered primary action |
| `accentSoft` | `rgba(200, 94, 43, 0.09)` | Accent background |
| `success` | `#3f742e` | Healthy, complete, connected |
| `successSoft` | `rgba(63, 116, 46, 0.10)` | Success background |
| `warning` | `#875718` | Caution and warning |
| `warningSoft` | `rgba(135, 87, 24, 0.09)` | Warning background |
| `danger` | `#9a3f3f` | Error and destructive action |
| `dangerSoft` | `rgba(154, 63, 63, 0.10)` | Danger background |
| `focus` | `#a44b22` | Keyboard focus outline |
| `shadow` | `rgba(31, 32, 30, 0.10)` | Standard elevation |
| `shadowStrong` | `rgba(31, 32, 30, 0.20)` | Dialog elevation |

### 3.3 CSS starter variables

The implementing model may rename variables to match the target system, but semantic relationships must remain intact.

```css
:root,
[data-theme="dark"] {
  color-scheme: dark;
  --theme-canvas: #2f353b;
  --theme-navigation: #41464a;
  --theme-surface: #383e43;
  --theme-surface-raised: #3b4145;
  --theme-surface-hover: #3f454a;
  --theme-surface-active: #484e52;
  --theme-text: #e5ddca;
  --theme-text-secondary: #d0c7b1;
  --theme-text-muted: #c2baa7;
  --theme-text-dim: #bbb4a3;
  --theme-border: rgba(221, 214, 195, 0.13);
  --theme-border-subtle: rgba(221, 214, 195, 0.075);
  --theme-accent: #f08a52;
  --theme-accent-hover: #f2a176;
  --theme-accent-soft: rgba(240, 138, 82, 0.11);
  --theme-success: #9bd27c;
  --theme-warning: #f0a95d;
  --theme-danger: #d97d7d;
  --theme-focus: #f09a6a;
  --theme-shadow: rgba(0, 0, 0, 0.14);
  --theme-shadow-strong: rgba(0, 0, 0, 0.30);
}

[data-theme="light"] {
  color-scheme: light;
  --theme-canvas: #f5f5f2;
  --theme-navigation: #e9e9e5;
  --theme-surface: #ffffff;
  --theme-surface-raised: #edede9;
  --theme-surface-hover: #ecece8;
  --theme-surface-active: #e2e2dd;
  --theme-text: #252625;
  --theme-text-secondary: #383936;
  --theme-text-muted: #555751;
  --theme-text-dim: #62645e;
  --theme-border: rgba(31, 32, 30, 0.15);
  --theme-border-subtle: rgba(31, 32, 30, 0.085);
  --theme-accent: #a44b22;
  --theme-accent-hover: #873a19;
  --theme-accent-soft: rgba(200, 94, 43, 0.09);
  --theme-success: #3f742e;
  --theme-warning: #875718;
  --theme-danger: #9a3f3f;
  --theme-focus: #a44b22;
  --theme-shadow: rgba(31, 32, 30, 0.10);
  --theme-shadow-strong: rgba(31, 32, 30, 0.20);
}
```

System mode must follow `prefers-color-scheme` while preserving an explicit user override.

## 4. Typography

Use the operating system's monospace family as the primary face:

```css
font-family: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Monaco,
  Consolas, "Liberation Mono", monospace;
```

Do not load a remote font solely to implement this theme. The system stack is intentional: it feels native, loads immediately, and works across desktop environments.

### Type scale

| Role | Size | Line height | Weight | Tracking |
| --- | ---: | ---: | ---: | ---: |
| Display/empty-state title | `22–30px` | `1.1` | `520` | `-0.035em` |
| Dialog title | `22–24px` | `1.2` | `520` | `-0.025em` |
| Page title | `17–22px` | `1.25` | `520` | `-0.02em` |
| Primary body/content | `13px` | `1.65–1.72` | `400` | normal |
| Control label | `10–12px` | `1.3` | `450–600` | normal |
| Section label | `10px` | `1.3` | `500` | `0.02–0.04em` |
| Metadata | `8–10px` | `1.4` | `400–500` | normal |

Use sentence case. Avoid large blocks of uppercase text. Keep labels short and operational.

## 5. Spacing, geometry, and elevation

### Spacing scale

Use this core scale:

```text
2, 4, 6, 8, 12, 16, 20, 24, 32, 40px
```

Prefer `8px` and `12px` internal gaps, `16px` compact padding, and `24px` region padding. Use values outside the scale only for optical alignment.

### Radius scale

| Element | Radius |
| --- | ---: |
| Small icon/control | `7–9px` |
| Input/button/card | `9–12px` |
| Dialog | `16px` |
| Primary composer/input surface | `18–20px` |
| Context panel | `22px` |
| Circular action/status | `999px` |

### Elevation

Use elevation sparingly:

```css
/* Primary input/composer */
box-shadow: 0 12px 32px var(--theme-shadow);

/* Dialog/popover */
box-shadow: 0 24px 70px var(--theme-shadow-strong);
```

Flat content regions should rely on spacing and subtle separators. Do not turn every list item into a floating card.

## 6. Layout recipes

Map these recipes onto the target product only when the corresponding regions exist.

### 6.1 Desktop workbench

Recommended structure:

```text
┌──────────────┬──────────────────────────────────┬────────────────┐
│ Navigation   │ Primary work                     │ Context        │
│ 260–300px    │ flexible, reading width 720–800 │ 300–340px     │
│              │                                  │ optional       │
└──────────────┴──────────────────────────────────┴────────────────┘
```

- navigation: `260–300px`, darker or lighter than canvas by one surface step;
- primary region: flexible with `min-width: 0`;
- content/readable column: `720–800px` maximum;
- optional context region: `300–340px`;
- top toolbar: `46–52px`;
- secondary tab/view row: `32–36px`;
- primary work region must absorb remaining height;
- primary input/composer anchors near the bottom when the workflow requires continuous input.

### 6.2 Navigation

- Brand and collapse action at the top.
- Primary create/new action is quiet until hovered; it need not be a bright filled button.
- Search is full-width and `44px` high.
- Group labels are small and subdued.
- Active rows use a subtle fill, not a high-saturation bar.
- Row height is usually `44–52px`.
- Titles truncate; navigation width does not expand for content.

### 6.3 Primary work surface

- Keep the main content on the canvas rather than placing the entire page inside a card.
- Center long-form content in a narrow readable column.
- Give primary content more contrast than chrome.
- Use generous vertical rhythm even when controls remain compact.
- Avoid persistent empty right-side space if no context panel exists.

### 6.4 Context panel

When the target has environment, inspector, properties, or status information:

- place it in one rounded raised panel;
- group rows with subtle separators;
- use compact labels and one-line values;
- make rows actionable only when they open a real destination;
- hide the entire panel before compressing the main work area excessively;
- preserve its functions through dialogs or toolbar actions at narrower widths.

## 7. Component recipes

### 7.1 Search and text inputs

- minimum height: `44px` for search and frequently used fields;
- radius: `10px`;
- default border: transparent or very subtle;
- background: slightly inset from its surrounding region;
- focus: one subtle border plus a visible `2px` focus outline;
- placeholder uses `textMuted`, not extremely faint text;
- leading search icon: `14–16px`;
- input background remains transparent inside the search container.

### 7.2 Buttons

Primary action:

- warm orange fill;
- dark readable label in dark mode;
- `39–44px` high;
- no glow;
- hover changes luminance modestly.

Secondary action:

- subtle surface fill;
- faint border;
- text uses `textSecondary`;
- hover increases surface contrast.

Ghost/icon action:

- `32–36px` square;
- no default border;
- translucent hover fill;
- icon plus accessible label;
- use tooltips only as supplementary information.

Destructive/stop action:

- `danger` text or fill;
- reserve for actual stop, remove, disconnect, or destructive behavior;
- require confirmation when the operation is not readily reversible.

### 7.3 Tabs and segmented controls

- compact rounded group or individual quiet buttons;
- selected tab uses a subtle active surface;
- avoid thick underlines unless the target already uses them consistently;
- use semantic tab roles and `aria-selected`;
- counts use a small neutral badge.

### 7.4 Lists

- separate rows with spacing or `borderSubtle`;
- hover fill is translucent and local to the row;
- row titles use `10–12px` medium text;
- metadata uses `8–10px` dim text;
- avoid a card border around every row;
- preserve keyboard selection and focus independently from hover.

### 7.5 Long-form content

- width: `720–800px` maximum;
- body: `13px / 1.65–1.72`;
- headings use warm primary text and moderate weight;
- links use the warm accent and remain underlined on hover/focus;
- inline code uses a subtle inset background;
- code blocks use a deeper graphite surface, `10–11px` text, `10px` radius, and horizontal scroll;
- blockquotes use a muted left border;
- tables scroll horizontally on narrow screens rather than breaking layout.

### 7.6 User-generated or input content

If the target presents an input/output conversation:

- user content is right-aligned in a soft neutral bubble;
- desktop bubble width is no more than `58–65%`;
- mobile bubble width may reach `85%`;
- generated/output content uses the main reading width without a bubble;
- avatars are optional and should be removed when they add repetitive noise;
- reasoning or background work is collapsible and visually subordinate.

### 7.7 Tool, event, or operation rows

- compact row height: approximately `34px` before expansion;
- use a small neutral operation icon;
- show name, short status, and expandable detail;
- running state uses activity plus text;
- success uses green plus text/icon;
- failure uses danger plus preserved diagnostic content;
- expanded arguments/results use preformatted inset surfaces;
- unknown event types receive a generic data-preserving fallback.

### 7.8 Primary composer or command surface

When the target has a persistent command, prompt, or message input:

- give it the strongest elevation in the primary workspace;
- maximum width should match the readable content column;
- radius: `18–20px`;
- internal text area starts around `58px` high and grows as needed;
- controls sit in a compact footer;
- primary submit action is circular or softly rounded and orange;
- active stop action is visibly distinct and red;
- attachment/status/secondary controls remain quiet;
- focus changes border and soft ring without shifting geometry;
- keep the surface stable as content above it updates.

### 7.9 Dialogs and sheets

- use a native modal/dialog primitive when available;
- centered dialogs: maximum width `520–900px` depending on content;
- side inspector/details: full-height, `480–540px` desktop;
- border radius: `16px` centered, `0` at a full-height screen edge;
- backdrop: translucent graphite with restrained blur;
- title and close action are always visible;
- Escape closes noncritical dialogs;
- mobile dialogs become full-screen when content is complex;
- dialog content scrolls internally while the page behind it remains fixed.

### 7.10 Settings

For multi-category settings:

- desktop: `180px` category navigation plus flexible content;
- maximum dialog: approximately `900px × 680px`;
- settings rows have `72–80px` minimum height;
- title/description stay left, control stays right;
- mobile: categories become a compact top row and content becomes full-screen;
- warnings sit near the control they qualify.

### 7.11 Empty states

- align empty states with the primary reading column;
- use a small product mark or existing icon, not a large illustration by default;
- use one short title and one practical sentence;
- offer one real next action;
- do not use fake data to make the screen appear populated.

### 7.12 Toasts and banners

- use toasts for transient confirmations and nonblocking diagnostics;
- use persistent banners for disconnected or blocking global states;
- limit toast width to approximately `360px`;
- pair semantic icon, label, and color;
- do not replace primary runtime/page state with a warning toast.

## 8. Interaction states

Every implemented surface must define these states where applicable:

| State | Visual treatment |
| --- | --- |
| Default | Quiet text and transparent/subtle surface |
| Hover | Slight surface lift, no large motion |
| Focus | `2px` visible focus ring with offset |
| Active/selected | `surfaceActive` or `accentSoft`, explicit state attribute |
| Disabled | Reduced opacity, no action dispatch, cursor reflects disabled state |
| Loading | Compact spinner or activity indicator plus descriptive text |
| Empty | Direct explanation and next action |
| Success | Green indicator plus label/icon |
| Warning | Warm warning panel plus explanation |
| Error | Danger indicator, useful message, retry/recovery when possible |
| Disconnected | Persistent banner without erasing existing useful content |

Do not use skeleton loading when the final geometry is unknown or the wait is normally brief. A compact status line is often more honest for development tools.

## 9. Motion

Motion is functional, short, and quiet.

- standard transition: `120–180ms`;
- panel entry: up to `200ms` with small translation and fade;
- hover should not translate large regions;
- loading spinner may rotate continuously;
- health/status pulse is allowed only during active connection or startup;
- no ambient floating, orbiting, or decorative parallax;
- avoid layout animation during streaming or frequent data updates.

Always include:

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

## 10. Responsive system

These are behavioral breakpoints, not merely CSS scaling points.

### `1280px` and above

- show navigation, primary work, and optional context panel;
- preserve full toolbar controls;
- center main content in its readable column.

### Below `1280px`

- hide the optional context panel;
- expose its real actions through a toolbar button, dialog, or drawer;
- do not reduce primary work readability to keep secondary context visible.

### `900px` and below

- convert persistent navigation into an overlay/drawer;
- preserve a visible open-navigation control;
- hide duplicate or low-priority toolbar actions;
- reduce outer horizontal padding to `16–18px`;
- assert every visible toolbar control remains within the viewport.

### `650px` and below

- use compact `44–48px` top chrome;
- hide redundant title/path text before hiding actions;
- reduce primary content padding to `8–12px`;
- stack multi-column form controls;
- convert complex dialogs to full-screen;
- allow tab rows to scroll if necessary;
- hide nonessential hints and tertiary metrics;
- stack item actions beneath item content;
- account for `env(safe-area-inset-bottom)` around persistent bottom input.

Target QA viewports:

- `1440 × 900` desktop;
- `700 × 900` narrow;
- `390 × 844` mobile.

## 11. Accessibility requirements

These are requirements, not optional polish.

- Use native semantic controls before custom elements.
- Every icon-only button has an accessible name.
- Every form control has a programmatic label.
- Search controls are at least `42px` high; target `44px`.
- Use `aria-current`, `aria-selected`, `aria-checked`, and expanded state where appropriate.
- Never communicate state through color alone.
- Maintain readable contrast for metadata in both themes.
- Focus order follows visual order.
- Focus is trapped and restored for modal surfaces.
- Escape closes noncritical dialogs.
- All essential workflows operate without a pointer.
- No essential control is clipped at supported widths.
- Document-level horizontal overflow is zero.
- Reduced-motion preference is respected.
- Serious and critical automated accessibility violations are zero.

## 12. Implementation constraints for another tool

The implementing model must:

1. inspect the target repository before changing it;
2. identify existing design tokens, component primitives, icon library, theme state, and breakpoints;
3. map semantic tokens instead of scattering raw color values;
4. preserve existing business logic, permissions, and state transitions;
5. keep all real loading, error, empty, and disabled states;
6. avoid new dependencies unless the target lacks a necessary primitive;
7. reuse existing icons rather than drawing substitutes in CSS;
8. preserve native platform behavior for inputs, dialogs, file pickers, and links;
9. adapt component recipes to the target's actual structure;
10. test interaction, not only static screenshots.

The implementing model must not:

- replace application functionality with a static mockup;
- use placeholder buttons that do nothing;
- invent metrics, providers, packages, tasks, or content;
- assume dark mode alone is sufficient;
- shrink text below readable sizes to make layout fit;
- hide essential controls at narrow widths;
- use gradients, glow, or glass effects as decoration;
- overuse cards, pills, or badges;
- claim inaccessible or unavailable behavior exists;
- add the words “PI,” “PIUI,” “Codex,” or “agent” unless they belong to the target product.

## 13. Suggested implementation sequence

1. Inventory the target's current shell and primary workflow.
2. Introduce semantic dark/light theme tokens.
3. Apply typography, canvas, and region hierarchy.
4. Restyle navigation and top-level chrome.
5. Restyle the primary work content.
6. Implement the primary input/composer recipe if applicable.
7. Restyle lists, operations, dialogs, and settings.
8. Define all interaction and runtime states.
9. Implement responsive behavior at `1280px`, `900px`, and `650px`.
10. Add explicit accessible labels and focus treatments.
11. Test primary workflows and state transitions.
12. Capture and compare desktop, narrow, and mobile screenshots.
13. Fix clipping, overflow, contrast, and keyboard issues before declaring completion.

## 14. Acceptance checklist

### Visual language

- [ ] Warm graphite canvas and navigation hierarchy are present.
- [ ] Cream primary text and readable metadata are used.
- [ ] Orange is the single primary action/selection accent.
- [ ] Green is reserved for healthy/success states.
- [ ] Borders are subtle and cards are not overused.
- [ ] Monospace-led typography is applied consistently.
- [ ] Elevation is concentrated on primary input, dialogs, and optional context.

### Components and states

- [ ] Search and frequent input controls are at least `42px` high.
- [ ] Buttons include hover, focus, active, and disabled states.
- [ ] Loading, empty, warning, error, and disconnected states are implemented.
- [ ] Dialogs are labelled, keyboard accessible, and responsive.
- [ ] Long content and code remain readable and scroll safely.
- [ ] The target's real primary workflow remains functional.

### Responsive behavior

- [ ] `1440 × 900` uses the full desktop hierarchy.
- [ ] Around `700px`, optional context is removed and navigation overlays cleanly.
- [ ] At `390 × 844`, essential controls fit without horizontal overflow.
- [ ] Full-screen mobile dialogs scroll internally.
- [ ] No critical action disappears without an alternate reachable location.

### Quality

- [ ] Type checking and the target's unit tests pass.
- [ ] Production build passes.
- [ ] Browser workflow tests pass at all three target widths.
- [ ] Serious/critical accessibility findings are zero.
- [ ] Light, dark, system, and reduced-motion modes are manually inspected.
- [ ] Screenshots show no clipped text, controls, or content.

## 15. Portability note

This file is intentionally self-contained. It may be copied into another repository, attached to a model conversation, or used as an implementation prompt without the PIUI source or its screenshots.

The theme originated from an implemented and responsive application, but the receiving tool should retain its own information architecture. Use every numeric value as a strong default, then make the smallest changes necessary for the target's real content and platform constraints. Preserve the semantic relationships—quiet navigation, dominant primary work, scarce elevation, warm action color, honest state, and accessible responsive behavior—even when individual dimensions must change.
