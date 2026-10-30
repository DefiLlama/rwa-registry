/**
 * fieldPath: a JSON path such as deployments[0].deployedAt as its steps, and the value set at it on a copy.
 * @dev review: src/cli/fieldValue.ts, src/cli/commands/set.ts
 */
export type Step = string | number;

export const stepsOf = (path: string): Step[] =>
  path.split(/\.|(?=\[)/).map((step) => (/^\[\d+\]$/.test(step) ? Number(step.slice(1, -1)) : step));

export const setAt = (target: unknown, steps: Step[], value: unknown): unknown => {
  if (!steps.length) return value;
  const [step, ...rest] = steps;
  const copy = (Array.isArray(target) ? [...target] : { ...(target as object) }) as Record<Step, unknown>;
  copy[step!] = setAt(copy[step!] ?? (typeof rest[0] === 'number' ? [] : {}), rest, value);
  return copy;
};
