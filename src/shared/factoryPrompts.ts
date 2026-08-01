import type { IdentityProfile, PetAnimationState, PetProject } from './types';

export const PROMPT_TEMPLATE_VERSION = 'deskpet-1.0.0';

export const STATE_FRAME_SPEC: Record<PetAnimationState, { frames: number; columns: number; rows: number; fps: number }> = {
  idle: { frames: 12, columns: 4, rows: 3, fps: 8 },
  walk: { frames: 16, columns: 4, rows: 4, fps: 16 },
  sit: { frames: 10, columns: 5, rows: 2, fps: 10 },
  sleep: { frames: 10, columns: 5, rows: 2, fps: 6 },
  happy: { frames: 16, columns: 4, rows: 4, fps: 16 },
  dragged: { frames: 8, columns: 4, rows: 2, fps: 12 },
};

export const REQUIRED_PHOTO_ROLES = [
  'front-face', 'left-profile', 'right-profile', 'standing-body', 'sitting-body', 'marking-detail',
] as const;

export function identityAnalysisPrompt(species: string): string {
  return `Analyze these reference photos of the same ${species}. Return JSON only with keys species, coatColors, pattern, eyeColor, bodyType, distinctiveFeatures, summary. Preserve identity-specific markings and distinguish photo lighting from real coat color. Do not invent accessories or a breed certainty.`;
}

export function stateSheetPrompt(project: PetProject, identity: IdentityProfile, state: PetAnimationState): string {
  const spec = STATE_FRAME_SPEC[state];
  const action = {
    idle: 'a seamless subtle idle loop: paws and ground contact fixed, tiny natural breathing, one blink, restrained tail-tip motion',
    walk: 'one complete natural quadruped walking cycle with contact, down, passing and up phases; opposite legs alternate clearly; no sliding pose duplicates',
    sit: 'a calm sit-down and seated settling loop with stable paws and body mass',
    sleep: 'a seamless curled sleeping loop with only subtle rib breathing and a tiny ear movement',
    happy: 'a playful but believable happy interaction loop with alert eyes, tail response and one gentle stretch',
    dragged: 'a safe suspended/held reaction loop, legs naturally relaxed, surprised but not distressed',
  }[state];
  return [
    `Create a production sprite contact sheet for a desktop pet named ${project.name}.`,
    `Identity lock: ${identity.summary}; coat ${identity.coatColors.join(', ')}; pattern ${identity.pattern}; eyes ${identity.eyeColor}; body ${identity.bodyType}; features ${identity.distinctiveFeatures.join(', ')}.`,
    `Action: ${action}.`,
    `Exactly ${spec.frames} chronological frames arranged left-to-right, top-to-bottom in a strict ${spec.columns} columns by ${spec.rows} rows grid. Every cell must contain exactly one full-body pet at the same scale and camera angle.`,
    'Natural semi-realistic appearance with lightly softened appeal; anatomically credible limbs and weight. Side view faces right. Feet share one baseline in all grounded frames.',
    'Perfectly flat solid #00ff00 background in every cell; no shadows, gradients, floor, dividers, labels, text or watermark. Do not use #00ff00 on the subject.',
    `Avoid: orange fur, identity drift, duplicate frames, extra or missing limbs, changing stripe pattern, clothes, props, cropped ears or tail. ${project.customPrompt}`,
  ].join('\n');
}
