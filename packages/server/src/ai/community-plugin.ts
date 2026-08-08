import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createContext, Script, type Context } from 'node:vm';
import * as ts from 'typescript';
import type {
  AiDecisionRequest,
  AiProvider,
  AiProviderDecision,
  AiProviderMetadata,
  AiPluginDataAccess,
} from './provider.js';
import {
  CommunityOnnxRuntime,
  type CommunityOnnxModelMetadata,
  type CommunityOnnxTensor,
} from './community-onnx-runtime.js';
import { sha256 } from './onnx-runtime.js';

export const MAX_COMMUNITY_STRATEGY_BYTES = 512 * 1024;
export const MAX_COMMUNITY_VM_MESSAGE_BYTES = 32 * 1024 * 1024;

export interface CommunityPluginOnnxManifest {
  modelFile: string;
  onnxSha256: string;
}

export interface CommunityAiPluginManifest {
  pluginSchemaVersion: 1;
  id: string;
  displayName: string;
  version: string;
  entry: string;
  entrySha256: string;
  featureSchema: string;
  dataAccess: AiPluginDataAccess[];
  onnx?: CommunityPluginOnnxManifest;
  capabilities: {
    minPlayers: number;
    maxPlayers: number;
    supportedHouseRules: 'all' | string[];
  };
}

interface CommunityPluginCandidate {
  id: string;
  features?: readonly number[];
  heuristicScore: number;
  teacherPreferred: boolean;
}

interface CommunityPluginOnnxContext {
  model: CommunityOnnxModelMetadata;
  outputs?: Readonly<Record<string, CommunityOnnxTensor>>;
}

interface CommunityPluginRequest {
  decisionId: string;
  phase: string;
  playerCount: number;
  enabledHouseRules: readonly string[];
  featureSchema: string;
  candidates: readonly CommunityPluginCandidate[];
  arena?: Readonly<Record<string, unknown>>;
  onnx?: CommunityPluginOnnxContext;
  deadlineMs: number;
}

function diagnosticsText(diagnostics: readonly ts.Diagnostic[] | undefined): string {
  return (diagnostics ?? [])
    .filter(diagnostic => diagnostic.category === ts.DiagnosticCategory.Error)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))
    .join('; ');
}

function compileStrategy(source: string, entry: string): string {
  const result = ts.transpileModule(source, {
    fileName: entry,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      strict: true,
      esModuleInterop: true,
      isolatedModules: true,
    },
  });
  const errors = diagnosticsText(result.diagnostics);
  if (errors) throw new Error(`TypeScript strategy compilation failed: ${errors}`);
  return result.outputText;
}

function createStrategyContext(
  compiledSource: string,
  pluginId: string,
  usesOnnx: boolean,
): Context {
  const context = createContext(
    {},
    {
      name: `uno-community-ai:${pluginId}`,
      codeGeneration: { strings: false, wasm: false },
      microtaskMode: 'afterEvaluate',
    },
  );
  new Script(`
    globalThis.module = { exports: Object.create(null) };
    globalThis.exports = globalThis.module.exports;
  `, { filename: `${pluginId}/module-bootstrap.js` }).runInContext(context, { timeout: 100 });
  new Script(compiledSource, { filename: `${pluginId}/strategy.js` })
    .runInContext(context, { timeout: 250 });
  const onnxContract = usesOnnx
    ? `
      if (typeof globalThis.__strategy.prepareOnnx !== 'function') {
        throw new Error('an ONNX plugin must define prepareOnnx(context)');
      }
    `
    : `
      if ('prepareOnnx' in globalThis.__strategy) {
        throw new Error('prepareOnnx(context) requires an ONNX model');
      }
    `;
  new Script(`
    globalThis.__strategy = module.exports.default;
    if (!globalThis.__strategy || typeof globalThis.__strategy.decide !== 'function') {
      throw new Error('strategy.ts must default-export an object with decide(context)');
    }
    ${onnxContract}
    globalThis.__deepFreeze = (value) => {
      if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value)) globalThis.__deepFreeze(child);
      }
      return value;
    };
    delete globalThis.module;
    delete globalThis.exports;
  `, { filename: `${pluginId}/bootstrap.js` }).runInContext(context, { timeout: 100 });
  return context;
}

function remainingStrategyTimeout(deadlineAt: number): number {
  const remainingMs = Math.floor(deadlineAt - performance.now());
  if (remainingMs <= 0) throw new Error('AI decision deadline exhausted');
  return Math.min(remainingMs, 1_000);
}

export class CommunityAiPlugin implements AiProvider {
  readonly metadata: AiProviderMetadata;
  private readonly context: Context;
  private readonly onnx: CommunityOnnxRuntime | null;
  private readonly prepareOnnxScript: Script | null;
  private readonly decideScript: Script;

  private constructor(
    metadata: AiProviderMetadata,
    context: Context,
    onnx: CommunityOnnxRuntime | null,
  ) {
    this.metadata = metadata;
    this.context = context;
    this.onnx = onnx;
    this.prepareOnnxScript = onnx ? new Script(`
      JSON.stringify(globalThis.__strategy.prepareOnnx(
        globalThis.__deepFreeze(JSON.parse(globalThis.__requestJson))
      ))
    `, { filename: `${metadata.id}/prepare-onnx.js` }) : null;
    this.decideScript = new Script(`
      JSON.stringify(globalThis.__strategy.decide(
        globalThis.__deepFreeze(JSON.parse(globalThis.__requestJson))
      ))
    `, { filename: `${metadata.id}/decide.js` });
  }

