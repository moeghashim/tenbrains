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

## Live intake states

- Live-path evidence: `../qa-live-intake/working-dark-1440.png`, `staged-dark-1440.png`, `review-dark-1440.png`, `approved-loading-dark-1440.png`, and `approved-dark-1440.png` capture one real create, SSE turn, candidate review, approval, GET loading, and approved-map sequence against the Phase-1 API.
- Streaming: the composer keeps the submitted message visible but disabled, the transcript shows one stable live Wayfinder turn, `Wayfinder is working` appears in the header and transcript, and the view follows new tokens without smooth-scroll or layout animation. New staged candidates use a 180ms fade and 4px rise; the global reduced-motion rule reduces this to 0.01ms.
- Errors and recovery: `../qa-live-intake/error-light-1440.png` captures an aborted message request with the exact typed message preserved, a danger-token inline explanation, and `Retry turn`; `error-sse-light-1440.png` exercises the same recovery for an SSE `error` event. Both retry paths completed against the live API without duplicate optimistic turns.
- Map runtime states: approval now transitions to a GET-driven loading surface before rendering only approved API data; an unavailable GET keeps saved items intact and exposes `Retry map`. The empty map remains the intentional empty state and no demo arrays render on the live path.
- Responsive and theme QA: actual theme controls switched dark and light at 1440 × 900, 700 × 900, and 390 × 844. Evidence is in `../qa-live-intake/intake-{dark|light}-{700|390}.png` and `staged-drawer-light-390.png`; document overflow was zero and the mobile transcript, fixed composer, staged-map Sheet, and toolbar remained reachable without clipped controls.
- Regression routes: `../qa-live-intake/regression-{demo-map|grilling|evidence|spec}-dark-1440.png` confirms the demo map, grilling session, evidence, and Discovery Spec remained visually unchanged with zero document overflow.
- Final result: passed

## Live grilling session

- Live-path evidence: `../qa-live-intake/grilling-session-dark-1440.png`, `grilling-error-dark-1440.png`, `grilling-review-dark-1440.png`, and `grilling-approved-light-1440.png` capture a real mock-provider session with streamed turns, editable Line of Inquiry suggestions, marked evidence, nine staged map updates, an interrupted request, review, and approval.
- Streaming and recovery: the transcript follows tokens only while You remain near its bottom, preserves scroll position after You scroll up, keeps the composer disabled while `Wayfinder is working`, and preserves the typed message plus transcript behind an inline danger-token retry state when the connection drops.
- Signals and review: Mark moment reports saving and saved states before the new evidence row appears; SSE inquiry and candidate events enter with a restrained 180ms motion that the global reduced-motion rule suppresses; the review label and approval dialog use the live staged count.
- Session map: `../qa-live-intake/grilling-map-{dark|light}-{1440|700|390}.png` verifies a real session with multiple turns, two evidence branches, nine candidate branches, and an awaiting-review outcome. Candidate branches attach to their recorded staged turn, narrow views open on the computed spine center, and both horizontal and vertical map overflow remain inside the focusable map region.
- Responsive and theme QA: dark and light passed at 1440 × 900, 700 × 900, and 390 × 844 for the live session and live map. The live transcript and map are viewport-contained, mobile drawers and the fixed composer remain reachable, and horizontal document overflow was zero at every size.
- Demo regression: `../qa-live-intake/grilling-demo-{dark|light}-{1440|700|390}.png` covers the unchanged `/sessions/grilling` route; no demo component markup or demo-scoped style was modified.
- Build and console: the Node 22 production build completed without TypeScript errors, and the Playwright run passed the live flow, recovery, approval, both themes, and all three QA viewports.
- Final result: passed

## Store-driven surfaces

