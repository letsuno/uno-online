import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import * as ort from 'onnxruntime-node';

export function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function requestedExecutionProviders(): ort.InferenceSession.ExecutionProviderConfig[] {
  const requested = process.env['UNO_RL_ONNX_EP'];
  if (!requested || requested === 'cpu') return ['cpu'];
  if (requested === 'cuda' || requested === 'dml') return [requested];
  throw new Error(`unsupported UNO_RL_ONNX_EP: ${requested}`);
}

export async function loadOnnxSession(options: {
  modelPath: string;
  expectedSha256: string;
  modelId: string;
  maximumModelBytes?: number;
}): Promise<ort.InferenceSession> {
  if (options.maximumModelBytes !== undefined) {
    const modelStats = await stat(options.modelPath);
    if (!modelStats.isFile()) throw new Error(`ONNX model is not a file for model ${options.modelId}`);
    if (modelStats.size > options.maximumModelBytes) {
      throw new Error(`ONNX model exceeds ${options.maximumModelBytes} bytes for model ${options.modelId}`);
    }
  }
  const modelBytes = await readFile(options.modelPath);
  if (options.maximumModelBytes !== undefined && modelBytes.byteLength > options.maximumModelBytes) {
    throw new Error(`ONNX model exceeds ${options.maximumModelBytes} bytes for model ${options.modelId}`);
  }
  if (sha256(modelBytes) !== options.expectedSha256) {
    throw new Error(`ONNX hash mismatch for model ${options.modelId}`);
  }
  return ort.InferenceSession.create(modelBytes, {
    executionProviders: requestedExecutionProviders(),
    graphOptimizationLevel: 'all',
    executionMode: 'sequential',
    enableCpuMemArena: true,
    enableMemPattern: true,
    logSeverityLevel: 3,
  });
}
