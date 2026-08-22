import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';
import {
  AlertCircle,
  ArrowRight,
  AudioLines,
  Bookmark,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  ChevronUp,
  Circle,
  CircleHelp,
  FileText,
  GitBranch,
  GripVertical,
  HelpCircle,
  Inbox,
  Keyboard,
  LoaderCircle,
  Map as MapIcon,
  Menu,
  MessageSquareText,
  Mic,
  Monitor,
  MoreHorizontal,
  Moon,
  PanelRightOpen,
  Pencil,
  Plus,
  PlusCircle,
  RotateCcw,
  SendHorizontal,
  Settings,
  Sparkles,
  Sun,
  Target,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { SessionFlowchart } from '@/components/session-flowchart';
import { SessionMap, type SessionMapData } from '@/components/session-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type RouteName = 'map' | 'session' | 'session-map' | 'intake' | 'intake-session-map' | 'discoveries' | 'evidence' | 'spec' | 'how-it-works';
type ThemeMode = 'dark' | 'light' | 'system';
type MapSegment = 'frontier' | 'fog' | 'closed';
type DrawerName = 'inquiry' | 'signals' | null;
type TicketType = 'Grilling' | 'Research' | 'Prototype' | 'Synthesis';
type WorkMode = 'You' | 'Wayfinder' | 'You + Wayfinder';

type Ticket = {
  title: string;
  type: TicketType;
  mode: WorkMode;
  target: string;
  selected?: boolean;
};

type Decision = {
  title: string;
  confidence: 'High' | 'Medium';
  evidence: string[];
};

type TranscriptLine = {
  time: string;
  actor: 'You' | 'Wayfinder';
  text: string;
  annotation?: string;
};

type IntakeMessage = {
  id?: string;
  time: string;
  actor: 'You' | 'Wayfinder';
  text: string;
  note?: string;
};

type ApiCandidate =
  | { id: string; type: 'destination-draft'; title: string; stagedAfter: string }
  | { id: string; type: 'ticket'; title: string; ticketType: TicketType; mode: WorkMode; target: string; stagedAfter: string }
  | { id: string; type: 'fog-question'; question: string; stagedAfter: string }
  | { id: string; type: 'closed-decision'; title: string; confidence?: 'High' | 'Medium'; evidence?: string[]; stagedAfter: string };

type ApiSession = {
  id: string;
  type: 'grilling';
  ticketId?: string | null;
  title: string;
  objective: string;
  evidenceTarget: string;
  mode: WorkMode;
  status: string;
  transcript: Array<{ id: string; actor: 'You' | 'Wayfinder'; text: string; createdAt: string }>;
  lineOfInquiry: Array<{ id: string; question: string; status: string }>;
  evidence: Array<{ id: string; text: string; sourceTurn: string | number; createdAt: string }>;
  staged: ApiCandidate[];
};

type ApiDiscovery = {
  id: string;
  name: string;
  status: string;
  map: {
    destination: string | null;
    openFrontier: Array<Ticket & { id: string }>;
    fogOfWar: Array<{ id: string; question: string }>;
    closedDecisions: Array<Decision & { id: string }>;
  };
  transcripts: {
    intake: Array<{ id: string; actor: 'You' | 'Wayfinder'; text: string; createdAt: string }>;
  };
  staged: ApiCandidate[];
  sessions: Array<ApiSession | { id: string; type: 'intake'; status: string; createdAt: string }>;
};

type DiscoverySummary = {
  id: string;
  name: string;
  status: 'Active' | 'Archived';
  clarity: number;
  counts: { open: number; fog: number; closed: number };
  updatedAt: string;
};

type LiveDiscoveryStatus = 'loading' | 'ready' | 'error';
type IntakeError = { kind: 'load' | 'turn'; message: string };
type LiveSessionError = { kind: 'load' | 'stream' | 'moment' | 'approve'; message: string };
type LiveSessionDrawer = 'inquiry' | 'signals' | null;
type InquiryDraft = { id: string; question: string; sourceQuestion: string };

type StagedFrontierTicket = {
  title: string;
  type: TicketType;
  mode: WorkMode;
  target: string;
  stagedAfter: string;
};

type EvidenceRecord = {
  id: string;
  claim: string;
  source: string;
  capturedDate: string;
  citedBy: string[];
  detail: string;
};

const frontierTickets: Ticket[] = [
  {
    title: 'Grill 5 solo founders on setup anxiety',
    type: 'Grilling',
    mode: 'You + Wayfinder',
    target: '5 setup examples',
    selected: true,
  },
  {
    title: 'Compare onboarding patterns',
    type: 'Research',
    mode: 'Wayfinder',
    target: '3 competitors',
  },
  {
    title: 'Prototype first-run checklist',
    type: 'Prototype',
    mode: 'You + Wayfinder',
    target: '1 usability test',
  },
  {
    title: 'Decide activation signal',
    type: 'Synthesis',
    mode: 'You',
    target: '1 metric test',
  },
];

const fogQuestions = [
  'Do solo founders want guidance or automation?',
  'What feels unsafe to delegate?',
  'Does setup anxiety differ by segment?',
];

const closedDecisions: Decision[] = [
  {
    title: 'Users trust suggestions before autonomous actions',
    confidence: 'High',
    evidence: ['INT-03', 'INT-05', 'COMP-02'],
  },
  {
    title: 'Setup value must appear in < 5 min',
    confidence: 'High',
    evidence: ['INT-01', 'INT-04'],
  },
  {
    title: 'Target developer-led teams first', // must stay 'developer-led teams' to match user-wayfinder-map-overview-v2.png
    confidence: 'Medium',
    evidence: ['INT-02', 'COMP-01'],
  },
];

const evidenceRecords: EvidenceRecord[] = [
  {
    id: 'INT-01',
    claim: 'Setup value must appear before the first configuration step feels worth finishing.',
    source: 'Grilling: Clarify setup anxiety',
    capturedDate: 'Aug 12, 2026',
    citedBy: ['Setup value must appear in < 5 min'],
    detail:
      'You abandoned setup when repo access came before value. Useful output must appear before permissions feel costly.',
  },
  {
    id: 'INT-02',
    claim: 'Hands-on developer founders respond to concrete setup pain before broad strategy claims.',
    source: 'Grilling: Clarify setup anxiety',
    capturedDate: 'Aug 12, 2026',
    citedBy: ['Target developer-led teams first'],
    detail:
      'Hands-on founders can judge setup risk before procurement language matters.',
  },
  {
    id: 'INT-03',
    claim: 'Repo write access stopped the flow because Wayfinder had not earned trust.',
    source: 'Grilling: Clarify setup anxiety',
    capturedDate: 'Aug 13, 2026',
    citedBy: ['Users trust suggestions before autonomous actions'],
    detail:
      'Quote: “I stopped when it asked for repo write access. I didn’t know what it would change.” This is behavior evidence.',
  },
  {
    id: 'INT-04',
    claim: 'Users decide within the first five minutes whether the onboarding assistant is worth continuing.',
    source: 'Grilling: Clarify setup anxiety',
    capturedDate: 'Aug 13, 2026',
    citedBy: ['Setup value must appear in < 5 min'],
    detail:
      'The first-run checklist must produce a useful artifact before high-trust access.',
  },
  {
    id: 'INT-05',
    claim: 'Users accept read-only suggestions before Wayfinder proposes autonomous changes.',
    source: 'Grilling: Clarify setup anxiety',
    capturedDate: 'Aug 13, 2026',
    citedBy: ['Users trust suggestions before autonomous actions'],
    detail:
      'Quote: “I would start with read-only suggestions first and choose what to apply.” Wayfinder staged this as evidence.',
  },
  {
    id: 'COMP-01',
    claim: 'Comparable onboarding flows target builders who can evaluate setup value directly.',
    source: 'Research: Compare onboarding patterns',
    capturedDate: 'Aug 14, 2026',
    citedBy: ['Target developer-led teams first'],
    detail:
      'Competitive research shows this pattern: show a concrete artifact before higher-trust actions.',
  },
  {
    id: 'COMP-02',
    claim: 'Competitors separate suggested changes from applied changes to preserve trust.',
    source: 'Research: Compare onboarding patterns',
    capturedDate: 'Aug 14, 2026',
    citedBy: ['Users trust suggestions before autonomous actions'],
    detail:
      'Pattern review found explicit review steps, read-only previews, and apply-change gates. Comparable products do not mutate work first.',
  },
];

const transcript: TranscriptLine[] = [
  {
    time: '11:55:12',
    actor: 'Wayfinder',
    text: 'When was the last time you tried a new onboarding assistant for a dev tool?',
  },
  {
    time: '11:55:28',
    actor: 'You',
    text: 'I think it was a couple weeks ago.',
  },
  {
    time: '11:55:36',
    actor: 'Wayfinder',
    text: 'Walk me through what you wanted it to help you do.',
  },
  {
    time: '11:55:52',
    actor: 'You',
    text: 'Mostly connect the repo and get it set up so I could start using it right away.',
  },
  {
    time: '11:56:07',
    actor: 'Wayfinder',
    text: 'What happened next?',
  },
  {
    time: '11:56:15',
    actor: 'You',
    text: 'I stopped when it asked for repo write access. I didn’t know what it would change.',
    annotation: 'Concrete behavior',
  },
  {
    time: '11:56:42',
    actor: 'Wayfinder',
    text: 'What were you worried might happen?',
  },
  {
    time: '11:57:01',
    actor: 'You',
    text: 'It could modify something I didn’t expect or push changes I didn’t review.',
  },
  {
    time: '11:57:28',
    actor: 'Wayfinder',
    text: 'What would have made that feel safe?',
  },
  {
    time: '11:57:45',
    actor: 'You',
    text: 'I would start with read-only suggestions first and choose what to apply. I’d be comfortable.',
    annotation: 'Concrete behavior',
  },
];

const intakeTranscript: IntakeMessage[] = [
  {
    time: '09:12',
    actor: 'Wayfinder',
    text: 'State the vague idea in one sentence. Name the decision you need clarity on.',
    note: 'Opening pressure test',
  },
  {
    time: '09:13',
    actor: 'You',
    text: 'I want a tool that helps solo technical founders turn vague product ideas into something they can build, test, or kill.',
  },
  {
    time: '09:14',
    actor: 'Wayfinder',
    text: 'Who is the first user? If you say “founders,” name the person who feels the pain this week.',
  },
  {
    time: '09:15',
    actor: 'You',
    text: 'Solo technical founders working directly with AI tools before customers exist.',
  },
  {
    time: '09:16',
    actor: 'Wayfinder',
    text: 'What breaks today when that person tries to validate an idea? Name the failure mode, not the feature request.',
    note: 'Hidden assumption surfaced',
  },
  {
    time: '09:17',
    actor: 'You',
    text: 'They collect notes, AI suggestions, and half-decisions in different places. They cannot tell what evidence is strong enough to act on.',
  },
  {
    time: '09:18',
    actor: 'Wayfinder',
    text: 'Describe a recent moment when that broke. Where did the decision stall?',
  },
  {
    time: '09:20',
    actor: 'You',
    text: 'Last week I wanted to test an AI onboarding assistant. I had interview notes and competitor tabs, but no explicit map of the remaining fog.',
  },
  {
    time: '09:21',
    actor: 'Wayfinder',
    text: 'How would you know this worked after one session? Name the observable change.',
  },
  {
    time: '09:22',
    actor: 'You',
    text: 'I would leave with a clear Destination, the next tickets, and the top fog questions staged for review.',
  },
];

const destinationDraft =
  'Solo technical founders can turn a vague AI product idea into a reviewed map with a Destination, next tickets, and fog.';

const emergingFrontierTickets: StagedFrontierTicket[] = [
  {
    title: 'Grill 5 founders on where idea validation stalls',
    type: 'Grilling',
    mode: 'You + Wayfinder',
    target: '5 concrete examples',
    stagedAfter: 'turn 4',
  },
  {
    title: 'Research alternatives for decision-map workflows',
    type: 'Research',
    mode: 'Wayfinder',
    target: '3 comparable patterns',
    stagedAfter: 'turn 6',
  },
  {
    title: 'Prototype the session-to-map review step',
    type: 'Prototype',
    mode: 'You + Wayfinder',
    target: '1 clickable flow',
    stagedAfter: 'turn 9',
  },
];

const emergingFogQuestions = [
  {
    question: 'What evidence is strong enough to stop exploring and write a thin PRD?',
    stagedAfter: 'turn 6',
  },
  {
    question: 'What evidence would justify killing the idea before more prototype work?',
    stagedAfter: 'turn 8',
  },
  {
    question: 'Do solo founders want relentless grilling, suggested tickets, or both?',
    stagedAfter: 'turn 9',
  },
];

function stagedAfterToTurnIndex(stagedAfter: string) {
  const match = stagedAfter.match(/\d+/);
  return match ? Math.max(0, Number(match[0]) - 1) : 0;
}

const intakeSessionMap: SessionMapData = {
  meta: {
    title: 'Discovery session',
    objective: 'Stage a Destination, tickets, and fog questions for review',
    evidenceTarget: '7 staged candidates',
    progress: 'Awaiting review',
    mode: 'You + Wayfinder',
  },
  transcript: intakeTranscript.map((message) => ({
    time: message.time,
    actor: message.actor,
    text: message.text,
    annotation: message.note,
  })),
  evidenceCaptured: [],
  candidateUpdates: [
    {
      id: 'DESTINATION-01',
      type: 'destination-draft',
      title: destinationDraft,
      sourceTurnIndex: 9,
    },
    ...emergingFrontierTickets.map((ticket, index) => ({
      id: `TICKET-${index + 1}`,
      type: 'open-frontier-ticket' as const,
      title: ticket.title,
      sourceTurnIndex: stagedAfterToTurnIndex(ticket.stagedAfter),
    })),
    ...emergingFogQuestions.map((item, index) => ({
      id: `FOG-${index + 1}`,
      type: 'fog-question' as const,
      title: item.question,
      sourceTurnIndex: stagedAfterToTurnIndex(item.stagedAfter),
    })),
  ],
  outcome: {
    stagedCount: 1 + emergingFrontierTickets.length + emergingFogQuestions.length,
    reviewState: 'Awaiting review',
  },
};

const grillingSessionMap: SessionMapData = {
  meta: {
    title: 'Clarify setup anxiety',
    objective: 'Surface hidden assumptions about first-run trust and delegation',
    evidenceTarget: '5 concrete examples',
    progress: '3 / 5',
    mode: 'You + Wayfinder',
  },
  transcript,
  evidenceCaptured: [
    {
      id: 'INT-03',
      text: 'Repo write access stopped the flow',
      sourceTurnIndex: 5,
    },
    {
      id: 'INT-05',
      text: 'You would try read-only suggestions first',
      sourceTurnIndex: 9,
    },
  ],
  candidateUpdates: [
    {
      id: 'FOG-01',
      type: 'fog-question',
      title: 'What permissions feel safe by default?',
      sourceTurnIndex: 5,
    },
    {
      id: 'DEC-01',
      type: 'closed-decision',
      title: 'Users trust suggestions before autonomous actions',
      evidenceIds: ['INT-03', 'INT-05'],
      sourceTurnIndex: 9,
    },
    {
      id: 'TICKET-01',
      type: 'open-frontier-ticket',
      title: 'Prototype read-only onboarding path',
      sourceTurnIndex: 9,
    },
  ],
  outcome: {
    stagedCount: 3,
    reviewState: 'Awaiting review',
  },
};


const typeClass: Record<TicketType, string> = {
  Grilling: 'type-grilling',
  Research: 'type-research',
  Prototype: 'type-prototype',
  Synthesis: 'type-synthesis',
};

function getRouteFromPath(): RouteName {
  const { pathname } = window.location;

  if (pathname === '/sessions/grilling/map' || /^\/sessions\/[^/]+\/map$/.test(pathname)) {
    return 'session-map';
  }

  if (pathname === '/discoveries/new/map') {
    return 'intake-session-map';
  }

  if (pathname.includes('/discoveries/new')) {
    return 'intake';
  }

  if (pathname === '/discoveries') {
    return 'discoveries';
  }

  if (pathname === '/evidence') {
    return 'evidence';
  }

  if (pathname === '/spec') {
    return 'spec';
  }

  if (pathname === '/how-it-works') {
    return 'how-it-works';
  }

  return pathname.includes('sessions') ? 'session' : 'map';
}

function App() {
  const [route, setRoute] = useState<RouteName>(getRouteFromPath);
  const [locationKey, setLocationKey] = useState(() => window.location.pathname + window.location.search + window.location.hash);
  const [liveDiscovery, setLiveDiscovery] = useState<ApiDiscovery | null>(null);
  const [liveDiscoveryStatus, setLiveDiscoveryStatus] = useState<LiveDiscoveryStatus>(() => {
    const hasStoredDiscovery = Boolean(window.sessionStorage.getItem('ten-brains-live-discovery'));
    const isLiveMap = getRouteFromPath() === 'map' && new URLSearchParams(window.location.search).get('demo') !== '1';
    return hasStoredDiscovery && isLiveMap ? 'loading' : 'ready';
  });
  const [mapLoadAttempt, setMapLoadAttempt] = useState(0);

  useEffect(() => {
    const syncLocation = () => {
      setRoute(getRouteFromPath());
      setLocationKey(window.location.pathname + window.location.search + window.location.hash);
    };
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, []);

  useEffect(() => {
    if (route !== 'map' || new URLSearchParams(window.location.search).get('demo') === '1') return;
    let cancelled = false;
    async function loadSelectedDiscovery() {
      setLiveDiscovery(null);
      setLiveDiscoveryStatus('loading');
      try {
        const pathId = window.location.pathname.match(/^\/discoveries\/([^/]+)$/)?.[1];
        let discoveryId = pathId ?? window.sessionStorage.getItem('ten-brains-live-discovery');
        if (!discoveryId) {
          const listResponse = await fetch('/api/discoveries');
          if (!listResponse.ok) throw new Error('Discoveries could not load');
          const discoveries: DiscoverySummary[] = await listResponse.json();
          discoveryId = discoveries.find((item) => item.status === 'Active')?.id ?? null;
        }
        if (!discoveryId) {
          if (!cancelled) setLiveDiscoveryStatus('ready');
          return;
        }
        window.sessionStorage.setItem('ten-brains-live-discovery', discoveryId);
        const response = await fetch(`/api/discoveries/${discoveryId}`);
        if (!response.ok) throw new Error('Discovery map could not load');
        const discovery: ApiDiscovery = await response.json();
        if (!cancelled) {
          setLiveDiscovery(discovery);
          setLiveDiscoveryStatus('ready');
        }
      } catch {
        if (!cancelled) setLiveDiscoveryStatus('error');
      }
    }
    loadSelectedDiscovery();
    return () => { cancelled = true; };
  }, [route, locationKey, mapLoadAttempt]);

  function navigate(path: string) {
    window.history.pushState({}, '', path);
    setRoute(getRouteFromPath());
    setLocationKey(window.location.pathname + window.location.search + window.location.hash);
  }

  function createMap(discovery: ApiDiscovery) {
    window.sessionStorage.setItem('ten-brains-live-discovery', discovery.id);
    setLiveDiscovery(null);
    setLiveDiscoveryStatus('loading');
    navigate('/map');
  }

  return (
    <TooltipProvider delayDuration={350} key={locationKey}>
      {route === 'intake' ? (
        <DiscoveryIntake navigate={navigate} onCreateMap={createMap} />
      ) : route === 'session' ? (
        <GrillingSession navigate={navigate} />
      ) : route === 'session-map' ? (
        <SessionMapView navigate={navigate} />
      ) : route === 'intake-session-map' ? (
        <IntakeSessionMapView navigate={navigate} />
      ) : route === 'discoveries' ? (
        <DiscoveriesList navigate={navigate} />
      ) : route === 'evidence' ? (
        <EvidenceView navigate={navigate} />
      ) : route === 'spec' ? (
        <DiscoverySpecView navigate={navigate} />
      ) : route === 'how-it-works' ? (
        <HowItWorksView navigate={navigate} />
      ) : (
        <MapOverview
          navigate={navigate}
          liveDiscovery={liveDiscovery}
          liveDiscoveryStatus={liveDiscoveryStatus}
          onRetryLiveMap={() => setMapLoadAttempt((attempt) => attempt + 1)}
        />
      )}
    </TooltipProvider>
  );
}

async function startNewDiscovery(navigate: (path: string) => void) {
  const response = await fetch('/api/discoveries', { method: 'POST' });
  if (!response.ok) return;
  const discovery: ApiDiscovery = await response.json();
  window.sessionStorage.setItem('ten-brains-live-discovery', discovery.id);
  navigate('/discoveries/new');
}

function openLiveDiscovery(id: string, navigate: (path: string) => void) {
  window.sessionStorage.setItem('ten-brains-live-discovery', id);
  navigate(`/discoveries/${id}`);
}

function NavLink({
  active,
  icon: Icon,
  children,
  onClick,
}: {
  active?: boolean;
  icon: LucideIcon;
  children: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Button asChild variant="ghost" className={`nav-link ${active ? 'active' : ''}`}>
      <a href="#" aria-current={active ? 'page' : undefined} onClick={onClick}>
        <Icon aria-hidden="true" />
        <span>{children}</span>
      </a>
    </Button>
  );
}

function SideNav({
  active,
  navigate,
  compactBrand,
}: {
  active: RouteName;
  navigate: (path: string) => void;
  compactBrand?: boolean;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [discoveries, setDiscoveries] = useState<DiscoverySummary[]>([]);
  const isDemoNavigation = new URLSearchParams(window.location.search).get('demo') === '1'
    || window.location.pathname.startsWith('/sessions/grilling')
    || ['/evidence', '/spec', '/how-it-works'].includes(window.location.pathname);
  const selectedDiscoveryId = window.location.pathname.match(/^\/discoveries\/([^/]+)$/)?.[1]
    ?? window.sessionStorage.getItem('ten-brains-live-discovery')
    ?? '';
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = window.localStorage.getItem('ten-brains-theme');
    return stored === 'light' || stored === 'system' ? stored : 'dark';
  });

  useEffect(() => {
    if (isDemoNavigation) return;
    fetch('/api/discoveries')
      .then((response) => response.ok ? response.json() : [])
      .then((items: DiscoverySummary[]) => setDiscoveries(items))
      .catch(() => undefined);
  }, [isDemoNavigation]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      document.documentElement.dataset.theme = themeMode;
      document.documentElement.classList.toggle('dark', themeMode === 'dark' || (themeMode === 'system' && media.matches));
    };

    window.localStorage.setItem('ten-brains-theme', themeMode);
    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [themeMode]);

  const go = (path: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setMobileOpen(false);
    navigate(path);
  };

  const ThemeIcon = themeMode === 'dark' ? Moon : themeMode === 'light' ? Sun : Monitor;

  const navigationContents = (
    <>
      <div className="brand-row">
        <span className="brand-mark">
          <span aria-hidden="true" className="brand-monogram">10</span>
        </span>
        <span className="brand-title">Ten Brains</span>
      </div>

      <button type="button" className={`discovery-label discovery-label-link ${active === 'discoveries' ? 'active' : ''}`} aria-current={active === 'discoveries' ? 'page' : undefined} onClick={() => { setMobileOpen(false); navigate('/discoveries'); }}>
        {compactBrand ? 'Current discovery' : 'Discoveries'}
      </button>
      {isDemoNavigation ? (
        <Select value="ai-onboarding" onValueChange={(value) => {
          setMobileOpen(false);
          navigate(value === 'all-discoveries' ? '/discoveries' : '/map?demo=1');
        }}>
          <SelectTrigger className="discovery-picker" aria-label="Current discovery"><SelectValue /></SelectTrigger>
          <SelectContent align="start">
            <SelectItem value="ai-onboarding">AI onboarding assistant</SelectItem>
            <SelectItem value="all-discoveries">View all discoveries</SelectItem>
          </SelectContent>
        </Select>
      ) : (
        <Select value={selectedDiscoveryId || 'all-discoveries'} onValueChange={(value) => {
          setMobileOpen(false);
          if (value === 'all-discoveries') navigate('/discoveries'); else openLiveDiscovery(value, navigate);
        }}>
          <SelectTrigger className="discovery-picker" aria-label="Current discovery"><SelectValue placeholder="Select discovery" /></SelectTrigger>
          <SelectContent align="start">
            {discoveries.map((discovery) => <SelectItem key={discovery.id} value={discovery.id}>{discovery.name}</SelectItem>)}
            <SelectItem value="all-discoveries">View all discoveries</SelectItem>
          </SelectContent>
        </Select>
      )}

      <Separator className="sidebar-separator" />

      <nav className="nav-stack" aria-label="Primary navigation">
        <NavLink active={active === 'map'} icon={MapIcon} onClick={go('/map')}>
          Map
        </NavLink>
        <NavLink active={active === 'session'} icon={CalendarDays} onClick={go(isDemoNavigation ? '/sessions/grilling' : '/sessions')}>
          Sessions
        </NavLink>
        <NavLink active={active === 'evidence'} icon={Inbox} onClick={go('/evidence')}>Evidence</NavLink>
        <NavLink active={active === 'spec'} icon={FileText} onClick={go('/spec')}>Discovery Spec</NavLink>
        <NavLink active={active === 'how-it-works'} icon={GitBranch} onClick={go('/how-it-works')}>How it works</NavLink>
      </nav>

      <div className="sidebar-spacer" />
      <Button
        variant="ghost"
        type="button"
        className={`text-action ${active === 'intake' ? 'intake-active' : ''}`}
        aria-current={active === 'intake' ? 'page' : undefined}
        onClick={() => { setMobileOpen(false); void startNewDiscovery(navigate); }}
      >
        <Plus aria-hidden="true" /> New discovery
      </Button>
      {active === 'session' && (
        <Button variant="ghost" className="secondary-row">
          <HelpCircle aria-hidden="true" /> Help
        </Button>
      )}
      <Button variant="ghost" className="secondary-row">
        <Settings aria-hidden="true" /> Settings
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="secondary-row theme-toggle" aria-label={`Theme: ${themeMode}`}>
            <ThemeIcon aria-hidden="true" />
            <span>Theme</span>
            <span className="theme-value">{themeMode}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="menu-content">
          <DropdownMenuCheckboxItem checked={themeMode === 'dark'} onSelect={() => setThemeMode('dark')}><Moon aria-hidden="true" /> Dark</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={themeMode === 'light'} onSelect={() => setThemeMode('light')}><Sun aria-hidden="true" /> Light</DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={themeMode === 'system'} onSelect={() => setThemeMode('system')}><Monitor aria-hidden="true" /> System</DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator />
      <Button variant="ghost" className="account-chip">
        <span className="you-chip-mark">Y</span>
        <strong>You</strong>
        <ChevronDown aria-hidden="true" />
      </Button>
    </>
  );

  return (
    <>
      <aside className="sidebar desktop-sidebar">{navigationContents}</aside>
      <div className="mobile-navigation-bar">
        <div className="mobile-brand">
          <span className="brand-mark"><span aria-hidden="true" className="brand-monogram">10</span></span>
          <span className="brand-title">Ten Brains</span>
        </div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Open navigation"><Menu aria-hidden="true" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="navigation-sheet" aria-label="Navigation">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
              <SheetDescription>Ten Brains primary navigation</SheetDescription>
            </SheetHeader>
            <aside className="sidebar mobile-sidebar">{navigationContents}</aside>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function MoreMenu({ label, disabled = false }: { label: string; disabled?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="menu-button" aria-label={label} disabled={disabled} title={disabled ? 'Available after a reviewed update' : undefined}>
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="menu-content">
        <DropdownMenuItem>Open details</DropdownMenuItem>
        <DropdownMenuItem>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function DiscoveriesCrumb({ navigate }: { navigate: (path: string) => void }) {
  return (
    <a href="/discoveries" onClick={(event) => { event.preventDefault(); navigate('/discoveries'); }}>
      Discoveries
    </a>
  );
}

function MapOverview({
  navigate,
  liveDiscovery,
  liveDiscoveryStatus,
  onRetryLiveMap,
}: {
  navigate: (path: string) => void;
  liveDiscovery: ApiDiscovery | null;
  liveDiscoveryStatus: LiveDiscoveryStatus;
  onRetryLiveMap: () => void;
}) {
  const [segment, setSegment] = useState<MapSegment>('frontier');
  const isDemoMap = new URLSearchParams(window.location.search).get('demo') === '1';
  const isLoadingMap = !isDemoMap && liveDiscoveryStatus === 'loading';
  const hasMapError = !isDemoMap && liveDiscoveryStatus === 'error';
  const liveMap = isDemoMap ? null : liveDiscovery?.map;
  const displayedTickets = liveMap?.openFrontier ?? frontierTickets;
  const displayedFog = liveMap?.fogOfWar.map((item) => item.question) ?? fogQuestions;
  const displayedDecisions = liveMap?.closedDecisions ?? closedDecisions;
  const hasLiveMap = Boolean(liveMap && (liveMap.destination || displayedTickets.length || displayedFog.length || displayedDecisions.length));
  const isEmptyMap = !isDemoMap && liveDiscoveryStatus === 'ready' && !hasLiveMap;
  const clarity = isDemoMap ? 62 : Math.min(100, (liveMap?.destination ? 30 : 10) + (displayedTickets.length + displayedFog.length + displayedDecisions.length) * 10);
  const mapStatus = isLoadingMap ? 'Loading' : hasMapError ? 'Unavailable' : isEmptyMap ? 'Empty' : 'Active';

  async function startSession(ticket: Ticket & { id?: string }) {
    if (isDemoMap || !liveDiscovery || !ticket.id) {
      navigate('/sessions/grilling');
      return;
    }
    const response = await fetch(`/api/discoveries/${liveDiscovery.id}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId: ticket.id }),
    });
    if (!response.ok) return;
    const session: ApiSession = await response.json();
    window.sessionStorage.setItem('ten-brains-live-discovery', liveDiscovery.id);
    navigate(`/sessions/${session.id}`);
  }

  return (
    <div className="app-shell">
      <SideNav active="map" navigate={navigate} />
      <main className="main-surface map-main">
        <header className="topbar map-topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>{isEmptyMap ? 'Untitled discovery' : (isDemoMap ? 'AI onboarding assistant' : (liveDiscovery?.name ?? 'Untitled discovery'))}</strong>
            <Badge variant="outline" className="status-badge active">
              {isLoadingMap ? <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" /> : <Circle aria-hidden="true" className="status-icon" />} {mapStatus}
            </Badge>
          </div>
          <MoreMenu label="Discovery options" disabled={!isDemoMap} />
        </header>

        {isLoadingMap ? (
          <MapLoadingState />
        ) : hasMapError ? (
          <MapLoadErrorState onRetry={onRetryLiveMap} />
        ) : isEmptyMap ? (
          <EmptyMapState navigate={navigate} />
        ) : (
          <>
            <Card className="destination-card">
              <CardContent className="destination-content">
                <div className="destination-head">
                  <div>
                    <p className="eyebrow">Destination</p>
                    <h1>{liveMap ? (liveMap.destination ?? 'Destination awaits approval') : 'Enough clarity to write a thin PRD or decide go / no-go'}</h1>
                  </div>
                  <div className="destination-actions">
                    <Button size="lg" className="primary-action" disabled={!isDemoMap} title={!isDemoMap ? 'Use a reviewed Wayfinder update' : undefined}>Add Open Frontier ticket</Button>
                    <Button size="lg" variant="outline" disabled={!isDemoMap} title={!isDemoMap ? 'Use a reviewed Wayfinder update' : undefined}>Review map update</Button>
                  </div>
                </div>
                <div className="clarity-row">
                  <div className="clarity-label">Clarity {clarity}%</div>
                  <Progress value={clarity} className="clarity-progress" aria-label={`Clarity ${clarity} percent`} />
                  <div className="clarity-counts">
                    <span><Circle aria-hidden="true" className="count-dot open" />{displayedTickets.length} open</span>
                    <span><Circle aria-hidden="true" className="count-dot fog" />{displayedFog.length} fog</span>
                    <span><Circle aria-hidden="true" className="count-dot closed" />{displayedDecisions.length} closed</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Tabs value={segment} onValueChange={(value) => setSegment(value as MapSegment)} className="map-tabs">
              <TabsList className="map-segments" aria-label="Map sections">
                <TabsTrigger value="frontier">Open Frontier</TabsTrigger>
                <TabsTrigger value="fog">Fog of War</TabsTrigger>
                <TabsTrigger value="closed">Closed Decisions</TabsTrigger>
              </TabsList>

              <section className="map-grid" aria-label="Decision map">
                <MapColumn title="Open Frontier" count={displayedTickets.length} tone="frontier" active={segment === 'frontier'}>
                  {displayedTickets.map((ticket) => (
                    <TicketCard
                      key={ticket.title}
                      ticket={{ ...ticket, selected: isDemoMap ? ticket.selected : ticket.type === 'Grilling' }}
                      onWork={() => startSession(ticket)}
                      live={!isDemoMap}
                    />
                  ))}
                  <Button variant="ghost" className="add-row" disabled={!isDemoMap} title={!isDemoMap ? 'Use a reviewed Wayfinder update' : undefined}><Plus aria-hidden="true" /> Add ticket</Button>
                </MapColumn>

                <MapColumn title="Fog of War" count={displayedFog.length} tone="fog" active={segment === 'fog'}>
                  {displayedFog.map((question) => (
                    <FogCard key={question} question={question} live={!isDemoMap} />
                  ))}
                  <Button variant="ghost" className="add-row" disabled={!isDemoMap} title={!isDemoMap ? 'Use a reviewed Wayfinder update' : undefined}><Plus aria-hidden="true" /> Add question</Button>
                </MapColumn>

                <MapColumn title="Closed Decisions" count={displayedDecisions.length} tone="closed" active={segment === 'closed'}>
                  {displayedDecisions.map((decision) => (
                    <DecisionCard key={decision.title} decision={decision} navigate={navigate} live={!isDemoMap} />
                  ))}
                  <Button variant="ghost" className="add-row" disabled={!isDemoMap} title={!isDemoMap ? 'Use a reviewed Wayfinder update' : undefined}><Plus aria-hidden="true" /> Add decision</Button>
                </MapColumn>
              </section>
            </Tabs>
          </>
        )}
      </main>
      {!isEmptyMap && !isLoadingMap && !hasMapError && <WayfinderPill status={isDemoMap ? 'synthesizing 2 evidence statements' : 'showing approved map items'} />}
    </div>
  );
}

function MapLoadingState() {
  return (
    <Card className="mt-4 border-[var(--border-subtle)] bg-card shadow-none">
      <CardContent className="flex min-h-[360px] flex-col items-center justify-center px-6 py-16 text-center" role="status" aria-live="polite">
        <LoaderCircle aria-hidden="true" className="mb-4 size-5 animate-spin text-[var(--workbench-accent)]" />
        <h1 className="text-base font-semibold text-[var(--text)]">Loading the approved map</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">Ten Brains is reading the latest approved items.</p>
      </CardContent>
    </Card>
  );
}

function MapLoadErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <Card className="mt-4 border-[var(--danger-border)] bg-[var(--danger-soft)] shadow-none">
      <CardContent className="flex min-h-[360px] flex-col items-center justify-center px-6 py-16 text-center" role="alert">
        <AlertCircle aria-hidden="true" className="mb-4 size-5 text-[var(--danger)]" />
        <h1 className="text-base font-semibold text-[var(--text)]">The approved map did not load</h1>
        <p className="mt-2 max-w-md text-sm text-[var(--text-muted)]">Your approved items remain saved. Retry the map request.</p>
        <Button variant="outline" className="mt-5 border-[var(--danger-border)] bg-[var(--surface)]" onClick={onRetry}>
          <RotateCcw aria-hidden="true" /> Retry map
        </Button>
      </CardContent>
    </Card>
  );
}

function MapColumn({
  title,
  count,
  tone,
  active,
  children,
}: {
  title: string;
  count: number;
  tone: 'frontier' | 'fog' | 'closed';
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Card className={`map-column ${tone} ${active ? 'mobile-active' : ''}`}>
      <CardHeader className="column-title">
        <CardTitle>{title}</CardTitle>
        <Badge variant="secondary" className="count-pill">{count}</Badge>
      </CardHeader>
      <CardContent className="column-stack">{children}</CardContent>
    </Card>
  );
}

function TicketCard({ ticket, onWork, live = false }: { ticket: Ticket; onWork: () => void; live?: boolean }) {
  return (
    <Card className={`ticket-card ${ticket.selected ? 'selected' : ''}`}>
      <CardContent className="ticket-content">
        <h3>{ticket.title}</h3>
        <div className="metadata-grid">
          <span>Type</span>
          <Badge variant="secondary" className={`mini-tag ${typeClass[ticket.type]}`}>{ticket.type}</Badge>
          <span>Mode</span>
          <Badge variant="secondary" className="mini-tag mode-tag">{ticket.mode}</Badge>
          <span>Evidence target</span>
          <strong>{ticket.target}</strong>
        </div>
        <div className="card-actions">
          {ticket.selected && <Button size="sm" onClick={onWork}>Start ticket</Button>}
          <MoreMenu label={`More options for ${ticket.title}`} disabled={live} />
        </div>
      </CardContent>
    </Card>
  );
}

function FogCard({ question, live = false }: { question: string; live?: boolean }) {
  return (
    <Card className="fog-card">
      <CardContent className="ticket-content">
        <h3>{question}</h3>
        <div className="metadata-grid fog-meta">
          <span>Type</span>
          <Badge variant="secondary" className="mini-tag fog-tag">Fog question</Badge>
        </div>
        <div className="card-actions two-up">
          <Button variant="outline" size="sm" disabled={live} title={live ? 'Use a reviewed Wayfinder update' : undefined}>Make actionable</Button>
          <MoreMenu label={`More options for ${question}`} disabled={live} />
        </div>
      </CardContent>
    </Card>
  );
}

function DecisionCard({ decision, navigate, live = false }: { decision: Decision; navigate: (path: string) => void; live?: boolean }) {
  return (
    <Card className="decision-card">
      <CardContent className="decision-content">
        <div className="decision-head">
          <h3>{decision.title}</h3>
          <div className="confidence-block">
            <Badge variant="outline" className="confidence-tag">{decision.confidence}</Badge>
            <span>Confidence</span>
          </div>
        </div>
        <div className="decision-footer">
          <span>Evidence</span>
          <div className="evidence-links">
            {decision.evidence.map((item, index) => (
              <span key={item}>
                {index > 0 && <span aria-hidden="true">,&nbsp;</span>}
                <a href={`/evidence#${item}`} onClick={(event) => { event.preventDefault(); navigate(`/evidence#${item}`); }}>{item}</a>
              </span>
            ))}
          </div>
          <MoreMenu label={`More options for ${decision.title}`} disabled={live} />
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyMapState({ navigate }: { navigate: (path: string) => void }) {
  return (
    <Card className="mt-4 border-dashed border-[var(--border-strong)] bg-card shadow-xs">
      <CardContent className="flex min-h-[520px] flex-col items-center justify-center px-6 py-16 text-center">
        <div className="mb-5 grid size-14 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] text-[var(--workbench-accent)] shadow-none">
          <MapIcon aria-hidden="true" className="size-6" />
        </div>
        <Badge variant="outline" className="mb-3 border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] text-[var(--text-muted)]">
          Empty discovery map
        </Badge>
        <h1 className="max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-[var(--text)] sm:text-[28px]">
          Turn a vague idea into a build-or-kill decision map
        </h1>
        <p className="mt-3 max-w-[560px] text-sm leading-6 text-[var(--text-muted)]">
          Start a focused discovery session with Wayfinder. It asks concrete questions, stages a Destination and candidate tickets, then waits for You to review.
        </p>
        <Separator className="mt-6 max-w-[360px]" />
        <Button size="lg" className="mt-6 h-11 bg-[var(--workbench-accent)] px-6 hover:bg-[var(--workbench-accent-hover)] max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:whitespace-normal max-sm:px-3 max-sm:py-2 max-sm:text-xs max-sm:leading-5" onClick={() => void startNewDiscovery(navigate)}>
          <MessageSquareText aria-hidden="true" /> Start a discovery session with Wayfinder
        </Button>
        <Button asChild variant="link" size="sm" className="mt-2 h-auto px-2 text-[var(--text-muted)] hover:text-[var(--workbench-accent)]">
          <a href="/map?demo=1" onClick={(event) => { event.preventDefault(); navigate('/map?demo=1'); }}>
            View demo map
          </a>
        </Button>
      </CardContent>
    </Card>
  );
}

function DiscoveryIntake({
  navigate,
  onCreateMap,
}: {
  navigate: (path: string) => void;
  onCreateMap: (discovery: ApiDiscovery) => void;
}) {
  const [emergingOpen, setEmergingOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [discovery, setDiscovery] = useState<ApiDiscovery | null>(null);
  const [message, setMessage] = useState('');
  const [streamedReply, setStreamedReply] = useState('');
  const [working, setWorking] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [error, setError] = useState<IntakeError | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function loadDiscovery() {
      setInitializing(true);
      setError(null);
      try {
        const storedId = window.sessionStorage.getItem('ten-brains-live-discovery');
        let response = storedId ? await fetch(`/api/discoveries/${storedId}`) : null;
        if (!response?.ok) {
          response = await fetch('/api/discoveries', { method: 'POST' });
        }
        if (!response.ok) throw new Error('Discovery could not start');
        const loaded: ApiDiscovery = await response.json();
        window.sessionStorage.setItem('ten-brains-live-discovery', loaded.id);
        if (!cancelled) {
          setDiscovery(loaded);
          setError(null);
        }
      } catch {
        if (!cancelled) setError({ kind: 'load', message: 'The discovery API is not available. Start it, then retry.' });
      } finally {
        if (!cancelled) setInitializing(false);
      }
    }
    loadDiscovery();
    return () => { cancelled = true; };
  }, [loadAttempt]);

  async function sendMessage(textOverride?: string) {
    const text = (textOverride ?? message).trim();
    if (!text || !discovery || working) return;
    setError(null);
    setWorking(true);
    setStreamedReply('');
    const optimistic = {
      id: 'local-pending-turn',
      actor: 'You' as const,
      text,
      createdAt: new Date().toISOString(),
    };
    setDiscovery((current) => current ? {
      ...current,
      transcripts: {
        intake: [
          ...current.transcripts.intake.filter((entry) => entry.id !== optimistic.id),
          optimistic,
        ],
      },
    } : current);

    try {
      const response = await fetch(`/api/discoveries/${discovery.id}/intake/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
      });
      if (!response.ok || !response.body) throw new Error('Turn failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let reply = '';

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const event = block.match(/^event: (.+)$/m)?.[1];
          const dataLine = block.match(/^data: (.+)$/m)?.[1];
          if (!event || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (event === 'token') {
            reply += data.text;
            setStreamedReply(reply);
          } else if (event === 'candidate') {
            setDiscovery((current) => current ? {
              ...current,
              staged: [...current.staged.filter((item) => item.id !== data.id), data as ApiCandidate],
            } : current);
          } else if (event === 'error') {
            throw new Error(data.message);
          }
        }
        if (done) break;
      }

      const refreshed = await fetch(`/api/discoveries/${discovery.id}`);
      if (!refreshed.ok) throw new Error('Discovery refresh failed');
      setDiscovery(await refreshed.json());
      setStreamedReply('');
      setMessage((current) => current.trim() === text ? '' : current);
    } catch {
      const refreshed = await fetch(`/api/discoveries/${discovery.id}`).catch(() => null);
      if (refreshed?.ok) setDiscovery(await refreshed.json());
      setStreamedReply('');
      setMessage(text);
      setWorking(false);
      setError({ kind: 'turn', message: 'Wayfinder could not complete this turn. Your message is ready to retry.' });
    } finally {
      setWorking(false);
    }
  }

  async function approveCandidates(candidateIds: string[]) {
    if (!discovery) return;
    setApproving(true);
    setApprovalError('');
    try {
      const response = await fetch(`/api/discoveries/${discovery.id}/intake/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateIds }),
      });
      if (!response.ok) throw new Error('Approval failed');
      const updated: ApiDiscovery = await response.json();
      setDiscovery(updated);
      onCreateMap(updated);
    } catch {
      setApprovalError('Wayfinder could not apply the selected items. Review the selection, then retry.');
    } finally {
      setApproving(false);
    }
  }

  const messages: IntakeMessage[] = (discovery?.transcripts.intake ?? []).map((entry) => ({
    id: entry.id,
    actor: entry.actor,
    text: entry.text,
    time: new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  }));
  if (streamedReply) messages.push({ actor: 'Wayfinder', text: streamedReply, time: 'Now' });
  const staged = discovery?.staged ?? [];

  return (
    <div className="app-shell intake-shell">
      <SideNav active="intake" navigate={navigate} />
      <main className="main-surface flex min-h-screen flex-col px-[22px] pb-24 pt-4 max-md:px-3 max-md:pb-32">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>Discovery session</strong>
            <Badge variant="outline" className="status-badge active">
              <Circle aria-hidden="true" className="status-icon" /> Staging map
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate('/discoveries/new/map')}>Session map</Button>
            <Button variant="outline" size="sm" className="xl:hidden" onClick={() => setEmergingOpen(true)}>
              <PanelRightOpen aria-hidden="true" /> Staged map
            </Button>
            <Button variant="outline" size="sm" onClick={() => navigate('/map?demo=1')}>View demo map</Button>
          </div>
        </header>

        <section className="mt-3 grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="flex h-[calc(100vh-112px)] min-h-[640px] flex-col overflow-hidden border-border bg-card shadow-xs max-md:h-[calc(100dvh-176px)] max-md:min-h-[560px]">
            <CardHeader className="flex min-h-14 flex-row items-center justify-between border-b border-border px-4 py-0">
              <div>
                <CardTitle className="text-sm font-semibold tracking-[-0.01em]">Discovery session with Wayfinder</CardTitle>
                <p className="mt-1 text-xs text-muted-foreground">Two actors · You approve staged changes</p>
              </div>
              <Badge
                variant="secondary"
                className={`gap-1.5 text-xs ${error ? 'bg-[var(--danger-soft)] text-[var(--danger)]' : 'bg-[var(--workbench-accent-soft)] text-[var(--workbench-accent)]'}`}
                role="status"
                aria-live="polite"
              >
                {error ? <AlertCircle aria-hidden="true" className="size-3" /> : working || initializing ? <LoaderCircle aria-hidden="true" className="size-3 animate-spin" /> : <Sparkles aria-hidden="true" className="size-3" />}
                {error ? 'Retry needed' : working ? 'Wayfinder is working' : initializing ? 'Starting discovery' : 'Wayfinder is ready'}
              </Badge>
            </CardHeader>
            <CardContent className="flex min-h-0 flex-1 flex-col p-0">
              <IntakeTranscriptView messages={messages} working={working} />
              <Separator />
              <div className="fixed inset-x-0 bottom-0 z-30 bg-[var(--canvas)] p-3 md:static md:bg-transparent">
                <div className="intake-composer-shell mx-auto grid max-w-[800px] grid-cols-[1fr_auto] items-center gap-2 border border-[var(--border-strong)] bg-[var(--surface)] p-2.5 focus-within:border-[var(--ring)] focus-within:ring-2 focus-within:ring-[var(--workbench-accent-soft)]">
                  <Input
                    aria-label="Reply to Wayfinder"
                    placeholder="Reply with a concrete example, constraint, or contradiction."
                    className="border-0 bg-transparent shadow-none focus-visible:ring-0"
                    value={message}
                    disabled={!discovery || working}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      if (error?.kind === 'turn') setError(null);
                    }}
                    onKeyDown={(event) => { if (event.key === 'Enter') sendMessage(); }}
                  />
                  <Button className="h-10 bg-[var(--workbench-accent)] hover:bg-[var(--workbench-accent-hover)]" type="button" disabled={!discovery || working || !message.trim()} onClick={() => sendMessage()}>
                    {working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <SendHorizontal aria-hidden="true" />} {working ? 'Working' : 'Send'}
                  </Button>
                </div>
                {error && (
                  <IntakeErrorState
                    error={error}
                    onRetry={() => error.kind === 'load' ? setLoadAttempt((attempt) => attempt + 1) : sendMessage(message)}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <div className="hidden xl:block">
            <EmergingMapPanel candidates={staged} onReview={() => setReviewOpen(true)} />
          </div>
        </section>
      </main>

      <Sheet open={emergingOpen} onOpenChange={setEmergingOpen}>
        <SheetContent side="right" className="w-[min(430px,92vw)] max-w-none overflow-y-auto bg-[var(--canvas)] p-0 sm:max-w-none">
          <SheetHeader className="border-b border-border pr-12">
            <SheetTitle>Staged map</SheetTitle>
            <SheetDescription>Staged candidates from the discovery session.</SheetDescription>
          </SheetHeader>
          <div className="p-3">
            <EmergingMapPanel candidates={staged} onReview={() => { setEmergingOpen(false); setReviewOpen(true); }} drawer />
          </div>
        </SheetContent>
      </Sheet>

      <ReviewMapDialog
        candidates={staged}
        open={reviewOpen}
        onOpenChange={(open) => {
          setReviewOpen(open);
          if (open) setApprovalError('');
        }}
        onApprove={approveCandidates}
        approving={approving}
        error={approvalError}
      />
    </div>
  );
}

