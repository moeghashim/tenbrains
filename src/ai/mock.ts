import { significantTerms } from "../core/text.js";
import type { AnalysisResult, SummaryResult, TakeawayResult } from "../domain/schemas.js";

/**
 * Deterministic, offline analysis used by the `mock` provider. It performs no
 * network calls and never fabricates a real model's judgement — output is a
 * transparent, reproducible summary of the input text, suitable for tests, CI,
 * and offline development. Every record it produces is flagged `mock: true`.
 */

function titleCase(word: string): string {
  const clean = word.replace(/^#/, "");
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^.*?[.!?](\s|$)/);
  const sentence = (match ? match[0] : trimmed).trim();
  return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
}

function detectIntent(text: string): string {
  const lower = text.toLowerCase();
  if (
    /\bhttps?:\/\//.test(text) ||
    /\b(launch|introducing|announc|release|available now)\b/.test(lower)
  ) {
    return "Announce or promote something to the audience";
  }
  if (text.includes("?") || /^\s*(how|why|what|when|should)\b/.test(lower)) {
    return "Pose a question or prompt discussion";
  }
  if (/^\s*(how to|here'?s how|step|tip|lesson)\b/.test(lower)) {
    return "Teach or explain a concept";
  }
  return "Share an observation or insight";
}

export function mockAnalysis(text: string): AnalysisResult {
  const terms = significantTerms(text, 5);
  const topic =
    terms.length > 0 ? terms.slice(0, 2).map(titleCase).join(" & ") : "General commentary";
  const summary = firstSentence(text) || `A short post about ${topic.toLowerCase()}.`;
  const intent = detectIntent(text);

  const novelConcepts = Array.from({ length: 5 }, (_, i) => {
    const term = terms[i];
    if (term) {
      return {
        name: titleCase(term),
        whyItMattersInTweet: `"${titleCase(term)}" is a recurring focus of the post and anchors its ${topic.toLowerCase()} theme.`,
      };
    }
    return {
      name: `Supporting idea ${i + 1}`,
      whyItMattersInTweet: `An additional point that reinforces the post's framing of ${topic.toLowerCase()}.`,
    };
  });

  return { topic, summary, intent, novelConcepts };
}

export function mockSummary(text: string): SummaryResult {
  const sentences = text
    .trim()
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
  const summary = (sentences.slice(0, 4).join(" ") || firstSentence(text)).slice(0, 1200);
  const terms = significantTerms(text, 5);
  const keyPoints = terms.length
    ? terms.map((term) => `${titleCase(term)} is a recurring theme in the content.`)
    : ["The supplied content does not contain enough detail for additional key points."];
  return { summary, keyPoints };
}

export function mockTakeaway(posts: Array<{ text: string }>): TakeawayResult {
  const combined = posts.map((p) => p.text).join("\n");
  const terms = significantTerms(combined, 6);
  const focus = terms.slice(0, 3).map(titleCase).join(", ") || "varied topics";
  const summary = `Across ${posts.length} recent post${posts.length === 1 ? "" : "s"}, the account consistently engages with ${focus}.`;

  const takeaways: string[] = [];
  for (let i = 0; i < Math.min(5, Math.max(3, terms.length)); i += 1) {
    const term = terms[i];
    takeaways.push(
      term
        ? `Recurring focus on ${titleCase(term)}.`
        : `Maintains a consistent voice across the ${posts.length} sampled posts.`,
    );
  }
  return { summary, takeaways };
}
