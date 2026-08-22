# Wayfinder Voice Audit

## Coordinator review — read before applying (binding)

The coordinator (Claude) reviewed this audit. Apply the table below WITH these corrections; they override the table where they conflict:

1. REJECTED — rows for `src/App.tsx:178,196,205,214` ("Grilling: …" → "Session: …"). Grilling is a canonical ticket type (Grilling, Research, Prototype, Synthesis). Keep "Grilling: Clarify setup anxiety" as-is. See the new "Ticket types" glossary row in voice.md.
2. REJECTED — all edits inside quotation marks (rows for lines 200, 218). Evidence quotes are captured speech and stay verbatim, contractions included. Annotation text outside the quotes may still be tightened as proposed.
3. REJECTED — de-hedging/de-contraction edits to "You" (human) transcript turns (rows for lines 249, 259, 269, 280, 290). Spoken hedging and contractions in You turns are demo data for Wayfinder to grill. Voice.md soft rules now state this. You-turn edits that fix glossary drift or actor implications (rows for lines 305, 315, 326, 336, 346) remain APPROVED.
4. Consistency check after applying: the quotes at lines ~200 and ~218 must still match their source transcript lines (~269, ~290) verbatim — with the rejections above, both sides stay unchanged, so no drift should exist.

Everything else in the table is approved as proposed.

## Scope

Audited source copy in `src/App.tsx`, `index.html`, `src/components/ui/dialog.tsx`, and `src/components/ui/sheet.tsx` against `voice.md`. Generated files under `dist/` were not audited because they mirror source output and should not be edited directly.

Compliant, no-change row count: 68.

## Audit table

