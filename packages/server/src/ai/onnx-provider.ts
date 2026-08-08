import * as ort from 'onnxruntime-node';
import type {
  AiDecisionRequest,
  AiProvider,
  AiProviderMetadata,
  AiValueDecision,
} from './provider.js';
import { loadOnnxSession } from './onnx-runtime.js';

interface OnnxProviderOptions {
  modelPath: string;
  inputName: string;
  outputName: string;
  featureCount: number;
  expectedSha256: string;
  rulePriorBlend: number;
  teacherPriorBonus: number;
  metadata: AiProviderMetadata;
}

function abortError(): Error {
  const error = new Error('AI decision aborted');
  error.name = 'AbortError';
  return error;
}

export class OnnxValueProvider implements AiProvider {
  readonly metadata: AiProviderMetadata;
  private readonly session: ort.InferenceSession;
  private readonly inputName: string;
  private readonly outputName: string;
  private readonly featureCount: number;
  private readonly rulePriorBlend: number;
  private readonly teacherPriorBonus: number;

  private constructor(options: OnnxProviderOptions, session: ort.InferenceSession) {
    this.metadata = options.metadata;
    this.session = session;
    this.inputName = options.inputName;
    this.outputName = options.outputName;
    this.featureCount = options.featureCount;
    this.rulePriorBlend = options.rulePriorBlend;
    this.teacherPriorBonus = options.teacherPriorBonus;
  }

  static async create(options: OnnxProviderOptions): Promise<OnnxValueProvider> {
    const session = await loadOnnxSession({
      modelPath: options.modelPath,
      expectedSha256: options.expectedSha256,
      modelId: options.metadata.id,
    });

    if (!session.inputNames.includes(options.inputName)
      || !session.outputNames.includes(options.outputName)) {
      await session.release();
      throw new Error(`ONNX input/output mismatch for model ${options.metadata.id}`);
    }

    const warmup = new ort.Tensor(
      'float32',
      new Float32Array(options.featureCount),
      [1, options.featureCount],
    );
    let outputs: ort.InferenceSession.ReturnType | undefined;
    try {
      outputs = await session.run({ [options.inputName]: warmup }, [options.outputName]);
      const output = outputs[options.outputName];
      if (!(output instanceof ort.Tensor) || output.data.length !== 1) {
        throw new Error(`ONNX output shape mismatch for model ${options.metadata.id}`);
      }
      return new OnnxValueProvider(options, session);
    } catch (error) {
      await session.release();
      throw error;
    } finally {
      warmup.dispose();
      if (outputs) {
        for (const tensor of Object.values(outputs)) tensor.dispose();
      }
    }
  }

  async decide(request: AiDecisionRequest, signal: AbortSignal): Promise<AiValueDecision> {
    if (signal.aborted) throw abortError();
    const flat = new Float32Array(request.candidates.length * this.featureCount);
    for (let row = 0; row < request.candidates.length; row++) {
      const values = request.candidates[row]?.features;
      if (!values || values.length !== this.featureCount) {
        throw new Error(`feature count mismatch for model ${this.metadata.id}`);
      }
      flat.set(values, row * this.featureCount);
    }
    if (signal.aborted) throw abortError();

    const input = new ort.Tensor(
      'float32',
      flat,
      [request.candidates.length, this.featureCount],
    );
    let outputs: ort.InferenceSession.ReturnType | undefined;
    try {
      outputs = await this.session.run(
        { [this.inputName]: input },
        [this.outputName],
      );
      if (signal.aborted) throw abortError();
      const output = outputs[this.outputName];
      if (!(output instanceof ort.Tensor) || output.data.length !== request.candidates.length) {
        throw new Error(`ONNX output shape mismatch for model ${this.metadata.id}`);
      }
      const values = Array.from(output.data as Float32Array, (value, index) => Number(value)
        + request.candidates[index]!.heuristicScore * this.rulePriorBlend
        + (request.candidates[index]!.teacherPreferred ? this.teacherPriorBonus : 0));
      if (!values.every(Number.isFinite)) {
        throw new Error(`ONNX returned non-finite values for model ${this.metadata.id}`);
      }
      return { kind: 'values', values };
    } finally {
      input.dispose();
      if (outputs) {
        for (const tensor of Object.values(outputs)) tensor.dispose();
      }
    }
  }

  async dispose(): Promise<void> {
    await this.session.release();
  }
}
