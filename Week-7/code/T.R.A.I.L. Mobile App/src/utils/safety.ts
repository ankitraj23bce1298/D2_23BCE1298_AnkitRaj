// utils/safety.ts
import scores from '../assets/safety_scores_2022.json';

export type SafetyScores = { [state: string]: number };

export function getSafetyScoreForState(state?: string): number | null {
  if (!state) return null;
  // normalize common variations
  const norm = state.trim().toLowerCase();
  const found = Object.entries(scores as SafetyScores).find(([k]) => k.trim().toLowerCase() === norm);
  return found ? found[1] : null;
}

// A quick label + color for UI
export function safetyBadge(score?: number | null) {
  if (score == null) return { label: 'N/A', bg: '#E5E7EB', fg: '#374151' };
  if (score >= 80) return { label: `${score}/100 • Safe`, bg: '#D1FAE5', fg: '#065F46' };
  if (score >= 60) return { label: `${score}/100 • Moderate`, bg: '#FEF3C7', fg: '#92400E' };
  return { label: `${score}/100 • Caution`, bg: '#FEE2E2', fg: '#991B1B' };
}
