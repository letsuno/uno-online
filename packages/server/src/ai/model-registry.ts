import { readFile, readdir, mkdir, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_HOUSE_RULES,
  RL_FEATURE_COUNT,
  RL_RECENT_DISCARD_SLOTS,
  RL_RECENT_DISCARD_TOKEN_SIZE,
  RL_SEQUENCE_FEATURE_OFFSET,
  RL_TEACHER_FEATURE_INDEX,
} from '@uno-online/shared';
import {
  AI_FEATURE_SCHEMA,
  AI_PLUGIN_DATA_ACCESS,
  type AiProvider,
  type AiProviderMetadata,
  type AiPluginDataAccess,
  type AiPluginFairness,
} from './provider.js';
import { OnnxValueProvider } from './onnx-provider.js';
import { sha256 } from './onnx-runtime.js';
import {
  CommunityAiPlugin,
  type CommunityAiPluginManifest,
  type CommunityPluginOnnxManifest,
} from './community-plugin.js';

const defaultAiDataRoot = fileURLToPath(new URL('../../../../data/', import.meta.url));

export interface RlOnnxManifest {
  schemaVersion: number;
  architecture: string;
  algorithm: string;
  inputName: string;
  outputName: string;
  dynamicBatch: boolean;
  featureCount: number;
  baseFeatureCount: number;
  sequenceOffset: number;
  sequenceLength: number;
  tokenSize: number;
  safetyFallback: Array<{ feature: string; index: number; threshold: number }>;
  safetyValue: string;
  safetyValueFeatureIndex: number;
  onnxSha256: string;
  maxAbsError: number;
}

interface AiPluginSettingsFile {
  disabledCommunityPluginIds: string[];
}

export interface AiProviderSummary {
  id: string;
  displayName: string;
  version: string;
  source: 'builtin' | 'community';
  usesOnnx: boolean;
  dataAccess: AiPluginDataAccess[];
  fairness: AiPluginFairness;
  capabilities: {
    minPlayers: number;
    maxPlayers: number;
    supportedHouseRules: 'all' | readonly string[];
  };
  enabled: boolean;
}

export interface AiPluginLoadFailure {
  packageDirectory: string;
  message: string;
}

export interface AiRegistrySnapshot {
  initializedAt: string;
  communityPluginsDirectory: string;
  providers: AiProviderSummary[];
  loadFailures: AiPluginLoadFailure[];
}

export const BUILTIN_AI_PROVIDER_ID = 'builtin-rl-v1';
const PRODUCTION_ARCHITECTURE = 'sequence-gru-residual-safety-router';
const PRODUCTION_ALGORITHM = 'grouped-reinforce-reference-baseline';
const PRODUCTION_MODEL_SHA256 = '6c0dd1ef1cd34f012ac1cc70961f57327c719bca7882f1907c429c5084616aa4';
const EXPECTED_SAFETY_FALLBACK = [
  { feature: 'house_elimination', index: 111, threshold: 0 },
  { feature: 'total_players', index: 1, threshold: 0.6 },
];
const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const HOUSE_RULE_NAMES = new Set(Object.keys(DEFAULT_HOUSE_RULES));

const bundledModelPath = fileURLToPath(new URL('./models/uno-rl.onnx', import.meta.url));
const bundledManifestPath = fileURLToPath(new URL('./models/uno-rl.manifest.json', import.meta.url));

function assertExactKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length > 0) throw new Error(`${label} contains unknown fields: ${unknown.join(', ')}`);
}

export function validateManifest(manifest: RlOnnxManifest, modelBytes: Uint8Array): void {
  if (manifest.schemaVersion !== 2
    || manifest.architecture !== PRODUCTION_ARCHITECTURE
    || manifest.algorithm !== PRODUCTION_ALGORITHM
    || manifest.inputName !== 'features'
    || manifest.outputName !== 'values'
    || manifest.dynamicBatch !== true) {
    throw new Error('unsupported production ONNX manifest');
  }
  if (manifest.featureCount !== RL_FEATURE_COUNT
    || manifest.baseFeatureCount !== RL_SEQUENCE_FEATURE_OFFSET
    || manifest.sequenceOffset !== RL_SEQUENCE_FEATURE_OFFSET
    || manifest.sequenceLength !== RL_RECENT_DISCARD_SLOTS
    || manifest.tokenSize !== RL_RECENT_DISCARD_TOKEN_SIZE
    || manifest.sequenceOffset + manifest.sequenceLength * manifest.tokenSize
      !== RL_TEACHER_FEATURE_INDEX) {
    throw new Error('production ONNX feature contract mismatch');
  }
  if (manifest.safetyValue !== 'teacher-preferred'
    || manifest.safetyValueFeatureIndex !== RL_TEACHER_FEATURE_INDEX
    || JSON.stringify(manifest.safetyFallback) !== JSON.stringify(EXPECTED_SAFETY_FALLBACK)) {
    throw new Error('production ONNX safety contract mismatch');
  }
  if (!Number.isFinite(manifest.maxAbsError)
    || manifest.maxAbsError < 0
    || manifest.maxAbsError > 1e-5
    || manifest.onnxSha256 !== PRODUCTION_MODEL_SHA256
    || sha256(modelBytes) !== PRODUCTION_MODEL_SHA256) {
    throw new Error('production ONNX integrity check failed');
  }
}

