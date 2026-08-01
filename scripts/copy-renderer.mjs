import { copyFile, mkdir } from 'node:fs/promises';

await mkdir('dist/renderer', { recursive: true });
await copyFile('src/renderer/index.html', 'dist/renderer/index.html');
await mkdir('dist/factory', { recursive: true });
await copyFile('src/factory/index.html', 'dist/factory/index.html');
await copyFile('src/factory/styles.css', 'dist/factory/styles.css');
