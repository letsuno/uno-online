import type { PlayerView } from '@uno-online/shared';
import { HOUSE_RULE_DESCRIPTIONS } from '@uno-online/shared';
import type { HouseRules } from '@uno-online/shared';

export function formatActiveRules(settings: PlayerView['settings']): { key: string; value: unknown; description: string }[] {
  const rules: { key: string; value: unknown; description: string }[] = [];
  if (!settings?.houseRules) return rules;
  for (const [key, value] of Object.entries(settings.houseRules)) {
    if (value === false || value === null || value === undefined) continue;
    rules.push({ key, value, description: HOUSE_RULE_DESCRIPTIONS[key as keyof HouseRules] ?? key });
  }
  return rules;
}

function ok(data: unknown) {
  return { content: [{ type: 'text' as const, text: typeof data === 'string' ? data : JSON.stringify(data, null, 2) }] };
}

function fail(err: unknown) {
  return { content: [{ type: 'text' as const, text: `错误: ${(err as Error).message}` }], isError: true };
}

export function wrapTool(fn: () => Promise<unknown> | unknown) {
  return Promise.resolve().then(fn).then(ok, fail);
}
