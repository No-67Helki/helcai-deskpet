import { useEffect, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import type { FactoryState, PetAnimationState, PetManifest, PetProject, PhotoRole, ProviderId, ProviderSummary } from '../shared/types';

const PHOTO_ROLES: Array<{ id: PhotoRole; label: string; hint: string }> = [
  { id: 'front-face', label: '正面脸部', hint: '平视、五官清晰' },
  { id: 'left-profile', label: '左侧面', hint: '完整头身轮廓' },
  { id: 'right-profile', label: '右侧面', hint: '完整头身轮廓' },
  { id: 'standing-body', label: '站立全身', hint: '四肢和尾巴完整' },
  { id: 'sitting-body', label: '坐姿全身', hint: '自然坐姿' },
  { id: 'marking-detail', label: '花纹细节', hint: '脸、背或尾巴特征' },
];
const STEPS = ['导入与命名', '照片检查', '身份确认', '生成动画', '预览发布'];

function stageStep(state: FactoryState): number {
  if (state.project.stage === 'identity-review') return 3;
  if (state.project.stage === 'generating') return 4;
  if (state.project.stage === 'review' || state.project.stage === 'complete') return 5;
  return Object.keys(state.project.photos).length === PHOTO_ROLES.length ? 2 : 1;
}

function workflowStep(state: FactoryState): number | null {
  if (state.project.stage === 'identity-review') return 3;
  if (state.project.stage === 'generating') return 4;
  if (state.project.stage === 'review' || state.project.stage === 'complete') return 5;
  return null;
}

function App(): ReactElement {
  const [state, setState] = useState<FactoryState | null>(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState('');
  const [providerDialog, setProviderDialog] = useState<ProviderSummary | null>(null);
  useEffect(() => {
    void window.deskcat.getFactoryState().then((next) => { setState(next); setStep(stageStep(next)); });
    return window.deskcat.onFactoryStateChanged((next) => { setState(next); const forced = workflowStep(next); if (forced) setStep(forced); });
  }, []);
  const run = async (operation: () => Promise<FactoryState>): Promise<void> => {
    setError('');
    try { const next = await operation(); setState(next); const forced = workflowStep(next); if (forced) setStep(forced); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  };
  if (!state) return <div className="shell"><div className="topbar">正在打开宠物工坊…</div></div>;
  const project = state.project;
  const busy = project.stage === 'analyzing' || project.stage === 'generating';
  return <div className="shell">
    <header className="topbar"><div className="brand"><h1>宠物工坊</h1><span>HelCai DeskPet Studio</span></div><div className="privacy">照片只在你选择的模型中处理</div></header>
    <div className="workspace">
      <nav className="steps" aria-label="制作步骤">{STEPS.map((label, index) => <button key={label} className={`step ${step === index + 1 ? 'active' : ''} ${step > index + 1 ? 'complete' : ''}`} onClick={() => !busy && setStep(index + 1)}><span className="step-index">{step > index + 1 ? '✓' : index + 1}</span><span>{label}</span></button>)}</nav>
      <main className="content">
        {step === 1 && <ImportStep state={state} run={run} setStep={setStep} />}
        {step === 2 && <PhotoCheckStep state={state} setStep={setStep} />}
        {step === 3 && <IdentityStep state={state} run={run} openProvider={setProviderDialog} setStep={setStep} />}
        {step === 4 && <GenerationStep state={state} run={run} openProvider={setProviderDialog} />}
        {step === 5 && <PublishStep state={state} setError={setError} />}
        {error && <p className="error" role="alert">{error}</p>}
      </main>
      <Preview state={state} />
    </div>
    {providerDialog && <ProviderDialog provider={providerDialog} close={() => setProviderDialog(null)} save={async (input) => { await run(() => window.deskcat.saveProviderSettings(input)); setProviderDialog(null); }} />}
  </div>;
}

type Run = (operation: () => Promise<FactoryState>) => Promise<void>;

function ImportStep({ state, run, setStep }: { state: FactoryState; run: Run; setStep(value: number): void }): ReactElement {
  const project = state.project;
  const complete = PHOTO_ROLES.every((role) => project.photos[role.id]);
  return <>
    <div className="content-header"><p className="eyebrow">01 / Identity references</p><h2>先让它认出你的宠物</h2><p className="lead">六个角度用于锁定脸型、花纹和体态。尽量使用自然光、无滤镜、无遮挡的原始照片。</p></div>
    <div className="field-row"><div className="field"><label htmlFor="pet-name">宠物名字</label><input id="pet-name" defaultValue={project.name} maxLength={32} onBlur={(event) => void run(() => window.deskcat.updateFactoryProject({ name: event.currentTarget.value }))} /></div><div className="field"><label htmlFor="species">类型</label><select id="species" value={project.species} onChange={(event) => void run(() => window.deskcat.updateFactoryProject({ species: event.target.value as 'cat' | 'dog' }))}><option value="cat">猫</option><option value="dog">狗</option></select></div></div>
    <div className="photo-grid">{PHOTO_ROLES.map((role) => { const photo = project.photos[role.id]; return <button className="photo-slot" key={role.id} onClick={() => void run(() => window.deskcat.selectFactoryPhoto(role.id))}>{photo ? <><img src={photo.previewUrl} alt={role.label} /><span className="photo-overlay">{role.label} · {photo.valid ? '清晰' : '建议更换高清图'}</span></> : <span className="photo-empty"><span>{role.label}<br /><small>{role.hint}</small></span></span>}</button>; })}</div>
    <div className="actions"><button className="button primary" disabled={!complete} onClick={() => setStep(2)}>检查照片并继续</button><span className="lead">已准备 {Object.keys(project.photos).length} / 6</span></div>
  </>;
}

function PhotoCheckStep({ state, setStep }: { state: FactoryState; setStep(value: number): void }): ReactElement {
  const photos = PHOTO_ROLES.map((role) => ({ role, photo: state.project.photos[role.id] }));
  const valid = photos.every((item) => item.photo?.valid);
  return <><div className="content-header"><p className="eyebrow">02 / Quality check</p><h2>先发现会影响身份的问题</h2><p className="lead">低分辨率照片仍可继续，但会降低毛发边缘和花纹一致性。角度缺失则不能生成完整动画。</p></div><dl className="profile">{photos.map(({ role, photo }) => <ProfileRow key={role.id} label={role.label} value={photo ? `${photo.width}×${photo.height} · ${photo.message}` : '缺失'} />)}</dl>{!valid && <div className="notice">部分照片清晰度偏低。可以返回更换，也可以接受质量风险继续。</div>}<div className="actions"><button className="button" onClick={() => setStep(1)}>返回更换</button><button className="button primary" onClick={() => setStep(3)}>接受并继续</button></div></>;
}

function IdentityStep({ state, run, openProvider, setStep }: { state: FactoryState; run: Run; openProvider(value: ProviderSummary): void; setStep(value: number): void }): ReactElement {
  const project = state.project;
  const analyzers = state.providers.filter((item) => item.capabilities.analyze);
  const analyzer = analyzers.find((item) => item.id === project.analyzerId);
  return <>
    <div className="content-header"><p className="eyebrow">03 / Identity review</p><h2>确认身份，而不是确认一种“猫”</h2><p className="lead">分析器只输出结构化身份特征。确认准确后，生成器才会开始制作动作。</p></div>
    <div className="field-row"><div className="field"><label>身份分析器</label><select value={project.analyzerId} onChange={(event) => void run(() => window.deskcat.updateFactoryProject({ analyzerId: event.target.value as ProviderId }))}>{analyzers.map((item) => <option value={item.id} key={item.id}>{item.name}{item.configured ? '' : ' · 未配置'}</option>)}</select></div><div className="field"><label>模型</label><button className="button" onClick={() => analyzer && openProvider(analyzer)}>{analyzer?.model ?? '配置模型'}</button></div></div>
    {project.identity ? <dl className="profile"><ProfileRow label="身份摘要" value={project.identity.summary} /><ProfileRow label="毛色" value={project.identity.coatColors.join('、')} /><ProfileRow label="花纹" value={project.identity.pattern} /><ProfileRow label="眼睛" value={project.identity.eyeColor} /><ProfileRow label="体态" value={project.identity.bodyType} /><ProfileRow label="识别特征" value={project.identity.distinctiveFeatures.join('、')} /></dl> : <div className="notice">尚未分析照片。云端分析前会检查授权和 API 配置，不会在后台静默上传。</div>}
    <div className="actions"><button className="button primary" disabled={project.stage === 'analyzing'} onClick={() => void run(() => window.deskcat.analyzeFactoryIdentity())}>{project.stage === 'analyzing' ? '正在分析…' : project.identity ? '重新分析' : '开始身份分析'}</button>{project.identity && <button className="button" onClick={() => setStep(4)}>身份正确，继续</button>}</div>
  </>;
}

function GenerationStep({ state, run, openProvider }: { state: FactoryState; run: Run; openProvider(value: ProviderSummary): void }): ReactElement {
  const project = state.project;
  const generators = state.providers.filter((item) => item.capabilities.generate);
  const generator = generators.find((item) => item.id === project.generatorId);
  const cloud = Boolean(generator && !generator.capabilities.local);
  return <>
    <div className="content-header"><p className="eyebrow">04 / Motion production</p><h2>生成六种自然动作</h2><p className="lead">六个动作分别生成，再由本地工具对齐脚点、抠除背景并构建 72 帧素材包。</p></div>
    <div className="field-row"><div className="field"><label>图像生成器</label><select value={project.generatorId} onChange={(event) => void run(() => window.deskcat.updateFactoryProject({ generatorId: event.target.value as ProviderId }))}>{generators.map((item) => <option value={item.id} key={item.id}>{item.name}{item.configured ? '' : ' · 未配置'}</option>)}</select></div><div className="field"><label>模型</label><button className="button" onClick={() => generator && openProvider(generator)}>{generator?.model ?? '配置模型'}</button></div></div>
    <div className="field"><label>视觉风格</label><select value={project.style} onChange={(event) => void run(() => window.deskcat.updateFactoryProject({ style: event.target.value as PetProject['style'] }))}><option value="natural">自然写实 · 轻度可爱化</option><option value="soft-illustration">柔和插画</option><option value="custom">自定义</option></select></div>
    <div className="field"><label>补充要求（可选）</label><textarea defaultValue={project.customPrompt} onBlur={(event) => void run(() => window.deskcat.updateFactoryProject({ customPrompt: event.currentTarget.value }))} placeholder="例如：保留右眼旁的小灰斑；动作克制，不要拟人服装。" /></div>
    {cloud && <label className="consent"><input type="checkbox" checked={state.cloudConsent} onChange={(event) => void run(() => window.deskcat.setCloudConsent(event.target.checked))} /><span>我同意将六张照片上传给当前云端模型用于本次生成。照片不会进入导出的桌宠包。</span></label>}
    <div className="notice">{project.estimatedCost ?? '选择生成器后显示费用说明。'} 每个状态失败时只自动修复一次，不会无限产生费用。</div>
    <div className="actions">{project.stage === 'generating' ? <button className="button danger" onClick={() => void run(() => window.deskcat.cancelFactoryGeneration())}>取消生成</button> : <button className="button primary" disabled={!project.identity || Boolean(cloud && !state.cloudConsent)} onClick={() => void run(() => window.deskcat.startFactoryGeneration())}>确认并开始生成</button>}</div>
  </>;
}

function PublishStep({ state, setError }: { state: FactoryState; setError(value: string): void }): ReactElement {
  const ready = Boolean(state.project.outputDirectory);
  const execute = async (operation: () => Promise<unknown>): Promise<void> => { setError(''); try { await operation(); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } };
  return <><div className="content-header"><p className="eyebrow">05 / Review & publish</p><h2>在安装前看完整循环</h2><p className="lead">生成结果只有通过尺寸、透明通道、脚点和六状态结构校验后，才能进入宠物库。</p></div>{ready ? <><div className="notice">素材包已经准备好。安装会立即启用“{state.project.name}”；导出则生成可分享的标准目录。</div><div className="actions"><button className="button primary" onClick={() => void execute(() => window.deskcat.installFactoryResult())}>安装并启用</button><button className="button" onClick={() => void execute(() => window.deskcat.exportFactoryResult())}>导出素材包</button></div></> : <div className="notice">尚无可发布结果。返回“生成动画”完成任务后再预览。</div>}</>;
}

function Preview({ state }: { state: FactoryState }): ReactElement {
  const project = state.project;
  const image = project.resultPreviewUrl ?? Object.values(project.photos)[0]?.previewUrl;
  const [previewState, setPreviewState] = useState<PetAnimationState>('idle');
  const animationReady = Boolean(project.resultSpriteUrl && project.resultManifest);
  const labels: Record<PetAnimationState, string> = { idle: '待机', walk: '行走', sit: '坐下', sleep: '睡眠', happy: '开心', dragged: '拖拽' };
  return <aside className="preview"><h3>实时预览</h3><div className="preview-frame">{animationReady ? <SpritePreview imageUrl={project.resultSpriteUrl!} manifest={project.resultManifest!} state={previewState} /> : image ? <img src={image} alt={`${project.name} 预览`} /> : <div className="preview-placeholder">导入照片后，这里会显示身份参考和最终桌宠预览。</div>}</div>{animationReady && <div className="clip-picker" aria-label="动画状态">{(Object.keys(labels) as PetAnimationState[]).map((clip) => <button key={clip} className={previewState === clip ? 'active' : ''} onClick={() => setPreviewState(clip)}>{labels[clip]}</button>)}</div>}<div className="meta"><div className="meta-row"><span>名称</span><span>{project.name}</span></div><div className="meta-row"><span>照片</span><span>{Object.keys(project.photos).length} / 6</span></div><div className="meta-row"><span>阶段</span><span>{project.stage}</span></div><div className="meta-row"><span>模板</span><span>DeskPet 1.0</span></div></div><div className="status" role="status">{project.statusMessage}<div className="progress"><div style={{ width: `${project.progress}%` }} /></div></div></aside>;
}

function SpritePreview({ imageUrl, manifest, state }: { imageUrl: string; manifest: PetManifest; state: PetAnimationState }): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const image = new Image();
    let requestId = 0;
    let canceled = false;
    const clip = manifest.clips[state];
    let startedAt = 0;
    image.onload = () => {
      const draw = (now: number): void => {
        if (canceled) return;
        if (!startedAt) startedAt = now;
        const count = Math.max(1, clip.end - clip.start + 1);
        const index = clip.start + Math.floor((now - startedAt) * clip.fps / 1000) % count;
        const columns = Math.max(1, manifest.columns ?? 1);
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, index % columns * manifest.frameWidth, Math.floor(index / columns) * manifest.frameHeight, manifest.frameWidth, manifest.frameHeight, 0, 0, canvas.width, canvas.height);
        requestId = requestAnimationFrame(draw);
      };
      requestId = requestAnimationFrame(draw);
    };
    image.src = imageUrl;
    return () => { canceled = true; cancelAnimationFrame(requestId); };
  }, [imageUrl, manifest, state]);
  return <canvas ref={canvasRef} width={384} height={384} aria-label={`${state} 动画预览`} />;
}

