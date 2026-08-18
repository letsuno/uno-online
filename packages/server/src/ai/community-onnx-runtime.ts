import * as ort from 'onnxruntime-node';
import { loadOnnxSession } from './onnx-runtime.js';

const TENSOR_TYPES = new Set<ort.Tensor.Type>([
  'float32',
  'uint8',
  'int8',
  'uint16',
  'int16',
  'int32',
  'int64',
  'string',
  'bool',
  'float16',
  'float64',
  'uint32',
  'uint64',
  'uint4',
  'int4',
]);

export const MAX_COMMUNITY_ONNX_MODEL_BYTES = 256 * 1024 * 1024;
export const MAX_COMMUNITY_ONNX_TENSOR_ELEMENTS = 8_000_000;
export const MAX_COMMUNITY_ONNX_TENSOR_BYTES = 64 * 1024 * 1024;
export const MAX_COMMUNITY_ONNX_TOTAL_INPUT_BYTES = 64 * 1024 * 1024;
export const MAX_COMMUNITY_ONNX_TOTAL_OUTPUT_BYTES = 64 * 1024 * 1024;

type JsonTensorScalar = number | string | boolean;

export interface CommunityOnnxTensor {
  type: ort.Tensor.Type;
  dims: readonly number[];
  data: readonly JsonTensorScalar[];
}

export interface CommunityOnnxValueMetadata {
  name: string;
  type: ort.Tensor.Type;
  shape: readonly (number | string)[];
}

export interface CommunityOnnxModelMetadata {
  inputs: readonly CommunityOnnxValueMetadata[];
  outputs: readonly CommunityOnnxValueMetadata[];
}

export interface CommunityOnnxRunResult {
  outputs: Readonly<Record<string, CommunityOnnxTensor>>;
}

function abortError(): Error {
  const error = new Error('AI decision aborted');
  error.name = 'AbortError';
  return error;
}

function assertExactKeys(value: Record<string, unknown>, allowedKeys: readonly string[], label: string): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(', ')}`);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function tensorElementCount(dims: readonly number[], label: string): number {
  let count = 1;
  for (const dimension of dims) {
    if (!Number.isSafeInteger(dimension) || dimension < 0) {
      throw new Error(`${label}.dims must contain non-negative safe integers`);
    }
    count *= dimension;
    if (!Number.isSafeInteger(count)) {
      throw new Error(`${label}.dims exceed the supported JavaScript array size`);
    }
    if (count > MAX_COMMUNITY_ONNX_TENSOR_ELEMENTS) {
      throw new Error(`${label} exceeds the ${MAX_COMMUNITY_ONNX_TENSOR_ELEMENTS} element limit`);
    }
  }
  return count;
}

function tensorByteLength(
  type: ort.Tensor.Type,
  elementCount: number,
  data: ArrayLike<unknown>,
  label: string,
): number {
  let byteLength: number;
  switch (type) {
    case 'string': {
      byteLength = 0;
      for (let index = 0; index < data.length; index++) {
        const value = data[index];
        if (typeof value === 'string') byteLength += Buffer.byteLength(value, 'utf8');
      }
      break;
    }
    case 'uint4':
    case 'int4':
      byteLength = Math.ceil(elementCount / 2);
      break;
    case 'uint8':
    case 'int8':
    case 'bool':
      byteLength = elementCount;
      break;
    case 'uint16':
    case 'int16':
    case 'float16':
      byteLength = elementCount * 2;
      break;
    case 'float32':
    case 'uint32':
    case 'int32':
      byteLength = elementCount * 4;
      break;
    default:
      byteLength = elementCount * 8;
  }
  if (byteLength > MAX_COMMUNITY_ONNX_TENSOR_BYTES) {
    throw new Error(`${label} exceeds the ${MAX_COMMUNITY_ONNX_TENSOR_BYTES} byte limit`);
  }
  return byteLength;
}

interface ParsedTensor {
  type: ort.Tensor.Type;
  dims: number[];
  data: unknown[];
  byteLength: number;
}

function parseTensor(value: unknown, label: string): ParsedTensor {
  const tensor = record(value, label);
  assertExactKeys(tensor, ['type', 'dims', 'data'], label);
  const type = tensor['type'];
  if (typeof type !== 'string' || !TENSOR_TYPES.has(type as ort.Tensor.Type)) {
    throw new Error(`${label}.type is not supported by ONNX Runtime`);
  }
  if (!Array.isArray(tensor['dims'])) throw new Error(`${label}.dims must be an array`);
  if (!Array.isArray(tensor['data'])) throw new Error(`${label}.data must be an array`);
  const tensorType = type as ort.Tensor.Type;
  const dims = tensor['dims'] as number[];
  const data = tensor['data'];
  const elementCount = tensorElementCount(dims, label);
  const expectedDataLength =
    tensorType === 'uint4' || tensorType === 'int4' ? Math.ceil(elementCount / 2) : elementCount;
  if (data.length !== expectedDataLength) {
    throw new Error(`${label}.data length does not match ${label}.dims`);
  }
  return {
    type: tensorType,
    dims,
    data,
    byteLength: tensorByteLength(tensorType, elementCount, data, label),
  };
}

function numericData(
  data: readonly unknown[],
  label: string,
  options?: { integer?: boolean; minimum?: number; maximum?: number },
): number[] {
  return data.map((value, index) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${label}.data[${index}] must be a finite number`);
    }
    if (options?.integer && !Number.isInteger(value)) {
      throw new Error(`${label}.data[${index}] must be an integer`);
    }
    if (
      (options?.minimum !== undefined && value < options.minimum) ||
      (options?.maximum !== undefined && value > options.maximum)
    ) {
      throw new Error(`${label}.data[${index}] is outside the ${label}.type range`);
    }
    return value;
  });
}

