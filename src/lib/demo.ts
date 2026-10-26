import type { AppState, Action, Analysis, LearnPath } from "./types";
import { pathProgress } from "./learning";

export const demoAnalysis: Analysis = {
  title: "Understanding systems, one useful idea at a time",
  summary:
    "A good mental model makes a complicated system easier to reason about. Start with the smallest useful explanation, test it against an everyday example, and build from there.",
  tags: ["systems-thinking", "learning"],
  sourceNote: "text only · media not analyzed",
  concepts: ["Mental models", "Feedback loops", "Compounding knowledge"],
  isTeachable: true,
};
const days = [
  {
    concept: "Thinking in systems",
    lesson:
      "A system is a group of connected parts that work together. A garden is a system: soil, sunlight, water, plants, and a gardener all affect each other.\n\nInstead of looking at one part on its own, ask how the parts connect. More water can help a thirsty plant, but too much water can damage its roots. The relationship matters as much as the individual parts.\n\nA useful first step is to draw three things: the parts, the connections between them, and what the system produces. Then ask what changes when you adjust just one connection.",
    sourcePostIds: ["demo-1"],
  },
  {
    concept: "Feedback loops",
    lesson:
      "A feedback loop happens when a system's output changes what happens next. A thermostat measures the room temperature and switches the heating off when it is warm enough. This balancing loop helps keep the room steady.\n\nOther loops reinforce change. Practising a skill makes you more confident, which encourages more practice. Look for the loop rather than assuming a single cause.",
    sourcePostIds: ["demo-1", "demo-2"],
  },
  {
    concept: "Finding leverage points",
    lesson:
      "A leverage point is a place where a small change can make a meaningful difference. Changing a rule or a connection can matter more than adding another part. In a garden, improving drainage may help more than adding water. Look for the underlying relationship before trying a bigger intervention.",
    sourcePostIds: ["demo-1"],
  },
  {
    concept: "Second-order effects",
    lesson:
      "An action can have an immediate result and later consequences. Making a road wider may reduce traffic at first, but encourage more people to drive later. Ask both what happens next and what happens after that. Use the sources to separate an observed outcome from a prediction.",
    sourcePostIds: ["demo-2"],
  },
  {
    concept: "Build your own mental model",
    lesson:
      "Choose a familiar system and explain its parts, connections, and purpose. Describe a feedback loop, then suggest a small change and predict its effects. A useful model is simple enough to explain and specific enough to test. When reality disagrees with your model, update the model.",
    sourcePostIds: ["demo-1", "demo-2"],
  },
];

export function demoPath(id = "demo-path"): LearnPath {
  return {
    id,
    title: "Thinking in systems",
    tag: "systems-thinking",
    sourceLabel: "3 sample posts in #SystemsThinking",
    days,
    currentDay: 0,
    explanations: [],
    suggestions: [
      { postId: "demo-2", minLevel: "Noob" },
      { postId: "demo-3", minLevel: "Pro" },
    ],
  };
}

