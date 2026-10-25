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
  /** a afirmação não vale; `contra` é o registro aberto da afirmação contrária, com certificado, que mostra isso */
  | { estado: 'nao-se-sustenta'; detalhe: string; contra: { registro: Record<string, unknown>; arquivos: Record<string, string> } }
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

// a afirmação contrária, cujo certificado mostra que a original não vale
const CONTRARIA: Record<Afirmacao, Afirmacao> = { segue: 'nao-segue', 'nao-segue': 'segue', contradiz: 'consistente', consistente: 'contradiz' }
/** O autor do contra-registro: o verificador, não a pessoa da cadeia. Não é o hash de uma chave: o contra-registro não é assinado. */
export const AUTOR_VERIFICADOR_TEXTO = 'cosmos-verificador-publico/contra-registro-v1'

type Certificacao = { certificado: Certificado; arquivos: Record<string, string> } | { falha: 'oposto' | 'pendente'; detalhe: string }

/**
 * Abre o registro: monta o certificado que a afirmação pede (seção 5 de registros-v1.md) e o registro aberto, com os
 * arquivos do certificado em `arquivos/<base>-...`. Se a afirmação não vale, certifica a contrária (segue ↔ não segue,
 * contradiz ↔ consistente) e devolve esse contra-registro, que qualquer conferência de registro-v1 confere: sem ele,
 * a recusa fica como diagnóstico do produtor, não como refutação. Se nada se decide, fica pendente.
 */