function IntakeErrorState({ error, onRetry }: { error: IntakeError; onRetry: () => void }) {
  return (
    <div className="intake-error-state mx-auto mt-2 flex max-w-[800px] items-center gap-3 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-2.5" role="alert">
      <AlertCircle aria-hidden="true" className="size-4 shrink-0 text-[var(--danger)]" />
      <p className="min-w-0 flex-1 text-xs leading-5 text-[var(--text-secondary)]">{error.message}</p>
      <Button variant="outline" size="sm" className="shrink-0 border-[var(--danger-border)] bg-[var(--surface)]" onClick={onRetry}>
        <RotateCcw aria-hidden="true" /> {error.kind === 'load' ? 'Retry connection' : 'Retry turn'}
      </Button>
    </div>
  );
}

function IntakeTranscriptView({ messages, working }: { messages: IntakeMessage[]; working: boolean }) {
  const transcriptRef = useRef<HTMLDivElement>(null);
  const lastMessageText = messages.at(-1)?.text ?? '';

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const viewport = transcriptRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
      if (viewport) viewport.scrollTop = viewport.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastMessageText, messages.length, working]);

  return (
    <ScrollArea ref={transcriptRef} className="min-h-0 flex-1" aria-label="Discovery session transcript">
      <div role="log" aria-label="Messages between You and Wayfinder" aria-busy={working} aria-live="polite" className="mx-auto max-w-[800px] space-y-5 px-5 py-5 pb-28 md:pb-6">
        {messages.map((message, index) => (
          <IntakeMessageRow key={message.id ?? `${message.time}-${index}`} message={message} index={index} />
        ))}
        {working && <WayfinderWorkingIndicator />}
      </div>
    </ScrollArea>
  );
}

