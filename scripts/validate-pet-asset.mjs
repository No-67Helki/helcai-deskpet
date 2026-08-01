import fs from 'node:fs';
import path from 'node:path';

const STATES = ['idle', 'walk', 'sit', 'sleep', 'happy', 'dragged'];

function fail(message) {
  throw new Error(message);
}

function safeFile(value, label) {
  if (typeof value !== 'string' || !value || value.includes('..') || /[\\/]/.test(value)) fail(`${label} 必须是资源目录内的安全文件名。`);
  return value;
}

function pngInfo(buffer) {
  if (buffer.length < 26 || buffer.toString('hex', 0, 8) !== '89504e470d0a1a0a') return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    transparent: buffer[25] === 4 || buffer[25] === 6,
    format: 'PNG',
  };
}

function webpInfo(buffer) {
  if (buffer.length < 30 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buffer.toString('ascii', 12, 16);
  if (chunk === 'VP8X') {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3),
      transparent: (buffer[20] & 0x10) !== 0,
      format: 'WebP',
    };
  }
  fail('素材校验器目前要求 WebP 使用 VP8X 容器；也可改用透明 PNG。');
}

function readImageInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  return pngInfo(buffer) ?? webpInfo(buffer) ?? fail(`${path.basename(filePath)} 不是受支持的透明 PNG/WebP。`);
}

function validateTransparentCorners(filePath, info) {
  if (info.format !== 'PNG') return;
  const buffer = fs.readFileSync(filePath);
  // Structural validation below is intentionally conservative; pixel-level validation
  // is performed by the Python builder/tests because PNG scanlines are compressed.
  if (!info.transparent || buffer.length < 100) fail('透明 PNG 数据无效。');
}

function validate(root) {
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(manifestPath)) fail('资源目录缺少 manifest.json。');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.schemaVersion !== 2) fail('manifest.schemaVersion 必须为 2。');
  if (manifest.kind !== 'sprite-sheet') fail('正式 2D 素材必须使用 sprite-sheet。');
  const source = safeFile(manifest.sourceImage, 'sourceImage');
  safeFile(manifest.previewImage, 'previewImage');
  const positive = (value, name) => {
    if (!Number.isInteger(value) || value <= 0) fail(`${name} 必须是正整数。`);
    return value;
  };
  const frameWidth = positive(manifest.frameWidth, 'frameWidth');
  const frameHeight = positive(manifest.frameHeight, 'frameHeight');
  const columns = positive(manifest.columns, 'columns');
  const totalFrames = positive(manifest.totalFrames, 'totalFrames');
  if (!manifest.anchor || manifest.anchor.x < 0 || manifest.anchor.x > frameWidth || manifest.anchor.y < 0 || manifest.anchor.y > frameHeight) {
    fail('anchor 必须位于单帧范围内。');
  }
  for (const state of STATES) {
    const clip = manifest.clips?.[state];
    if (!clip || !Number.isInteger(clip.start) || !Number.isInteger(clip.end) || clip.start < 0 || clip.end < clip.start || clip.end >= totalFrames) {
      fail(`clips.${state} 的帧区间无效。`);
    }
    if (typeof clip.fps !== 'number' || clip.fps < 1 || clip.fps > 60 || typeof clip.loop !== 'boolean') fail(`clips.${state} 缺少有效 fps/loop。`);
  }
  const sourcePath = path.join(root, source);
  const info = readImageInfo(sourcePath);
  const rows = Math.ceil(totalFrames / columns);
  if (info.width < columns * frameWidth || info.height < rows * frameHeight) {
    fail(`精灵表为 ${info.width}x${info.height}，清单至少需要 ${columns * frameWidth}x${rows * frameHeight}。`);
  }
  if (!info.transparent) fail('正式素材必须包含透明通道。');
  validateTransparentCorners(sourcePath, info);
  if (totalFrames < 24) fail('正式六状态素材至少需要 24 帧。');
  if (manifest.motion?.walkDistancePerCycle !== undefined && (!(manifest.motion.walkDistancePerCycle > 0))) fail('motion.walkDistancePerCycle 必须为正数。');
  const previewPath = path.join(root, manifest.previewImage);
  if (!fs.existsSync(previewPath)) fail('previewImage 文件不存在。');
  return { id: manifest.id, frames: totalFrames, dimensions: `${info.width}x${info.height}`, format: info.format };
}

const input = process.argv[2];
if (!input) {
  console.error('用法: npm run validate:asset -- <宠物资源目录>');
  process.exitCode = 2;
} else {
  try {
    const result = validate(path.resolve(input));
    console.log(`素材校验通过：${result.id}，${result.frames} 帧，${result.dimensions} ${result.format}`);
  } catch (error) {
    console.error(`素材校验失败：${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}
