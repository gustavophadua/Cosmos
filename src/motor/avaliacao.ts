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
