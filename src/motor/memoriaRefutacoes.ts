// A memória de refutações (especificacao/formalizacao-v1.md, seção 6; capítulo 6 da resposta do GPT ao contraponto):
// o que já se tentou e caiu fica guardado com a obrigação EXATA (semântica, teoria e fórmula), o tipo do resultado e
// a evidência. Ela informa, nunca proíbe: refutar "Q(b) segue de {∀x (P(x) ⟹ Q(x)), P(a)}" não diz nada sobre a mesma
// conclusão com P(b) acrescentado, nem sobre Q(a). Só "contramodelo conferido" e "refutação conferida" estabelecem que
// a afirmação não vale; tempo esgotado, regra não suportada e prova inválida dizem só que a tentativa não chegou lá.

import type { Ficha } from './registro'
import { sha256, textoDaFormula } from './registro'

export const FORMATO_MEMORIA = 'memoria-refutacoes-v1'
export type Resultado = 'contramodelo-conferido' | 'refutacao-conferida' | 'tempo-esgotado' | 'nao-suportado' | 'prova-invalida'
export const ESTABELECE: Record<Resultado, boolean> = { 'contramodelo-conferido': true, 'refutacao-conferida': true, 'tempo-esgotado': false, 'nao-suportado': false, 'prova-invalida': false }

/** A obrigação: o que foi perguntado, exatamente. A teoria é o hash das premissas canônicas com as fichas. */
export interface Obrigacao { semantica: 'm2/t1'; afirmacao: string; teoria: string; formula: string }
export interface Tentativa {
  obrigacao: Obrigacao
  chave: string
  resultado: Resultado
  /** onde está a evidência (por exemplo, o contra-registro publicado), ou null quando não há */
  evidencia: string | null
  origem: string
  em: string
}
export interface Memoria { formato: typeof FORMATO_MEMORIA; tentativas: Tentativa[] }
export interface Consulta {
  /** a mesma obrigação, já tentada */
  exatas: Tentativa[]
  /** a mesma fórmula com outra teoria: sugestão, não decisão */
  parecidas: Tentativa[]
  /** sempre false: a memória não proíbe */
  bloqueia: false
  aviso: string
}

/** A obrigação de um registro revelado: a afirmação, o hash da teoria (já no registro) e o da fórmula canônica. */
export async function obrigacaoDe(afirmacao: string, revelacao: { formaCanonica: string; teoria: { hash: string; fichas: Ficha[] } }): Promise<Obrigacao> {
  return { semantica: 'm2/t1', afirmacao, teoria: revelacao.teoria.hash, formula: await sha256(textoDaFormula(revelacao.formaCanonica, revelacao.teoria.fichas)) }
}
export const chaveDaObrigacao = (o: Obrigacao) => sha256(`${FORMATO_MEMORIA}\nsemantica ${o.semantica}\nafirmacao ${o.afirmacao}\nteoria ${o.teoria}\nformula ${o.formula}\n`)

export const memoriaVazia = (): Memoria => ({ formato: FORMATO_MEMORIA, tentativas: [] })
/** Acrescenta uma tentativa; nada é apagado nem trocado (o histórico fica, mesmo quando uma revisão o contesta). */
export async function registrar(m: Memoria, t: Omit<Tentativa, 'chave'>): Promise<Memoria> {
  return { ...m, tentativas: [...m.tentativas, { ...t, chave: await chaveDaObrigacao(t.obrigacao) }] }
}

/** O que a memória sabe de uma obrigação. Nunca bloqueia: a pessoa pode sempre tentar de novo. */
export async function consultar(m: Memoria, o: Obrigacao): Promise<Consulta> {
  const chave = await chaveDaObrigacao(o)
  const exatas = m.tentativas.filter((t) => t.chave === chave)
  const parecidas = m.tentativas.filter((t) => t.chave !== chave && t.obrigacao.formula === o.formula && t.obrigacao.afirmacao === o.afirmacao)
  const estabelecida = exatas.find((t) => ESTABELECE[t.resultado])
  const aviso = estabelecida
    ? `Esta mesma obrigação já caiu (${estabelecida.resultado}, ${estabelecida.origem}). Tentar de novo é permitido; a evidência está em ${estabelecida.evidencia ?? 'lugar nenhum'}.`
    : exatas.length ? `Esta obrigação já foi tentada sem resultado conclusivo (${exatas.map((t) => t.resultado).join(', ')}).`
      : parecidas.length ? 'A mesma conclusão já caiu com outra teoria; com esta teoria a tentativa vale por si.'
        : 'Nada registrado para esta obrigação.'
  return { exatas, parecidas, bloqueia: false, aviso }
}