function IntakeMessageRow({ message, index }: { message: IntakeMessage; index: number }) {
  const isWayfinder = message.actor === 'Wayfinder';
  const messageContent = (
    <div className="p-3">
      <div className={`mb-1.5 flex items-center gap-2 text-xs ${isWayfinder ? '' : 'justify-end'}`}>
        <span className={`font-semibold ${isWayfinder ? 'text-[var(--workbench-accent)]' : 'text-[var(--text)]'}`}>{message.actor}</span>
        <time className="tabular-nums text-muted-foreground">{message.time}</time>
        <Badge variant="outline" className="h-5 rounded-md px-1.5 text-[10px] font-medium text-muted-foreground">
          turn {index + 1}
        </Badge>
      </div>
      <p className="text-[13px] leading-[1.7] text-[var(--text-secondary)]">{message.text}</p>
      {message.note && (
        <Badge variant="secondary" className="mt-2 rounded-md bg-[var(--workbench-accent-soft)] text-[10px] font-medium text-[var(--workbench-accent)]">
          {message.note}
        </Badge>
      )}
    </div>
  );

  return (
    <article className={`flex ${isWayfinder ? 'justify-start' : 'justify-end'}`}>
      {isWayfinder ? (
        <div className="w-full max-w-[760px] border-b border-[var(--border-subtle)] pb-3">{messageContent}</div>
      ) : (
        <Card className="max-w-[62%] gap-0 rounded-xl border-[var(--border-subtle)] bg-[var(--surface-hover)] py-0 shadow-none max-sm:max-w-[85%]">
          {messageContent}
        </Card>
      )}
    </article>
  );
}

