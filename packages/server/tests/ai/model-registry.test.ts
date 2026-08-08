import { createHash } from 'node:crypto';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as ort from 'onnxruntime-node';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_FEATURE_SCHEMA } from '../../src/ai/provider.js';
import {
  AiProviderRegistry,
  BUILTIN_AI_PROVIDER_ID,
  validateCommunityPluginManifest,
} from '../../src/ai/model-registry.js';
import { MAX_COMMUNITY_STRATEGY_BYTES } from '../../src/ai/community-plugin.js';
import { MAX_COMMUNITY_ONNX_TENSOR_ELEMENTS } from '../../src/ai/community-onnx-runtime.js';

const temporaryDirectories: string[] = [];
const originalPluginsDir = process.env['UNO_AI_PLUGINS_DIR'];
const originalSettingsFile = process.env['UNO_AI_PLUGIN_SETTINGS_FILE'];

afterEach(async () => {
  if (originalPluginsDir === undefined) delete process.env['UNO_AI_PLUGINS_DIR'];
  else process.env['UNO_AI_PLUGINS_DIR'] = originalPluginsDir;
  if (originalSettingsFile === undefined) delete process.env['UNO_AI_PLUGIN_SETTINGS_FILE'];
  else process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = originalSettingsFile;
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { recursive: true, force: true })
  )));
});