  static async create(options: {
    packageDir: string;
    manifest: CommunityAiPluginManifest;
    metadata: AiProviderMetadata;
  }): Promise<CommunityAiPlugin> {
    const { packageDir, manifest, metadata } = options;
    const entryPath = join(packageDir, manifest.entry);
    const entryStats = await stat(entryPath);
    if (!entryStats.isFile()) throw new Error(`TypeScript entry is not a file for plugin ${manifest.id}`);
    if (entryStats.size > MAX_COMMUNITY_STRATEGY_BYTES) {
      throw new Error(
        `TypeScript entry exceeds ${MAX_COMMUNITY_STRATEGY_BYTES} bytes for plugin ${manifest.id}`,
      );
    }
    const entryBytes = await readFile(entryPath);
    if (entryBytes.byteLength > MAX_COMMUNITY_STRATEGY_BYTES) {
      throw new Error(
        `TypeScript entry exceeds ${MAX_COMMUNITY_STRATEGY_BYTES} bytes for plugin ${manifest.id}`,
      );
    }
    if (sha256(entryBytes) !== manifest.entrySha256) {
      throw new Error(`TypeScript entry hash mismatch for plugin ${manifest.id}`);
    }
    const context = createStrategyContext(
      compileStrategy(entryBytes.toString('utf8'), manifest.entry),
      manifest.id,
      manifest.onnx !== undefined,
    );

    let onnx: CommunityOnnxRuntime | null = null;
    if (manifest.onnx) {
      onnx = await CommunityOnnxRuntime.create({
        modelPath: join(packageDir, manifest.onnx.modelFile),
        expectedSha256: manifest.onnx.onnxSha256,
        pluginId: manifest.id,
      });
    }
    return new CommunityAiPlugin(metadata, context, onnx);
  }

  private invoke(script: Script, request: unknown, deadlineAt: number, label: string): unknown {
    const requestJson = JSON.stringify(request);
    if (Buffer.byteLength(requestJson, 'utf8') > MAX_COMMUNITY_VM_MESSAGE_BYTES) {
      throw new Error(
        `plugin ${this.metadata.id} request exceeds ${MAX_COMMUNITY_VM_MESSAGE_BYTES} bytes for ${label}`,
      );
    }
    this.context['__requestJson'] = requestJson;
    let serialized: unknown;
    try {
      serialized = script.runInContext(this.context, {
        timeout: remainingStrategyTimeout(deadlineAt),
      });
    } finally {
      delete this.context['__requestJson'];
    }
    if (typeof serialized !== 'string') {
      throw new Error(`plugin ${this.metadata.id} returned no ${label}`);
    }
    if (Buffer.byteLength(serialized, 'utf8') > MAX_COMMUNITY_VM_MESSAGE_BYTES) {
      throw new Error(
        `plugin ${this.metadata.id} returned more than ${MAX_COMMUNITY_VM_MESSAGE_BYTES} bytes for ${label}`,
      );
    }
    return JSON.parse(serialized) as unknown;
  }

  async decide(request: AiDecisionRequest, signal: AbortSignal): Promise<AiProviderDecision> {
    if (signal.aborted) throw new Error('AI decision aborted');
    const deadlineAt = performance.now() + request.deadlineMs;
    const remainingDeadlineMs = (): number => Math.max(0, Math.ceil(deadlineAt - performance.now()));
    const pluginRequest: CommunityPluginRequest = {
      decisionId: request.decisionId,
      phase: request.phase,
      playerCount: request.playerCount,
      enabledHouseRules: [...request.enabledHouseRules],
      featureSchema: request.featureSchema,
      candidates: request.candidates.map(candidate => ({
        id: candidate.id,
        ...(this.metadata.dataAccess.includes('candidate-features')
          ? { features: [...candidate.features] }
          : {}),
        heuristicScore: candidate.heuristicScore,
        teacherPreferred: candidate.teacherPreferred,
      })),
      ...(request.communityData ? { arena: request.communityData } : {}),
      ...(this.onnx ? { onnx: { model: this.onnx.metadata } } : {}),
      deadlineMs: remainingDeadlineMs(),
    };
    if (this.onnx && this.prepareOnnxScript) {
      const prepared = this.invoke(
        this.prepareOnnxScript,
        pluginRequest,
        deadlineAt,
        'ONNX inputs',
      );
      const result = await this.onnx.run(prepared, signal);
      pluginRequest.onnx = {
        model: this.onnx.metadata,
        outputs: result.outputs,
      };
    }
    if (signal.aborted) throw new Error('AI decision aborted');
    pluginRequest.deadlineMs = remainingDeadlineMs();
    const candidateId = this.invoke(
      this.decideScript,
      pluginRequest,
      deadlineAt,
      'decision',
    );
    if (typeof candidateId !== 'string'
      || !request.candidates.some(candidate => candidate.id === candidateId)) {
      throw new Error(`plugin ${this.metadata.id} returned an illegal candidate id`);
    }
    return { kind: 'candidate', candidateId };
  }

  async dispose(): Promise<void> {
    await this.onnx?.dispose();
  }
}
