import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { IdentityProfile, PetProject, ProviderCapabilities, ProviderId, ProviderSettingsInput, ProviderSummary } from '../shared/types';
import { identityAnalysisPrompt } from '../shared/factoryPrompts';
import { CredentialService } from './credentialService';

interface ProviderDefinition {
  id: ProviderId;
  name: string;
  model: string;
  analyzerModel?: string;
  baseUrl: string;
  capabilities: ProviderCapabilities;
}

const definitions: ProviderDefinition[] = [
  { id: 'openai', name: 'OpenAI', model: 'gpt-image-2', analyzerModel: 'gpt-5.6-terra', baseUrl: 'https://api.openai.com/v1', capabilities: { analyze: true, generate: true, multiImage: true, imageEdit: true, transparentOutput: false, costEstimate: true, cancellable: true, local: false } },
  { id: 'gemini', name: 'Google Gemini', model: 'gemini-3.1-flash-image', analyzerModel: 'gemini-3.1-flash', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', capabilities: { analyze: true, generate: true, multiImage: true, imageEdit: true, transparentOutput: false, costEstimate: true, cancellable: true, local: false } },
  { id: 'tongyi', name: '通义千问 / 万相', model: 'wan2.7-image-pro', analyzerModel: 'qwen3-vl-plus', baseUrl: 'https://dashscope.aliyuncs.com', capabilities: { analyze: true, generate: true, multiImage: true, imageEdit: true, transparentOutput: false, costEstimate: true, cancellable: true, local: false } },
  { id: 'ollama', name: 'Ollama', model: 'qwen3-vl', baseUrl: 'http://127.0.0.1:11434', capabilities: { analyze: true, generate: false, multiImage: true, imageEdit: false, transparentOutput: false, costEstimate: false, cancellable: true, local: true } },
  { id: 'claude', name: 'Anthropic Claude', model: 'claude-sonnet-4-5', baseUrl: 'https://api.anthropic.com', capabilities: { analyze: true, generate: false, multiImage: true, imageEdit: false, transparentOutput: false, costEstimate: true, cancellable: true, local: false } },
  { id: 'comfyui', name: 'ComfyUI（高级）', model: 'workflow-api', baseUrl: 'http://127.0.0.1:8188', capabilities: { analyze: false, generate: true, multiImage: true, imageEdit: true, transparentOutput: true, costEstimate: false, cancellable: true, local: true } },
];

function dataUrl(filePath: string, data: Buffer): string {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
  return `data:${mime};base64,${data.toString('base64')}`;
}

function extractJson(text: string): IdentityProfile {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('分析模型没有返回可解析的身份 JSON。');
  const raw = JSON.parse(match[0]) as Partial<IdentityProfile>;
  return {
    species: raw.species === 'dog' ? 'dog' : 'cat',
    coatColors: Array.isArray(raw.coatColors) ? raw.coatColors.map(String).slice(0, 8) : [],
    pattern: String(raw.pattern ?? 'unknown'),
    eyeColor: String(raw.eyeColor ?? 'unknown'),
    bodyType: String(raw.bodyType ?? 'unknown'),
    distinctiveFeatures: Array.isArray(raw.distinctiveFeatures) ? raw.distinctiveFeatures.map(String).slice(0, 12) : [],
    summary: String(raw.summary ?? 'Identity extracted from the supplied reference photos.'),
  };
}

export class ProviderRegistry {
  private overrides = new Map<ProviderId, { model?: string; baseUrl?: string }>();

  constructor(private readonly credentials: CredentialService) {}

  summaries(): ProviderSummary[] {
    return definitions.map((item) => ({
      id: item.id,
      name: item.name,
      configured: item.id === 'ollama' || (item.id === 'comfyui' ? this.overrides.has(item.id) : this.credentials.has(item.id)),
      model: this.overrides.get(item.id)?.model ?? item.model,
      baseUrl: this.overrides.get(item.id)?.baseUrl ?? item.baseUrl,
      capabilities: item.capabilities,
    }));
  }

  async configure(settings: ProviderSettingsInput): Promise<void> {
    this.definition(settings.id);
    if (settings.apiKey !== undefined) await this.credentials.set(settings.id, settings.apiKey);
    this.overrides.set(settings.id, { ...(settings.model ? { model: settings.model.trim() } : {}), ...(settings.baseUrl ? { baseUrl: settings.baseUrl.trim().replace(/\/$/, '') } : {}) });
  }

  configuration(): Partial<Record<ProviderId, { model?: string; baseUrl?: string }>> {
    return Object.fromEntries(this.overrides.entries()) as Partial<Record<ProviderId, { model?: string; baseUrl?: string }>>;
  }

  restore(value: unknown): void {
    if (!value || typeof value !== 'object') return;
    for (const [rawId, rawSettings] of Object.entries(value)) {
      const id = rawId as ProviderId;
      if (!definitions.some((item) => item.id === id) || !rawSettings || typeof rawSettings !== 'object') continue;
      const settings = rawSettings as { model?: unknown; baseUrl?: unknown };
      this.overrides.set(id, {
        ...(typeof settings.model === 'string' && settings.model ? { model: settings.model } : {}),
        ...(typeof settings.baseUrl === 'string' && /^https?:\/\//.test(settings.baseUrl) ? { baseUrl: settings.baseUrl.replace(/\/$/, '') } : {}),
      });
    }
  }

  estimate(project: PetProject): string {
    const provider = this.definition(project.generatorId);
    return provider.capabilities.local ? '本地运行，不产生云端 API 费用' : '预计生成 7 张高质量图；实际费用以供应商账单为准';
  }

  async analyze(project: PetProject, signal: AbortSignal): Promise<IdentityProfile> {
    const provider = this.definition(project.analyzerId);
    if (!provider.capabilities.analyze) throw new Error(`${provider.name} 不提供照片分析能力。`);
    const photos = await this.readPhotos(project);
    const prompt = identityAnalysisPrompt(project.species);
    const key = this.credentials.get(provider.id);
    const baseUrl = this.overrides.get(provider.id)?.baseUrl ?? provider.baseUrl;
    const model = this.overrides.get(provider.id)?.model ?? provider.analyzerModel ?? provider.model;

    if (!provider.capabilities.local && !key) throw new Error(`请先在模型设置中配置 ${provider.name} API 密钥。`);
    if (provider.id === 'ollama') {
      const response = await this.jsonFetch(`${baseUrl}/api/chat`, { model, stream: false, format: 'json', messages: [{ role: 'user', content: prompt, images: photos.map((item) => item.data.toString('base64')) }] }, {}, signal);
      return extractJson(String((response.message as { content?: unknown } | undefined)?.content ?? ''));
    }
    if (provider.id === 'gemini') {
      const parts = [{ text: prompt }, ...photos.map((item) => ({ inlineData: { mimeType: item.mime, data: item.data.toString('base64') } }))];
      const response = await this.jsonFetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key!)}`, { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json' } }, {}, signal);
      const text = (((response.candidates as Array<{ content?: { parts?: Array<{ text?: string }> } }> | undefined)?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join(''));
      return extractJson(text);
    }
    if (provider.id === 'claude') {
      const content = [{ type: 'text', text: prompt }, ...photos.map((item) => ({ type: 'image', source: { type: 'base64', media_type: item.mime, data: item.data.toString('base64') } }))];
      const response = await this.jsonFetch(`${baseUrl}/v1/messages`, { model, max_tokens: 1200, messages: [{ role: 'user', content }] }, { 'x-api-key': key!, 'anthropic-version': '2023-06-01' }, signal);
      const text = (response.content as Array<{ text?: string }> | undefined)?.map((item) => item.text ?? '').join('') ?? '';
      return extractJson(text);
    }
    const openAiBase = provider.id === 'tongyi' ? `${baseUrl}/compatible-mode/v1` : baseUrl;
    const body = { model, messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, ...photos.map((item) => ({ type: 'image_url', image_url: { url: dataUrl(item.path, item.data) } }))] }], response_format: { type: 'json_object' } };
    const response = await this.jsonFetch(`${openAiBase}/chat/completions`, body, { Authorization: `Bearer ${key}` }, signal);
    const text = (((response.choices as Array<{ message?: { content?: string } }> | undefined)?.[0]?.message?.content) ?? '');
    return extractJson(text);
  }

  async generate(project: PetProject, prompt: string, signal: AbortSignal): Promise<Buffer> {
    const provider = this.definition(project.generatorId);
    if (!provider.capabilities.generate) throw new Error(`${provider.name} 只能分析图片，不能生成桌宠素材。`);
    if (provider.id === 'comfyui') throw new Error('ComfyUI 需要在高级设置中导入 API workflow；默认云端流程不依赖它。');
    const key = this.credentials.get(provider.id);
    if (!provider.capabilities.local && !key) throw new Error(`请先配置 ${provider.name} API 密钥。`);
    const photos = await this.readPhotos(project);
    const baseUrl = this.overrides.get(provider.id)?.baseUrl ?? provider.baseUrl;
    const model = this.overrides.get(provider.id)?.model ?? provider.model;

    if (provider.id === 'openai') {
      const form = new FormData();
      form.set('model', model);
      form.set('prompt', prompt);
      form.set('size', '1024x1024');
      form.set('quality', 'high');
      photos.slice(0, 5).forEach((item) => form.append('image[]', new Blob([new Uint8Array(item.data)], { type: item.mime }), path.basename(item.path)));
      const response = await fetch(`${baseUrl}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal });
      const json = await this.checkResponse(response);
      return this.imageFromResponse(json);
    }
    if (provider.id === 'gemini') {
      const parts = [{ text: prompt }, ...photos.map((item) => ({ inlineData: { mimeType: item.mime, data: item.data.toString('base64') } }))];
      const json = await this.jsonFetch(`${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key!)}`, { contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'] } }, {}, signal);
      const part = ((json.candidates as Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> | undefined)?.[0]?.content?.parts ?? []).find((item) => item.inlineData?.data);
      if (!part?.inlineData?.data) throw new Error('Gemini 没有返回图像数据。');
      return Buffer.from(part.inlineData.data, 'base64');
    }
    const endpoint = `${baseUrl}/api/v1/services/aigc/multimodal-generation/generation`;
    const content = [...photos.slice(0, 3).map((item) => ({ image: dataUrl(item.path, item.data) })), { text: prompt }];
    const json = await this.jsonFetch(endpoint, { model, input: { messages: [{ role: 'user', content }] }, parameters: { n: 1, size: '1024*1024', watermark: false, prompt_extend: true } }, { Authorization: `Bearer ${key}`, 'X-DashScope-Async': 'disable' }, signal);
    return this.imageFromResponse(json);
  }

  private definition(id: ProviderId): ProviderDefinition {
    const found = definitions.find((item) => item.id === id);
    if (!found) throw new Error(`未知 AI 供应商：${id}`);
    return found;
  }

  private async readPhotos(project: PetProject): Promise<Array<{ path: string; data: Buffer; mime: string }>> {
    const photos = Object.values(project.photos);
    return Promise.all(photos.map(async (photo) => ({ path: photo.path, data: await readFile(photo.path), mime: path.extname(photo.path).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg' })));
  }

  private async jsonFetch(url: string, body: unknown, headers: Record<string, string>, signal: AbortSignal): Promise<Record<string, unknown>> {
    const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal });
    return this.checkResponse(response);
  }

  private async checkResponse(response: Response): Promise<Record<string, unknown>> {
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* handled below */ }
    if (!response.ok) {
      const error = json.error as { message?: string } | undefined;
      throw new Error(error?.message ?? `供应商请求失败（HTTP ${response.status}）。`);
    }
    return json;
  }

  private async imageFromResponse(json: Record<string, unknown>): Promise<Buffer> {
    const first = ((json.data as Array<{ b64_json?: string; url?: string }> | undefined)?.[0]
      ?? ((json.output as { choices?: Array<{ message?: { content?: Array<{ image?: string; url?: string }> } }> } | undefined)?.choices?.[0]?.message?.content?.[0])) as { b64_json?: string; image?: string; url?: string } | undefined;
    const base64 = first?.b64_json ?? first?.image;
    if (base64) return Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ''), 'base64');
    if (first?.url) {
      const response = await fetch(first.url);
      if (!response.ok) throw new Error('供应商返回的图像地址无法下载。');
      return Buffer.from(await response.arrayBuffer());
    }
    throw new Error('供应商没有返回可用的图像。');
  }
}
