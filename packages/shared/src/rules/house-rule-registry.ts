import type { RuleMetadata } from './house-rule-types.js';
import { PRE_CHECK_PLUGINS, POST_PROCESS_PLUGINS } from './rules/index.js';

export function getAllRuleMetadata(): RuleMetadata[] {
  const seen = new Set<string>();
  const result: RuleMetadata[] = [];
  for (const plugin of [...PRE_CHECK_PLUGINS, ...POST_PROCESS_PLUGINS]) {
    if (!seen.has(plugin.meta.id)) {
      seen.add(plugin.meta.id);
      result.push(plugin.meta);
    }
  }
  return result;
}
