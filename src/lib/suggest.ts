import { pretty, prettyShort } from './dates';
import type { Overview } from './overview';
import { inr } from './rewards';

/** One headline suggestion for the Home screen and weekly summary. */
export function topSuggestion(o: Overview): string | null {
  const primaries = o.summaries.filter((s) => !s.card.is_addon);
  if (!primaries.length) return null;
  const targeted = primaries
    .filter((s) => s.gate && s.gateTargeted && s.gate.current.remaining > 0)
    .sort((a, b) => a.gate!.current.daysLeft - b.gate!.current.daysLeft)[0];
  if (targeted) {
    const g = targeted.gate!;
    return `Put everyday spends on ${targeted.card.name}: ${inr(g.current.remaining)} more by ${prettyShort(g.current.end)} (≈${inr(g.current.perDayNeeded)}/day) unlocks lounge access.`;
  }
  const best = [...primaries].sort((a, b) => b.cycle.interestFreeDays - a.cycle.interestFreeDays)[0];
  return `Pay with ${best.card.name} today for ${best.cycle.interestFreeDays} interest-free days (bill due ${pretty(best.cycle.nextDue)}).`;
}

export function weeklySummary(o: Overview): string {
  const lines: string[] = [];
  const primaries = o.summaries.filter((s) => !s.card.is_addon);
  const risky = primaries.filter((s) => s.gate && s.gate.current.remaining > 0 && (s.gate.atRisk || s.gate.close));
  if (risky.length) {
    lines.push('Gates at risk: ' + risky.map((s) => `${s.card.name} needs ${inr(s.gate!.current.remaining)} by ${prettyShort(s.gate!.current.end)}`).join('; '));
  }
  const expiring = primaries.flatMap((s) =>
    s.quotas.filter((q) => (q.left ?? 0) > 0 && Date.parse(q.resetsOn) - Date.parse(o.today) <= 21 * 86_400_000)
      .map((q) => `${s.card.name}: ${q.left} ${q.type} lounge visit(s) reset ${prettyShort(q.resetsOn)}`));
  if (expiring.length) lines.push('Lounges expiring: ' + expiring.join('; '));
  const fees = primaries.filter((s) => s.feeWaiver && s.feeWaiver.pct < 1);
  if (fees.length) {
    lines.push('Fee waiver: ' + fees.map((s) => `${s.card.name} ${Math.round(s.feeWaiver!.pct * 100)}% of ${inr(s.feeWaiver!.target)}`).join('; '));
  }
  const tip = topSuggestion(o);
  if (tip) lines.push(tip);
  return lines.join('\n') || 'All quiet this week.';
}