export const demoState: AppState = {
  user: { id: "demo", name: "Your workspace", handle: "demo" },
  accounts: [
    {
      id: "maya",
      name: "Maya Chen",
      handle: "maya_builds",
      bio: "Making complex things a little easier to understand. Writing about systems, software, and learning.",
      followers: 12400,
      following: 382,
      tags: ["systems-thinking", "learning"],
    },
    {
      id: "alex",
      name: "Alex Rivera",
      handle: "alex_thinks",
      bio: "Notes on better thinking. Curious about the connections between technology and everyday life.",
      followers: 8200,
      following: 215,
      tags: ["systems-thinking", "technology"],
    },
    {
      id: "sarah",
      name: "Sarah Park",
      handle: "sarah_learns",
      bio: "Learn something. Explain it simply. Repeat. Building a practice of lifelong curiosity.",
      followers: 6100,
      following: 490,
      tags: ["learning", "mental-models"],
    },
    {
      id: "daniel",
      name: "Daniel Brooks",
      handle: "daniel_makes",
      bio: "Small experiments in software and independent work.",
      followers: 3400,
      following: 198,
      tags: ["technology", "building"],
    },
  ],
  posts: [
    {
      id: "demo-1",
      accountId: "maya",
      createdAt: "2026-10-24T10:30:00Z",
      text: "The most useful skill I’ve learned isn’t a programming language. It’s learning to see systems.\n\nA garden. A team. A product. Connected parts, influencing each other.\n\nOnce you start looking for the connections instead of just the parts, a lot of things begin to make sense.",
      tags: ["systems-thinking", "mental-models"],
      media: [],
      threadId: "demo-1",
      position: 0,
    },
    {
      id: "demo-2",
      accountId: "alex",
      createdAt: "2026-10-24T09:15:00Z",
      text: "A small reminder: progress isn’t always a straight line.\n\nFeedback loops are everywhere. Practice builds confidence. Confidence encourages practice. The trick is finding the loop that works in your favour.",
      tags: ["systems-thinking", "learning"],
      media: [{ type: "image", url: "/demo-feedback.svg" }],
    },
    {
      id: "demo-3",
      accountId: "sarah",
      createdAt: "2026-10-24T08:00:00Z",
      text: "My favourite test for understanding something:\n\nCan I explain it without using the words I just learned?\n\nIf not, I probably memorised the label rather than understood the idea. A simple example is worth more than a complicated definition.",
      tags: ["learning", "mental-models"],
      media: [],
    },
    {
      id: "demo-4",
      accountId: "maya",
      createdAt: "2026-10-24T07:00:00Z",
      text: "Start with a familiar system. Draw its parts, the connections, and the result. What happens when you change a connection?\n\nMore water helps a thirsty plant. Too much damages its roots. The relationship matters.",
      tags: ["systems-thinking"],
      media: [],
      threadId: "demo-1",
      position: 1,
    },
  ],
  paths: [demoPath()],
  captures: [],
  followedAccounts: ["maya", "alex"],
  followedTags: ["systems-thinking", "learning"],
};

// The public demo never calls X or Grok and never writes to the owner's database.
export function applyDemoAction(state: AppState, action: Action): AppState {
  const next = structuredClone(state);
  if (action.type === "followAccount")
    next.followedAccounts = action.follow
      ? [...new Set([...next.followedAccounts, action.accountId])]
      : next.followedAccounts.filter((id) => id !== action.accountId);
  if (action.type === "followTag")
    next.followedTags = action.follow
      ? [...new Set([...next.followedTags, action.tag])]
      : next.followedTags.filter((tag) => tag !== action.tag);
  if (action.type === "analyze")
    next.posts.find((p) => p.id === action.postId)!.analysis = demoAnalysis;
  if (action.type === "capture" || action.type === "import") {
    const profile =
      action.type === "capture" && !action.url.includes("/status/");
    next.captures.unshift({
      id: crypto.randomUUID(),
      url: action.type === "capture" ? action.url : "Sample bookmark import",
      detectedType:
        action.type === "import" ? "import" : profile ? "profile" : "thread",
      postIds: profile ? [] : ["demo-1", "demo-4"],
      accountId: "maya",
      analysis: demoAnalysis,
      decision: profile ? "follow" : "none",
      status: "ready",
    });
    if (profile)
      next.followedAccounts = [...new Set([...next.followedAccounts, "maya"])];
  }
  if (
    action.type === "learn" ||
    (action.type === "decide" && action.decision === "learn")
  )
    next.paths.unshift(demoPath(crypto.randomUUID()));
  if (action.type === "decide") {
    const capture = next.captures.find((c) => c.id === action.captureId)!;
    capture.decision = action.decision;
    if (action.decision === "follow")
      next.followedTags = [
        ...new Set([...next.followedTags, ...demoAnalysis.tags]),
      ];
  }
  if (action.type === "grade") {
    const path = next.paths.find((p) => p.id === action.pathId)!;
    path.explanations.push({
      id: crypto.randomUUID(),
      day: action.day,
      text: action.text,
      score: 82,
      createdAt: new Date().toISOString(),
      feedback: [
        {
          kind: "ok",
          text: "Illustrative demo feedback: name the parts and explain how they connect.",
        },
        {
          kind: "gap",
          text: "In a live check, Grok reviews your explanation against these sources. This demo always returns a sample score of 82.",
          sourceRef: "demo-1",
        },
        {
          kind: "example",
          text: "Try an everyday example, such as watering a garden.",
        },
      ],
    });
    const completed = pathProgress(path).completed;
    const nextDay = path.days.findIndex(
      (_, index) => !completed.includes(index),
    );
    path.currentDay = nextDay < 0 ? path.days.length - 1 : nextDay;
  }
  if (action.type === "refresh") next.lastRefreshed = new Date().toISOString();
  return next;
}