export async function abrirRegistro(fechado: Record<string, unknown>, r: RevelacaoDeRegistro, base: string, f: Ferramentas): Promise<Abertura> {
  const erro = await conferirRevelacaoDoRegistro(fechado, r)
  if (erro) return { estado: 'pendente', detalhe: `revelação recusada: ${erro}` }
  const afirmacao = fechado.afirmacao as Afirmacao
  const fichas = r.teoria.fichas
  const numericos = new Set(fichas.filter((x) => x.numerico).map((x) => x.simbolo))
  const formula = ler(r.formula, fichas)
  const premissas = r.teoria.premissas.map((p) => ler(p, fichas))
  const comNumeros = (fs: Formula[]) => fs.some((x) => temAritmetica(x, (n) => numericos.has(n)))
  // sem números, o modelo finito do motor; com números, o modelo exato tirado do Z3 (quando a ferramenta vem)
  const modelo = async (fs: Formula[]): Promise<unknown | null> => {
    if (comNumeros(fs)) return f.modeloExato ? f.modeloExato(fs, numericos) : null
    const b = buscarModelo(fs, BUSCA)
    return b.status === 'modelo' ? certificadoDoModelo(b.modelo, fs) : null
  }
  const semExato = (fs: Formula[]) => comNumeros(fs) && !f.modeloExato

  const certificar = async (af: Afirmacao, prefixo: string): Promise<Certificacao> => {
    const arquivos: Record<string, string> = {}
    const arquivo = async (nome: string, texto: string) => {
      const caminho = `arquivos/${base}-${prefixo}${nome}`
      arquivos[caminho] = texto
      return { arquivo: caminho, sha256: await sha256(texto) }
    }
    const refutacao = async (nome: string, fs: Formula[], textos: string[]) => {
      const problema = cabecalho(`${base}: ${prefixo}${nome}`, textos) + f.traduzir(fs, numericos) + '\n(check-sat)\n'
      const res = await f.refutar(problema)
      return { veredito: res.veredito, arquivos: res.veredito === 'unsat' && res.prova ? { problema: await arquivo(`${nome}.smt2`, problema), prova: await arquivo(`${nome}.alethe`, res.prova) } : null }
    }
    const conjunto = conjuntoDoCertificado(af, premissas, formula)
    const negada = af === 'segue' || af === 'nao-segue'
    const textos = [...r.teoria.premissas, negada ? `¬(${r.formula})` : r.formula]
    const certificado: Certificado = {}
    if (af === 'segue' || af === 'contradiz') {
      const ref = await refutacao('refutacao', conjunto, textos)
      if (!ref.arquivos) {
        // com quantificador, o cvc5 costuma dar unknown no lugar de sat: um modelo do conjunto mostra que a afirmação não vale
        if (ref.veredito === 'sat' || (!semExato(conjunto) && (await modelo(conjunto))))
          return { falha: 'oposto', detalhe: `há modelo das premissas com ${negada ? 'a negação da fórmula' : 'a fórmula'}: "${af}" não vale` }
        return { falha: 'pendente', detalhe: 'o cvc5 não decidiu a refutação no prazo' }
      }
      if (premissas.length) {
        if (semExato(premissas)) return { falha: 'pendente', detalhe: 'o modelo das premissas pede números exatos, e o gerador está sem o Z3' }
        const m = await modelo(premissas)
        if (m) Object.assign(certificado, { refutacao: ref.arquivos, modeloDasPremissas: m })
        else {
          const vazio = await refutacao('vazio', premissas, r.teoria.premissas)
          if (!vazio.arquivos) return { falha: 'pendente', detalhe: 'sem modelo das premissas (até 5 objetos, ou o exato pelo Z3), e o cvc5 não provou que elas são inconsistentes' }
          Object.assign(certificado, { vazio: vazio.arquivos })
          for (const k of Object.keys(arquivos)) if (k.includes('-refutacao.')) delete arquivos[k]
        }
      } else Object.assign(certificado, { refutacao: ref.arquivos })
    } else {
      if (semExato(conjunto)) return { falha: 'pendente', detalhe: 'o modelo pede números exatos, e o gerador está sem o Z3' }
      const m = await modelo(conjunto)
      if (!m) {
        const ref = await refutacao('refutacao', conjunto, textos)
        return ref.veredito === 'unsat'
          ? { falha: 'oposto', detalhe: `o cvc5 refuta as premissas com ${negada ? 'a negação da fórmula' : 'a fórmula'}: "${af}" não vale` }
          : { falha: 'pendente', detalhe: comNumeros(conjunto) ? 'o Z3 não deu modelo exato com testemunhas' : 'sem modelo até 5 objetos e 3 mundos' }
      }
      certificado.modelo = m
    }
    return { certificado, arquivos }
  }
  const montar = (af: Afirmacao, certificado: Certificado, campos: { tipo: unknown; estado: unknown; autor: unknown }) => ({
    formato: FORMATO_REGISTRO, situacao: 'aberto', afirmacao: af, formula: r.formula, formaCanonica: r.formaCanonica,
    teoria: { nome: r.teoria.nome, fichas, premissas: r.teoria.premissas, hash: r.teoria.hash },
    tipo: campos.tipo, dominio: fechado.dominio, estado: campos.estado, semantica: fechado.semantica, autor: campos.autor,
    compromisso: { hash: r.compromisso, sal: r.sal }, certificado,
  })

  const original = await certificar(afirmacao, '')
  if ('certificado' in original)
    return { estado: 'aberto', registro: montar(afirmacao, original.certificado, { tipo: fechado.tipo, estado: fechado.estado, autor: fechado.autor }), arquivos: original.arquivos }
  if (original.falha === 'pendente') return { estado: 'pendente', detalhe: original.detalhe }
  // a afirmação não vale: a evidência exportável é o certificado da contrária
  const af = CONTRARIA[afirmacao]
  const contra = await certificar(af, 'contra-')
  if (!('certificado' in contra))
    return { estado: 'pendente', detalhe: `${original.detalhe}, mas sem evidência exportável de "${af}" (${contra.detalhe}): diagnóstico do produtor, não refutação conferível` }
  const tipo = af === 'segue' ? 'teorema' : fechado.tipo === 'teorema' ? 'hipótese' : fechado.tipo
  const autor = await sha256(AUTOR_VERIFICADOR_TEXTO)
  return { estado: 'nao-se-sustenta', detalhe: original.detalhe, contra: { registro: montar(af, contra.certificado, { tipo, estado: 'sem avaliação', autor }), arquivos: contra.arquivos } }
}