function WayfinderWorkingIndicator() {
  return (
    <article role="status" aria-live="polite" className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground" aria-label="Wayfinder is working">
      <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin text-[var(--workbench-accent)]" />
      <span className="font-semibold text-[var(--workbench-accent)]">Wayfinder is working</span>
      <span className="flex items-center gap-1" aria-hidden="true">
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--workbench-accent)]" />
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--workbench-accent)] [animation-delay:140ms]" />
        <span className="size-1.5 animate-pulse rounded-full bg-[var(--workbench-accent)] [animation-delay:280ms]" />
      </span>
      <span>Reviewing your message</span>
    </article>
  );
}

function EmergingMapPanel({ candidates, onReview, drawer }: { candidates: ApiCandidate[]; onReview: () => void; drawer?: boolean }) {
  const destinations = candidates.filter((candidate): candidate is Extract<ApiCandidate, { type: 'destination-draft' }> => candidate.type === 'destination-draft');
  const tickets = candidates.filter((candidate): candidate is Extract<ApiCandidate, { type: 'ticket' }> => candidate.type === 'ticket');
  const fog = candidates.filter((candidate): candidate is Extract<ApiCandidate, { type: 'fog-question' }> => candidate.type === 'fog-question');
  const decisions = candidates.filter((candidate): candidate is Extract<ApiCandidate, { type: 'closed-decision' }> => candidate.type === 'closed-decision');
  return (
    <Card className={`${drawer ? '' : 'sticky top-4 max-h-[calc(100vh-112px)] overflow-y-auto'} border-dashed border-[var(--border-strong)] bg-[var(--surface-subtle)] shadow-xs`}>
      <CardHeader className="border-b border-border px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold tracking-[-0.01em]">Staged map</CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Wayfinder stages candidates here. You approve items before Wayfinder adds them.</p>
          </div>
          <Badge variant="outline" className="shrink-0 border-dashed border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]">Staged only</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4 p-4">
        {destinations.map((destination) => <StagedDestinationCard key={destination.id} destination={destination} />)}
        {candidates.length === 0 && (
          <div className="rounded-lg border border-dashed border-[var(--border-strong)] px-3 py-5 text-center">
            <p className="text-sm font-medium text-[var(--text-secondary)]">No staged candidates</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Wayfinder stages candidates after You add concrete context.</p>
          </div>
        )}

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-[0.03em] text-[var(--workbench-accent)]">Candidate Open Frontier</h2>
            <Badge variant="secondary" className="h-5 text-[10px]">{tickets.length} staged</Badge>
          </div>
          {tickets.map((ticket) => (
            <StagedFrontierCard key={ticket.id} ticket={ticket} />
          ))}
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold tracking-[0.03em] text-[var(--warning)]">Candidate Fog of War</h2>
            <Badge variant="secondary" className="h-5 text-[10px]">{fog.length} staged</Badge>
          </div>
          {fog.map((item) => (
            <StagedFogCard key={item.id} question={item.question} stagedAfter={item.stagedAfter} />
          ))}
        </section>

        {decisions.length > 0 && (
          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold tracking-[0.03em] text-[var(--success)]">Candidate Closed Decisions</h2>
              <Badge variant="secondary" className="h-5 text-[10px]">{decisions.length} staged</Badge>
            </div>
            {decisions.map((decision) => <StagedDecisionCard key={decision.id} decision={decision} />)}
          </section>
        )}

        <Button className="w-full bg-[var(--workbench-accent)] hover:bg-[var(--workbench-accent-hover)]" onClick={onReview} disabled={candidates.length === 0}>
          <ClipboardCheck aria-hidden="true" /> Review and create map
        </Button>
      </CardContent>
    </Card>
  );
}

