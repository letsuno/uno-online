import type { PlayerView } from '@uno-online/shared';
import { HOUSE_RULE_DESCRIPTIONS } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';

export function formatActiveRules(
  settings: PlayerView['settings'],
): { key: string; value: unknown; description: string }[] {
  const rules: { key: string; value: unknown; description: string }[] = [];
  for (const key of Object.keys(settings.houseRules) as (keyof HouseRules)[]) {
    const value = settings.houseRules[key];
    if (value === false || value === null) continue;
    rules.push({ key, value, description: HOUSE_RULE_DESCRIPTIONS[key] });
  }
  return rules;
}

function ok(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }],
  };
}

function fail(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: 'text' as const, text: `错误: ${message}` }], isError: true };
}

export function wrapTool(fn: () => Promise<unknown> | unknown) {
  return Promise.resolve().then(fn).then(ok, fail);
}