- Discoveries: live summaries now use compact aligned rows with tabular clarity and Open / Fog / Closed counts, a quiet first-row demo label, truncated long names, open-row navigation, and compact loading, empty, create-failure, and retryable error states. Evidence: `../qa-live-intake/store-driven/discoveries-{dark|light}-{1440|700|390}.png`, `discoveries-loading-dark-700.png`, `discoveries-empty-dark-700.png`, and `discoveries-error-light-390.png`.
- Live map: approved API data drives Destination, counts, clarity, and all three columns. Empty columns use one honest discovery-session action; loading and error states are compact; empty maps resume their selected discovery; unavailable direct-edit actions remain visible, disabled, and accessibly described. Evidence: `../qa-live-intake/store-driven/map-{dark|light}-{1440|700|390}.png`, `map-empty-dark-1440.png`, `map-loading-dark-700.png`, and `map-error-light-390.png`.
- Landing and selector: `/map` preserves the selected discovery, otherwise opens the most recently updated Active discovery, and falls back to the intentional empty landing only when no Active discovery exists. New discovery opens live intake, while the desktop and mobile selectors show real names, loading/error labels, switching, and ellipsis truncation for long names.
- End-to-end: one real mock-provider flow created a discovery, streamed an intake turn, approved staged items, rendered the GET-backed map, opened its Grilling ticket, and streamed a live session turn. The resulting discovery and live session were used for responsive screenshots of intake and session in both themes.
- Responsive and regression QA: dark and light passed at 1440 × 900, 700 × 900, and 390 × 844 across discoveries, map, intake, and session with zero document-level horizontal overflow. Demo map, grilling, Evidence, and Discovery Spec regression captures remained visually unchanged; exact image comparisons were zero-difference for the demo map, grilling, and spec captures.
- Build: the Node 22 production build completed without TypeScript errors.
- Final result: passed

## Discovery management actions — 2026-08-30

- Live API workflow: renamed `Discovery actions QA` to `Renamed discovery QA`, confirmed the server `Discovery name is required` response for an empty rename, duplicated it, archived the copy, and restored it with `Unarchive`.
- Selection behavior: rename updated the breadcrumb and discovery selector without navigation. Duplicate opened the copied live map and stored its new ID. Archive cleared the selected ID and opened `/discoveries`.
- Archived behavior: archived discoveries use a quiet grayed row with an explicit `Unarchive` action. The map selector excludes them, and `/map` ignored a stored archived ID before choosing the most recent Active discovery.
- Responsive and theme QA: dark and light passed at 1440 × 900 and 390 × 844. Evidence: `../qa-discovery-actions-{dark|light}-{1440|390}.png` and `../qa-discovery-rename-light-1440.png`.
- Menu and dialog QA: the live Discovery options menu contains only Rename, Duplicate, and Archive. The rename dialog follows the 16px Warm Graphite dialog recipe, keeps keyboard focus visible, and exposes loading and error states.
- Demo regression: `/map?demo=1` retained `AI onboarding assistant`, rendered `Target developer-led teams first`, and had zero document-level horizontal overflow. No demo data or route behavior changed.
- Console and build: the shared dialog overlay now forwards its Radix ref, so the rename path adds no console warning. Node 22 production build and API tests passed.
- Final result: passed

## Live Evidence view — 2026-08-30

- Live data: `/evidence` loaded discovery `149ef834-1beb-4094-98e9-56e7c35f6bd3` through the selected-discovery fallback and rendered two captured evidence records from its real Grilling session. Session headings and `Open session` links group each record by source session.
- Quote fidelity and selection: both list rows and expanded details matched the API `text` values exactly. The direct link `/evidence#EVID-6add0821-0d50-431f-9017-b4c627924c40` expanded the requested record, and row selection updated the hash.
- Runtime states: loading, retryable error, no-active-discovery, and empty-evidence treatments use the store-driven state pattern. The verified empty state exposed one action, `Open a session`, for a selected discovery with no captured evidence.
- Responsive and theme QA: the actual theme controls switched dark and light at 1440 × 900 and 390 × 844. Evidence: `../qa-evidence-live-{dark|light}-{1440|390}.png`. Document-level horizontal overflow was zero at both widths.
- Demo regression: `/evidence?demo=1#INT-03` rendered all seven scripted records, selected `INT-03`, retained `Target developer-led teams first`, and rendered no live session groups. Evidence: `../qa-evidence-demo-dark-1440.png`.
- Console and validation: the Evidence route added no page errors. The shared browser history retained a pre-existing Radix overlay ref warning from an earlier map route. Node 22 production build, API tests, and `git diff --check` passed.
- Final result: passed

