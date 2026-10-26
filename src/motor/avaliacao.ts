// A avaliação da formalização de frases curtas (especificacao/avaliacao-v1.md): cada item traz frases em português
// (premissas e uma conclusão) e o vocabulário; a resposta esperada é a formalização em m2 e a classe da conclusão
// (segue, contradiz ou independente das premissas). O gabarito é conferido pelo Z3; a nota de uma resposta exige a
// classe certa E fórmulas equivalentes às do gabarito, porque acertar a classe com a fórmula errada é sorte, não
// formalização. O conjunto fechado não é publicado: só o compromisso de cada item (SHA-256 com sal), a raiz e o
// carimbo, antes de qualquer treino.

import type { Formula } from '../logica/ast'
import { expandir } from '../logica/acucar'
import { usosDeNomes } from '../logica/termos'
import { validar } from '../logica/validador'
import { checarZ3, type ResultadoZ3 } from './z3'
import { comoDicionario, sha256, type Ficha } from './registro'

export const FORMATO_ITEM = 'avaliacao-frases-v1'
export type Classe = 'segue' | 'contradiz' | 'independente'
export const CLASSES: Classe[] = ['segue', 'contradiz', 'independente']

export interface Termo extends Ficha {
  /** como o símbolo se lê em português: "x é médico(a)", "Ana", "x admira y" */
  leitura: string
}
export interface Item {
  id: string
  texto: { premissas: string[]; conclusao: string }
  vocabulario: Termo[]
  gabarito: { premissas: string[]; conclusao: string; classe: Classe }
}
export interface Resposta { id: string; premissas: string[]; conclusao: string; classe: Classe }
export interface Nota {
  id: string
  /** a resposta se lê em m2 com o vocabulário do item */
  le: boolean
  classeCerta: boolean
  /** as premissas da resposta, juntas, equivalem às do gabarito; idem a conclusão */
  premissasFieis: boolean
  conclusaoFiel: boolean
  /** classe certa e as duas fidelidades: a única que conta como acerto */
  completa: boolean
  motivo: string
}

const fichasDe = (v: Termo[]): Ficha[] => v.map(({ simbolo, tipo, aridade }) => ({ simbolo, tipo, aridade }))
/**
 * A leitura m2 com o vocabulário do item; lança se não se lê ou se usa um nome fora do vocabulário (o leitor do m2
 * aceita nomes novos, e uma resposta com símbolo inventado não pode ser comparada com o gabarito).
 */
export function lerFormula(texto: string, vocabulario: Termo[]): Formula {
  const v = validar(texto, comoDicionario(fichasDe(vocabulario)))
  if (!v.ast || !v.ok) throw new Error(`"${texto}" não se lê: ${v.diags.find((d) => d.nivel === 'erro')?.msg ?? 'erro de leitura'}`)
  for (const u of usosDeNomes(v.ast)) {
    const t = vocabulario.find((x) => x.simbolo === u.nome)
    if (!t || t.tipo !== u.tipo || t.aridade !== u.aridade) throw new Error(`"${texto}" usa ${u.nome} (${u.tipo}/${u.aridade}), que não está no vocabulário do item`)
  }
  return expandir(v.ast)
}
const conjuncao = (fs: string[]) => fs.map((f) => `(${f})`).join(' ∧ ')

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

/** O resumo de um lote de notas: acertos completos e por classe do gabarito. */
export function resumir(itens: Item[], notas: Nota[]) {
  const porId = new Map(notas.map((n) => [n.id, n]))
  const por = (c: Classe) => { const xs = itens.filter((i) => i.gabarito.classe === c); return { itens: xs.length, completas: xs.filter((i) => porId.get(i.id)?.completa).length } }
  return { itens: itens.length, respondidos: notas.length, completas: notas.filter((n) => n.completa).length, soClasseCerta: notas.filter((n) => n.classeCerta && !n.completa).length, segue: por('segue'), contradiz: por('contradiz'), independente: por('independente') }
}

/** O compromisso de um item: SHA-256 do formato, do sal (32 bytes em hex) e do item em JSON, linha a linha. */
export const compromissoDoItem = (item: Item, sal: string) => sha256(`${FORMATO_ITEM}\n${sal}\n${JSON.stringify(item)}\n`)
/** A raiz do conjunto: SHA-256 dos compromissos, um por linha, na ordem dos itens. */
export const raizDoConjunto = (compromissos: string[]) => sha256(compromissos.map((c) => c + '\n').join(''))
