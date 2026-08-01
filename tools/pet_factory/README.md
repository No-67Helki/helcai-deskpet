# Pet Factory

这里是多视角身份建模与动画生成工具链的边界。运行时只消费完成校验的 PetManifest v2 包，不直接依赖生成服务。

```bash
conda activate env310
python tools/pet_factory/validate_inputs.py inputs/pet-photos
```

辅助工具：

- `review_photos.py`：生成照片联系表与尺寸清单，供人工筛选身份参考。
- `normalize_references.py`：把手机 MPO/JPEG 规范化为生成服务可读取的 PNG 副本。
- `build_sprite_package.py`：把六组严格网格转换为 72 帧透明图集，执行键色抠除、主体归一和脚点对齐，并写出 manifest。

当前内置赫尔财的最终资源位于 `assets/pets/helcai/`。中间生成物放在 `.artifacts/`，原始照片放在 `Cat_Photo/` 或 `inputs/pet-photos/`，两者都不会进入发布包。ComfyUI 不是默认依赖。