## Store-driven Discovery Spec — 2026-08-30

- Live store data: `/spec` loaded discovery `149ef834-1beb-4094-98e9-56e7c35f6bd3` through the selected-discovery fallback. It rendered the saved discovery name, seven typed Open Frontier tickets, seven Fog of War questions, six Closed Decisions, and nine cited evidence links.
- Evidence navigation: selecting `EVID-a8aaa572-05d2-4972-8ce0-d7f218f0974c` opened `/evidence#EVID-a8aaa572-05d2-4972-8ce0-d7f218f0974c` and expanded that live evidence record.
- Empty and runtime states: the selected map had no Destination, so the Spec rendered one quiet `Open map` action. A separate empty discovery rendered one action for each empty section; loading, retryable error, and no-active-discovery states follow the same store-driven treatment.
- Responsive and theme QA: dark and light passed at 1440 × 900 and 390 × 844 with zero document-level horizontal overflow. Evidence: `../qa-spec-live-{dark|light}-{1440|390}.png`; complete long-form captures: `../qa-spec-live-{dark|light}-full-1440.png`.
- Demo regression: `/spec?demo=1` retained `AI onboarding assistant` and the six scripted sections without live map lists. Evidence: `../qa-spec-demo-dark-1440.png`.
- Framing and console: `Maintained by You + Wayfinder` remained visible at both widths. The Spec route produced no page errors during data, navigation, theme, or viewport checks.
- Validation: Node 22 production build, API tests, and `git diff --check` passed.
- Final result: passed

## Provider Settings and subscription sign-in — 2026-09-06

- Added `/settings` through the live desktop sidebar and mobile navigation. Intake and Grilling sessions show effective provider/model routing, API-backed provider choices, editable model IDs, and separate save actions. Clearing a model uses the provider default.
- Real API end-to-end: changed Grilling sessions from `openai / gpt-5.6-luna` to `codex-subscription / gpt-6-astra` through the form (HTTP 200), then reverted through the form. A fresh GET confirmed both surfaces at the original `openai / gpt-5.6-luna` routing. No inference or login was performed.
- Provider access: all six API rows render their states and reasons. Claude and Codex reported Available; Grok reported Needs login with expiry and `grok login`. The copy action placed exactly `grok login` on the clipboard. Login remains a terminal instruction.
- Recovery: verified loading, manual refresh, injected HTTP 503 with Retry recovery, and a real HTTP 400 for an invalid model ID. A browser-only PATCH response fixture verified environment-override messaging and restoration of effective routing in the form; the running server environment was not changed.
- Responsive and theme QA: dark and light passed at 1440 × 900, 700 × 900, and 390 × 844 with no document horizontal overflow. Native controls remain labeled and usable. Screenshots: `../qa-settings-{dark|light}-{1440|700|390}.png`, `../qa-settings-error-light-390.png`, and `../qa-settings-loading-light-1440.png`.
- Demo preservation: Settings remains inert on existing demo navigation, matching prior behavior. Demo component/data markup is unchanged, and `/map?demo=1` still renders `Target developer-led teams first`. Evidence: `../qa-settings-demo-light-1440.png`.
- Validation: Node 22 production build and all six API tests passed. No server code changed and no commit was made. Browser errors were limited to the existing missing favicon and deliberately rejected requests; Settings produced no page exceptions in final responsive QA.
- Implementation note: the view lives in `src/ProviderSettings.tsx`, with route/sidebar wiring in `src/App.tsx` and scoped styles in `src/styles.css`.
- Final result: passed.

## Provider selection authentication notice — 2026-09-06