function localFile(value: unknown, extension: string, label: string): string {
  if (typeof value !== 'string'
    || isAbsolute(value)
    || basename(value) !== value
    || !value.toLowerCase().endsWith(extension)) {
    throw new Error(`${label} must be a local ${extension} filename`);
  }
  return value;
}

function validateCapabilities(value: unknown): CommunityAiPluginManifest['capabilities'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community plugin capabilities are required');
  }
  const capabilities = value as Record<string, unknown>;
  assertExactKeys(
    capabilities,
    ['minPlayers', 'maxPlayers', 'supportedHouseRules'],
    'community plugin capabilities',
  );
  const minPlayers = capabilities['minPlayers'];
  const maxPlayers = capabilities['maxPlayers'];
  const supportedHouseRules = capabilities['supportedHouseRules'];
  if (typeof minPlayers !== 'number' || typeof maxPlayers !== 'number'
    || !Number.isInteger(minPlayers) || !Number.isInteger(maxPlayers)
    || minPlayers < 2 || maxPlayers > 10 || minPlayers > maxPlayers) {
    throw new Error('community plugin player capability range is invalid');
  }
  if (supportedHouseRules === undefined) {
    throw new Error('community plugin supportedHouseRules is required');
  }
  if (supportedHouseRules !== 'all'
    && (!Array.isArray(supportedHouseRules)
      || supportedHouseRules.some(rule => typeof rule !== 'string' || !HOUSE_RULE_NAMES.has(rule))
      || new Set(supportedHouseRules).size !== supportedHouseRules.length)) {
    throw new Error('community plugin supportedHouseRules contains an unknown rule');
  }
  return {
    minPlayers,
    maxPlayers,
    supportedHouseRules: supportedHouseRules === 'all' ? 'all' : [...supportedHouseRules] as string[],
  };
}

function validateDataAccess(value: unknown): AiPluginDataAccess[] {
  if (!Array.isArray(value)) throw new Error('community plugin dataAccess must be an array');
  const allowed = new Set<string>(AI_PLUGIN_DATA_ACCESS);
  if (value.some(item => typeof item !== 'string' || !allowed.has(item))) {
    throw new Error('community plugin dataAccess contains an unknown permission');
  }
  if (new Set(value).size !== value.length) {
    throw new Error('community plugin dataAccess contains duplicates');
  }
  return [...value] as AiPluginDataAccess[];
}

function fairnessFor(dataAccess: readonly AiPluginDataAccess[]): AiPluginFairness {
  if (dataAccess.includes('opponent-hands') || dataAccess.includes('draw-piles')) return 'cheat';
  if (dataAccess.includes('chat-history')) return 'privileged';
  return 'fair';
}

function validateOnnx(value: unknown): CommunityPluginOnnxManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('plugin onnx must be an object');
  }
  const onnx = value as Record<string, unknown>;
  assertExactKeys(onnx, ['modelFile', 'onnxSha256'], 'plugin onnx');
  const modelFile = localFile(onnx['modelFile'], '.onnx', 'plugin onnx.modelFile');
  const onnxSha256 = onnx['onnxSha256'];
  if (typeof onnxSha256 !== 'string' || !SHA256_PATTERN.test(onnxSha256)) {
    throw new Error('plugin onnx.onnxSha256 is invalid');
  }
  return { modelFile, onnxSha256 };
}

