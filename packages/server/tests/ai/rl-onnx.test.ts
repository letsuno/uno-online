import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  canonicalizeRlPlans,
  enumerateLegalActionPlans,
  initializeGame,
  rlPlanKey,
} from '@uno-online/shared';
import {
  chooseBotActionWithAi,
  buildCommunityData,
} from '../../src/ai/rl-onnx.js';
import {
  aiProviderRegistry,
  BUILTIN_AI_PROVIDER_ID,
  validateManifest,
  type RlOnnxManifest,
} from '../../src/ai/model-registry.js';

const originalRandom = Math.random;

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

async function productionFiles(): Promise<[Uint8Array, RlOnnxManifest]> {
  const [modelBytes, manifestText] = await Promise.all([
    readFile(new URL('../../src/ai/models/uno-rl.onnx', import.meta.url)),
    readFile(new URL('../../src/ai/models/uno-rl.manifest.json', import.meta.url), 'utf8'),
  ]);
  return [modelBytes, JSON.parse(manifestText) as RlOnnxManifest];
}

describe('server production ONNX RL runtime', () => {
  beforeAll(() => {
    Math.random = seededRandom(20_261_107);
  });

  afterAll(() => {
    Math.random = originalRandom;
  });

  it('loads the hash-checked bundled model', async () => {
    await expect(aiProviderRegistry.get(BUILTIN_AI_PROVIDER_ID)).resolves.toMatchObject({
      metadata: { id: BUILTIN_AI_PROVIDER_ID },
    });
  });

  it('accepts only the sealed production manifest contract', async () => {
    const [modelBytes, manifest] = await productionFiles();

    expect(() => validateManifest(manifest, modelBytes)).not.toThrow();
    expect(() => validateManifest({
      ...manifest,
      architecture: 'unsupported',
    }, modelBytes)).toThrow('unsupported production ONNX manifest');
    expect(() => validateManifest({
      ...manifest,
      featureCount: manifest.featureCount + 1,
    }, modelBytes)).toThrow('feature contract mismatch');
    expect(() => validateManifest({
      ...manifest,
      safetyValueFeatureIndex: 0,
    }, modelBytes)).toThrow('safety contract mismatch');
    expect(() => validateManifest(manifest, new Uint8Array(modelBytes.length)))
      .toThrow('integrity check failed');
  });

  it('returns a deterministic legal action across shuffled states', async () => {
    for (let game = 0; game < 32; game++) {
      const state = initializeGame(Array.from({ length: 2 + game % 9 }, (_, index) => ({
        id: `p${index}`,
        name: `Bot ${index}`,
        isBot: true,
        botConfig: {
          difficulty: 'rl' as const,
          personality: 'strategic' as const,
          aiProviderId: 'builtin-rl-v1',
        },
      })));
      const playerId = state.players[state.currentPlayerIndex]?.id;
      expect(playerId).toBeDefined();
      if (!playerId) continue;
      const legalKeys = new Set(canonicalizeRlPlans(
        enumerateLegalActionPlans(state, playerId, { kind: 'turn' }).plans,
      ).map(rlPlanKey));
      const first = await chooseBotActionWithAi(state, playerId);
      const second = await chooseBotActionWithAi(state, playerId);
      expect(legalKeys.has(rlPlanKey(first.actions))).toBe(true);
      expect(second.actions).toEqual(first.actions);
    }
  });

  it('only exposes arena data explicitly declared by a community plugin', () => {
    const state = initializeGame(Array.from({ length: 3 }, (_, index) => ({
      id: `permission-p${index}`,
      name: `Player ${index}`,
      isBot: true,
      botConfig: { difficulty: 'rl' as const, personality: 'strategic' as const, aiProviderId: 'test-provider' },
    })));
    const publicOnly = buildCommunityData(state, 'permission-p0', ['public-state']);
    expect(publicOnly).toHaveProperty('publicState');
    expect(publicOnly).not.toHaveProperty('ownHand');
    expect(publicOnly).not.toHaveProperty('opponentHands');
    expect(publicOnly).not.toHaveProperty('drawPiles');

    const cheating = buildCommunityData(state, 'permission-p0', [
      'own-hand',
      'opponent-hands',
      'draw-piles',
    ]);
    expect(cheating).toMatchObject({
      ownHand: state.players[0]!.hand,
      opponentHands: [
        { playerId: 'permission-p1', cards: state.players[1]!.hand },
        { playerId: 'permission-p2', cards: state.players[2]!.hand },
      ],
      drawPiles: { left: state.deckLeft, right: state.deckRight },
    });
  });
});