- Both routing forms now show an inline notice immediately when a selected provider needs login or is unsupported. Notices use existing provider status data and remain visible after saving. Save stays enabled, with an explicit warning that turns on that surface will fail until authentication.
- Shared login-command controls now serve the forms and Provider access list. Each control has a provider-specific accessible label, keyboard activation, and local copy feedback. Form notices use a persistent polite live region; provider selectors and save buttons reference the notice through `aria-describedby`.
- Real API QA: selected `grok-subscription` in Grilling sessions, saw the sign-in notice and `grok login`, copied that exact command, and saved successfully to `grok-subscription / grok-build`. The warning persisted after save and reload. Restored the original `openai / gpt-5.6-luna` routing afterward; Intake remained unchanged.
- Also verified Intake selection and refresh with Grok. Refresh preserves the pending selection while updating access status. Browser-only response fixtures confirmed that Available clears the notice and Unsupported shows the reason without a command. The real Anthropic needs-login row showed API-key configuration instructions without inventing a login command. No provider login or server credential changes were performed.
- Dark and light passed at 1440 × 900 and 390 × 844 with no document horizontal overflow. Inspected desktop dark and mobile light captures. Evidence: `../qa-settings-auth-{dark|light}-{1440|390}.png`.
- Demo regression: `/map?demo=1` still renders `Target developer-led teams first`. No demo components, App routing, or server code changed.
- Validation: Node 22 `npm run build`, all six `npm test` tests, and `git diff --check` passed. No commit was made.
- Final result: passed.

## Live Wayfinder turn error details — 2026-09-06

- Live intake and Grilling now preserve the safe SSE error message. Non-SSE failures and empty messages retain generic fallback copy. Provider/authentication, rate-limit, model/settings, login, and related errors expose one quiet `Open Settings` link beside retry.
- Messages render as React text inside the existing `role="alert"` regions. Long text wraps and clamps to four visual lines, with the full text retained in the DOM and title. Mobile actions wrap beneath the message; no HTML is interpreted.
- Real failure QA: both surfaces used `openai / gpt-5.6-luna` and displayed `OpenAI authentication failed. Check OPENAI_API_KEY.` with Retry and Open Settings. Verified the mobile Grilling link opens `/settings`. No failure fixtures were used.
- Real success QA: both surfaces completed Codex turns using the server's verified default `gpt-5.4-mini`. SSE included `done` without `error`, inputs cleared, transcripts rendered, and no error banners remained. An initial `gpt-5.4` attempt was rejected and correctly surfaced the server's model/settings message; final success captures use `gpt-5.4-mini`.
- Restored both surfaces to `openai / gpt-5.6-luna`. QA discovery: `291bc52c-aa6f-4a18-bc44-9e5e335a3566` (`P6 turn error QA`); session: `1ed43382-4e39-4c71-9b7f-2b22cd6f8fb4`.
- Dark/light error captures at 1440 × 900 and 390 × 844 had no document horizontal overflow. Evidence: `../qa-turn-error-{intake|session}-{dark|light}-{1440|390}.png`. Success evidence: `../qa-turn-success-{intake|session}-codex-1440.png`. Mobile Grilling errors are shown in the existing Ask Wayfinder sheet.
- Demo code is unchanged, and `/map?demo=1` retains `Target developer-led teams first`. No server code changed and no commit was made.
- Validation: Node 22 build, all 29 tests, and `git diff --check` passed.
- Final result: passed.

## Composer focus and transcript following — 2026-09-08

