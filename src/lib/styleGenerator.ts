import fs from 'fs';
import path from 'path';
import { loadSettings } from './settings';
import { extractJson } from './jsonx';
import { askClaudeVision, type ClaudeBlock } from './judge';
import { slugify, isKebab } from './userStyles';
import { CATALOG } from '../styles/catalog';
import type { StyleDef, StyleDefaults } from '../styles/catalog.types';

// Exemplos reais do catálogo mostrados ao Claude como referência de formato.
const EXAMPLE_IDS = ['fotorrealista', 'watercolor', 'isometrico-3d'];

const QUALITIES = new Set(['low', 'medium', 'high']);
const ASPECTS = new Set(['square', 'portrait', 'landscape']);
const BACKGROUNDS = new Set(['auto', 'opaque', 'transparent']);
const FORMATS = new Set(['png', 'jpeg', 'webp']);

function buildRubric(descricao: string, arquivosTexto: string[]): string {
  const examples = EXAMPLE_IDS.map((id) => CATALOG.find((s) => s.id === id))
    .filter((s): s is StyleDef => Boolean(s))
    .map((s) => JSON.stringify({ id: s.id, nome: s.nome, desc: s.desc, grupo: s.grupo, template: s.template, defaults: s.defaults }, null, 2))
    .join('\n\n');

  const anexos = arquivosTexto.length
    ? '\n\nTRECHOS DE ARQUIVOS DE REFERÊNCIA DO USUÁRIO:\n' + arquivosTexto.join('\n---\n')
    : '';

  return [
    'Você é um diretor de arte que cataloga ESTILOS visuais reutilizáveis.',
    'Cada estilo é um StyleDef JSON com: id (kebab-case), nome, desc (uma frase em pt-BR), grupo, template e defaults.',
    'O template é uma instrução em INGLÊS que fixa MODO/ESTILO/COMPOSIÇÃO/LUZ/CÂMERA/RESTRIÇÕES e contém os placeholders {subject} {scene} {extra} exatamente assim.',
    'NÃO coloque tamanho, fundo nem formato dentro do template — isso vive só em defaults.',
    'defaults = { size, quality(low|medium|high), aspect(square|portrait|landscape), background(auto|opaque|transparent), format(png|jpeg|webp) }.',
    'EXEMPLOS REAIS do catálogo (imite o formato e o nível de detalhe do template):',
    examples,
    `PEDIDO DO USUÁRIO (descrição do estilo desejado): "${descricao}".`,
    'Se houver imagens anexadas, extraia delas o modo, a paleta, a luz e a composição.',
    anexos,
    'PROPONHA UM NOVO StyleDef coerente com a descrição/imagens. Responda APENAS com o objeto JSON do StyleDef, sem texto ao redor.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function mediaType(p: string): string | null {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function coerceDefaults(raw: any): StyleDefaults {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    size: typeof r.size === 'string' && r.size.trim() ? r.size : '2K',
    quality: QUALITIES.has(r.quality) ? r.quality : 'high',
    aspect: ASPECTS.has(r.aspect) ? r.aspect : 'square',
    background: BACKGROUNDS.has(r.background) ? r.background : 'auto',
    format: FORMATS.has(r.format) ? r.format : 'png',
  };
}

function coerceStyle(parsed: any, descricao: string): StyleDef {
  const nome = parsed && typeof parsed.nome === 'string' && parsed.nome.trim() ? parsed.nome.trim() : descricao.slice(0, 40).trim() || 'Estilo do usuário';
  let id = parsed && typeof parsed.id === 'string' ? slugify(parsed.id) : '';
  if (!id || !isKebab(id)) id = slugify(nome) || 'estilo-usuario';
  const template =
    parsed && typeof parsed.template === 'string' && parsed.template.includes('{subject}')
      ? parsed.template
      : `${(parsed && parsed.template) || descricao}. {subject}. {scene} {extra}`;
  return {
    id,
    nome,
    desc: parsed && typeof parsed.desc === 'string' && parsed.desc.trim() ? parsed.desc.trim() : descricao.slice(0, 120).trim(),
    grupo: parsed && typeof parsed.grupo === 'string' && parsed.grupo.trim() ? parsed.grupo.trim() : 'Meus estilos',
    template,
    defaults: coerceDefaults(parsed && parsed.defaults),
    origem: 'user',
  };
}

/** Claude analisa descrição/imagens/arquivos e PROPÕE um StyleDef. */
export async function generateStyleDef(input: {
  descricao: string;
  imagens?: string[];
  arquivos?: string[];
  model?: string;
}): Promise<{ style: StyleDef; raw: string }> {
  const model = input.model || loadSettings().judgeModel;

  const arquivosTexto: string[] = [];
  for (const f of input.arquivos ?? []) {
    try {
      const txt = fs.readFileSync(f, 'utf8').slice(0, 4000);
      arquivosTexto.push(`# ${path.basename(f)}\n${txt}`);
    } catch {
      /* arquivo ilegível — ignora */
    }
  }

  const content: ClaudeBlock[] = [{ type: 'text', text: buildRubric(input.descricao, arquivosTexto) }];
  for (const img of input.imagens ?? []) {
    const mt = mediaType(img);
    if (!mt) continue;
    try {
      const b64 = fs.readFileSync(img).toString('base64');
      content.push({ type: 'image', source: { type: 'base64', media_type: mt, data: b64 } });
    } catch {
      /* imagem ilegível — ignora */
    }
  }

  const raw = await askClaudeVision(content, model);
  const parsed = extractJson(raw);
  const style = coerceStyle(parsed, input.descricao);
  return { style, raw };
}