export function validateCommunityPluginManifest(value: unknown): CommunityAiPluginManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community plugin manifest must be an object');
  }
  const manifest = value as Record<string, unknown>;
  assertExactKeys(
    manifest,
    [
      'pluginSchemaVersion',
      'id',
      'displayName',
      'version',
      'entry',
      'entrySha256',
      'featureSchema',
      'dataAccess',
      'onnx',
      'capabilities',
    ],
    'community plugin manifest',
  );
  if (manifest['pluginSchemaVersion'] !== 1) throw new Error('unsupported community plugin schema');
  const id = manifest['id'];
  if (typeof id !== 'string' || !PROVIDER_ID_PATTERN.test(id)) {
    throw new Error('invalid community plugin id');
  }
  const displayName = manifest['displayName'];
  if (typeof displayName !== 'string' || displayName.length === 0 || displayName !== displayName.trim()) {
    throw new Error('community plugin displayName is required');
  }
  const version = manifest['version'];
  if (typeof version !== 'string' || version.length === 0 || version !== version.trim()) {
    throw new Error('community plugin version is required');
  }
  const entry = localFile(manifest['entry'], '.ts', 'plugin entry');
  const entrySha256 = manifest['entrySha256'];
  if (typeof entrySha256 !== 'string' || !SHA256_PATTERN.test(entrySha256)) {
    throw new Error('community plugin entrySha256 is invalid');
  }
  if (manifest['featureSchema'] !== AI_FEATURE_SCHEMA) {
    throw new Error('community plugin feature contract mismatch');
  }
  const dataAccess = validateDataAccess(manifest['dataAccess']);
  const onnx = manifest['onnx'] === undefined ? undefined : validateOnnx(manifest['onnx']);
  const capabilities = validateCapabilities(manifest['capabilities']);
  return {
    pluginSchemaVersion: 1,
    id,
    displayName,
    version,
    entry,
    entrySha256,
    featureSchema: AI_FEATURE_SCHEMA,
    dataAccess,
    ...(onnx ? { onnx } : {}),
    capabilities,
  };
}

function communityMetadata(manifest: CommunityAiPluginManifest): AiProviderMetadata {
  return {
    id: manifest.id,
    displayName: manifest.displayName,
    version: manifest.version,
    source: 'community',
    usesOnnx: manifest.onnx !== undefined,
    dataAccess: [...manifest.dataAccess],
    fairness: fairnessFor(manifest.dataAccess),
    capabilities: {
      minPlayers: manifest.capabilities.minPlayers,
      maxPlayers: manifest.capabilities.maxPlayers,
      supportedHouseRules: manifest.capabilities.supportedHouseRules,
    },
  };
}

export class AiProviderRegistry {
  private readonly providers = new Map<string, AiProvider>();
  private readonly disabledCommunityPluginIds = new Set<string>();
  private readonly loadFailures: AiPluginLoadFailure[] = [];
  private initializePromise: Promise<void> | null = null;
  private settingsMutation: Promise<void> = Promise.resolve();
  private initializedAt = '';

  communityRoot(): string {
    return resolve(process.env['UNO_AI_PLUGINS_DIR'] ?? join(defaultAiDataRoot, 'ai-plugins'));
  }

  settingsPath(): string {
    return resolve(process.env['UNO_AI_PLUGIN_SETTINGS_FILE']
      ?? join(defaultAiDataRoot, 'ai-plugin-settings.json'));
  }

  private async initializeBuiltin(): Promise<void> {
    const [modelBytes, manifestText] = await Promise.all([
      readFile(bundledModelPath),
      readFile(bundledManifestPath, 'utf8'),
    ]);
    const manifest = JSON.parse(manifestText) as RlOnnxManifest;
    validateManifest(manifest, modelBytes);
    const metadata: AiProviderMetadata = {
      id: BUILTIN_AI_PROVIDER_ID,
      displayName: 'UNO RL Built-in',
      version: manifest.onnxSha256.slice(0, 12),
      source: 'builtin',
      usesOnnx: true,
      dataAccess: ['candidate-features'],
      fairness: 'fair',
      capabilities: {
        minPlayers: 2,
        maxPlayers: 10,
        supportedHouseRules: 'all',
      },
    };
    this.providers.set(metadata.id, await OnnxValueProvider.create({
      modelPath: bundledModelPath,
      inputName: manifest.inputName,
      outputName: manifest.outputName,
      featureCount: manifest.featureCount,
      expectedSha256: manifest.onnxSha256,
      rulePriorBlend: 0.35,
      teacherPriorBonus: 0.1,
      metadata,
    }));
  }

  private recordLoadFailure(packageDirectory: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    this.loadFailures.push({ packageDirectory, message });
    process.emitWarning(`Ignored community AI plugin at ${packageDirectory}: ${message}`);
  }

  private async loadCommunityPackage(packageDirectory: string): Promise<void> {
    const manifestPath = join(packageDirectory, 'ai-plugin.json');
    try {
      const manifest = validateCommunityPluginManifest(
        JSON.parse(await readFile(manifestPath, 'utf8')),
      );
      if (manifest.id === BUILTIN_AI_PROVIDER_ID || this.providers.has(manifest.id)) {
        throw new Error(`duplicate or reserved AI provider id: ${manifest.id}`);
      }
      const metadata = communityMetadata(manifest);
      const provider = await CommunityAiPlugin.create({
        packageDir: packageDirectory,
        manifest,
        metadata,
      });
      this.providers.set(metadata.id, provider);
    } catch (error) {
      this.recordLoadFailure(packageDirectory, error);
    }
  }