- Reviewed `../qa-report-double-border.png` and `../qa-report-no-autoscroll.png`. Live intake attached its scrolling ref to a wrapper that does not forward refs under React 18. The global input outline also duplicated the composer's focus treatment.
- Both live transcripts now use direct viewport refs and shared scroll-follow behavior. They follow streaming content within 120px of the bottom, stop following when You scroll up, and resume on every send or retry. A resize observer handles content and viewport geometry changes. Intake now keeps the composer in the layout instead of covering transcript content with a fixed overlay.
- Live intake, desktop Grilling, and mobile Grilling composers use one 2px outer focus outline. Input focus outlines and shadows are suppressed only inside these live composers; action-button focus remains intact. Keyboard Tab from each desktop transcript reaches its input with the outer focus treatment.
- Real Codex QA: multiple turns completed in both surfaces on `codex-subscription / gpt-5.4-mini`. Routing was left unchanged. Discovery: `f88cce6b-d96c-4673-949b-b04688a1b412`; session: `9d285824-3f5b-472f-b4f1-75c1b490d009`.
- Desktop stream sampling captured 24 intake and 10 Grilling content updates while busy; bottom gaps stayed at 0px and at most 0.5px respectively. Scrolling to older history held scrollTop at 0 through a real reply in both views. Sending another message resumed following within 1px of the bottom.
- Repeated no-yank and send-resume checks at 390px against real turns. Both held older history during the reply and resumed within 1px after send. Last-message geometry confirmed intake's last message ended above its composer and Grilling's last message ended above the bottom controls.
- Dark/light focused screenshots passed at 1440 × 900 and 390 × 844 without document horizontal overflow. Evidence: `../qa-composer-scroll-{intake|session}-{dark|light}-{1440|390}.png`; unobscured mobile transcript endings: `../qa-scroll-last-message-{intake|session}-390.png`.
- Demo markup remains unchanged, and `/map?demo=1` still renders `Target developer-led teams first`. No server changes or commits.
- Validation: Node 22 `npm run build`, all 29 `npm test` tests, and `git diff --check` passed.
- Final result: passed.

## Wayfinder choice chips — 2026-09-09

- Live intake and Grilling render offered choices below Wayfinder reply text. Labels lead, optional details use secondary text, and the recommended option has one quiet accent treatment plus a text label. Only the latest unanswered offer is actionable; older offers remain as disabled history.
- Chip activation sends its label as `message` and `choiceLabel`. Free-text entry remains available with or without offers; typing does not disable choices. Sending free text consumes the prior offer just like a chip answer. Choices are conversational replies, never approval actions.
- Mock end-to-end QA passed on both surfaces: selected a recommended chip and an alternate chip with keyboard Enter, verified request metadata and persisted You-entry `choiceLabel`, then sent typed text without choice metadata. Each flow ended with one active offer and nine disabled historical chips.
- Streaming QA used actual mock SSE with only the following discovery GET delayed for observation. Both surfaces rendered three offered chips while still busy, before the final refresh, then enabled them when the turn completed. Chips add no wrapper when absent. The existing resize-aware follow behavior reached the bottom after chip height changes (0px observed gap).
- Real Codex QA on `codex-subscription / gpt-6-astra` completed an intake turn with `done`, no error, and no offered choices. No active chip group or empty choice container appeared. Both surfaces were restored to their original `codex-subscription / gpt-6-astra` routing after mock checks.
- QA discovery: `963b7e45-078c-43eb-9147-ea410db50ccd`; Grilling session: `a437fe37-282f-409b-af42-05652edb4c75`.
- Dark/light captures at 1440 × 900 and 390 × 844 passed without document horizontal overflow. Evidence: `../qa-choices-{intake|session}-{dark|light}-{1440|390}.png`; real no-choice reply: `../qa-choices-codex-1440.png`.
- Buttons retain native keyboard focus and activation. Active offers announce that suggested replies are available and free text remains an option; history is labeled as offered replies and uses disabled buttons.
- Validation: Node 22 build, all 33 tests, and `git diff --check` passed. Demo components and the pinned title are unchanged. No server changes or commits.
- Final result: passed.

## Synthesis sessions — 2026-09-09

