# Ten Brains design QA

## Source and target

- Source references: `../user-wayfinder-map-overview-v2.png` (1536 x 1024) and `../user-wayfinder-grilling-session-v2.png` (1586 x 960).
- Desktop implementation checked in Orca's embedded browser at 1512 x 834 on `/map` and `/sessions/grilling`.
- Responsive implementation checked with iPhone 12 emulation at 390 x 844 on both routes.

## Visual comparison

- Overall structure: the persistent navigation, breadcrumb header, destination/objective summary, three-column desktop map, three-panel desktop session, mobile segmented map, and mobile session drawers remain in the reference hierarchy.
- Typography: Geist provides the requested restrained Codex-like hierarchy, with compact metadata, stronger content titles, and neutral supporting text.
- Surfaces and chrome: warm canvas colors were replaced by cool neutral grays and white surfaces, 1px borders, restrained shadows, and compact 8-12px corner radii. No gradients or glass effects are present.
- Semantic color: indigo remains the primary and frontier color; fog remains muted amber; decisions and captured evidence remain muted green; red is limited to the live state.
- Iconography: product icons are Lucide line icons, including the compass brand mark, navigation, objectives, microphone, bookmarks, drag handles, and menus.
- Responsive behavior: only one map column is visible at a time on mobile; the Frontier/Fog/Closed tabs switch the visible column; session side panels become Sheet drawers; the fixed Wayfinder pill and live controls have separate docking positions and sufficient bottom padding.

## Functional checks

- Desktop accessibility snapshots exposed both route structures and all expected controls.
- The mobile Fog tab switched from the frontier column to the fog column.
- The mobile Line of Inquiry button opened a labeled Sheet dialog with its expected contents and close control.
- Dropdown, Select, Checkbox, Progress, Input, Tooltip, Badge, Card, Button, Tabs, Separator, and Sheet primitives are present in the rendered component tree where appropriate.
- `npm run build` under Node 22 completed without TypeScript errors.

## Tradeoffs

- The new Radix/shadcn primitives and Lucide icon set increase the production JavaScript bundle to roughly 341 kB before gzip (107 kB gzip), acceptable for this prototype but a future code-splitting pass could reduce it.
- Mobile browser screenshots produced a duplicated full-page stitch around sticky content, so responsive overlap and visibility were additionally verified from live bounding boxes and accessibility snapshots at 390 x 844.

## Final result

passed

## Voice pass

- Strings changed: 102 UI strings.
- Files touched: `src/App.tsx` and `design-qa.md`.
- Rejected audit proposals: kept four `Grilling: Clarify setup anxiety` source labels because Grilling is the canonical ticket type; preserved quoted contractions and wording because evidence quotes must stay verbatim; preserved natural hedging and contractions in You transcript turns because they are captured demo speech.
- Refined audit proposals: replaced note drift with evidence language, changed `intake-to-map` to `session-to-map`, and rewrote five passive statements in active voice.

## How it works view

- Source visual truth: `../ten-brains-session-flowchart.svg` at 1140 × 1470; implementation capture: `../how-it-works-dark-flowchart.png` at 1126 × 1453 CSS pixels and device scale 1.
- Comparison evidence: `../how-it-works-comparison.png` for the full diagram and `../how-it-works-comparison-focus.png` for the decision, fog, ticket-type, and Closed Decision region.
- Initial findings: desktop had a needless 14px internal scroll and an over-raised 22px container; narrow views opened on the fog edge and clipped core decision labels.
- Fixes and post-fix evidence: the flat 12px canvas now fits at 1440px; 700px and 390px keep overflow inside the keyboard-focusable diagram region, center the action spine, and use responsive centered decision labels.
- QA states: dark and light at 1440 × 900, dark at 700 × 900, and dark plus light at 390 × 844. Document overflow was zero, the mobile nav link opened `/how-it-works`, and the actual theme toggle switched tokens correctly.
- Fidelity surfaces: system monospace typography, spacing rhythm, semantic token colors, vector sharpness, and controlled copy match the source. No SVG color literal remains; orange, amber, green, surfaces, borders, and text all resolve through CSS custom properties.
- Console: the view itself produced no warnings or errors. Opening the existing mobile Sheet exposed one pre-existing Radix ref warning outside this view; it did not affect navigation or rendering.
- Final result: passed

