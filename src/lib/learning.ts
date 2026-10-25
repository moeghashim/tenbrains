import type { LearnPath, Level } from "./types";

export function levelFor(score: number): Level {
  return score >= 80
    ? "Ninja"
    : score >= 50
      ? "Pro"
      : score >= 25
        ? "Rookie"
        : "Noob";
}

export function pathProgress(path: LearnPath) {
  const completed = new Set(
    path.explanations.filter((e) => e.score >= 70).map((e) => e.day),
  );
  const recent = path.explanations.slice(-3);
  const average = recent.length
    ? recent.reduce((sum, e) => sum + e.score, 0) / recent.length
    : 0;
  const score = Math.round(
    average * 0.7 + (completed.size / path.days.length) * 30,
  );
  const level = levelFor(score);
  const nextThreshold = [25, 50, 80].find((n) => n > score);
  return {
    completed: [...completed],
    score,
    level,
    toNext: nextThreshold ? nextThreshold - score : 0,
    nextLevel: nextThreshold ? levelFor(nextThreshold) : null,
  };
}