- Live Synthesis tickets now expose Start ticket alongside Grilling tickets and create sessions with `type: synthesis`. Research and Prototype remain inert. The live chat shares streaming, choice chips, retry, and scroll-follow behavior, with a persistent Synthesis · You + Wayfinder badge outside the mobile breadcrumb.
- Session Signals presents a Consolidated update. Closed Decisions link exact cited evidence IDs to `/evidence#id`; fog retirements show the current question text and reason; Destination refinements are labeled correctly. The existing selected-candidate review/approve flow includes citation links and retirement details. Sessions list and live session discovery filters include Synthesis.
- Full mock UI flow: intake → approve map → open Grilling ticket → send a quote containing the fog question → Mark moment → standalone Synthesis → review all three candidate types → approve. The map retained the cited evidence, gained the Closed Decision and Destination, and removed the targeted fog question only after approval. Discovery: `69bd2ee4-ddf3-40f1-ac98-ea88e46b44c8`; Synthesis session: `d692b169-2118-44fa-a797-dade4c402096`.
- Mock ticket-generation limitation: current mock intake and Grilling never stage Synthesis tickets. The coordinator supplied approved-ticket fixture discovery `d2a1ed33-d5ed-4dcb-84f8-b1bf1ddb896e`. Its map action created session `875eac6f-ee08-48bc-9247-507ce4ad2778` with the correct synthesis type and ticket ID. The rest of the mock workflow used the documented standalone session POST; no server code was changed by this UI stage.
- A real `codex-subscription / gpt-6-astra` Synthesis turn completed with `done` and no error. Mock empty-evidence QA returned guidance and zero candidates. Citation navigation opened the exact Grilling capture. Both provider routes were restored to `codex-subscription / gpt-6-astra`.
- Session map loaded for empty and staged Synthesis sessions. A small shared type/label extension renders fog-retirement nodes honestly using existing fog styling. Limitations: its evidence nodes remain session-local rather than discovery-wide, cross-session citations do not gain new evidence branches, and retirement nodes use the stored question ID; the review panel shows the full current question and reason. No new map choreography was added.
- Dark/light chat and review captures passed at 1440 × 900 and 390 × 844 without document horizontal overflow. Evidence: `../qa-synthesis-chat-{dark|light}-{1440|390}.png`, `../qa-synthesis-{dark|light}-{1440|390}.png`, `../qa-synthesis-review-{dark|light}-{1440|390}.png`, `../qa-synthesis-approved-map-1440.png`, `../qa-synthesis-empty-1440.png`, `../qa-synthesis-codex-1440.png`, and `../qa-synthesis-session-map-390.png`.
- Validation: Node 22 build, all 39 tests, and `git diff --check` passed. Demo paths remain unchanged and the pinned title `Target developer-led teams first` still renders. No commit was made.
- Final result: passed, with the mock-ticket and Session map limitations above.

## Research sessions — 2026-09-09

- Live Research tickets now open typed Research sessions alongside Grilling and Synthesis; Prototype remains inert. Research is labeled in the session, Sessions list, and Evidence groups. Structured inquiry SSE events populate the existing Line of Inquiry.
- Research uses a multiline composer with separate Send and Record finding actions. Record finding sends `isFinding: true` without trimming or rewriting the message. The evidence SSE event updates the rail immediately, marks the record as a Verbatim finding, and retains it independently of the eventual reply. Retry uses ordinary chat to avoid capturing the same finding again.
- Pure-mock browser E2E passed: four intake turns staged the round-robin ticket types, approval created the map, and the Research ticket opened a research session. Its opening reply supplied three inquiry questions. Record finding captured leading/trailing spaces, a newline, a tab, curly quotes, an em dash, and café exactly in the request, stored evidence, rail textContent, and expanded `/evidence` quote. Evidence was emitted before reply tokens. The cited Closed Decision was reviewed and approved through the UI, then verified on the discovery map.
- QA discovery: `23c07009-eb5c-4923-a0aa-3022f7436e13`; Research session: `c46a9480-89ad-4544-a737-e27f1e274ace`; evidence: `EVID-85aec797-cb47-45d7-83c1-d4cea6d9f04a`. The candidate linked that exact evidence ID. Fog-retirement candidates also support their supplied evidence links in the shared review flow.
- Ordinary chat remained separate from findings. Keyboard Enter activated a recommended Research chip and sent its label as both message and choiceLabel, without isFinding; older offers became disabled history. Tab from the textarea reached Record finding at both viewport sizes in both themes.
- A real `codex-subscription / gpt-6-astra` Research turn completed with done and no error, suggesting a timestamped screen recording to verify the observation. It supplied no candidates or new chips, and that state rendered cleanly. Both provider routes were restored and verified as `codex-subscription / gpt-6-astra` after mock QA.
- Dark/light captures passed at 1440 × 900 and 390 × 844 without document horizontal overflow. Final settled captures: `../qa-research-final-{dark|light}-{1440|390}.png`; focused composer: `../qa-research-composer-{dark|light}-{1440|390}.png`; candidate/evidence rail: `../qa-research-{dark|light}-{1440|390}.png`; real reply: `../qa-research-codex-1440.png`; Evidence: `../qa-research-evidence-1440.png`; session map: `../qa-research-session-map-1440.png`.
- Session map loads the Research transcript and captured evidence using the existing layout. It does not add a separate research-question choreography; compact node previews abbreviate text, while the evidence detail preserves the full quote. Approved candidates leave the staged panel as before. This is the only scope limitation.
- Validation: Node 22 `npm run build`, all 45 tests, and `git diff --check` passed. `/map?demo=1` retains `Target developer-led teams first`; demo components are unchanged. No server changes or commits.
- Final result: passed.

