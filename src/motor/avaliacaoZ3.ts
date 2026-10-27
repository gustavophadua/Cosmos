// A classificação e a nota da avaliação pelo Z3 (especificacao/avaliacao-v1.md). Fica fora de avaliacao.ts porque o
// Z3 não entra no app publicado: a tela de formalização só lê e lê de volta; a nota roda no Node (testes e piloto).

import type { Formula } from '../logica/ast'
import { checarZ3, type ResultadoZ3 } from './z3'
import { CLASSES, lerFormula, type Classe, type Item, type Nota, type Resposta, type Termo } from './avaliacao'

export const conjuncao = (fs: string[]) => fs.map((f) => `(${f})`).join(' ∧ ')

/**
 * A classe da conclusão pelo Z3: segue (premissas ∧ ¬conclusão é insatisfazível), contradiz (premissas ∧ conclusão é
 * insatisfazível) ou independente (as duas são satisfazíveis). Premissas inconsistentes ou resposta "unknown" lançam:
 * um item assim não entra no conjunto.
 */
export async function classificar(api: unknown, vocabulario: Termo[], premissas: string[], conclusao: string, tempoMs?: number): Promise<Classe> {
  const ps = premissas.map((p) => lerFormula(p, vocabulario))
  const z = (fs: Formula[]): Promise<ResultadoZ3> => checarZ3(api, fs, tempoMs)
  const base = await z(ps)
  if (base !== 'sat') throw new Error(base === 'unsat' ? 'as premissas são inconsistentes' : 'o Z3 não decidiu as premissas')
  const semConclusao = await z([...ps, lerFormula(`¬(${conclusao})`, vocabulario)])
  const comConclusao = await z([...ps, lerFormula(conclusao, vocabulario)])
  if (semConclusao === 'unknown' || comConclusao === 'unknown') throw new Error('o Z3 não decidiu a conclusão')
  return semConclusao === 'unsat' ? 'segue' : comConclusao === 'unsat' ? 'contradiz' : 'independente'
}

/** Duas fórmulas (ou conjunções) equivalentes: a negação do bicondicional é insatisfazível. */
async function equivalentes(api: unknown, vocabulario: Termo[], a: string, b: string): Promise<ResultadoZ3> {
  return checarZ3(api, [lerFormula(`¬((${a}) ⟺ (${b}))`, vocabulario)])
}

/** A nota de uma resposta para um item. */
export async function pontuar(api: unknown, item: Item, r: Resposta): Promise<Nota> {
  const nota: Nota = { id: item.id, le: false, classeCerta: r.classe === item.gabarito.classe, premissasFieis: false, conclusaoFiel: false, completa: false, motivo: '' }
  if (!CLASSES.includes(r.classe)) return { ...nota, classeCerta: false, motivo: 'classe desconhecida' }
  if (!Array.isArray(r.premissas) || !r.premissas.length || typeof r.conclusao !== 'string') return { ...nota, motivo: 'faltam premissas ou conclusão' }
  try { [...r.premissas, r.conclusao].forEach((f) => lerFormula(f, item.vocabulario)) } catch (e) { return { ...nota, motivo: (e as Error).message } }
  nota.le = true
  nota.premissasFieis = (await equivalentes(api, item.vocabulario, conjuncao(r.premissas), conjuncao(item.gabarito.premissas))) === 'unsat'
  nota.conclusaoFiel = (await equivalentes(api, item.vocabulario, r.conclusao, item.gabarito.conclusao)) === 'unsat'
  nota.completa = nota.classeCerta && nota.premissasFieis && nota.conclusaoFiel
  nota.motivo = nota.completa ? '' : [!nota.classeCerta && 'classe errada', !nota.premissasFieis && 'premissas não equivalem às do gabarito', !nota.conclusaoFiel && 'conclusão não equivale à do gabarito'].filter(Boolean).join('; ')
  return nota
}