function int64Data(data: readonly unknown[], label: string, unsigned: boolean): bigint[] {
  const minimum = unsigned ? 0n : -(2n ** 63n);
  const maximum = unsigned ? 2n ** 64n - 1n : 2n ** 63n - 1n;
  return data.map((value, index) => {
    if (
      (typeof value !== 'string' || !/^-?\d+$/.test(value)) &&
      (typeof value !== 'number' || !Number.isSafeInteger(value))
    ) {
      throw new Error(`${label}.data[${index}] must be a decimal string or safe integer`);
    }
    const converted = BigInt(value);
    if (converted < minimum || converted > maximum) {
      throw new Error(`${label}.data[${index}] is outside the ${label}.type range`);
    }
    return converted;
  });
}

function createTensor({ type, dims, data }: ParsedTensor, label: string): ort.Tensor {
  switch (type) {
    case 'string':
      if (data.some(item => typeof item !== 'string')) {
        throw new Error(`${label}.data must contain only strings`);
      }
      return new ort.Tensor('string', data as string[], dims);
    case 'bool':
      if (data.some(item => typeof item !== 'boolean')) {
        throw new Error(`${label}.data must contain only booleans`);
      }
      return new ort.Tensor('bool', data as boolean[], dims);
    case 'int64':
      return new ort.Tensor('int64', int64Data(data, label, false), dims);
    case 'uint64':
      return new ort.Tensor('uint64', int64Data(data, label, true), dims);
    case 'float16':
      return new ort.Tensor(
        'float16',
        new Uint16Array(
          numericData(data, label, {
            integer: true,
            minimum: 0,
            maximum: 65_535,
          }),
        ),
        dims,
      );
    case 'uint4':
      return new ort.Tensor(
        'uint4',
        new Uint8Array(
          numericData(data, label, {
            integer: true,
            minimum: 0,
            maximum: 255,
          }),
        ),
        dims,
      );
    case 'int4':
      return new ort.Tensor(
        'int4',
        new Int8Array(
          numericData(data, label, {
            integer: true,
            minimum: -128,
            maximum: 127,
          }),
        ),
        dims,
      );
    case 'uint8':
      return new ort.Tensor(
        'uint8',
        numericData(data, label, {
          integer: true,
          minimum: 0,
          maximum: 255,
        }),
        dims,
      );
    case 'int8':
      return new ort.Tensor(
        'int8',
        numericData(data, label, {
          integer: true,
          minimum: -128,
          maximum: 127,
        }),
        dims,
      );
    case 'uint16':
      return new ort.Tensor(
        'uint16',
        numericData(data, label, {
          integer: true,
          minimum: 0,
          maximum: 65_535,
        }),
        dims,
      );
    case 'int16':
      return new ort.Tensor(
        'int16',
        numericData(data, label, {
          integer: true,
          minimum: -32_768,
          maximum: 32_767,
        }),
        dims,
      );
    case 'uint32':
      return new ort.Tensor(
        'uint32',
        numericData(data, label, {
          integer: true,
          minimum: 0,
          maximum: 4_294_967_295,
        }),
        dims,
      );
    case 'int32':
      return new ort.Tensor(
        'int32',
        numericData(data, label, {
          integer: true,
          minimum: -2_147_483_648,
          maximum: 2_147_483_647,
        }),
        dims,
      );
    case 'float32':
      return new ort.Tensor('float32', numericData(data, label), dims);
    case 'float64':
      return new ort.Tensor('float64', numericData(data, label), dims);
  }
}

function outputTensorByteLength(tensor: ort.Tensor, name: string): number {
  const elementCount = tensorElementCount(tensor.dims, `ONNX output ${name}`);
  return tensorByteLength(tensor.type, elementCount, tensor.data, `ONNX output ${name}`);
}

function serializeTensor(tensor: ort.Tensor, name: string): CommunityOnnxTensor {
  let data: JsonTensorScalar[];
  if (tensor.type === 'int64' || tensor.type === 'uint64') {
    data = Array.from(tensor.data as BigInt64Array | BigUint64Array, value => value.toString());
  } else if (tensor.type === 'bool') {
    data = Array.from(tensor.data as Uint8Array, value => value !== 0);
  } else {
    data = Array.from(tensor.data as ArrayLike<number | string>);
    if (data.some(value => typeof value === 'number' && !Number.isFinite(value))) {
      throw new Error(`ONNX output ${name} contains a non-finite number`);
    }
  }
  return { type: tensor.type, dims: [...tensor.dims], data };
}