## Prototype sessions — 2026-09-09

- All four live Open Frontier ticket types now expose Start ticket and create their matching session type. Prototype sessions show a Prototype · You + Wayfinder badge and appear in Sessions, Evidence, and the session map. Demo ticket selection remains unchanged.
- Staged Prototype plans show separate Success criteria and Build checklist lists in Session Signals and the review dialog. Explicit approval attaches the plan to the existing ticket. Its map indicator shows the criteria count; the session header reads the approved ticket plan, so unapproved revisions cannot replace it. Desktop layout reserves space for the plan and composer; longer plans scroll within the header section.
- Record result reuses Research's byte-verbatim capture with isFinding true. Ordinary Send and choice chips remain chat. Results arrive through evidence SSE before reply tokens and appear as Verbatim result in the rail. Retry remains ordinary chat and does not capture again. Cited Closed Decisions use the shared review and approval flow.
- Pure-mock browser E2E passed: two intake turns → approve map → open Prototype ticket → opening plan → review criteria/checklist → approve plan → verify Plan · 2 criteria on map → Record result → approve its cited Closed Decision. Exact leading/trailing spaces, newline, tab, curly quotes, café, and em dash were preserved in request, stored evidence, and rail textContent. Evidence was emitted before tokens. The approved decision cites the exact result ID.
- QA discovery: `dfec2ad4-717d-49be-ae1d-d362b436ca9f`; mock Prototype session: `fe49febf-fbc7-4571-8a56-b9fc26e3d3a5`; result: `EVID-5fe2d341-4495-4e1f-8c15-aa117027a6db`. A keyboard-activated report-follow-up chip sent `Examine the failed step` as message and choiceLabel, without isFinding. Tab from the textarea reached Record result in both themes and viewport sizes.
- Real Codex opening QA: a new ticket-linked Prototype session `76049310-48ff-450d-ad8c-97752105f22f` completed on codex-subscription/gpt-6-astra with done and no error. It reviewed the already approved plan and asked for a concrete receipt and expected category. It staged no replacement, preserving the approved plan. Both routes were restored to codex-subscription/gpt-6-astra after mock checks.
- Dark/light captures at 1440 × 900 and 390 × 844 had no document horizontal overflow. Screenshots: `../qa-prototype-{dark|light}-{1440|390}.png`, `../qa-prototype-composer-{dark|light}-{1440|390}.png`, `../qa-prototype-plan-review-1440.png`, `../qa-prototype-map-plan-1440.png`, `../qa-prototype-codex-1440.png`, `../qa-prototype-evidence-1440.png`, and `../qa-prototype-session-map-1440.png`.
- Session map reuses the existing transcript/evidence layout. A staged ticket-plan uses an Open Frontier node titled Prototype plan; detailed criteria and checklist remain in the session/review, without new plan choreography. This is the documented scope limitation. Sessions list and Evidence headings correctly identify Prototype.
- Validation: Node 22 build, all 50 tests, and git diff --check passed. The pinned demo title remains Target developer-led teams first. No server changes or commits.
- Final result: passed.