function StagedDestinationCard({ destination }: { destination: Extract<ApiCandidate, { type: 'destination-draft' }> }) {
  return (
    <section className="staged-candidate-enter rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.07em] text-muted-foreground">
        <Target aria-hidden="true" className="size-4" /> Destination draft
      </div>
      <p className="text-sm font-medium leading-6 text-[var(--text)]">{destination.title}</p>
      <Badge variant="outline" className="mt-3 h-5 rounded-md border-dashed text-[10px]">Candidate · {destination.stagedAfter}</Badge>
    </section>
  );
}

function StagedFrontierCard({ ticket }: { ticket: StagedFrontierTicket | Extract<ApiCandidate, { type: 'ticket' }> }) {
  const ticketType = 'ticketType' in ticket ? ticket.ticketType : ticket.type;
  return (
    <Card className="staged-candidate-enter border-dashed border-[var(--workbench-accent-border)] bg-[var(--workbench-accent-soft)] shadow-none">
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <PlusCircle aria-hidden="true" className="size-4 text-[var(--workbench-accent)]" />
          <Badge variant="outline" className="h-5 rounded-md border-dashed border-[var(--workbench-accent-border)] bg-[var(--surface)] text-[10px] text-[var(--workbench-accent)]">Candidate ticket</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">{ticket.stagedAfter}</span>
        </div>
        <h3 className="text-sm font-semibold leading-5 text-[var(--text)]">{ticket.title}</h3>
        <div className="mt-2 grid grid-cols-[74px_1fr] gap-y-1 text-[11px] text-muted-foreground">
          <span>Type</span><span>{ticketType}</span>
          <span>Mode</span><span>{ticket.mode}</span>
          <span>Evidence target</span><span>{ticket.target}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function StagedFogCard({ question, stagedAfter }: { question: string; stagedAfter: string }) {
  return (
    <Card className="staged-candidate-enter border-dashed border-[var(--warning-border)] bg-[var(--warning-soft)] shadow-none">
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <HelpCircle aria-hidden="true" className="size-4 text-[var(--warning)]" />
          <Badge variant="outline" className="h-5 rounded-md border-dashed border-[var(--warning-border)] bg-[var(--surface)] text-[10px] text-[var(--warning)]">Candidate fog question</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">{stagedAfter}</span>
        </div>
        <p className="text-sm font-medium leading-5 text-[var(--text)]">{question}</p>
      </CardContent>
    </Card>
  );
}

function StagedDecisionCard({ decision }: { decision: Extract<ApiCandidate, { type: 'closed-decision' }> }) {
  return (
    <Card className="staged-candidate-enter border-dashed border-[var(--success-border)] bg-[var(--success-soft)] shadow-none">
      <CardContent className="p-3">
        <div className="mb-2 flex items-center gap-2">
          <CheckCircle2 aria-hidden="true" className="size-4 text-[var(--success)]" />
          <Badge variant="outline" className="h-5 rounded-md border-dashed border-[var(--success-border)] bg-[var(--surface)] text-[10px] text-[var(--success)]">Candidate Closed Decision</Badge>
          <span className="ml-auto text-[10px] text-muted-foreground">{decision.stagedAfter}</span>
        </div>
        <p className="text-sm font-medium leading-5 text-[var(--text)]">{decision.title}</p>
      </CardContent>
    </Card>
  );
}

function ReviewMapDialog({
  candidates,
  open,
  onOpenChange,
  onApprove,
  approving = false,
  error = '',
  context = 'intake',
}: {
  candidates: ApiCandidate[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApprove: (candidateIds: string[]) => Promise<void>;
  approving?: boolean;
  error?: string;
  context?: 'intake' | 'session';
}) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setSelectedIds(new Set(candidates.map((candidate) => candidate.id)));
  }, [open, candidates]);

  function setSelected(id: string, selected: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (selected) next.add(id); else next.delete(id);
      return next;
    });
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!approving) onOpenChange(nextOpen); }}>
      <DialogContent className="grid max-h-[92dvh] w-[calc(100%-24px)] grid-rows-[auto_minmax(0,1fr)_auto] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-5 py-4 text-left">
          <div className="mb-1 flex items-center gap-2">
            <Badge variant="outline" className="border-dashed border-[var(--warning-border)] bg-[var(--warning-soft)] text-[var(--warning)]">Approval required</Badge>
          </div>
          <DialogTitle>Review staged map</DialogTitle>
          <DialogDescription>{context === 'session' ? 'Select staged updates before Wayfinder applies them to the map.' : 'Select staged items before Wayfinder creates the map.'}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="min-h-0">
          <div className="space-y-3 p-5">
            {candidates.map((candidate) => {
              const label = candidate.type === 'fog-question' ? candidate.question : candidate.title;
              const helper = candidate.type === 'ticket'
                ? `${candidate.ticketType} · ${candidate.mode} · ${candidate.target}`
                : candidate.type === 'fog-question'
                  ? 'Fog of War · candidate fog question'
                  : candidate.type === 'closed-decision'
                    ? `Closed Decision · ${candidate.confidence ?? 'Medium'} confidence`
                    : 'Destination draft';
              return (
                <ReviewCheckbox
                  key={candidate.id}
                  label={label}
                  helper={helper}
                  checked={selectedIds.has(candidate.id)}
                  disabled={approving}
                  onCheckedChange={(checked) => setSelected(candidate.id, checked)}
                />
              );
            })}
            {error && (
              <div className="flex items-start gap-2 rounded-lg border border-[var(--danger-border)] bg-[var(--danger-soft)] p-3 text-xs leading-5 text-[var(--text-secondary)]" role="alert">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
                <span>{error}</span>
              </div>
            )}
            <div className="rounded-lg border border-[var(--success-border)] bg-[var(--success-soft)] p-3 text-sm leading-6 text-[var(--text)]">
              {context === 'session' ? 'Wayfinder will apply only the selected updates. Future changes still require explicit review.' : 'Wayfinder will create the map only with the selected staged items. Future changes still require explicit review.'}
            </div>
          </div>
        </ScrollArea>
        <DialogFooter className="mx-0 mb-0 border-t border-border bg-[var(--surface-subtle)] px-5 py-3 sm:justify-between">
          <Button variant="outline" disabled={approving} onClick={() => onOpenChange(false)}>Continue grilling</Button>
          <Button className="bg-[var(--workbench-accent)] hover:bg-[var(--workbench-accent-hover)]" disabled={approving || selectedIds.size === 0} onClick={() => void onApprove([...selectedIds])}>
            {approving ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : null}
            {approving ? (context === 'session' ? 'Applying updates' : 'Creating map') : (context === 'session' ? 'Approve map updates' : 'Approve and create map')}
            {!approving && <ArrowRight aria-hidden="true" />}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewCheckbox({ label, helper, checked, disabled, onCheckedChange }: { label: string; helper?: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <label className={`flex gap-3 rounded-lg border border-dashed border-[var(--border-strong)] bg-[var(--surface)] p-3 text-sm leading-5 transition-colors hover:bg-[var(--surface-subtle)] ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}>
      <Checkbox checked={checked} disabled={disabled} onCheckedChange={(value) => onCheckedChange(value === true)} className="mt-0.5" aria-label={label} />
      <span>
        <span className="block font-medium text-[var(--text)]">{label}</span>
        {helper && <span className="mt-1 block text-xs text-muted-foreground">{helper}</span>}
      </span>
    </label>
  );
}

function DiscoveriesList({ navigate }: { navigate: (path: string) => void }) {
  const [discoveries, setDiscoveries] = useState<DiscoverySummary[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  useEffect(() => {
    fetch('/api/discoveries')
      .then((response) => { if (!response.ok) throw new Error('Load failed'); return response.json(); })
      .then((items: DiscoverySummary[]) => { setDiscoveries(items); setStatus('ready'); })
      .catch(() => setStatus('error'));
  }, []);
  const rows = [
    ...discoveries.map((discovery) => ({
      id: discovery.id,
      name: discovery.name,
      status: discovery.status,
      clarity: `${discovery.clarity}%`,
      counts: `${discovery.counts.open} Open Frontier / ${discovery.counts.fog} Fog of War / ${discovery.counts.closed} Closed Decisions`,
      lastActivity: new Date(discovery.updatedAt).toLocaleString(),
      demo: false,
    })),
    {
      id: 'demo', name: 'AI onboarding assistant · Demo', status: 'Demo', clarity: '62%',
      counts: '4 Open Frontier / 3 Fog of War / 8 Closed Decisions', lastActivity: 'Scripted demo map', demo: true,
    },
  ];

  return (
    <div className="app-shell">
      <SideNav active="discoveries" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>All maps</strong>
          </div>
          <Button className="bg-[var(--workbench-accent)] hover:bg-[var(--workbench-accent-hover)]" onClick={() => void startNewDiscovery(navigate)}>
            <Plus aria-hidden="true" /> New discovery
          </Button>
        </header>

        <section className="workspace-collection discoveries-collection">
          <div className="workspace-intro">
            <p className="eyebrow">Discoveries</p>
            <h1 className="mt-2 text-[22px] font-medium tracking-[-0.03em] text-[var(--text)]">Decision maps</h1>
            <p className="mt-2 max-w-[620px] text-[13px] leading-[1.7] text-muted-foreground">
              Open an existing map or return to the empty discovery that starts with a Wayfinder session.
            </p>
          </div>

          <div className="workspace-list discoveries-list">
            <div className="discoveries-list-head" aria-hidden="true">
              <span>Name</span>
              <span>Status</span>
              <span>Clarity</span>
              <span>Counts</span>
              <span>Last activity</span>
            </div>
            {status === 'loading' && <p className="p-4 text-sm text-muted-foreground" role="status">Loading discoveries.</p>}
            {status === 'error' && <p className="p-4 text-sm text-destructive" role="alert">Discoveries could not load. Try again.</p>}
            {status === 'ready' && discoveries.length === 0 && <p className="p-4 text-sm text-muted-foreground">No live discoveries yet.</p>}
            {rows.map((discovery) => (
              <button
                key={discovery.id}
                type="button"
                className="discoveries-row"
                onClick={() => discovery.demo ? navigate('/map?demo=1') : openLiveDiscovery(discovery.id, navigate)}
              >
                <span className="discoveries-title">{discovery.name}</span>
                <Badge variant="outline" className={`discoveries-status ${discovery.status === 'Active' ? 'is-active' : 'is-empty'}`}>
                  {discovery.status}
                </Badge>
                <span className="discoveries-clarity" data-label="Clarity">{discovery.clarity}</span>
                <span className="discoveries-meta" data-label="Counts">{discovery.counts}</span>
                <span className="discoveries-meta" data-label="Last activity">{discovery.lastActivity}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function EvidenceView({ navigate }: { navigate: (path: string) => void }) {
  const initialId = decodeURIComponent(window.location.hash.replace('#', ''));
  const [selectedId, setSelectedId] = useState(() => evidenceRecords.some((item) => item.id === initialId) ? initialId : evidenceRecords[0]?.id);

  function selectEvidence(id: string) {
    setSelectedId((current) => current === id ? '' : id);
    window.history.replaceState({}, '', `/evidence#${id}`);
  }

  return (
    <div className="app-shell">
      <SideNav active="evidence" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>Evidence</strong>
          </div>
          <Badge variant="outline" className="border-[var(--border-subtle)] text-muted-foreground">{evidenceRecords.length} evidence items</Badge>
        </header>

        <section className="workspace-collection evidence-collection">
          <div className="workspace-intro">
            <p className="eyebrow">Evidence ledger</p>
            <h1 className="mt-2 text-[22px] font-medium tracking-[-0.03em] text-[var(--text)]">Evidence cited by Closed Decisions</h1>
            <p className="mt-2 max-w-[680px] text-[13px] leading-[1.7] text-muted-foreground">
              Evidence from sessions and competitive research. Select a row to inspect the quote or context behind the claim.
            </p>
          </div>

          <div className="workspace-list evidence-list">
            {evidenceRecords.map((item) => {
              const expanded = selectedId === item.id;
              return (
                <div key={item.id} id={item.id} className={`evidence-row-shell ${expanded ? 'is-expanded' : ''}`}>
                  <button
                    type="button"
                    className="evidence-row"
                    aria-expanded={expanded}
                    onClick={() => selectEvidence(item.id)}
                  >
                    <span className="evidence-row-copy">
                      <span className="evidence-title">{item.claim}</span>
                      <span className="evidence-metadata">
                        <span className="evidence-id">{item.id}</span>
                        <span>{item.source}</span>
                        <span>{item.capturedDate}</span>
                        <span>Cited by {item.citedBy.join(', ')}</span>
                      </span>
                    </span>
                    <ChevronDown aria-hidden="true" className="evidence-chevron" />
                  </button>
                  {expanded && (
                    <div className="evidence-detail-wrap">
                      <div className="evidence-detail">
                        <span className="evidence-detail-label">Context</span>
                        <pre>{item.detail}</pre>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}

function liveSessionIdFromPath() {
  const match = window.location.pathname.match(/^\/sessions\/([^/]+)(?:\/map)?$/);
  return match && match[1] !== 'grilling' ? match[1] : null;
}

function sessionMapData(session: ApiSession): SessionMapData {
  const evidenceIds = session.evidence.map((item) => item.id);
  return {
    meta: {
      title: session.title,
      objective: session.objective,
      evidenceTarget: session.evidenceTarget,
      progress: `${session.evidence.length} evidence captured`,
      mode: session.mode,
    },
    transcript: session.transcript.map((turn) => ({
      id: turn.id,
      time: new Date(turn.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      actor: turn.actor,
      text: turn.text,
      evidenceFlag: session.evidence.some((item) => item.sourceTurn === turn.id) ? 'Evidence' : undefined,
    })),
    evidenceCaptured: session.evidence.map((item) => ({ id: item.id, text: item.text, sourceTurnId: String(item.sourceTurn) })),
    candidateUpdates: session.staged.map((candidate) => ({
      id: candidate.id,
      type: candidate.type === 'ticket' ? 'open-frontier-ticket' : candidate.type,
      title: candidate.type === 'fog-question' ? candidate.question : candidate.title,
      sourceTurnIndex: Math.min(
        Math.max(0, session.transcript.length - 1),
        Math.max(0, Number(candidate.stagedAfter.match(/\d+/)?.[0] ?? session.transcript.length) - 1),
      ),
      evidenceIds: candidate.type === 'closed-decision' ? [...new Set([...(candidate.evidence ?? []), ...evidenceIds])] : evidenceIds,
    })),
    outcome: {
      stagedCount: session.staged.length,
      reviewState: session.staged.length ? 'Awaiting review' : 'No staged updates',
    },
  };
}

function SessionMapView({ navigate }: { navigate: (path: string) => void }) {
  const sessionId = liveSessionIdFromPath();
  return sessionId ? <LiveSessionMapView navigate={navigate} sessionId={sessionId} /> : <DemoSessionMapView navigate={navigate} />;
}

function LiveSessionMapView({ navigate, sessionId }: { navigate: (path: string) => void; sessionId: string }) {
  const [session, setSession] = useState<ApiSession | null>(null);
  const [status, setStatus] = useState<LiveDiscoveryStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const sessionMapScrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const discoveryId = window.sessionStorage.getItem('ten-brains-live-discovery');
    setStatus('loading');
    if (!discoveryId) { setStatus('error'); return; }
    fetch(`/api/discoveries/${discoveryId}`)
      .then((response) => {
        if (!response.ok) throw new Error('Session map could not load');
        return response.json();
      })
      .then((discovery: ApiDiscovery | null) => {
        const found = discovery?.sessions.find((item): item is ApiSession => item.id === sessionId && item.type === 'grilling');
        if (!found) throw new Error('Session map could not load');
        setSession(found);
        setStatus('ready');
      })
      .catch(() => setStatus('error'));
  }, [sessionId, attempt]);

  useEffect(() => {
    if (status !== 'ready') return;
    const container = sessionMapScrollRef.current;
    if (!container) return;
    const centerSessionPath = () => {
      const svg = container.querySelector<SVGSVGElement>('.session-map-svg');
      const viewBoxWidth = svg?.viewBox.baseVal.width;
      const pathCenter = Number(svg?.dataset.centerX);
      const renderedPathCenter = svg && viewBoxWidth && Number.isFinite(pathCenter)
        ? (pathCenter / viewBoxWidth) * svg.getBoundingClientRect().width
        : container.scrollWidth / 2;
      container.scrollLeft = Math.max(0, renderedPathCenter - container.clientWidth / 2);
    };
    centerSessionPath();
    const resizeObserver = new ResizeObserver(centerSessionPath);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [status, session]);
  return (
    <div className="app-shell live-session-map-shell">
      <SideNav active="session" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <a href={`/sessions/${sessionId}`} onClick={(event) => { event.preventDefault(); navigate(`/sessions/${sessionId}`); }}>Session</a>
            <span aria-hidden="true" className="breadcrumb-slash">/</span><strong>Session map</strong>
          </div>
          <Button variant="outline" size="lg" className="session-map-action" onClick={() => navigate(`/sessions/${sessionId}`)}>Back to session</Button>
        </header>
        <section className="workspace-collection session-map-collection">
          <div className="workspace-intro"><p className="eyebrow">{session?.title ?? 'Grilling session'}</p><h1>Session map</h1><p>{session?.objective ?? 'Loading session map.'}</p></div>
          {status === 'loading' && <div className="session-map-state" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" /><span>Loading the live session map.</span></div>}
          {status === 'error' && <div className="session-map-state is-error" role="alert"><AlertCircle aria-hidden="true" /><span>The live session map could not load.</span><Button size="sm" onClick={() => setAttempt((current) => current + 1)}><RotateCcw aria-hidden="true" /> Retry</Button></div>}
          {session && status === 'ready' && <div ref={sessionMapScrollRef} className="session-map-scroll live-session-map-scroll" role="region" aria-label={`${session.title} session map`} tabIndex={0}><SessionMap data={sessionMapData(session)} /></div>}
        </section>
      </main>
    </div>
  );
}

function DemoSessionMapView({ navigate }: { navigate: (path: string) => void }) {
  const sessionMapScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = sessionMapScrollRef.current;
    if (!container) return;

    const centerSessionPath = () => {
      const svg = container.querySelector<SVGSVGElement>('.session-map-svg');
      const viewBoxWidth = svg?.viewBox.baseVal.width;
      const pathCenter = Number(svg?.dataset.centerX);
      const renderedPathCenter = svg && viewBoxWidth && Number.isFinite(pathCenter)
        ? (pathCenter / viewBoxWidth) * svg.getBoundingClientRect().width
        : container.scrollWidth / 2;
      container.scrollLeft = Math.max(0, renderedPathCenter - container.clientWidth / 2);
    };

    centerSessionPath();
    const resizeObserver = new ResizeObserver(centerSessionPath);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <SideNav active="session" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <a href="/sessions/grilling" onClick={(event) => { event.preventDefault(); navigate('/sessions/grilling'); }}>Sessions</a>
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>Session map</strong>
          </div>
          <Button variant="outline" size="lg" className="session-map-action" onClick={() => navigate('/sessions/grilling')}>Back to session</Button>
        </header>

        <section className="workspace-collection session-map-collection">
          <div className="workspace-intro">
            <p className="eyebrow">Clarify setup anxiety</p>
            <h1>Session map</h1>
            <p>Clarify setup anxiety session.</p>
          </div>
          <div
            ref={sessionMapScrollRef}
            className="session-map-scroll"
            role="region"
            aria-label="Clarify setup anxiety Session map"
            tabIndex={0}
          >
            <SessionMap data={grillingSessionMap} />
          </div>
        </section>
      </main>
    </div>
  );
}

function IntakeSessionMapView({ navigate }: { navigate: (path: string) => void }) {
  const sessionMapScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = sessionMapScrollRef.current;
    if (!container) return;

    const centerSessionPath = () => {
      const svg = container.querySelector<SVGSVGElement>('.session-map-svg');
      const viewBoxWidth = svg?.viewBox.baseVal.width;
      const pathCenter = Number(svg?.dataset.centerX);
      const renderedPathCenter = svg && viewBoxWidth && Number.isFinite(pathCenter)
        ? (pathCenter / viewBoxWidth) * svg.getBoundingClientRect().width
        : container.scrollWidth / 2;
      container.scrollLeft = Math.max(0, renderedPathCenter - container.clientWidth / 2);
    };

    centerSessionPath();
    const resizeObserver = new ResizeObserver(centerSessionPath);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <SideNav active="intake" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <a href="/discoveries/new" onClick={(event) => { event.preventDefault(); navigate('/discoveries/new'); }}>Discovery session</a>
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>Session map</strong>
          </div>
          <Button variant="outline" size="lg" className="session-map-action" onClick={() => navigate('/discoveries/new')}>Back to session</Button>
        </header>

        <section className="workspace-collection session-map-collection">
          <div className="workspace-intro">
            <p className="eyebrow">Discovery session</p>
            <h1>Session map</h1>
            <p>Discovery session.</p>
          </div>
          <div
            ref={sessionMapScrollRef}
            className="session-map-scroll"
            role="region"
            aria-label="Discovery session map"
            tabIndex={0}
          >
            <SessionMap data={intakeSessionMap} />
          </div>
        </section>
      </main>
    </div>
  );
}

function HowItWorksView({ navigate }: { navigate: (path: string) => void }) {
  const flowchartScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = flowchartScrollRef.current;
    if (!container) return;

    const centerActionPath = () => {
      container.scrollLeft = Math.max(0, (container.scrollWidth - container.clientWidth) / 2);
    };

    centerActionPath();
    const resizeObserver = new ResizeObserver(centerActionPath);
    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <div className="app-shell">
      <SideNav active="how-it-works" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>How it works</strong>
          </div>
        </header>

        <section className="workspace-collection how-it-works-collection">
          <div className="workspace-intro">
            <h1>How it works</h1>
            <p>How a discovery session moves. Lines show the path You take.</p>
          </div>
          <div
            ref={flowchartScrollRef}
            className="flowchart-scroll"
            role="region"
            aria-label="Discovery session flowchart"
            tabIndex={0}
          >
            <SessionFlowchart className="session-flowchart" />
          </div>
        </section>
      </main>
    </div>
  );
}

function DiscoverySpecView({ navigate }: { navigate: (path: string) => void }) {
  return (
    <div className="app-shell">
      <SideNav active="spec" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar">
          <div className="breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>Discovery Spec</strong>
          </div>
          <Badge variant="outline" className="spec-maintainer-badge">
            Maintained by You + Wayfinder
          </Badge>
        </header>

        <article className="spec-reading-column">
          <p className="eyebrow">Living Discovery Spec</p>
          <h1 className="mt-2 text-[24px] font-medium leading-tight tracking-[-0.03em] text-[var(--text)]">AI onboarding assistant</h1>
          <p className="spec-deck">
            This is the source of truth for the current Destination, boundaries, and decision criteria. Wayfinder proposes updates. You approve them before they become part of this spec.
          </p>

          <SpecSection title="Destination">
            Write a thin PRD or decide go / no-go. The AI onboarding assistant earns trust before high-permission access.
          </SpecSection>

          <SpecSection title="Scope and user segment">
            Start with solo technical founders and hands-on developer founders. They evaluate developer tools for their own products. The first useful moment is a concrete setup artifact. You review it before Wayfinder applies any change.
          </SpecSection>

          <SpecSection title="Constraints">
            <ul className="list-disc space-y-2 pl-5">
              <li>You must review suggestions before Wayfinder proposes any applied change.</li>
              <li>Setup value appears in less than five minutes.</li>
              <li>Prefer read-only analysis and explicit permission boundaries in early flows.</li>
              <li>Every map update remains staged until You approve it.</li>
            </ul>
          </SpecSection>

          <SpecSection title="Success criteria">
            <ul className="list-disc space-y-2 pl-5">
              <li>You can explain the trust ladder in one sentence.</li>
              <li>Five concrete examples clarify what makes setup feel risky.</li>
              <li>The next Open Frontier tickets are actionable without inventing new research.</li>
              <li>Closed Decisions cite evidence IDs from the ledger.</li>
            </ul>
          </SpecSection>

          <SpecSection title="Out of scope">
            <ul className="list-disc space-y-2 pl-5">
              <li>Autonomous repository changes as the first-run default.</li>
              <li>Multi-role approval flows.</li>
              <li>Marketing-site positioning beyond the first discovery map.</li>
            </ul>
          </SpecSection>

          <SpecSection title="Changelog">
            <ol className="spec-changelog">
              <li><span className="text-muted-foreground">Aug 14</span> — Wayfinder staged the trust-before-actions Closed Decision from INT-03, INT-05, and COMP-02.</li>
              <li><span className="text-muted-foreground">Aug 13</span> — You approved the setup-value timing constraint from INT-01 and INT-04.</li>
              <li><span className="text-muted-foreground">Aug 12</span> — Discovery opened with the Destination and first grilling ticket.</li>
            </ol>
          </SpecSection>
        </article>
      </main>
    </div>
  );
}

function SpecSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="spec-section">
      <h2>{title}</h2>
      <div className="spec-section-content">{children}</div>
    </section>
  );
}

function SessionsList({ navigate }: { navigate: (path: string) => void }) {
  const [discovery, setDiscovery] = useState<ApiDiscovery | null>(null);
  const discoveryId = window.sessionStorage.getItem('ten-brains-live-discovery');
  useEffect(() => {
    if (!discoveryId) return;
    fetch(`/api/discoveries/${discoveryId}`)
      .then((response) => response.ok ? response.json() : null)
      .then((item: ApiDiscovery | null) => item && setDiscovery(item))
      .catch(() => undefined);
  }, [discoveryId]);
  const sessions = discovery?.sessions.filter((item): item is ApiSession => item.type === 'grilling') ?? [];
  return (
    <div className="app-shell">
      <SideNav active="session" navigate={navigate} />
      <main className="main-surface workspace-main">
        <header className="topbar"><div className="breadcrumb"><DiscoveriesCrumb navigate={navigate} /><span aria-hidden="true" className="breadcrumb-slash">/</span><strong>Sessions</strong></div></header>
        <section className="workspace-collection discoveries-collection">
          <div className="workspace-intro"><p className="eyebrow">Sessions</p><h1 className="mt-2 text-[22px] font-medium">Focused sessions</h1><p className="mt-2 text-sm text-muted-foreground">Open a session for the selected discovery.</p></div>
          <div className="workspace-list discoveries-list">
            {sessions.length === 0 && <p className="p-4 text-sm text-muted-foreground">No live sessions yet.</p>}
            {sessions.map((session) => <button key={session.id} type="button" className="discoveries-row" onClick={() => navigate(`/sessions/${session.id}`)}><span className="discoveries-title">{session.title}</span><Badge variant="outline" className="discoveries-status is-active">{session.status}</Badge><span className="discoveries-meta">{session.evidence.length} evidence</span><span className="discoveries-meta">{session.staged.length} staged updates</span><span className="discoveries-meta">{session.mode}</span></button>)}
            <button type="button" className="discoveries-row" onClick={() => navigate('/sessions/grilling')}><span className="discoveries-title">Clarify setup anxiety · Demo</span><Badge variant="outline" className="discoveries-status is-empty">Demo</Badge><span className="discoveries-meta">Scripted session</span><span className="discoveries-meta">3 staged updates</span><span className="discoveries-meta">You + Wayfinder</span></button>
          </div>
        </section>
      </main>
    </div>
  );
}

function GrillingSession({ navigate }: { navigate: (path: string) => void }) {
  if (window.location.pathname === '/sessions') return <SessionsList navigate={navigate} />;
  const sessionId = liveSessionIdFromPath();
  return sessionId ? <LiveGrillingSession navigate={navigate} sessionId={sessionId} /> : <DemoGrillingSession navigate={navigate} />;
}

function LiveGrillingSession({ navigate, sessionId }: { navigate: (path: string) => void; sessionId: string }) {
  const [discovery, setDiscovery] = useState<ApiDiscovery | null>(null);
  const [message, setMessage] = useState('');
  const [streamedReply, setStreamedReply] = useState('');
  const [working, setWorking] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [drawer, setDrawer] = useState<LiveSessionDrawer>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [inquiries, setInquiries] = useState<InquiryDraft[]>([]);
  const [loadStatus, setLoadStatus] = useState<LiveDiscoveryStatus>('loading');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [error, setError] = useState<LiveSessionError | null>(null);
  const [approving, setApproving] = useState(false);
  const [approvalError, setApprovalError] = useState('');
  const [momentStatus, setMomentStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const dismissedInquiryQuestions = useRef(new Set<string>());
  const discoveryId = window.sessionStorage.getItem('ten-brains-live-discovery');
  const session = discovery?.sessions.find((item): item is ApiSession => item.id === sessionId && item.type === 'grilling') ?? null;

  function mergeInquiries(found: ApiSession) {
    setInquiries((current) => found.lineOfInquiry
      .filter((item) => !dismissedInquiryQuestions.current.has(item.question))
      .map((item) => {
        const existing = current.find((draft) => draft.sourceQuestion === item.question);
        return existing ? { ...existing, id: item.id } : { id: item.id, question: item.question, sourceQuestion: item.question };
      }));
  }

  async function refresh(): Promise<ApiSession> {
    if (!discoveryId) throw new Error('Live discovery is unavailable');
    const response = await fetch(`/api/discoveries/${discoveryId}`);
    if (!response.ok) throw new Error('Session could not load');
    const updated: ApiDiscovery = await response.json();
    const found = updated.sessions.find((item): item is ApiSession => item.id === sessionId && item.type === 'grilling');
    if (!found) throw new Error('Session could not load');
    setDiscovery(updated);
    mergeInquiries(found);
    return found;
  }

  useEffect(() => {
    let cancelled = false;
    setLoadStatus('loading');
    setError(null);
    refresh()
      .then(() => { if (!cancelled) setLoadStatus('ready'); })
      .catch(() => {
        if (!cancelled) {
          setLoadStatus('error');
          setError({ kind: 'load', message: 'The session API is not available. Retry the connection or return to the map.' });
        }
      });
    return () => { cancelled = true; };
  }, [sessionId, loadAttempt]);

  function updateLiveSession(update: (current: ApiSession) => ApiSession) {
    setDiscovery((current) => current ? {
      ...current,
      sessions: current.sessions.map((item) => item.id === sessionId && item.type === 'grilling' ? update(item) : item),
    } : current);
  }

  async function sendSessionMessage(textOverride?: string) {
    const text = (textOverride ?? message).trim();
    if (!text || !discoveryId || !session || working) return;
    setError(null);
    setWorking(true);
    setStreamedReply('');
    updateLiveSession((current) => ({
      ...current,
      transcript: [
        ...current.transcript.filter((turn) => turn.id !== 'local-pending-session-turn'),
        { id: 'local-pending-session-turn', actor: 'You', text, createdAt: new Date().toISOString() },
      ],
    }));

    try {
      const response = await fetch(`/api/discoveries/${discoveryId}/sessions/${session.id}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text }),
      });
      if (!response.ok || !response.body) throw new Error('Session turn failed');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let reply = '';

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          const event = block.match(/^event: (.+)$/m)?.[1];
          const dataLine = block.match(/^data: (.+)$/m)?.[1];
          if (!event || !dataLine) continue;
          const data = JSON.parse(dataLine);
          if (event === 'token') {
            reply += data.text;
            setStreamedReply(reply);
          } else if (event === 'candidate') {
            updateLiveSession((current) => ({ ...current, staged: [...current.staged.filter((candidate) => candidate.id !== data.id), data as ApiCandidate] }));
          } else if (event === 'inquiry' && typeof data.question === 'string' && !dismissedInquiryQuestions.current.has(data.question)) {
            setInquiries((current) => current.some((item) => item.sourceQuestion === data.question)
              ? current
              : [...current, { id: `local-inquiry-${Date.now()}`, question: data.question, sourceQuestion: data.question }]);
          } else if (event === 'error') {
            throw new Error(data.message || 'Wayfinder could not complete this turn.');
          }
        }
        if (done) break;
      }

      await refresh();
      setMessage((current) => current.trim() === text ? '' : current);
      setStreamedReply('');
      setComposerOpen(false);
    } catch {
      setMessage(text);
      setStreamedReply('');
      setError({ kind: 'stream', message: 'Wayfinder lost the connection. Your message and transcript are ready to retry.' });
    } finally {
      setWorking(false);
    }
  }

  async function markMoment() {
    if (!discoveryId || !session || momentStatus === 'saving') return;
    const source = [...session.transcript].reverse().find((turn) => turn.actor === 'You' && turn.id !== 'local-pending-session-turn');
    if (!source) return;
    setMomentStatus('saving');
    setError(null);
    try {
      const response = await fetch(`/api/discoveries/${discoveryId}/sessions/${session.id}/evidence`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: source.text, sourceTurn: source.id }),
      });
      if (!response.ok) throw new Error('Evidence could not be captured');
      await refresh();
      setMomentStatus('saved');
      window.setTimeout(() => setMomentStatus('idle'), 1800);
    } catch {
      setMomentStatus('idle');
      setError({ kind: 'moment', message: 'Wayfinder could not mark that moment. Your transcript is unchanged.' });
    }
  }

  async function approveUpdates(candidateIds: string[]) {
    if (!discoveryId || !session) return;
    setApproving(true);
    setApprovalError('');
    try {
      const response = await fetch(`/api/discoveries/${discoveryId}/sessions/${session.id}/updates/approve`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ candidateIds }),
      });
      if (!response.ok) throw new Error('Approval failed');
      setReviewOpen(false);
      await refresh();
    } catch {
      setApprovalError('Wayfinder could not apply the selected updates. Review the selection, then retry.');
    } finally {
      setApproving(false);
    }
  }

  function dismissInquiry(item: InquiryDraft) {
    dismissedInquiryQuestions.current.add(item.sourceQuestion);
    setInquiries((current) => current.filter((entry) => entry.id !== item.id));
  }

  const retry = () => {
    if (error?.kind === 'stream') sendSessionMessage(message);
    else if (error?.kind === 'load') setLoadAttempt((attempt) => attempt + 1);
    else if (error?.kind === 'moment') markMoment();
  };

  if (loadStatus !== 'ready' || !session) {
    return (
      <div className="app-shell">
        <SideNav active="session" navigate={navigate} />
        <main className="main-surface session-main live-session-load">
          <Card className="live-session-load-card">
            {loadStatus === 'loading' ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <AlertCircle aria-hidden="true" />}
            <div><h1>{loadStatus === 'loading' ? 'Loading session' : 'Session unavailable'}</h1><p>{loadStatus === 'loading' ? 'Loading the live transcript and staged updates.' : error?.message}</p></div>
            {loadStatus === 'error' && <div className="live-session-load-actions"><Button size="sm" onClick={() => setLoadAttempt((attempt) => attempt + 1)}><RotateCcw aria-hidden="true" /> Retry connection</Button><Button variant="outline" size="sm" onClick={() => navigate('/map')}>Back to map</Button></div>}
          </Card>
        </main>
      </div>
    );
  }

  const transcriptLines = [...session.transcript, ...(streamedReply ? [{ id: 'streamed-session-reply', actor: 'Wayfinder' as const, text: streamedReply, createdAt: new Date().toISOString() }] : [])];
  const lastUserTurn = [...session.transcript].reverse().find((turn) => turn.actor === 'You' && turn.id !== 'local-pending-session-turn');
  const lastTurnMarked = Boolean(lastUserTurn && session.evidence.some((item) => String(item.sourceTurn) === lastUserTurn.id));
  const signals = <LiveSessionSignals session={session} onReview={() => { setApprovalError(''); setReviewOpen(true); }} />;
  const inquiryPanel = <LiveLineOfInquiry inquiries={inquiries} onChange={(id, question) => setInquiries((current) => current.map((item) => item.id === id ? { ...item, question } : item))} onDismiss={dismissInquiry} />;

  return (
    <div className="app-shell session-shell live-session-shell">
      <SideNav active="session" navigate={navigate} compactBrand />
      <main className="main-surface session-main">
        <header className="topbar session-topbar">
          <div className="breadcrumb session-breadcrumb"><DiscoveriesCrumb navigate={navigate} /><span aria-hidden="true" className="breadcrumb-slash">/</span><strong>{session.title}</strong><Badge className="live-badge"><Circle aria-hidden="true" className="live-dot" /> LIVE</Badge></div>
          <div className="session-header-actions"><Button variant="secondary" size="lg" className="session-map-action" onClick={() => navigate(`/sessions/${session.id}/map`)}>Session map</Button></div>
        </header>
        <Card className="objective-card">
          <div className="objective-section wide"><Target aria-hidden="true" className="target-icon" /><div><p className="eyebrow">Objective</p><strong>{session.objective}</strong></div></div>
          <Separator orientation="vertical" /><div className="objective-section"><Target aria-hidden="true" className="target-icon" /><div><p className="eyebrow">Evidence target</p><strong>{session.evidenceTarget}</strong></div></div>
          <Separator orientation="vertical" /><div className="objective-section progress-summary"><div><p className="eyebrow">Progress</p><strong><span>{session.evidence.length}</span> captured</strong></div></div>
        </Card>

        <Sheet open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)}>
          <div className="mobile-session-actions" aria-label="Session drawers"><Button variant="outline" size="sm" onClick={() => setDrawer('inquiry')}>Line of Inquiry</Button><Button variant="outline" size="sm" onClick={() => setDrawer('signals')}>Session Signals</Button></div>
          <SheetContent className="mobile-drawer live-session-drawer" side="right"><SheetHeader><SheetTitle>{drawer === 'inquiry' ? 'Line of Inquiry' : 'Session Signals'}</SheetTitle><SheetDescription className="sr-only">Live session details</SheetDescription></SheetHeader><div className="drawer-body">{drawer === 'inquiry' ? <LiveLineOfInquiry inquiries={inquiries} onChange={(id, question) => setInquiries((current) => current.map((item) => item.id === id ? { ...item, question } : item))} onDismiss={dismissInquiry} drawer /> : <LiveSessionSignals session={session} onReview={() => { setDrawer(null); setApprovalError(''); setReviewOpen(true); }} drawer />}</div></SheetContent>
        </Sheet>

        <section className="session-grid live-session-grid">
          {inquiryPanel}
          <PanelShell title="Live transcript">
            <LiveSessionTranscript lines={transcriptLines} working={working} />
            <LiveSessionComposer message={message} working={working} momentStatus={momentStatus} markDisabled={!lastUserTurn || lastTurnMarked} error={error} onMessageChange={(value) => { setMessage(value); if (error?.kind === 'stream') setError(null); }} onSend={() => sendSessionMessage()} onMark={markMoment} onRetry={retry} />
          </PanelShell>
          {signals}
        </section>
      </main>
      <WayfinderPill status={error?.kind === 'stream' ? 'reconnect needed' : working ? 'working' : 'listening'} expanded />
      <div className="mobile-live-controls">
        <Button variant="outline" size="sm" disabled={working || !lastUserTurn || lastTurnMarked || momentStatus === 'saving'} onClick={markMoment}>{momentStatus === 'saving' ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : momentStatus === 'saved' || lastTurnMarked ? <CheckCircle2 aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{momentStatus === 'saving' ? 'Saving' : momentStatus === 'saved' || lastTurnMarked ? 'Moment saved' : 'Mark moment'}</Button>
        <Button size="sm" onClick={() => setComposerOpen(true)}><Mic aria-hidden="true" /> Ask Wayfinder</Button>
      </div>
      <Sheet open={composerOpen} onOpenChange={setComposerOpen}><SheetContent side="bottom" className="live-session-composer-sheet"><SheetHeader><SheetTitle>Ask Wayfinder</SheetTitle><SheetDescription>Give one concrete example, constraint, or contradiction.</SheetDescription></SheetHeader><LiveSessionComposer message={message} working={working} momentStatus={momentStatus} markDisabled error={error} mobile onMessageChange={(value) => { setMessage(value); if (error?.kind === 'stream') setError(null); }} onSend={() => sendSessionMessage()} onMark={markMoment} onRetry={retry} /></SheetContent></Sheet>
      <ReviewMapDialog candidates={session.staged} open={reviewOpen} onOpenChange={(open) => { setReviewOpen(open); if (open) setApprovalError(''); }} onApprove={approveUpdates} approving={approving} error={approvalError} context="session" />
    </div>
  );
}

function LiveLineOfInquiry({ inquiries, onChange, onDismiss, drawer = false }: { inquiries: InquiryDraft[]; onChange: (id: string, question: string) => void; onDismiss: (item: InquiryDraft) => void; drawer?: boolean }) {
  return (
    <PanelShell title="Line of Inquiry" drawer={drawer}>
      {inquiries.length === 0 && <div className="live-session-empty"><CircleHelp aria-hidden="true" /><strong>No suggested question</strong><p>Wayfinder will add a question after a useful turn.</p></div>}
      {inquiries.map((item, index) => (
        <Card className={`${index === 0 ? 'recommended-card' : 'probe-card'} live-inquiry-card live-arrival`} key={item.id}>
          <CardContent className="live-inquiry-content">
            <div className="live-inquiry-label">{index === 0 && <Sparkles aria-hidden="true" />}<strong>{index === 0 ? 'Next question' : `Question ${index + 1}`}</strong><Button variant="ghost" size="icon-xs" aria-label="Dismiss question" onClick={() => onDismiss(item)}><X /></Button></div>
            <textarea aria-label="Edit question" value={item.question} onChange={(event) => onChange(item.id, event.target.value)} />
          </CardContent>
        </Card>
      ))}
    </PanelShell>
  );
}

function LiveSessionSignals({ session, onReview, drawer = false }: { session: ApiSession; onReview: () => void; drawer?: boolean }) {
  return (
    <PanelShell title="Session Signals" drawer={drawer}>
      <div className="signal-section">
        <h3>Evidence captured</h3>
        {session.evidence.length === 0 && <p className="live-signal-empty">Mark a concrete moment to add evidence.</p>}
        {session.evidence.map((item) => <Card className="evidence-item live-arrival" key={item.id}><CardContent className="evidence-content live-evidence-content"><Bookmark aria-hidden="true" /><span><strong>{item.id}</strong>{item.text}</span></CardContent></Card>)}
      </div>
      <div className="signal-section map-updates">
        <h3>Candidate map updates</h3>
        {session.staged.length === 0 && <p className="live-signal-empty">Wayfinder has not staged an update.</p>}
        {session.staged.map((candidate) => <div className="live-arrival" key={candidate.id}><CandidateUpdate tone={candidate.type === 'fog-question' ? 'fog' : candidate.type === 'closed-decision' ? 'decision' : 'frontier'} label={candidate.type === 'fog-question' ? 'Candidate Fog of War question' : candidate.type === 'closed-decision' ? 'Candidate Closed Decision' : 'Candidate Open Frontier ticket'} text={candidate.type === 'fog-question' ? candidate.question : candidate.title} /></div>)}
        <Button className="review-button" disabled={session.staged.length === 0} onClick={onReview}>Review {session.staged.length} map {session.staged.length === 1 ? 'update' : 'updates'}</Button>
      </div>
    </PanelShell>
  );
}

function LiveSessionTranscript({ lines, working }: { lines: ApiSession['transcript']; working: boolean }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastText = lines.at(-1)?.text ?? '';
  useEffect(() => {
    if (!stickToBottom.current) return;
    const frame = window.requestAnimationFrame(() => {
      if (viewportRef.current) viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [lastText, lines.length, working]);

  return (
    <div ref={viewportRef} className="live-transcript-viewport" role="log" aria-label="Messages between You and Wayfinder" aria-busy={working} aria-live="polite" onScroll={(event) => { const viewport = event.currentTarget; stickToBottom.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 64; }}>
      <div className="transcript-list live-transcript-list">
        {lines.map((line) => <div className={`transcript-row ${line.id === 'streamed-session-reply' ? 'is-streaming' : ''}`} key={line.id}><time>{new Date(line.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><strong>{line.actor}</strong><div><p>{line.text}</p></div></div>)}
        {working && <div className="live-session-working" role="status"><LoaderCircle aria-hidden="true" className="animate-spin" /><span>Wayfinder is working</span></div>}
      </div>
    </div>
  );
}

function LiveSessionComposer({ message, working, momentStatus, markDisabled, error, mobile = false, onMessageChange, onSend, onMark, onRetry }: { message: string; working: boolean; momentStatus: 'idle' | 'saving' | 'saved'; markDisabled: boolean; error: LiveSessionError | null; mobile?: boolean; onMessageChange: (message: string) => void; onSend: () => void; onMark: () => void; onRetry: () => void }) {
  return (
    <div className={mobile ? 'live-mobile-composer' : 'composer live-session-composer'}>
      <Input aria-label="Send to Wayfinder" placeholder="Give Wayfinder one concrete example." value={message} disabled={working} onChange={(event) => onMessageChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') onSend(); }} />
      {!mobile && <Button variant="outline" size="sm" disabled={working || markDisabled || momentStatus === 'saving'} onClick={onMark}>{momentStatus === 'saving' ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : momentStatus === 'saved' ? <CheckCircle2 aria-hidden="true" /> : <Bookmark aria-hidden="true" />}{momentStatus === 'saving' ? 'Saving moment' : momentStatus === 'saved' ? 'Moment saved' : 'Mark moment'}</Button>}
      <Button size="sm" disabled={working || !message.trim()} onClick={onSend}>{working ? <LoaderCircle aria-hidden="true" className="animate-spin" /> : <SendHorizontal aria-hidden="true" />}{working ? 'Working' : 'Send'}</Button>
      {error && error.kind !== 'approve' && <div className="live-session-error" role="alert"><AlertCircle aria-hidden="true" /><p>{error.message}</p><Button variant="outline" size="sm" onClick={onRetry}><RotateCcw aria-hidden="true" /> Retry</Button></div>}
    </div>
  );
}

function DemoGrillingSession({ navigate }: { navigate: (path: string) => void }) {
  const [drawer, setDrawer] = useState<DrawerName>(null);

  return (
    <div className="app-shell session-shell">
      <SideNav active="session" navigate={navigate} compactBrand />
      <main className="main-surface session-main">
        <header className="topbar session-topbar">
          <div className="breadcrumb session-breadcrumb">
            <DiscoveriesCrumb navigate={navigate} />
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <a href="/sessions/grilling" onClick={(event) => event.preventDefault()}>Sessions</a>
            <span aria-hidden="true" className="breadcrumb-slash">/</span>
            <strong>Clarify setup anxiety</strong>
            <Badge className="live-badge">
              <Circle aria-hidden="true" className="live-dot" /> LIVE
            </Badge>
            <span className="session-time">12:08</span>
          </div>
          <div className="session-header-actions">
            <Button variant="secondary" size="lg" className="session-map-action" onClick={() => navigate('/sessions/grilling/map')}>Session map</Button>
            <Button variant="outline" size="lg" className="end-session">End session</Button>
          </div>
        </header>

        <Card className="objective-card">
          <div className="objective-section wide">
            <Target aria-hidden="true" className="target-icon" />
            <div>
              <p className="eyebrow">Objective</p>
              <strong>Surface hidden assumptions about first-run trust and delegation</strong>
            </div>
          </div>
          <Separator orientation="vertical" />
          <div className="objective-section">
            <Target aria-hidden="true" className="target-icon" />
            <div>
              <p className="eyebrow">Evidence target</p>
              <strong>5 concrete examples</strong>
            </div>
          </div>
          <Separator orientation="vertical" />
          <div className="objective-section progress-summary">
            <div>
              <p className="eyebrow">Progress</p>
              <strong><span>3</span> / 5</strong>
            </div>
          </div>
        </Card>

        <Sheet open={drawer !== null} onOpenChange={(open) => !open && setDrawer(null)}>
          <div className="mobile-session-actions" aria-label="Session drawers">
            <Button variant="outline" size="sm" onClick={() => setDrawer('inquiry')}>Line of Inquiry</Button>
            <Button variant="outline" size="sm" onClick={() => setDrawer('signals')}>Session Signals</Button>
          </div>
          <SheetContent className="mobile-drawer" side="right">
            <SheetHeader>
              <SheetTitle>{drawer === 'inquiry' ? 'Line of Inquiry' : 'Session Signals'}</SheetTitle>
              <SheetDescription className="sr-only">Line of Inquiry and Session Signals</SheetDescription>
            </SheetHeader>
            <div className="drawer-body">
              {drawer === 'inquiry' ? <LineOfInquiry drawer /> : <SessionSignals drawer navigate={navigate} />}
            </div>
          </SheetContent>
        </Sheet>

        <section className="session-grid">
          <LineOfInquiry />
          <Transcript />
          <SessionSignals navigate={navigate} />
        </section>
      </main>
      <WayfinderPill status="listening" expanded />
      <div className="mobile-live-controls">
        <Button variant="outline" size="sm"><Bookmark aria-hidden="true" /> Mark moment</Button>
        <Button size="sm"><Mic aria-hidden="true" /> Ask Wayfinder</Button>
      </div>
    </div>
  );
}

function PanelShell({ title, children, drawer }: { title: string; children: ReactNode; drawer?: boolean }) {
  return (
    <Card className={`panel ${drawer ? 'drawer-panel' : ''}`}>
      {!drawer && (
        <CardHeader className="panel-title">
          <CardTitle>{title}</CardTitle>
          <MoreMenu label={`${title} options`} />
        </CardHeader>
      )}
      <CardContent className="panel-content">{children}</CardContent>
    </Card>
  );
}

function LineOfInquiry({ drawer }: { drawer?: boolean }) {
  return (
    <PanelShell title="Line of Inquiry" drawer={drawer}>
      <Card className="recommended-card">
        <CardContent className="recommended-content">
          <div className="recommend-label">
            <Sparkles aria-hidden="true" />
            <strong>Next question</strong>
            <span className="inline-actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label="Edit question"><Pencil /></Button>
                </TooltipTrigger>
                <TooltipContent>Edit question</TooltipContent>
              </Tooltip>
              <Button variant="ghost" size="icon-xs" aria-label="Dismiss question"><X /></Button>
            </span>
          </div>
          <p>You said setup felt risky. Tell me about the last time that happened.</p>
        </CardContent>
      </Card>
      <ProbeCard>What did you do instead?</ProbeCard>
      <ProbeCard>What would have made that feel safe?</ProbeCard>
      <Button variant="outline" className="add-probe"><Plus aria-hidden="true" /> Add question</Button>
      <div className="panel-hint">
        <span>Drag to reorder · Edit or dismiss questions</span>
        <span className="key-hint"><Keyboard aria-hidden="true" /> Space to mark moment</span>
      </div>
    </PanelShell>
  );
}

function ProbeCard({ children }: { children: ReactNode }) {
  return (
    <Card className="probe-card">
      <CardContent className="probe-content">
        <GripVertical aria-hidden="true" />
        <p>{children}</p>
        <Button variant="ghost" size="icon-xs" aria-label="Dismiss question"><X /></Button>
      </CardContent>
    </Card>
  );
}

function Transcript() {
  return (
    <PanelShell title="Live transcript">
      <div className="transcript-list">
        {transcript.map((line) => (
          <div className="transcript-row" key={`${line.time}-${line.text}`}>
            <time>{line.time}</time>
            <strong>{line.actor}</strong>
            <div>
              <p className={line.annotation ? 'captured-line' : ''}>{line.text}</p>
              {line.annotation && (
                <Badge variant="outline" className="annotation-pill">
                  <Circle aria-hidden="true" />{line.annotation}
                </Badge>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="composer">
        <Input aria-label="Send to Wayfinder" placeholder="Ask, note, or press ⌘↵ to send to Wayfinder." />
        <Button variant="outline" size="sm"><Bookmark aria-hidden="true" /> Mark moment</Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button className="mic-button" aria-label="Voice input options">
              <Mic aria-hidden="true" />
              <ChevronDown aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Voice input options</TooltipContent>
        </Tooltip>
      </div>
    </PanelShell>
  );
}

function SessionSignals({ drawer, navigate }: { drawer?: boolean; navigate: (path: string) => void }) {
  return (
    <PanelShell title="Session Signals" drawer={drawer}>
      <div className="signal-section">
        <h3>1. Assumptions tested <InfoTooltip text="The core belief evaluated in this conversation." /></h3>
        <Select defaultValue="supported">
          <SelectTrigger className="signal-select" aria-label="Assumption result">
            <span>Users fear setup complexity</span>
            <span className="supported"><Circle aria-hidden="true" />Supported</span>
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="supported">Supported</SelectItem>
            <SelectItem value="unclear">Needs more evidence</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="signal-section">
        <h3>2. Evidence captured <InfoTooltip text="Wayfinder marked concrete moments during the session." /></h3>
        <EvidenceItem id="INT-03" text="Repo write access stopped the flow" navigate={navigate} />
        <EvidenceItem id="INT-05" text="You would try read-only suggestions first" navigate={navigate} />
        <Button variant="ghost" size="sm" className="link-button"><Plus aria-hidden="true" /> Add evidence</Button>
      </div>

      <div className="signal-section map-updates">
        <h3>3. Candidate map updates <InfoTooltip text="Review potential map changes before Wayfinder adds them." /></h3>
        <CandidateUpdate tone="fog" label="Candidate Fog of War question" text="What permissions feel safe by default?" />
        <CandidateUpdate tone="decision" label="Candidate Closed Decision" text="Users trust suggestions before autonomous actions" />
        <CandidateUpdate tone="frontier" label="Candidate Open Frontier ticket" text="Prototype read-only onboarding path" />
        <Button className="review-button">Review 3 map updates</Button>
      </div>
    </PanelShell>
  );
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="info-trigger" type="button" aria-label={text}><CircleHelp /></button>
      </TooltipTrigger>
      <TooltipContent>{text}</TooltipContent>
    </Tooltip>
  );
}

function EvidenceItem({ id, text, navigate }: { id: string; text: string; navigate: (path: string) => void }) {
  return (
    <Card className="evidence-item">
      <CardContent className="evidence-content">
        <Checkbox defaultChecked className="evidence-checkbox" aria-label={`Evidence captured: ${text}`} />
        <a href={`/evidence#${id}`} className="hover:text-[var(--workbench-accent)] hover:underline" onClick={(event) => { event.preventDefault(); navigate(`/evidence#${id}`); }}>
          {text}
        </a>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon-sm" className="bookmark" aria-label={`Save evidence: ${text}`}>
              <Bookmark aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Save evidence</TooltipContent>
        </Tooltip>
        <MoreMenu label={`More options for ${text}`} />
      </CardContent>
    </Card>
  );
}

function CandidateUpdate({ tone, label, text }: { tone: 'fog' | 'decision' | 'frontier'; label: string; text: string }) {
  const ToneIcon = tone === 'fog' ? HelpCircle : tone === 'decision' ? CheckCircle2 : PlusCircle;

  return (
    <Card className={`candidate-card ${tone}`}>
      <CardContent className="candidate-content">
        <div className="candidate-label">
          <ToneIcon aria-hidden="true" className="candidate-icon" />
          <strong>{label}</strong>
          <span className="candidate-spacer" />
          <Checkbox aria-label={`Select ${label}`} />
          <MoreMenu label={`More options for ${label}`} />
        </div>
        <p>{text}</p>
      </CardContent>
    </Card>
  );
}

function WayfinderPill({ status, expanded }: { status: string; expanded?: boolean }) {
  return (
    <Card className="wayfinder-pill" aria-label={`Wayfinder ${status}`}>
      <span className="wayfinder-mark">
        {expanded ? <AudioLines aria-hidden="true" /> : <Sparkles aria-hidden="true" />}
      </span>
      <strong>Wayfinder</strong>
      <span>· {status}</span>
      <Circle aria-hidden="true" className="wayfinder-status" />
      {expanded && <ChevronUp aria-hidden="true" />}
    </Card>
  );
}

export default App;