function hash(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function validManifest(entrySource = 'export default { decide: (context: any) => context.candidates[0].id };') {
  return {
    pluginSchemaVersion: 1,
    id: 'community-test-v1',
    displayName: 'Community Test V1',
    version: '1.0.0',
    entry: 'strategy.ts',
    entrySha256: hash(entrySource),
    featureSchema: AI_FEATURE_SCHEMA,
    dataAccess: ['candidate-features', 'public-state'],
    capabilities: {
      minPlayers: 2,
      maxPlayers: 10,
      supportedHouseRules: ['stackDrawTwo', 'jumpIn'],
    },
  };
}

async function createPluginPackage(options?: {
  root?: string;
  id?: string;
  source?: string;
  dataAccess?: string[];
  withOnnx?: boolean;
}): Promise<{ root: string; packageDir: string }> {
  const root = options?.root ?? await mkdtemp(join(tmpdir(), 'uno-ai-plugins-'));
  if (!options?.root) temporaryDirectories.push(root);
  const id = options?.id ?? 'community-test-v1';
  const packageDir = join(root, id);
  await mkdir(packageDir, { recursive: true });
  const source = options?.source
    ?? 'export default { decide: (context: any) => context.candidates[0].id };';
  await writeFile(join(packageDir, 'strategy.ts'), source, 'utf8');
  const manifest = {
    ...validManifest(source),
    id,
    dataAccess: options?.dataAccess ?? ['candidate-features'],
    capabilities: { minPlayers: 2, maxPlayers: 10, supportedHouseRules: 'all' },
  } as Record<string, unknown>;
  if (options?.withOnnx) {
    const bundledPath = new URL('../../src/ai/models/uno-rl.onnx', import.meta.url);
    const modelBytes = await readFile(bundledPath);
    await copyFile(bundledPath, join(packageDir, 'model.onnx'));
    manifest['onnx'] = {
      modelFile: 'model.onnx',
      onnxSha256: hash(modelBytes),
    };
  }
  await writeFile(join(packageDir, 'ai-plugin.json'), JSON.stringify(manifest), 'utf8');
  return { root, packageDir };
}

function request(deadlineMs = 1_000) {
  return {
    decisionId: 'test-decision',
    phase: 'playing',
    playerCount: 2,
    enabledHouseRules: [],
    featureSchema: AI_FEATURE_SCHEMA,
    candidates: [
      {
        id: 'candidate-a',
        features: Array.from({ length: 577 }, () => 0),
        heuristicScore: 0,
        teacherPreferred: false,
      },
      {
        id: 'candidate-b',
        features: Array.from({ length: 577 }, () => 0),
        heuristicScore: 1,
        teacherPreferred: true,
      },
    ],
    communityData: { opponentHands: [{ playerId: 'other', cards: [] }] },
    deadlineMs,
  };
}

describe('community AI plugin manifest', () => {
  it('accepts declared data access and an optional ONNX contract', () => {
    expect(validateCommunityPluginManifest(validManifest())).toMatchObject({
      id: 'community-test-v1',
      featureSchema: AI_FEATURE_SCHEMA,
      dataAccess: ['candidate-features', 'public-state'],
    });
  });

  it('rejects path traversal and undeclared permission names', () => {
    expect(() => validateCommunityPluginManifest({
      ...validManifest(),
      entry: '../strategy.ts',
    })).toThrow('local .ts filename');
    expect(() => validateCommunityPluginManifest({
      ...validManifest(),
      dataAccess: ['full-process-access'],
    })).toThrow('unknown permission');
  });

  it('rejects ignored manifest fields instead of accepting legacy shapes', () => {
    expect(() => validateCommunityPluginManifest({
      ...validManifest(),
      defaultProvider: true,
    })).toThrow('unknown fields: defaultProvider');
  });

  it('rejects unknown house rules', () => {
    const manifest = validManifest();
    expect(() => validateCommunityPluginManifest({
      ...manifest,
      capabilities: { ...manifest.capabilities, supportedHouseRules: ['notARealRule'] },
    })).toThrow('unknown rule');
  });

  it('does not grant candidate feature access implicitly to ONNX plugins', () => {
    expect(() => validateCommunityPluginManifest({
      ...validManifest(),
      dataAccess: [],
      onnx: {
        modelFile: 'model.onnx',
        onnxSha256: 'a'.repeat(64),
      },
    })).not.toThrow();
  });
});

describe('community AI plugin registry', () => {
  it('releases providers on dispose and can initialize again', async () => {
    const root = await mkdtemp(join(tmpdir(), 'uno-ai-empty-'));
    temporaryDirectories.push(root);
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const registry = new AiProviderRegistry();
    const original = await registry.get(BUILTIN_AI_PROVIDER_ID);
    expect(original).not.toBeNull();
    const dispose = vi.spyOn(original!, 'dispose');

    await registry.dispose();
    expect(dispose).toHaveBeenCalledOnce();

    const reloaded = await registry.get(BUILTIN_AI_PROVIDER_ID);
    expect(reloaded).not.toBeNull();
    expect(reloaded).not.toBe(original);
    await registry.dispose();
  });

  it('does not expose a host-created module object to the VM context', async () => {
    const source = `
      declare const module: any;
      module.constructor.constructor('return process')();
      export default { decide: (context: any) => context.candidates[0].id };
    `;
    const { root } = await createPluginPackage({ source });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const registry = new AiProviderRegistry();
    expect(await registry.get('community-test-v1')).toBeNull();
    expect((await registry.snapshot()).loadFailures[0]?.message)
      .toMatch(/Code generation from strings disallowed|not defined/);
  });

  it('rejects oversized TypeScript entries before compilation', async () => {
    const source = `export default { decide: (context: any) => context.candidates[0].id };\n/*${
      'x'.repeat(MAX_COMMUNITY_STRATEGY_BYTES)
    }*/`;
    const { root } = await createPluginPackage({ source });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const registry = new AiProviderRegistry();
    expect(await registry.get('community-test-v1')).toBeNull();
    expect((await registry.snapshot()).loadFailures[0]?.message)
      .toContain(`exceeds ${MAX_COMMUNITY_STRATEGY_BYTES} bytes`);
  });

  it('loads TypeScript once at startup and validates the returned candidate', async () => {
    const source = `
      export default {
        decide(context: any) {
          return context.arena.opponentHands.length > 0
            ? context.candidates[1].id
            : context.candidates[0].id;
        }
      };
    `;
    const { root } = await createPluginPackage({
      source,
      dataAccess: ['opponent-hands'],
    });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const registry = new AiProviderRegistry();
    const provider = await registry.get('community-test-v1');
    expect(provider?.metadata).toMatchObject({
      source: 'community',
      fairness: 'cheat',
      usesOnnx: false,
    });
    await expect(provider!.decide(request(), new AbortController().signal)).resolves.toEqual({
      kind: 'candidate',
      candidateId: 'candidate-b',
    });

    await createPluginPackage({ root, id: 'added-after-startup' });
    expect((await registry.listAll()).map(item => item.id)).not.toContain('added-after-startup');
  });

  it('accepts only a candidate id string from strategy.ts', async () => {
    const source = `
      export default {
        decide(context: any) {
          return { candidateId: context.candidates[0].id };
        }
      };
    `;
    const { root } = await createPluginPackage({ source });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const provider = await new AiProviderRegistry().get('community-test-v1');
    await expect(provider!.decide(request(), new AbortController().signal))
      .rejects.toThrow('illegal candidate id');
  });

  it('lets the plugin define ONNX inputs and interpret raw outputs', async () => {
    const source = `
      export default {
        prepareOnnx(context: any) {
          const input = context.onnx.model.inputs[0];
          const output = context.onnx.model.outputs[0];
          return {
            inputs: {
              [input.name]: {
                type: 'float32',
                dims: [1, context.candidates[0].features.length],
                data: context.candidates[0].features,
              },
            },
            outputNames: [output.name],
          };
        },
        decide(context: any) {
          const outputName = context.onnx.model.outputs[0].name;
          const values = context.onnx.outputs[outputName].data;
          return values.length === 1
            ? context.candidates[1].id
            : context.candidates[0].id;
        }
      };
    `;
    const { root } = await createPluginPackage({ source, withOnnx: true });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const registry = new AiProviderRegistry();
    const provider = await registry.get('community-test-v1');
    expect(provider?.metadata.usesOnnx).toBe(true);
    await expect(provider!.decide(request(), new AbortController().signal)).resolves.toEqual({
      kind: 'candidate',
      candidateId: 'candidate-b',
    });
    await provider?.dispose();
  });

  it('shares one deadline across ONNX preparation and final selection', async () => {
    const source = `
      function busyWait(milliseconds: number) {
        const startedAt = Date.now();
        while (Date.now() - startedAt < milliseconds) {}
      }
      export default {
        prepareOnnx(context: any) {
          busyWait(40);
          const input = context.onnx.model.inputs[0];
          const output = context.onnx.model.outputs[0];
          return {
            inputs: {
              [input.name]: {
                type: 'float32',
                dims: [1, context.candidates[0].features.length],
                data: context.candidates[0].features,
              },
            },
            outputNames: [output.name],
          };
        },
        decide(context: any) {
          busyWait(40);
          return context.candidates[0].id;
        },
      };
    `;
    const { root } = await createPluginPackage({ source, withOnnx: true });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const provider = await new AiProviderRegistry().get('community-test-v1');
    expect(provider).not.toBeNull();
    try {
      await expect(provider!.decide(request(60), new AbortController().signal))
        .rejects.toThrow(/timed out|deadline exhausted/);
    } finally {
      await provider?.dispose();
    }
  });

  it('releases inputs created before a later ONNX input fails validation', async () => {
    const source = `
      export default {
        prepareOnnx(context: any) {
          const input = context.onnx.model.inputs[0];
          const tensor = {
            type: 'float32',
            dims: [1, context.candidates[0].features.length],
            data: context.candidates[0].features,
          };
          return { inputs: { [input.name]: tensor, unknownInput: tensor } };
        },
        decide(context: any) {
          return context.candidates[0].id;
        },
      };
    `;
    const { root } = await createPluginPackage({ source, withOnnx: true });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const provider = await new AiProviderRegistry().get('community-test-v1');
    const dispose = vi.spyOn(ort.Tensor.prototype, 'dispose');
    try {
      await expect(provider!.decide(request(), new AbortController().signal))
        .rejects.toThrow('unknown ONNX input');
      expect(dispose).toHaveBeenCalled();
    } finally {
      dispose.mockRestore();
      await provider?.dispose();
    }
  });

  it('rejects ONNX tensors above the element limit without allocating them', async () => {
    const source = `
      export default {
        prepareOnnx(context: any) {
          const input = context.onnx.model.inputs[0];
          return {
            inputs: {
              [input.name]: {
                type: 'float32',
                dims: [${MAX_COMMUNITY_ONNX_TENSOR_ELEMENTS + 1}],
                data: [],
              },
            },
          };
        },
        decide(context: any) {
          return context.candidates[0].id;
        },
      };
    `;
    const { root } = await createPluginPackage({ source, withOnnx: true });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const provider = await new AiProviderRegistry().get('community-test-v1');
    try {
      await expect(provider!.decide(request(), new AbortController().signal))
        .rejects.toThrow(`exceeds the ${MAX_COMMUNITY_ONNX_TENSOR_ELEMENTS} element limit`);
    } finally {
      await provider?.dispose();
    }
  });

  it('requires an ONNX plugin to define its own preprocessing hook', async () => {
    const { root } = await createPluginPackage({ withOnnx: true });
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const registry = new AiProviderRegistry();
    expect(await registry.get('community-test-v1')).toBeNull();
    expect((await registry.snapshot()).loadFailures[0]?.message)
      .toContain('must define prepareOnnx(context)');
  });

  it('persists independent enable state without an implicit default provider', async () => {
    const { root } = await createPluginPackage();
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = join(root, 'settings.json');

    const registry = new AiProviderRegistry();
    expect((await registry.get('community-test-v1'))?.metadata.id).toBe('community-test-v1');
    await registry.setCommunityPluginEnabled('community-test-v1', false);
    expect(await registry.has('community-test-v1')).toBe(false);
    expect(await registry.get('community-test-v1')).toBeNull();
    expect((await registry.get('builtin-rl-v1'))?.metadata.id).toBe('builtin-rl-v1');

    const settings = JSON.parse(await readFile(join(root, 'settings.json'), 'utf8'));
    expect(settings).toEqual({
      disabledCommunityPluginIds: ['community-test-v1'],
    });
  });

  it('rejects legacy settings fields instead of silently enabling plugins', async () => {
    const { root } = await createPluginPackage();
    const settingsFile = join(root, 'settings.json');
    await writeFile(settingsFile, JSON.stringify({
      disabledCommunityPluginIds: [],
      defaultProviderId: 'community-test-v1',
    }), 'utf8');
    process.env['UNO_AI_PLUGINS_DIR'] = root;
    process.env['UNO_AI_PLUGIN_SETTINGS_FILE'] = settingsFile;

    await expect(new AiProviderRegistry().initialize())
      .rejects.toThrow('unknown fields: defaultProviderId');
  });
});
