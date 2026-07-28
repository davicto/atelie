import fs from 'fs';
import path from 'path';
import { loadSettings } from '../settings';
import { extractJson } from '../jsonx';
import { askClaudeVision, type ClaudeBlock } from '../judge';
import { findStyle } from '../userStyles';
import type { Canon, Personagem } from '../../types';

/**
 * Cláusula invariante que trava a IDENTIDADE do personagem/estilo contra a(s)
 * imagem(ns) de referência. Prefixada (junto do resto do cânone) a TODO painel.
 */
export const IDENTICAL_CLAUSE =
  'Keep the character(s) and art style IDENTICAL to the reference image(s); same face, hair, outfit, colors and line style; only change the pose/action/background.';

function nameKey(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Bloco INVARIANTE do cânone, prefixado ao prompt de todo painel:
 * estiloDescricao + descrições (verbatim) dos personagens PRESENTES + paleta/mundo +
 * a cláusula "keep IDENTICAL to the reference". Personagens ausentes NÃO entram.
 */
export function buildCanonBlock(canon: Canon, personagensPresentes: string[]): string {
  const present = new Set(personagensPresentes.map(nameKey));
  const parts: string[] = [];
  if (canon.estiloDescricao?.trim()) parts.push(`ESTILO: ${canon.estiloDescricao.trim()}`);
  for (const c of canon.personagens ?? []) {
    if (present.has(nameKey(c.nome))) parts.push(`PERSONAGEM ${c.nome}: ${c.descricao}`);
  }
  if (canon.paleta?.trim()) parts.push(`PALETA: ${canon.paleta.trim()}`);
  if (canon.mundo?.trim()) parts.push(`MUNDO: ${canon.mundo.trim()}`);
  parts.push(IDENTICAL_CLAUSE);
  return parts.join(' ');
}

function mediaType(p: string): string | null {
  const ext = path.extname(p).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return null;
}

function buildCanonRubric(descricao: string, estiloId: string): string {
  const style = findStyle(estiloId);
  const styleHint = style ? `O estilo alvo é "${style.nome}" — ${style.desc}.` : '';
  return [
    'Você é um diretor de arte montando a BÍBLIA visual (cânone) de uma série ilustrada coerente (HQ, storyboard ou livro).',
    'A partir da descrição livre do usuário, extraia os PERSONAGENS recorrentes e as travas visuais que devem se manter IDÊNTICAS de um quadro para o próximo.',
    styleHint,
    `DESCRIÇÃO DO USUÁRIO: "${descricao}".`,
    'Se houver imagens anexadas, extraia delas rosto, cabelo, roupa, cores, linha e paleta.',
    'Responda APENAS com um objeto JSON no schema:',
    '{ "estiloDescricao": string (trava de estilo/linha/paleta EM INGLÊS, injetável verbatim em prompts de imagem), ' +
      '"personagens": [ { "nome": string, "descricao": string (trava visual DETALHADA e travável EM INGLÊS: rosto, cabelo, roupa, cores, acessórios) } ], ' +
      '"paleta": string opcional, "mundo": string opcional (cenário/época) }.',
    'Sem texto ao redor do JSON.',
  ]
    .filter(Boolean)
    .join(' ');
}

function coerceCanon(parsed: any, estiloId: string, descricao: string): Canon {
  const p = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const personagens: Personagem[] = Array.isArray(p.personagens)
    ? p.personagens
        .filter((x: any) => x && typeof x === 'object')
        .map((x: any) => ({
          nome: String(x.nome ?? '').trim() || 'Personagem',
          descricao: String(x.descricao ?? '').trim(),
        }))
        .filter((x: Personagem) => x.descricao || x.nome !== 'Personagem')
    : [];
  const estiloDescricao =
    typeof p.estiloDescricao === 'string' && p.estiloDescricao.trim()
      ? p.estiloDescricao.trim()
      : findStyle(estiloId)?.desc ?? descricao.slice(0, 200).trim();
  return {
    estiloId: estiloId || 'custom',
    estiloDescricao,
    personagens,
    paleta: typeof p.paleta === 'string' && p.paleta.trim() ? p.paleta.trim() : undefined,
    mundo: typeof p.mundo === 'string' && p.mundo.trim() ? p.mundo.trim() : undefined,
  };
}

/**
 * Claude analisa a descrição livre (e imagens opcionais) e PROPÕE um Canon:
 * personagens (nome + trava visual), estiloDescricao e paleta/mundo. extractJson + coerção.
 */
export async function draftCanon(
  descricao: string,
  estiloId: string,
  opts: { model?: string; imagens?: string[] } = {},
): Promise<Canon> {
  const model = opts.model || loadSettings().serieJudge.model || loadSettings().judgeModel;
  const content: ClaudeBlock[] = [{ type: 'text', text: buildCanonRubric(descricao, estiloId) }];
  for (const img of opts.imagens ?? []) {
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
  return coerceCanon(extractJson(raw), estiloId, descricao);
}
