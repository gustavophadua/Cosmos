// Abrir um registro fechado (registro-v1) a partir da revelação guardada pela pessoa: a fórmula, as premissas e o sal
// que dão o compromisso publicado na cadeia. O certificado sai da tradução t1 (Z3) e do cvc5, para as refutações, ou
// da busca de modelo finito do motor, para os modelos. Quem gera não confere: o registro aberto ainda passa pela
// conferência do Caderno e, no verificador público, pela implementação independente e pelo Carcara.

import { expandir } from '../logica/acucar'
import type { Formula } from '../logica/ast'
import { temAritmetica } from '../logica/termos'
import { validar } from '../logica/validador'
import { certificadoDoModelo } from './certificadoModelo'
import { buscarModelo, type OpcoesMotor } from './motor'
import { comoDicionario, compromissoDe, conjuntoDoCertificado, FORMATO_REGISTRO, formaCanonica, sha256, textoDaFormula, textoDaTeoria, type Afirmacao, type Certificado, type Ficha } from './registro'

export interface RevelacaoDeRegistro {
  compromisso: string
  sal: string
  formula: string
  formaCanonica: string
  teoria: { nome: string; fichas: Ficha[]; premissas: string[]; hash: string }
}
export interface Ferramentas {
  /** o problema que a tradução t1 manda ao Z3 (sem set-logic e sem check-sat) */
  traduzir: (fs: Formula[], numericos: Set<string>) => string
  /** o cvc5 no problema completo: o veredito e, no unsat, a prova Alethe (só os comandos) */
  refutar: (problema: string) => Promise<{ veredito: 'unsat' | 'sat' | 'unknown'; prova?: string }>
  /** o modelo exato (modelo-exato-t1-v1) de um conjunto com números, pelo Z3; null se não sai certificado */
  modeloExato?: (fs: Formula[], numericos: Set<string>) => Promise<unknown | null>
}
export type Abertura =
  | { estado: 'aberto'; registro: Record<string, unknown>; arquivos: Record<string, string> }
  | { estado: 'nao-se-sustenta'; detalhe: string }
  | { estado: 'pendente'; detalhe: string }

// a busca de modelo do verificador: até 5 objetos e 3 mundos, como nos lotes cegos
export const BUSCA: OpcoesMotor = { N: 5, K: 3, limite: 2_000_000 }

function ler(texto: string, fichas: Ficha[]): Formula {
  const v = validar(texto, comoDicionario(fichas))
  if (!v.ast || !v.ok) throw new Error(`${texto}: ${v.diags.find((d) => d.nivel === 'erro')?.msg ?? 'não se lê'}`)
  return expandir(v.ast)
}

/** Confere a revelação contra o registro fechado: a forma canônica, o hash da teoria e o compromisso com o sal. */
export async function conferirRevelacaoDoRegistro(fechado: Record<string, unknown>, r: RevelacaoDeRegistro): Promise<string | null> {
  if (fechado.situacao !== 'fechado') return 'o registro da cadeia não está fechado'
  const comp = fechado.compromisso as { hash?: string }, teoria = fechado.teoria as { hash?: string; nome?: string }
  let canonica: string, premissas: string[]
  try {
    canonica = formaCanonica(ler(r.formula, r.teoria.fichas))
    premissas = r.teoria.premissas.map((p) => formaCanonica(ler(p, r.teoria.fichas)))
  } catch (e) {
    return `a revelação não se lê: ${(e as Error).message}`
  }
  if (canonica !== r.formaCanonica) return 'a forma canônica da revelação não é a da fórmula'
  if ((await sha256(textoDaTeoria(premissas, r.teoria.fichas))) !== teoria.hash || r.teoria.hash !== teoria.hash) return 'o hash da teoria não confere'
  if (teoria.nome !== r.teoria.nome) return 'o nome da teoria não é o do registro'
  if ((await compromissoDe(r.sal, textoDaFormula(canonica, r.teoria.fichas))) !== comp.hash || r.compromisso !== comp.hash) return 'o compromisso não confere com a fórmula e o sal'
  return null
}

const cabecalho = (titulo: string, textos: string[]) => [`; ${titulo}`, ...textos.map((t) => `; ${t.replace(/\n/g, ' ')}`), '; tradução t1 do Caderno', '(set-logic ALL)'].join('\n') + '\n'

/**
 * Abre o registro: monta o certificado que a afirmação pede (seção 5 de registros-v1.md) e o registro aberto, com os
 * arquivos do certificado em `arquivos/<base>-...`. Se o solucionador mostra que a afirmação não vale, diz isso; se não
 * consegue decidir, fica pendente.
 */
