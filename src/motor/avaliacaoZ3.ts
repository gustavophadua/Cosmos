// A classificação e a nota da avaliação pelo Z3 (especificacao/avaliacao-v1.md). Fica fora de avaliacao.ts porque o
// Z3 não entra no app publicado: a tela de formalização só lê e lê de volta; a nota roda no Node (testes e piloto).

import type { Formula } from '../logica/ast'
import { checarZ3, type ResultadoZ3 } from './z3'
import { CLASSES, lerFormula, type Classe, type Item, type Nota, type Resposta, type Termo } from './avaliacao'

export interface Candidato { premissas: string[]; conclusao: string; classe: Classe | null }

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

const equivale = async (api: unknown, v: Termo[], a: string, b: string) => a === b || (await equivalentes(api, v, a, b)) === 'unsat'
const mesmoSentido = async (api: unknown, v: Termo[], a: Candidato, b: Candidato) =>
  await equivale(api, v, a.conclusao, b.conclusao) && await equivale(api, v, conjuncao(a.premissas), conjuncao(b.premissas))

/**
 * A votação do piloto (passo D3 do plano): das respostas de um item, fica a da maior turma de fórmulas equivalentes
 * pelo Z3 (premissas juntas e conclusão), não a de texto igual. Empate: a turma do candidato que veio primeiro. A
 * classe é a mais dita dentro da turma (sem contar as que não disseram classe). Null se nenhum candidato se leu.
 */
export async function votar(api: unknown, v: Termo[], candidatos: Candidato[]): Promise<Candidato | null> {
  const turmas: Candidato[][] = []
  for (const c of candidatos) {
    let achou = false
    for (const t of turmas) if (await mesmoSentido(api, v, t[0], c)) { t.push(c); achou = true; break }
    if (!achou) turmas.push([c])
  }
  if (!turmas.length) return null
  const maior = turmas.reduce((a, t) => (t.length > a.length ? t : a))
  const contagem = new Map<Classe | null, number>()
  for (const c of maior) if (c.classe) contagem.set(c.classe, (contagem.get(c.classe) ?? 0) + 1)
  const classe = contagem.size ? [...contagem].reduce((a, x) => (x[1] > a[1] ? x : a))[0] : null
  return { premissas: maior[0].premissas, conclusao: maior[0].conclusao, classe }
}

export interface Conferencia { classeZ3: Classe | null; aceita: boolean; motivo: string }
/**
 * O modo automático da formalização (especificacao/formalizacao-v1.md §3c): a proposta passa sem a pessoa aprovar só
 * quando a classe que o modelo disse é a que o Z3 dá às fórmulas dele. Classe diferente quase sempre é fórmula que não
 * diz o que o texto dizia; premissas inconsistentes ou o Z3 sem decidir também descartam.
 */
export async function conferirProposta(api: unknown, p: { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }, tempoMs = 5_000): Promise<Conferencia> {
  let classeZ3: Classe
  try { classeZ3 = await classificar(api, p.vocabulario, p.premissas, p.conclusao, tempoMs) } catch (e) { return { classeZ3: null, aceita: false, motivo: (e as Error).message } }
  if (!p.classe) return { classeZ3, aceita: false, motivo: `o modelo não disse a classe; o Z3 diz ${classeZ3}` }
  return classeZ3 === p.classe ? { classeZ3, aceita: true, motivo: '' } : { classeZ3, aceita: false, motivo: `o modelo disse ${p.classe}, o Z3 diz ${classeZ3}` }
}
