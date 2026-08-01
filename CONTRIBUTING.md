# 为 HelCai DeskPet 贡献

DeskCat 当前优先稳定 Windows 桌宠运行时和 PetManifest v2 协议。

请先搜索现有 Issue。修复和小型改进可以直接提交 Pull Request；涉及数据格式、Provider 接口或大规模 UI 调整的改动，请先创建 Issue 讨论范围。

提交变更前请运行：

```bash
npm run typecheck
npm run lint
npm test
npm run test:python
npm run build
```

素材生成后端必须与桌宠运行时解耦，不得把 API Key、用户原始照片或模型缓存提交到仓库。新的宠物包必须通过：

```bash
npm run validate:asset -- <asset-directory>
```

真实人物或宠物照片必须由权利人授权使用，并默认保留在 Git 忽略的本地输入目录。

提交应保持聚焦，不要包含构建产物、原始照片、密钥、模型缓存、生成中间物或与改动无关的格式化。提交即表示你有权按本项目 MIT License 提供对应代码或素材。