function valueMetadata(
  metadata: readonly ort.InferenceSession.ValueMetadata[],
  label: string,
): CommunityOnnxValueMetadata[] {
  return metadata.map(value => {
    if (!value.isTensor) throw new Error(`${label} ${value.name} is not a tensor`);
    return { name: value.name, type: value.type, shape: [...value.shape] };
  });
}

export class CommunityOnnxRuntime {
  readonly metadata: CommunityOnnxModelMetadata;
  private readonly session: ort.InferenceSession;

  private constructor(session: ort.InferenceSession) {
    this.session = session;
    this.metadata = {
      inputs: valueMetadata(session.inputMetadata, 'ONNX input'),
      outputs: valueMetadata(session.outputMetadata, 'ONNX output'),
    };
  }

  static async create(options: {
    modelPath: string;
    expectedSha256: string;
    pluginId: string;
  }): Promise<CommunityOnnxRuntime> {
    const session = await loadOnnxSession({
      modelPath: options.modelPath,
      expectedSha256: options.expectedSha256,
      modelId: options.pluginId,
      maximumModelBytes: MAX_COMMUNITY_ONNX_MODEL_BYTES,
    });
    try {
      return new CommunityOnnxRuntime(session);
    } catch (error) {
      await session.release();
      throw error;
    }
  }

  async run(value: unknown, signal: AbortSignal): Promise<CommunityOnnxRunResult> {
    if (signal.aborted) throw abortError();
    const request = record(value, 'prepareOnnx result');
    assertExactKeys(request, ['inputs', 'outputNames'], 'prepareOnnx result');
    const rawInputs = record(request['inputs'], 'prepareOnnx result.inputs');
    if (Object.keys(rawInputs).length === 0) {
      throw new Error('prepareOnnx result.inputs must not be empty');
    }
    const feeds = Object.create(null) as Record<string, ort.Tensor>;
    let outputs: ort.InferenceSession.ReturnType | undefined;
    try {
      let totalInputBytes = 0;
      for (const [name, tensor] of Object.entries(rawInputs)) {
        if (!this.session.inputNames.includes(name)) {
          throw new Error(`prepareOnnx returned unknown ONNX input: ${name}`);
        }
        const label = `prepareOnnx result.inputs.${name}`;
        const parsed = parseTensor(tensor, label);
        totalInputBytes += parsed.byteLength;
        if (totalInputBytes > MAX_COMMUNITY_ONNX_TOTAL_INPUT_BYTES) {
          throw new Error(`ONNX inputs exceed the ${MAX_COMMUNITY_ONNX_TOTAL_INPUT_BYTES} total byte limit`);
        }
        feeds[name] = createTensor(parsed, label);
      }
      const missingInputs = this.session.inputNames.filter(name => feeds[name] === undefined);
      if (missingInputs.length > 0) {
        throw new Error(`prepareOnnx omitted ONNX inputs: ${missingInputs.join(', ')}`);
      }

      let outputNames: string[] | undefined;
      if (request['outputNames'] !== undefined) {
        if (
          !Array.isArray(request['outputNames']) ||
          request['outputNames'].length === 0 ||
          request['outputNames'].some(name => typeof name !== 'string') ||
          new Set(request['outputNames']).size !== request['outputNames'].length
        ) {
          throw new Error('prepareOnnx result.outputNames must be unique ONNX output names');
        }
        outputNames = request['outputNames'] as string[];
        const unknownOutputs = outputNames.filter(name => !this.session.outputNames.includes(name));
        if (unknownOutputs.length > 0) {
          throw new Error(`prepareOnnx requested unknown ONNX outputs: ${unknownOutputs.join(', ')}`);
        }
      }

      if (signal.aborted) throw abortError();
      outputs = outputNames ? await this.session.run(feeds, outputNames) : await this.session.run(feeds);
      if (signal.aborted) throw abortError();
      let totalOutputBytes = 0;
      const serializedOutputs: Record<string, CommunityOnnxTensor> = Object.create(null);
      for (const [name, tensor] of Object.entries(outputs)) {
        totalOutputBytes += outputTensorByteLength(tensor, name);
        if (totalOutputBytes > MAX_COMMUNITY_ONNX_TOTAL_OUTPUT_BYTES) {
          throw new Error(`ONNX outputs exceed the ${MAX_COMMUNITY_ONNX_TOTAL_OUTPUT_BYTES} total byte limit`);
        }
        serializedOutputs[name] = serializeTensor(tensor, name);
      }
      return { outputs: serializedOutputs };
    } finally {
      for (const tensor of Object.values(feeds)) tensor.dispose();
      if (outputs) {
        for (const tensor of Object.values(outputs)) tensor.dispose();
      }
    }
  }

  async dispose(): Promise<void> {
    await this.session.release();
  }
}
