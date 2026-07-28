export interface StyleDefaults {
  size: string;
  quality: 'low' | 'medium' | 'high';
  aspect: 'square' | 'portrait' | 'landscape';
  background: 'auto' | 'opaque' | 'transparent';
  format: 'png' | 'jpeg' | 'webp';
}

export interface StyleDef {
  id: string;
  nome: string;
  desc: string;
  grupo: string;
  /**
   * Template com placeholders {subject} {scene} {extra}; carrega MODO/ESTILO/
   * COMPOSIÇÃO/LUZ/CÂMERA/RESTRIÇÕES fixos do estilo. Propriedades de saída
   * (tamanho/fundo/formato) NÃO entram no texto — vão em `defaults`→flags.
   */
  template: string;
  defaults: StyleDefaults;
  /** Procedência: 'builtin' (CATALOG) ou 'user' (styles.json). Ausente = builtin. */
  origem?: 'builtin' | 'user';
}

export interface PromptSlots {
  subject: string;
  scene: string;
  extra: string;
}

/**
 * Substitui {subject}/{scene}/{extra} no template. Slots vazios são removidos
 * sem deixar espaços duplos nem espaço órfão antes de pontuação.
 */
export function renderTemplate(t: string, slots: PromptSlots): string {
  const out = t
    .split('{subject}').join(slots.subject ?? '')
    .split('{scene}').join(slots.scene ?? '')
    .split('{extra}').join(slots.extra ?? '');
  return out
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