function ProfileRow({ label, value }: { label: string; value: string }): ReactElement { return <div className="profile-row"><dt>{label}</dt><dd>{value || '未识别'}</dd></div>; }

function ProviderDialog({ provider, close, save }: { provider: ProviderSummary; close(): void; save(input: { id: ProviderId; apiKey?: string; model?: string; baseUrl?: string }): Promise<void> }): ReactElement {
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(provider.model);
  const [baseUrl, setBaseUrl] = useState(provider.baseUrl);
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close()}><div className="modal" role="dialog" aria-modal="true"><h3>{provider.name}</h3><p>密钥只使用系统加密存储，renderer 和日志无法读取。留空不会清除已有密钥。</p>{!provider.capabilities.local && <div className="field"><label>API 密钥</label><input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={provider.configured ? '已安全保存；输入新值可替换' : '输入 API 密钥'} /></div>}<div className="field"><label>模型</label><input value={model} onChange={(event) => setModel(event.target.value)} /></div><div className="field"><label>服务地址</label><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></div><div className="actions"><button className="button primary" onClick={() => void save({ id: provider.id, ...(apiKey ? { apiKey } : {}), model, baseUrl })}>保存配置</button><button className="button" onClick={close}>取消</button></div></div></div>;
}

createRoot(document.getElementById('root')!).render(<App />);