| Location | Current string | Proposed replacement | Rule violated |
| --- | --- | --- | --- |
| `src/App.tsx:124` | Grill 5 new users on setup anxiety | Grill 5 solo founders on setup anxiety | Use precise product audience; avoid generic user drift in a ticket title. |
| `src/App.tsx:125-146` | Grilling; Research; Prototype; Synthesis; You; Wayfinder; You + Wayfinder | No change | Compliant glossary terms for ticket type and work mode. |
| `src/App.tsx:127` | 5 interviews | 5 setup examples | Avoid interview framing; keep evidence target concrete. |
| `src/App.tsx:131` | Compare onboarding patterns | No change | Compliant imperative ticket title. |
| `src/App.tsx:134` | 3 competitors | No change | Compliant evidence target. |
| `src/App.tsx:137` | Prototype first-run checklist | No change | Compliant imperative ticket title. |
| `src/App.tsx:140` | Usability test | 1 usability test | Make the evidence target explicit and countable. |
| `src/App.tsx:143` | Decide activation signal | No change | Compliant imperative ticket title. |
| `src/App.tsx:146` | 1 metric test | No change | Compliant evidence target. |
| `src/App.tsx:151` | Do users want guidance or automation? | Do solo founders want guidance or automation? | Fog question should use precise audience language. |
| `src/App.tsx:152` | What feels unsafe to delegate? | No change | Compliant one-question fog card. |
| `src/App.tsx:153` | Is setup anxiety segment-specific? | Does setup anxiety differ by segment? | Prefer plain language over compressed jargon. |
| `src/App.tsx:158` | Users trust suggestions before autonomous actions | No change | Compliant declarative decision title. |
| `src/App.tsx:159-170` | High; Medium | No change | Compliant confidence labels. |
| `src/App.tsx:163` | Setup value must appear in < 5 min | No change | Compliant declarative decision title. |
| `src/App.tsx:168` | Target developer-led teams first | No change. Pinned and unchangeable. | Compliant by explicit task constraint despite team wording. |
| `src/App.tsx:176-237` | INT-01; INT-02; INT-03; INT-04; INT-05; COMP-01; COMP-02; Aug 12, 2026; Aug 13, 2026; Aug 14, 2026 | No change | Compliant evidence IDs and dates. |
| `src/App.tsx:177` | Setup value has to appear before the first configuration step feels worth finishing. | Setup value must appear before the first configuration step feels worth finishing. | Evidence statement should be direct; avoid weak phrasing. |
| `src/App.tsx:178,196,205,214` | Grilling: Clarify setup anxiety | Session: Clarify setup anxiety | Glossary prefers session for focused interaction. |
| `src/App.tsx:182` | You described abandoning setup when the assistant asked for repo access before showing the useful outcome. The useful moment needs to arrive before permissions or configuration feel costly. | You abandoned setup when repo access came before value. Useful output must appear before permissions feel costly. | Use active voice; avoid assistant synonym drift. |
| `src/App.tsx:186` | Hands-on developer founders respond to concrete setup pain before broad strategy claims. | No change | Compliant evidence statement. |
| `src/App.tsx:191` | The strongest pull came from people responsible for evaluating developer tools directly, because they can judge setup risk and value without a procurement story. | Hands-on founders can judge setup risk before procurement language matters. | Remove vague people reference and marketing-style phrasing. |
| `src/App.tsx:195` | Repo write access stopped the flow because trust had not been earned yet. | No change | Compliant evidence statement. |
| `src/App.tsx:200` | Quote: “I stopped when it asked for repo write access. I didn’t know what it would change.” This is concrete behavior, not preference polling. | Quote: “I stopped when it asked for repo write access. I did not know what it would change.” This is behavior evidence. | Avoid contraction in artifact copy; tighten second sentence. |
| `src/App.tsx:204` | Users decide within the first five minutes whether the onboarding assistant is worth continuing. | No change | Compliant evidence statement. |
| `src/App.tsx:209` | The session suggests the first-run checklist must produce a visible recommendation or useful artifact quickly, before asking for high-trust access. | The first-run checklist must produce a useful artifact before high-trust access. | Remove hedging verb; keep one idea. |
| `src/App.tsx:213` | Read-only suggestions feel acceptable before any autonomous change is proposed. | No change | Compliant evidence statement. |
| `src/App.tsx:218` | Quote: “I would start with read-only suggestions first and choose what to apply.” Wayfinder staged this as evidence for a suggestions-before-actions trust ladder. | Quote: “I would start with read-only suggestions and choose what to apply.” Wayfinder staged this as evidence. | Remove redundant wording and tighten evidence detail. |
| `src/App.tsx:222` | Comparable onboarding flows target builders who can evaluate setup value directly. | No change | Compliant evidence statement. |
| `src/App.tsx:223,232` | Research: Compare onboarding patterns | No change | Compliant source label. |
| `src/App.tsx:227` | Competitor notes show the clearest positioning around developer-owned setup: show a concrete artifact, then expand to higher-trust actions only after review. | Competitor notes show this pattern: show a concrete artifact before higher-trust actions. | Remove marketing-style phrasing and keep one idea. |
| `src/App.tsx:231` | Competitors separate suggested changes from applied changes to preserve trust. | No change | Compliant evidence statement. |
| `src/App.tsx:236` | The pattern review found explicit review steps, read-only previews, and “apply changes” gates in comparable products; none silently mutate user work as the first move. | Pattern review found explicit review steps, read-only previews, and apply-change gates. Comparable products do not mutate work first. | Split sentence and remove semicolon. |
| `src/App.tsx:243-290` | Wayfinder; You; 11:55:12 through 11:57:45 | No change | Compliant transcript actors and timestamps. |
| `src/App.tsx:244` | When was the last time you tried a new onboarding assistant for a dev tool? | No change | Compliant single Wayfinder question. |
| `src/App.tsx:249` | I think it was a couple weeks ago. | It was two weeks ago. | Soft rule: remove hedging filler. |
| `src/App.tsx:254` | Walk me through what you were hoping it would help you do. | Walk me through what you wanted it to help you do. | Remove softer phrasing from transcript demo copy. |
| `src/App.tsx:259` | Mostly connect the repo and get it set up so I could start using it right away. | Connect the repo and complete setup so I could start using it. | Remove filler and tighten sentence. |
| `src/App.tsx:264` | What happened next? | No change | Compliant single Wayfinder question. |
| `src/App.tsx:269` | I stopped when it asked for repo write access. I didn’t know what it would change. | I stopped when it asked for repo write access. I did not know what it would change. | Avoid contraction in demo copy. |
| `src/App.tsx:270,291` | Concrete behavior | No change | Compliant evidence annotation. |
| `src/App.tsx:275` | What were you worried might happen? | No change | Compliant single Wayfinder question. |
| `src/App.tsx:280` | It could modify something I didn’t expect or push changes I didn’t review. | It could modify files I did not expect or push changes I did not review. | Make object concrete; avoid contractions. |
| `src/App.tsx:285` | What would have made that feel okay? | What would have made that feel safe? | Prefer concrete product language already used elsewhere. |
| `src/App.tsx:290` | I would start with read-only suggestions first and choose what to apply. I’d be comfortable. | I would start with read-only suggestions and choose what to apply. That would feel safe. | Remove redundancy and contraction. |
| `src/App.tsx:297-346` | 09:12 through 09:22; Wayfinder; You | No change | Compliant intake transcript metadata and actors. |
| `src/App.tsx:299` | State the vague idea in one sentence. Do not pitch it; name the decision you need clarity on. | State the vague idea in one sentence. Name the decision you need clarity on. | Keep one idea per sentence and remove extra clause. |
| `src/App.tsx:300` | Opening pressure test | No change | Compliant note label. |
| `src/App.tsx:305` | I want a tool that helps solo technical founders turn fuzzy product ideas into something they can build, test, or kill. | I want a tool that helps solo technical founders turn vague product ideas into something they can build, test, or kill. | Avoid synonym drift; use vague instead of fuzzy. |
| `src/App.tsx:310` | Who is the first user, specifically? If you say “founders,” narrow it to the person who would feel the pain this week. | Who is the first user? If you say “founders,” name the person who feels the pain this week. | Shorten Wayfinder turn. |
| `src/App.tsx:315` | Solo technical founders working directly with AI tools before they have customers or anyone else sharing the idea. | Solo technical founders working directly with AI tools before customers exist. | Avoid implying extra collaborators. |
| `src/App.tsx:320` | What breaks today when that person tries to validate an idea? Give me the failure mode, not the feature request. | What breaks today when that person tries to validate an idea? Name the failure mode, not the feature request. | Keep direct imperative language. |
| `src/App.tsx:321` | Hidden assumption surfaced | No change | Compliant note label. |
| `src/App.tsx:326` | They collect notes, AI suggestions, and half-decisions in different places, then cannot tell what evidence is strong enough to act on. | They collect notes, AI suggestions, and half-decisions in different places. They cannot tell what evidence is strong enough to act on. | Split sentence over 20-word limit if reused as artifact copy. |
| `src/App.tsx:331` | Describe a recent moment when that broke. What did you do, what evidence did you have, and where did the decision stall? | Describe a recent moment when that broke. Where did the decision stall? | Soft rule: ask one question per Wayfinder turn. |
| `src/App.tsx:336` | Last week I wanted to test an AI onboarding assistant. I had interview notes and competitor tabs, but no explicit map of what was still foggy. | Last week I wanted to test an AI onboarding assistant. I had interview notes and competitor tabs, but no explicit map of the remaining fog. | Use canonical fog language. |
| `src/App.tsx:341` | How would you know this worked after one session? Name the observable change that would make the product worth building. | How would you know this worked after one session? Name the observable change. | Shorten second sentence. |
| `src/App.tsx:346` | I would leave with a clear destination, the next few work tickets, and the top unanswered questions staged for review before anything becomes the map. | I would leave with a clear Destination, the next tickets, and the top fog questions staged for review. | Use glossary terms and keep under 20 words. |
| `src/App.tsx:351` | Solo technical founders can turn a vague AI product idea into a reviewed decision map with a destination, next work, and unresolved fog. | Solo technical founders can turn a vague AI product idea into a reviewed map with a Destination, next tickets, and fog. | Use glossary capitalization and ticket language. |
| `src/App.tsx:355` | Grill 5 founders on where idea validation stalls | No change | Compliant imperative ticket title. |
| `src/App.tsx:358,365,372` | 5 concrete examples; 3 comparable patterns; 1 clickable flow | No change | Compliant evidence targets. |
| `src/App.tsx:359,366,373,380,384,388` | turn 4; turn 6; turn 9 | No change | Compliant session metadata. |
| `src/App.tsx:362` | Research alternatives for decision-map workflows | No change | Compliant imperative ticket title. |
| `src/App.tsx:369` | Prototype intake-to-map review step | Prototype the intake-to-map review step | Use full imperative verb phrase. |
| `src/App.tsx:379` | What evidence is strong enough to stop exploring and write a thin PRD? | No change | Compliant one-question fog card. |
| `src/App.tsx:383` | What would justify killing the idea before more prototype work? | What evidence would justify killing the idea before more prototype work? | Make the question evidence-led. |
| `src/App.tsx:387` | Do solo founders want relentless grilling, suggested next work, or both? | Do solo founders want relentless grilling, suggested tickets, or both? | Use ticket language instead of work. |
| `src/App.tsx:529,608` | Ten Brains | No change | Compliant product name. |
| `src/App.tsx:533,539,543-558` | Current discovery; Discoveries; AI onboarding assistant; View all discoveries; Map; Sessions; Evidence; Discovery Spec | No change | Compliant navigation and glossary terms. |
| `src/App.tsx:569` | New discovery | No change | Compliant action label. |
| `src/App.tsx:573-590` | Help; Settings; Theme; dark; light; system; Dark; Light; System | No change | Compliant app chrome labels. |
| `src/App.tsx:596` | You | No change | Compliant actor label. |
| `src/App.tsx:612-617` | Open navigation; Navigation; Ten Brains primary navigation | No change | Compliant accessibility labels. |
| `src/App.tsx:636-639` | Open details; Duplicate; Archive | No change | Compliant menu actions. |
| `src/App.tsx:648` | Discoveries | No change | Compliant breadcrumb label. |
| `src/App.tsx:666-671` | Untitled discovery; AI onboarding assistant; Empty; Active; Discovery options | No change | Compliant map header labels. |
| `src/App.tsx:682-683` | Destination; Enough clarity to write a thin PRD or decide go / no-go | No change | Compliant Destination label and sentence length. |
| `src/App.tsx:686` | Add frontier ticket | Add Open Frontier ticket | Use canonical Open Frontier name. |
| `src/App.tsx:687` | Update map | Review map update | Make action reviewable and explicit. |
| `src/App.tsx:691-696` | Clarity 62%; Clarity 62 percent; 4 open; 3 fog; 8 closed | No change | Compliant metric labels. |
| `src/App.tsx:703-710` | Map sections; Decision map; Frontier; Open Frontier | Use Open Frontier for the segment label. | Segment label drifts from canonical name. |
| `src/App.tsx:705,717` | Fog; Fog of War | Use Fog of War for the segment label. | Segment label drifts from canonical name. |
| `src/App.tsx:706,724` | Closed; Closed Decisions | Use Closed Decisions for the segment label. | Segment label drifts from canonical name. |
| `src/App.tsx:714,721,728` | Add ticket; Add question; Add decision | No change | Compliant imperative action labels. |
| `src/App.tsx:770-778` | Type; Mode; Evidence target; Work ticket | Start ticket | `Work ticket` is less direct than an imperative action. |
| `src/App.tsx:779,797,825` | More options for ... | No change | Compliant accessibility label pattern. |
| `src/App.tsx:793` | Question | Fog question | Use canonical fog context. |
| `src/App.tsx:796` | Make actionable | No change | Compliant imperative action label. |
| `src/App.tsx:811-816` | Confidence; Evidence | No change | Compliant decision metadata labels. |
| `src/App.tsx:840-846` | Empty discovery map; Turn a vague idea into a build-or-kill decision map; Start a focused discovery session with Wayfinder. It asks concrete questions, stages a destination and candidate work, then waits for You to review before creating the map. | Empty discovery map; Turn a vague idea into a build-or-kill decision map; Start a focused discovery session with Wayfinder. It asks concrete questions, stages a Destination and candidate tickets, then waits for You to review. | Use glossary terms and avoid `work` as actionable item. |
| `src/App.tsx:850-854` | Start a discovery session with Wayfinder; View demo map | No change | Compliant action labels. |
| `src/App.tsx:880-889` | Discovery intake; Staging map; Emerging map; View demo map | Discovery session; Staging map; Staged map; View demo map | Prefer session and staged map over intake/emerging map drift. |
| `src/App.tsx:897` | Chat intake with Wayfinder | Discovery session with Wayfinder | Prefer session over chat intake. |
| `src/App.tsx:898` | Two actors · staged changes require your approval | Two actors · You approve staged changes | Use actor name and active voice. |
| `src/App.tsx:901` | Wayfinder working | No change | Compliant status label. |
| `src/App.tsx:909-911` | Reply to Wayfinder; Reply with a concrete example, constraint, or contradiction...; Send | Reply to Wayfinder; Reply with a concrete example, constraint, or contradiction.; Send | Remove ellipsis from placeholder. |
| `src/App.tsx:927-928` | Emerging map; Staged candidates from the intake conversation. | Staged map; Staged candidates from the discovery session. | Prefer staged map and session terminology. |
| `src/App.tsx:943-944` | Discovery intake transcript; Messages between You and Wayfinder | Discovery session transcript; Messages between You and Wayfinder | Prefer session terminology. |
| `src/App.tsx:962` | turn {index + 1} | No change | Compliant transcript turn marker. |
| `src/App.tsx:989-997` | Wayfinder is working; Wayfinder; Refining the staged map | No change | Compliant actor and status copy. |
| `src/App.tsx:1008-1011` | Emerging map; Wayfinder stages candidates here; nothing is added until You approve it.; Staging only | Staged map; Wayfinder stages candidates here. You approve items before Wayfinder adds them.; Staged only | Use staged map and active voice; split sentence. |
| `src/App.tsx:1017-1020` | Destination draft; Candidate · staged after turn 10 | No change | Compliant staged artifact labels. |
| `src/App.tsx:1025` | Candidate frontier | Candidate Open Frontier | Use canonical Open Frontier name. |
| `src/App.tsx:1035` | Candidate fog | Candidate Fog of War | Use canonical Fog of War name. |
| `src/App.tsx:1044` | Review & create map | Review and create map | Avoid ampersand in controlled copy. |
| `src/App.tsx:1057` | Candidate ticket | No change | Compliant ticket label. |
| `src/App.tsx:1062-1064` | Type; Mode; Target | Type; Mode; Evidence target | Keep metadata label consistent. |
| `src/App.tsx:1077` | Candidate question | Candidate fog question | Use canonical fog context. |
| `src/App.tsx:1100-1103` | Approval required; Review staged map; Choose the candidates Wayfinder should add before creating the map. | Approval required; Review staged map; Select staged items before Wayfinder creates the map. | Use imperative action language and tighter sentence. |
| `src/App.tsx:1109` | Approve destination draft | No change | Compliant imperative action label. |
| `src/App.tsx:1116` | Candidate frontier tickets | Candidate Open Frontier tickets | Use canonical Open Frontier name. |
| `src/App.tsx:1127-1131` | Candidate fog questions; Fog of War · candidate question | Candidate Fog of War questions; Fog of War · candidate fog question | Use canonical Fog of War/fog question terms. |
| `src/App.tsx:1137` | Wayfinder will create the map only with the selected staged items. Future changes still require explicit review. | No change | Compliant review-gate explanation. |
| `src/App.tsx:1142-1144` | Keep grilling; Approve & create map | Continue grilling; Approve and create map | Use direct imperative language and avoid ampersand. |
| `src/App.tsx:1167-1179` | AI onboarding assistant; Active; 62%; 4 open / 3 fog / 8 closed; Wayfinder synthesized 2 notes; Untitled discovery; Empty; 0 open / 0 fog / 0 closed; Awaiting discovery intake | AI onboarding assistant; Active; 62%; 4 Open Frontier / 3 Fog of War / 8 Closed Decisions; Wayfinder synthesized 2 evidence statements; Untitled discovery; Empty; 0 Open Frontier / 0 Fog of War / 0 Closed Decisions; Awaiting discovery session | Use glossary terms and evidence instead of notes. |
| `src/App.tsx:1192-1204` | All maps; New discovery; Discoveries; Decision maps; Open an existing map or return to the empty discovery that starts with Wayfinder intake. | All maps; New discovery; Discoveries; Decision maps; Open an existing map or return to the empty discovery that starts with a Wayfinder session. | Prefer session terminology. |
| `src/App.tsx:1210-1214,1227-1229` | Name; Status; Clarity; Counts; Last activity | No change | Compliant table labels. |
| `src/App.tsx:1256-1266` | Evidence; evidence items; Evidence ledger; Evidence cited by closed decisions; Flat source list for interview notes and competitive research. Select a row to inspect the quote or context behind the claim. | Evidence; evidence items; Evidence ledger; Evidence cited by Closed Decisions; Evidence list for session notes and competitive research. Select a row to inspect the quote or context behind the claim. | Capitalize canonical Closed Decisions; prefer evidence/session terms. |
| `src/App.tsx:1287-1295` | Cited by ...; Context | No change | Compliant evidence detail labels. |
| `src/App.tsx:1319-1330` | Discovery Spec; Maintained by You + Wayfinder; Living discovery spec; AI onboarding assistant; A compact source of truth for the current destination, boundaries, and decision criteria. Wayfinder proposes updates; You approve them before they become part of this spec. | Discovery Spec; Maintained by You + Wayfinder; Living Discovery Spec; AI onboarding assistant; This is the source of truth for the current Destination, boundaries, and decision criteria. Wayfinder proposes updates. You approve them before they become part of this spec. | Use canonical capitalization; split semicolon sentence; remove vague compact adjective. |
| `src/App.tsx:1333-1335` | Destination; Enough clarity to write a thin PRD or decide go / no-go for an AI onboarding assistant that earns trust before asking for high-permission access. | Destination; Write a thin PRD or decide go / no-go. The AI onboarding assistant earns trust before high-permission access. | Discovery Spec text exceeds 20 words and contains two ideas. |
| `src/App.tsx:1337-1339` | Scope and audience; Start with solo technical founders and hands-on developer founders evaluating developer tools for their own products. The first useful moment is a concrete setup recommendation or artifact that can be reviewed before any change is applied. | Scope and user segment; Start with solo technical founders and hands-on developer founders. They evaluate developer tools for their own products. The first useful moment is a concrete setup artifact. You review it before any change is applied. | Split dense artifact copy and prefer active voice. |
| `src/App.tsx:1341-1347` | Constraints; Suggestions must be reviewable before Wayfinder proposes any applied change.; Setup value should appear in less than five minutes.; Early flows should prefer read-only analysis and explicit permission boundaries.; Every map update remains staged until You approve it. | Constraints; Suggestions must be reviewable before Wayfinder proposes any applied change.; Setup value appears in less than five minutes.; Prefer read-only analysis and explicit permission boundaries in early flows.; Every map update remains staged until You approve it. | Avoid should in hard map artifacts; use direct active language. |
| `src/App.tsx:1350-1356` | Success criteria; You can explain the trust ladder in one sentence.; At least five concrete examples clarify what makes setup feel risky.; The next frontier tickets are actionable without inventing new research.; Closed decisions cite evidence IDs from the ledger. | Success criteria; You can explain the trust ladder in one sentence.; Five concrete examples clarify what makes setup feel risky.; The next Open Frontier tickets are actionable without inventing new research.; Closed Decisions cite evidence IDs from the ledger. | Use canonical capitalization and direct phrasing. |
| `src/App.tsx:1359-1364` | Out of scope; Autonomous repository changes as the first-run default.; Broad administration or multi-role approval flows.; Marketing-site positioning beyond the first discovery map. | Out of scope; Autonomous repository changes as the first-run default.; Multi-role approval flows.; Marketing-site positioning beyond the first discovery map. | Avoid broad administration language and extra actor implication. |
| `src/App.tsx:1367-1371` | Changelog; Aug 14 — Wayfinder staged the trust-before-actions decision from INT-03, INT-05, and COMP-02.; Aug 13 — You approved the setup-value timing constraint from INT-01 and INT-04.; Aug 12 — Discovery opened with the destination and first grilling ticket. | Changelog; Aug 14 — Wayfinder staged the trust-before-actions Closed Decision from INT-03, INT-05, and COMP-02.; Aug 13 — You approved the setup-value timing constraint from INT-01 and INT-04.; Aug 12 — Discovery opened with the Destination and first grilling ticket. | Use canonical Closed Decision and Destination terms. |
| `src/App.tsx:1400-1408` | Sessions; Clarify setup anxiety; LIVE; 12:08; End session | No change | Compliant session header labels. |
| `src/App.tsx:1415-1431` | Objective; Surface hidden assumptions about first-run trust and delegation; Evidence target; 5 concrete examples; Progress; 3 / 5 | No change | Compliant session objective metadata. |
| `src/App.tsx:1437-1444` | Session drawers; Line of Inquiry; Session Signals; Session guidance and captured signals | Session drawers; Line of Inquiry; Session Signals; Line of Inquiry and Session Signals | Last string should name actual drawer surfaces. |
| `src/App.tsx:1458-1461` | listening; Mark moment; Ask Wayfinder | No change | Compliant live controls. |
| `src/App.tsx:1483-1499` | Line of Inquiry; Recommended next; Edit recommendation; Dismiss recommendation; You said setup felt ‘risky.’ Tell me about the last time that happened. | Line of Inquiry; Next question; Edit question; Dismiss question; You said setup felt risky. Tell me about the last time that happened. | Avoid recommendation synonym drift; remove smart-quote emphasis. |
| `src/App.tsx:1502-1504` | What did you do instead?; What would have made that feel safe?; Add probe | What did you do instead?; What would have made that feel safe?; Add question | Use question instead of probe. |
| `src/App.tsx:1506-1507` | Drag to reorder · Edit or dismiss suggestions; Space to mark moment | Drag to reorder · Edit or dismiss questions; Space to mark moment | Avoid suggestions synonym drift in Line of Inquiry. |
| `src/App.tsx:1519` | Dismiss probe | Dismiss question | Use question instead of probe. |
| `src/App.tsx:1527-1554` | Live Transcript; Send to Wayfinder; Ask, note, or press ⌘↵ to send to Wayfinder...; Mark moment; Voice input options | Live transcript; Send to Wayfinder; Ask, note, or press ⌘↵ to send to Wayfinder.; Mark moment; Voice input options | Use sentence case; remove ellipsis. |
| `src/App.tsx:1563-1579` | Session Signals; 1. Assumptions tested; The core belief evaluated in this conversation.; Assumption result; Users fear setup complexity; Supported; Needs more evidence; 2. Evidence captured; Concrete moments marked during the session. | No change | Compliant session signal labels and tooltip copy. |
| `src/App.tsx:1580` | Stopped at repo write access | Repo write access stopped the flow | Make evidence statement active and complete. |
| `src/App.tsx:1581` | Would try read-only suggestions first | You would try read-only suggestions first | Add actor for a complete evidence statement. |
| `src/App.tsx:1582` | Add evidence | No change | Compliant imperative action label. |
| `src/App.tsx:1586` | 3. Candidate map updates; Potential changes to review before adding them to the map. | 3. Candidate map updates; Review potential map changes before Wayfinder adds them. | Use active voice and name Wayfinder. |
| `src/App.tsx:1587` | Candidate fog question; What permissions feel safe by default? | Candidate Fog of War question; What permissions feel safe by default? | Use canonical Fog of War name. |
| `src/App.tsx:1588` | Candidate decision; Trust suggestions before autonomous actions | Candidate Closed Decision; Users trust suggestions before autonomous actions | Use canonical Closed Decision and declarative title. |
| `src/App.tsx:1589` | Candidate frontier ticket; Prototype read-only onboarding path | Candidate Open Frontier ticket; Prototype read-only onboarding path | Use canonical Open Frontier name. |
| `src/App.tsx:1590` | Review 3 map updates | No change | Compliant imperative action label. |
| `src/App.tsx:1611-1623` | Evidence captured: ...; Save evidence; More options for ... | No change | Compliant accessibility labels and action. |
| `src/App.tsx:1639-1640` | Select ...; More options for ... | No change | Compliant accessibility label pattern. |
| `src/App.tsx:1650-1655` | Wayfinder synthesizing 2 notes; Wayfinder listening; Wayfinder; synthesizing 2 notes; listening | Wayfinder synthesizing 2 evidence statements; Wayfinder listening; Wayfinder; synthesizing 2 evidence statements; listening | Use evidence instead of notes. |
| `index.html:14` | Ten Brains | No change | Compliant product name in document title. |
| `src/components/ui/dialog.tsx:77,116` | Close | No change | Compliant dialog action label. |
| `src/components/ui/sheet.tsx:80` | Close | No change | Compliant sheet action label. |

## Key findings

- The largest drift is synonym drift: `frontier`, `fog`, `closed`, `notes`, `probe`, `suggestions`, `emerging map`, and `intake` should move toward the glossary terms.
- Several Discovery Spec and evidence detail sentences should be split to meet the 20-word hard rule.
- The demo transcript mostly matches the soft rules, but a few lines use hedging or ask multiple questions in one Wayfinder turn.
- `Target developer-led teams first` is pinned and must remain unchanged.
