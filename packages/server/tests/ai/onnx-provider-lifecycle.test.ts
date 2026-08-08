import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as ort from 'onnxruntime-node';
import { describe, expect, it, vi } from 'vitest';
import { OnnxValueProvider } from '../../src/ai/onnx-provider.js';
import { AI_FEATURE_SCHEMA } from '../../src/ai/provider.js';
import { loadOnnxSession } from '../../src/ai/onnx-runtime.js';

describe('built-in ONNX tensor lifecycle', () => {
  it('rejects a model above a caller-provided size limit before loading it', async () => {
    const modelPath = new URL('../../src/ai/models/uno-rl.onnx', import.meta.url);
    await expect(loadOnnxSession({
      modelPath: fileURLToPath(modelPath),
      expectedSha256: 'unused',
      modelId: 'size-limit-test',
      maximumModelBytes: 0,
    })).rejects.toThrow('ONNX model exceeds 0 bytes');
  });

  it('releases warmup, input, and output tensors', async () => {
    const modelPath = new URL('../../src/ai/models/uno-rl.onnx', import.meta.url);
    const manifest = JSON.parse(await readFile(
      new URL('../../src/ai/models/uno-rl.manifest.json', import.meta.url),
      'utf8',
    )) as { inputName: string; outputName: string; featureCount: number; onnxSha256: string };
    const dispose = vi.spyOn(ort.Tensor.prototype, 'dispose');
    let provider: OnnxValueProvider | undefined;
    try {
      provider = await OnnxValueProvider.create({
        modelPath: fileURLToPath(modelPath),
        inputName: manifest.inputName,
        outputName: manifest.outputName,
        featureCount: manifest.featureCount,
        expectedSha256: manifest.onnxSha256,
        rulePriorBlend: 0,
        teacherPriorBonus: 0,
        metadata: {
          id: 'lifecycle-test',
          displayName: 'Lifecycle Test',
          version: '1',
          source: 'builtin',
          usesOnnx: true,
          dataAccess: ['candidate-features'],
          fairness: 'fair',
          capabilities: { minPlayers: 2, maxPlayers: 10, supportedHouseRules: 'all' },
        },
      });
      expect(dispose).toHaveBeenCalledTimes(2);

      dispose.mockClear();
      await provider.decide({
        decisionId: 'tensor-lifecycle',
        phase: 'playing',
        playerCount: 2,
        enabledHouseRules: [],
        featureSchema: AI_FEATURE_SCHEMA,
        candidates: [{
          id: 'candidate',
          features: Array.from({ length: manifest.featureCount }, () => 0),
          heuristicScore: 0,
          teacherPreferred: false,
        }],
        deadlineMs: 1_000,
      }, new AbortController().signal);
      expect(dispose).toHaveBeenCalledTimes(2);
    } finally {
      await provider?.dispose();
      dispose.mockRestore();
    }
  });
});
