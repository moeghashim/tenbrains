import type { Concept, ConceptRating, LearningDay } from "./types.js";

const TRACK_DAYS = 7;
const DEFAULT_FAMILIARITY = 1; // assume novel when unrated
const DEFAULT_INTEREST = 3; // assume neutral interest when unrated

function ratingFor(
  concept: Concept,
  ratings: ConceptRating[],
): { familiarity: number; interest: number } {
  const match = ratings.find((r) => r.concept.toLowerCase() === concept.name.toLowerCase());
  return {
    familiarity: match?.familiarity ?? DEFAULT_FAMILIARITY,
    interest: match?.interest ?? DEFAULT_INTEREST,
  };
}

/**
 * Order concepts for study: highest interest first, then most novel (lowest
 * familiarity), preserving original order as a stable tiebreaker.
 */
export function prioritizeConcepts(concepts: Concept[], ratings: ConceptRating[]): Concept[] {
  return concepts
    .map((concept, index) => ({ concept, index, ...ratingFor(concept, ratings) }))
    .sort((a, b) => {
      if (b.interest !== a.interest) {
        return b.interest - a.interest;
      }
      const noveltyA = 6 - a.familiarity;
      const noveltyB = 6 - b.familiarity;
      if (noveltyB !== noveltyA) {
        return noveltyB - noveltyA;
      }
      return a.index - b.index;
    })
    .map((entry) => entry.concept);
}

function splitMinutes(total: number): { learn: number; explain: number; check: number } {
  const learn = Math.max(1, Math.round(total * 0.4));
  const explain = Math.max(1, Math.round(total * 0.4));
  const check = Math.max(1, total - learn - explain);
  return { learn, explain, check };
}

/**
 * Build a 7-day Feynman track. Each day pairs a prioritized concept with
 * Learn / Explain / Check steps. With fewer than 7 concepts, the top concepts
 * recur on later days for spaced repetition.
 */
export function buildFeynmanTrack(
  concepts: Concept[],
  minutesPerDay: number,
  ratings: ConceptRating[],
): LearningDay[] {
  const ordered = prioritizeConcepts(concepts, ratings);
  if (ordered.length === 0) {
    return [];
  }
  const minutes = splitMinutes(minutesPerDay);
  const days: LearningDay[] = [];
  for (let day = 1; day <= TRACK_DAYS; day += 1) {
    const concept = ordered[(day - 1) % ordered.length] as Concept;
    const revisiting = day > ordered.length;
    days.push({
      day,
      concept: concept.name,
      learn: `${minutes.learn} min: ${revisiting ? "Revisit" : "Read or watch a primer on"} "${concept.name}". ${concept.whyItMattersInTweet}`,
      explain: `${minutes.explain} min: Write a plain-language explanation of "${concept.name}" as if teaching a beginner, no jargon.`,
      check: `${minutes.check} min: List what still feels fuzzy about "${concept.name}" and note one question to resolve tomorrow.`,
    });
  }
  return days;
}