  private async loadCommunityPackagesAtStartup(): Promise<void> {
    let entries;
    try {
      entries = await readdir(this.communityRoot(), { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
    const directories = entries
      .filter(entry => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of directories) {
      await this.loadCommunityPackage(join(this.communityRoot(), entry.name));
    }
  }

  private async readSettings(): Promise<void> {
    try {
      const value = JSON.parse(await readFile(this.settingsPath(), 'utf8')) as unknown;
      if (!value || typeof value !== 'object') throw new Error('AI plugin settings must be an object');
      assertExactKeys(
        value as Record<string, unknown>,
        ['disabledCommunityPluginIds'],
        'AI plugin settings',
      );
      const settings = value as Record<string, unknown>;
      const disabledIds = settings['disabledCommunityPluginIds'];
      if (!Array.isArray(disabledIds)
        || disabledIds.some(id => typeof id !== 'string' || !PROVIDER_ID_PATTERN.test(id))
        || new Set(disabledIds).size !== disabledIds.length) {
        throw new Error('disabledCommunityPluginIds must be an array of unique strings');
      }
      for (const id of disabledIds) {
        this.disabledCommunityPluginIds.add(id);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw error;
    }
  }

  async initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = (async () => {
      await this.initializeBuiltin();
      await this.loadCommunityPackagesAtStartup();
      await this.readSettings();
      this.initializedAt = new Date().toISOString();
    })();
    return this.initializePromise;
  }

  private isEnabled(id: string): boolean {
    const provider = this.providers.get(id);
    if (!provider) return false;
    return provider.metadata.source === 'builtin'
      || !this.disabledCommunityPluginIds.has(id);
  }

  async get(providerId: string): Promise<AiProvider | null> {
    await this.initialize();
    return this.isEnabled(providerId) ? this.providers.get(providerId) ?? null : null;
  }

  async has(providerId: string): Promise<boolean> {
    await this.initialize();
    return this.isEnabled(providerId);
  }

  private summaries(): AiProviderSummary[] {
    return [...this.providers.values()].map(provider => ({
      id: provider.metadata.id,
      displayName: provider.metadata.displayName,
      version: provider.metadata.version,
      source: provider.metadata.source,
      usesOnnx: provider.metadata.usesOnnx,
      dataAccess: [...provider.metadata.dataAccess],
      fairness: provider.metadata.fairness,
      capabilities: {
        minPlayers: provider.metadata.capabilities.minPlayers,
        maxPlayers: provider.metadata.capabilities.maxPlayers,
        supportedHouseRules: provider.metadata.capabilities.supportedHouseRules === 'all'
          ? 'all'
          : [...provider.metadata.capabilities.supportedHouseRules],
      },
      enabled: this.isEnabled(provider.metadata.id),
    }));
  }

  async listEnabled(): Promise<AiProviderSummary[]> {
    await this.initialize();
    return this.summaries().filter(provider => provider.enabled);
  }

  async listAll(): Promise<AiProviderSummary[]> {
    await this.initialize();
    return this.summaries();
  }

  async snapshot(): Promise<AiRegistrySnapshot> {
    await this.initialize();
    return {
      initializedAt: this.initializedAt,
      communityPluginsDirectory: this.communityRoot(),
      providers: await this.listAll(),
      loadFailures: this.loadFailures.map(failure => ({ ...failure })),
    };
  }

  private async persistSettings(): Promise<void> {
    const target = this.settingsPath();
    await mkdir(dirname(target), { recursive: true });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    const settings: AiPluginSettingsFile = {
      disabledCommunityPluginIds: [...this.disabledCommunityPluginIds].sort(),
    };
    await writeFile(temporary, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
    await rename(temporary, target);
  }

  async setCommunityPluginEnabled(id: string, enabled: boolean): Promise<AiRegistrySnapshot> {
    await this.initialize();
    const provider = this.providers.get(id);
    if (!provider) throw new Error('AI plugin not found');
    if (provider.metadata.source !== 'community') throw new Error('built-in AI cannot be disabled');
    const operation = this.settingsMutation.then(async () => {
      const wasDisabled = this.disabledCommunityPluginIds.has(id);
      if (enabled) this.disabledCommunityPluginIds.delete(id);
      else this.disabledCommunityPluginIds.add(id);
      try {
        await this.persistSettings();
      } catch (error) {
        if (wasDisabled) this.disabledCommunityPluginIds.add(id);
        else this.disabledCommunityPluginIds.delete(id);
        throw error;
      }
    });
    this.settingsMutation = operation.catch(() => undefined);
    await operation;
    return this.snapshot();
  }

}

export const aiProviderRegistry = new AiProviderRegistry();