export async function abrirRegistro(fechado: Record<string, unknown>, r: RevelacaoDeRegistro, base: string, f: Ferramentas): Promise<Abertura> {
  const erro = await conferirRevelacaoDoRegistro(fechado, r)
  if (erro) return { estado: 'pendente', detalhe: `revelação recusada: ${erro}` }
  const afirmacao = fechado.afirmacao as Afirmacao
  const fichas = r.teoria.fichas
  const numericos = new Set(fichas.filter((x) => x.numerico).map((x) => x.simbolo))
  const formula = ler(r.formula, fichas)
  const premissas = r.teoria.premissas.map((p) => ler(p, fichas))
  const conjunto = conjuntoDoCertificado(afirmacao, premissas, formula)
  const comNumeros = (fs: Formula[]) => fs.some((x) => temAritmetica(x, (n) => numericos.has(n)))
  const arquivos: Record<string, string> = {}
  const arquivo = async (nome: string, texto: string) => {
    const caminho = `arquivos/${base}-${nome}`
    arquivos[caminho] = texto
    return { arquivo: caminho, sha256: await sha256(texto) }
  }
  // sem números, o modelo finito do motor; com números, o modelo exato tirado do Z3 (quando a ferramenta vem)
  const modelo = async (fs: Formula[]): Promise<unknown | null> => {
    if (comNumeros(fs)) return f.modeloExato ? f.modeloExato(fs, numericos) : null
    const b = buscarModelo(fs, BUSCA)
    return b.status === 'modelo' ? certificadoDoModelo(b.modelo, fs) : null
  }
  const semExato = (fs: Formula[]) => comNumeros(fs) && !f.modeloExato
  const refutacao = async (nome: string, fs: Formula[], textos: string[]) => {
    const problema = cabecalho(`${base}: ${nome}`, textos) + f.traduzir(fs, numericos) + '\n(check-sat)\n'
    const res = await f.refutar(problema)
    return { veredito: res.veredito, arquivos: res.veredito === 'unsat' && res.prova ? { problema: await arquivo(`${nome}.smt2`, problema), prova: await arquivo(`${nome}.alethe`, res.prova) } : null }
  }

  const certificado: Certificado = {}
  const negada = afirmacao === 'segue' || afirmacao === 'nao-segue'
  const textos = [...r.teoria.premissas, negada ? `¬(${r.formula})` : r.formula]
  if (afirmacao === 'segue' || afirmacao === 'contradiz') {
    const ref = await refutacao('refutacao', conjunto, textos)
    if (ref.veredito === 'sat') return { estado: 'nao-se-sustenta', detalhe: `o cvc5 acha modelo para as premissas e ${negada ? 'a negação da fórmula' : 'a fórmula'}: a afirmação "${afirmacao}" não vale` }
    if (!ref.arquivos) {
      // com quantificador, o cvc5 costuma dar unknown no lugar de sat: um modelo do conjunto achado pelo motor mostra que a afirmação não vale
      if (await modelo(conjunto)) return { estado: 'nao-se-sustenta', detalhe: `o motor acha um modelo das premissas com ${negada ? 'a negação da fórmula' : 'a fórmula'}: a afirmação "${afirmacao}" não vale` }
      return { estado: 'pendente', detalhe: 'o cvc5 não decidiu a refutação no prazo' }
    }
    if (premissas.length) {
      if (semExato(premissas)) return { estado: 'pendente', detalhe: 'o modelo das premissas pede números exatos, e o gerador está sem o Z3' }
      const m = await modelo(premissas)
      if (m) Object.assign(certificado, { refutacao: ref.arquivos, modeloDasPremissas: m })
      else {
        const vazio = await refutacao('vazio', premissas, r.teoria.premissas)
        if (!vazio.arquivos) return { estado: 'pendente', detalhe: 'sem modelo das premissas (até 5 objetos, ou o exato pelo Z3), e o cvc5 não provou que elas são inconsistentes' }
        Object.assign(certificado, { vazio: vazio.arquivos })
        for (const k of Object.keys(arquivos)) if (k.includes('-refutacao.')) delete arquivos[k]
      }
    } else Object.assign(certificado, { refutacao: ref.arquivos })
  } else {
    if (semExato(conjunto)) return { estado: 'pendente', detalhe: 'o modelo pede números exatos, e o gerador está sem o Z3' }
    const m = await modelo(conjunto)
    if (!m) {
      const ref = await refutacao('refutacao', conjunto, textos)
      return ref.veredito === 'unsat'
        ? { estado: 'nao-se-sustenta', detalhe: `o cvc5 refuta o conjunto: a afirmação "${afirmacao}" não vale` }
        : { estado: 'pendente', detalhe: comNumeros(conjunto) ? 'o Z3 não deu modelo exato com testemunhas' : 'sem modelo até 5 objetos e 3 mundos' }
    }
    certificado.modelo = m
  }
  const registro = {
    formato: FORMATO_REGISTRO, situacao: 'aberto', afirmacao, formula: r.formula, formaCanonica: r.formaCanonica,
    teoria: { nome: r.teoria.nome, fichas, premissas: r.teoria.premissas, hash: r.teoria.hash },
    tipo: fechado.tipo, dominio: fechado.dominio, estado: fechado.estado, semantica: fechado.semantica, autor: fechado.autor,
    compromisso: { hash: r.compromisso, sal: r.sal }, certificado,
  }
  return { estado: 'aberto', registro, arquivos }
}