## Session map view

- Source visual truth: the in-app `/how-it-works` flowchart and `../ten-brains-session-flowchart.svg`; implementation evidence: `../session-map-final-dark-1440.png`, `../session-map-final-light-1440.png`, and `../session-map-comparison.png`.
- Initial findings: orange competed across the spine, evidence, and every branch; candidate-to-outcome return curves tangled the lower map; the staged-but-unapproved outcome read as success; narrow views opened with the primary moment cards wider than the visible map region.
- Fixes and post-fix evidence: the orange spine is now the sole dominant path, evidence uses quiet dashed neutral connectors, Fog of War and Closed Decision candidates alone carry amber and green semantics, provisional candidates use dashed borders, and the unapproved outcome remains neutral. Shared layout constants narrow the primary cards without per-node offsets, remove redundant return curves, and keep the data-generated layout stable as arrays change.
- QA states: dark and light at 1440 × 900, 700 × 900, and 390 × 844. The actual sidebar theme control switched tokens correctly; document overflow was zero at all three widths; horizontal overflow stayed inside the keyboard-focusable map region and opened centered on the session spine.
- Navigation and controls: the grilling header uses a neutral secondary `Session map` action beside the destructive session control, the action routes to `/sessions/grilling/map`, and `Back to session` returns to `/sessions/grilling` without crowding the header.
- Fidelity surfaces: all SVG colors resolve through CSS custom properties, moment and evidence nodes remain quiet neutral surfaces, quote excerpts remain readable, and the compact 12px-radius geometry matches the flowchart sibling.
- Console: no page errors were reported during route, theme, or viewport checks.
- Final result: passed

## Intake session map

- Source visual truth: the sibling `/sessions/grilling/map` capture at `../grilling-session-map-reference-diagram.png` (1128 × 1169); intake implementation at `../intake-session-map-final-diagram.png` (1128 × 1454). Both are CSS-pixel captures at device scale 1; `../intake-session-map-final-comparison.png` normalizes both to 720px width for the full-view comparison.
- Focused evidence: `../intake-session-map-final-mobile-candidates-390.png` shows the horizontally scrolled candidate column at the 390 × 844 viewport. A focused comparison was required because candidate labels and question endings are not readable in the normalized full diagram.
- Initial findings: `../intake-session-map-before-comparison.png` showed a P2 right-heavy composition with an unused evidence column, connector paths crossing the 09:17, 09:20, and 09:21 marker labels, an orange Destination draft inconsistent with the neutral staged-map treatment, and fog questions truncated before their question marks.
- Fixes and post-fix evidence: one no-evidence layout offset now balances the complete generated diagram; source turns with candidate branches place their labels left of the orange spine; type-based candidate heights preserve the full Destination draft and all fog questions; Destination remains a neutral dashed staged surface while fog alone uses amber. These rules derive from data and shared constants rather than per-node positions.
- QA states: dark and light at 1440 × 900, 700 × 900, and 390 × 844 in `../intake-session-map-final-{dark|light}-{1440|700|390}.png`. The actual theme menu switched and persisted light mode; document overflow was zero at every viewport; narrow overflow remained inside the keyboard-focusable map region and opened on its computed 410px spine center.
- Interaction and regression checks: the intake `Session map` action is a compact secondary control, routes to `/discoveries/new/map`, and `Back to session` returns to `/discoveries/new`. The grilling sibling retained its 560px spine center and rendered without document overflow in dark and light desktop and mobile captures.
- Fidelity surfaces: system-monospace type, 12px geometry, restrained dashed borders, theme-variable colors, warm semantic accents, and existing controlled copy remain consistent. The diagram is native SVG, so there are no raster asset or image-quality deviations; all visible fog cards remain one question and end with `?`.
- Console: no page errors occurred. Opening the existing mobile navigation for the actual theme-toggle check reproduced the pre-existing Radix `SheetOverlay` ref warning documented above; it does not originate in either session map.
- Final result: passed
