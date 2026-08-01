# HelCai DeskPet

<p align="center">
  <img src="assets/icon.png" alt="HelCai icon" width="160" />
</p>

HelCai DeskPet is a lightweight Windows desktop pet with natural six-state animation, grounded multi-monitor movement, alpha-aware interaction, and a customizable pet asset studio.

> This is an early public release. Windows 10 and 11 are the primary supported platforms.

## Highlights

- Transparent, borderless desktop pet that stays on the active display work area.
- Distance-synchronized 16-frame walk cycle without frame-rate-dependent movement.
- Alpha hit testing: transparent pixels pass clicks through while visible pixels remain interactive.
- Multi-monitor support, including negative coordinates, DPI scaling, taskbars, and saved position.
- A five-step pet studio for importing photos, naming, identity review, generation, preview, installation, and export.
- Provider-neutral image analysis and generation interfaces, with ComfyUI as an optional advanced backend.
- Electron `safeStorage` protection for API keys and no original photos in exported pet packages.
- PetManifest v2 plus deterministic local normalization, grounding, transparency, and package validation.

## Development

Requirements: Node.js 20+, npm 10+, and Python 3.10 with Pillow for image tooling.

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run test:python
npm run build
```

Run the desktop app with `npm start`, or create a Windows portable build with `npm run build:win`.

## Privacy

The project does not operate a photo relay server. Photos are sent directly from the Electron main process to a provider only after the user selects that provider, grants upload consent, and starts a task. See [PRIVACY.md](PRIVACY.md) for details.

## Contributing and license

Read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and [ASSETS.md](ASSETS.md) before contributing. Code, documentation, and explicitly distributed bundled derivative assets are available under the [MIT License](LICENSE). Original private pet photos are not part of the repository.

[中文 README](README.md)
