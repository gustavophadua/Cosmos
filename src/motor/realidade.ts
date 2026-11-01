// A camada de fatos (especificacao/realidade-v1.md): o argumento da pessoa confrontado com a realidade registrada. A
// pessoa é um fragmento do todo: o que ela diz não é aceito como verdade, é conferido contra a base de fatos físicos
// (src/dados/realidade-v1.ts). Tudo aqui é exato: o modelo já traduziu o texto antes; daqui em diante só há regras
// fixas (o alinhamento por sinônimos) e o Z3. Nada é chutado: o que a base não decide fica marcado como observação ou
// visão da pessoa, nunca como fato.

import type { Classe, Termo } from './avaliacao'
import { lerFormula } from './avaliacao'
import { lerDeVolta } from './formalizacao'
import { renomear, usosDeNomes } from '../logica/nomes'
import { FATOS, REALIDADE, VOCABULARIO_REAL, type Fato, type TermoReal } from '../dados/realidade-v1'

export { REALIDADE }
export type ClassificarComVocabulario = (vocabulario: Termo[], premissas: string[], conclusao: string) => Promise<Classe>
export interface Base { vocabulario: TermoReal[]; fatos: Fato[] }
export const BASE_REAL: Base = { vocabulario: VOCABULARIO_REAL, fatos: FATOS }

/** O símbolo da pessoa lido como um símbolo da base (por sinônimo exato, sem acento). */
export interface Alinhamento { de: string; leituraDe: string; para: string; leituraPara: string }
/** A constante da pessoa reconhecida como um caso de um tipo da base ("o celular" é um celular). */
export interface Tipagem { constante: string; leitura: string; formula: string; leituraTipo: string }
/**
 * fato: a base prova a frase · contraria: a base prova o contrário · observacao: usa termos da base, mas a base não
 * decide (é relato ou visão da pessoa) · fora: não fala de nada que a base conheça · nao-decidido: o Z3 não concluiu.
 */
export type Situacao = 'fato' | 'contraria' | 'observacao' | 'fora' | 'nao-decidido'
export interface Confronto { frase: string; formula: string; conclusao: boolean; situacao: Situacao; fatos: string[] }
/** Uma condição registrada que, com os fatos, produz uma possibilidade ("em funcionamento" produz "gera calor"). */
export interface Caminho { condicao: string; leitura: string; produz: string; fatos: string[] }
/** O mecanismo por trás do que a pessoa observou: o que isso implica pelos fatos e os caminhos que o produzem. */
export interface Mecanismo { frase: string; implica: { formula: string; leitura: string }[]; caminhos: Caminho[] }
export interface ResultadoRealidade {
  versao: string
  alinhamentos: Alinhamento[]
  tipagens: Tipagem[]
  frases: Confronto[]
  mecanismos: Mecanismo[]
  /** a conclusão diante dos fatos e do que a pessoa relatou de compatível com eles (null: não deu para decidir) */
  conclusaoComRelato: Classe | null
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const VAZIAS = new Set(['e', 'um', 'uma', 'o', 'a', 'os', 'as', 'meu', 'minha', 'seu', 'sua', 'nosso', 'nossa', 'esse', 'essa', 'este', 'esta', 'aquele', 'aquela'])
/** O miolo de uma leitura: sem acento, sem as variáveis e sem artigo, cópula ou possessivo no começo. */
function miolos(leitura: string): string[] {
  const palavras = semAcento(leitura).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !['x', 'y', 'z'].includes(w))
  while (palavras.length > 1 && VAZIAS.has(palavras[0])) palavras.shift()
  const m = palavras.join(' ')
  return m.startsWith('esta ') ? [m, m.slice(5)] : [m]
}
function termoDaBase(leitura: string, aridade: number, base: Base): TermoReal | null {
  if (/\bnao\b/.test(semAcento(leitura))) return null // "x não esquenta": a negação fica na fórmula, nunca no alinhamento
  const ms = miolos(leitura)
  const achados = base.vocabulario.filter((t) => t.aridade === aridade && [...t.sinonimos, ...miolos(t.leitura)].some((s) => ms.includes(semAcento(s))))
  return achados.length === 1 ? achados[0] : null // ambíguo não alinha
}

/** Liga o vocabulário da pessoa ao da base. Devolve as fórmulas reescritas e o vocabulário junto. */
export function alinhar(p: { vocabulario: Termo[]; premissas: string[]; conclusao: string }, base: Base = BASE_REAL) {
  const nomesBase = new Set(base.vocabulario.map((t) => t.simbolo))
  const alinhamentos: Alinhamento[] = [], tipagens: Tipagem[] = [], troca = new Map<string, string>(), proprios: Termo[] = []
  for (const t of p.vocabulario) {
    const alvo = t.tipo === 'predicado' ? termoDaBase(t.leitura, t.aridade, base) : null
    if (alvo) { troca.set(t.simbolo, alvo.simbolo); if (miolos(t.leitura)[0] !== miolos(alvo.leitura)[0]) alinhamentos.push({ de: t.simbolo, leituraDe: t.leitura, para: alvo.simbolo, leituraPara: alvo.leitura }); continue }
    // um símbolo da pessoa com o nome de um da base, mas outro sentido, ganha outro nome
    const novo = nomesBase.has(t.simbolo) ? `${t.simbolo}Dito` : t.simbolo
    if (novo !== t.simbolo) troca.set(t.simbolo, novo)
    proprios.push({ ...t, simbolo: novo })
    if (t.tipo === 'constante') {
      const tipo = termoDaBase(t.leitura, 1, base) ?? termoDaBase(t.simbolo, 1, base)
      if (tipo) tipagens.push({ constante: novo, leitura: t.leitura, formula: `${tipo.simbolo}(${novo})`, leituraTipo: tipo.leitura.replace(/\bx\b/, t.leitura) })
    }
  }
  const vocabulario: Termo[] = [...base.vocabulario.map(({ simbolo, tipo, aridade, leitura }) => ({ simbolo, tipo, aridade, leitura })), ...proprios]
  // troca em dois passos (nomes provisórios), para uma troca não pegar o resultado de outra
  const reescrever = (f: string) => {
    let r = f
    const pares = [...troca.entries()]
    pares.forEach(([de], i) => { r = renomear(r, de, `Tmpalinha${i}`, []) })
    pares.forEach(([, para], i) => { r = renomear(r, `Tmpalinha${i}`, para, []) })
    lerFormula(r, vocabulario)
    return r
  }
  return { alinhamentos, tipagens, vocabulario, premissas: p.premissas.map(reescrever), conclusao: reescrever(p.conclusao) }
}

const simbolosDe = (f: string, v: Termo[]) => new Set(usosDeNomes(lerFormula(f, v) as never).map((u) => u.nome))
/** Os fatos ligados à fórmula por símbolos em comum, em cadeia (o que pode importar para decidi-la). */
function relevantes(fs: string[], base: Base, v: Termo[]): Fato[] {
  const vistos = new Set(fs.flatMap((f) => [...simbolosDe(f, v)]))
  const dentro = new Set<Fato>()
  for (let mudou = true; mudou;) {
    mudou = false
    for (const fato of base.fatos) {
      if (dentro.has(fato)) continue
      const s = simbolosDe(fato.formula, v)
      if ([...s].some((x) => vistos.has(x))) { dentro.add(fato); s.forEach((x) => vistos.add(x)); mudou = true }
    }
  }
  return base.fatos.filter((f) => dentro.has(f))
}
/** Os fatos de que a decisão precisa: tira um por vez e mantém só os que, tirados, mudam a classe. */
async function necessarios(classificar: ClassificarComVocabulario, v: Termo[], fatos: Fato[], extras: string[], f: string, classe: Classe): Promise<string[]> {
  let usados = [...fatos]
  for (const fato of fatos) {
    const sem = usados.filter((x) => x !== fato)
    if (await classificar(v, [...sem.map((x) => x.formula), ...extras], f).catch(() => null) === classe) usados = sem
  }
  return usados.map((x) => x.id)
}

/** O argumento traduzido diante da base de fatos. */
export async function confrontarRealidade(classificarTudo: ClassificarComVocabulario, p: { vocabulario: Termo[]; premissas: string[]; conclusao: string },
  texto: { premissas: string[]; conclusao: string }, base: Base = BASE_REAL): Promise<ResultadoRealidade> {
  const a = alinhar(p, base)
  const v = a.vocabulario, nomesBase = new Set(base.vocabulario.map((t) => t.simbolo))
  // cada consulta leva só os símbolos que usa (o conferidor aceita até 40)
  const classificar: ClassificarComVocabulario = (_v, ps, c) => {
    const usados = new Set([...ps, c].flatMap((f) => [...simbolosDe(f, v)]))
    return classificarTudo(v.filter((t) => usados.has(t.simbolo)), ps, c)
  }
  const tipos = a.tipagens.map((t) => t.formula)
  const frases = [...a.premissas.map((formula, i) => ({ frase: texto.premissas[i] ?? formula, formula, conclusao: false })), { frase: texto.conclusao, formula: a.conclusao, conclusao: true }]
  const confrontos: Confronto[] = []
  for (const fr of frases) {
    const s = simbolosDe(fr.formula, v)
    // sem nenhum predicado da base, a frase não fala de nada que a base conhece (a constante reconhecida não basta)
    if (![...s].some((x) => nomesBase.has(x))) { confrontos.push({ ...fr, situacao: 'fora', fatos: [] }); continue }
    const fatos = relevantes([fr.formula, ...tipos], base, v)
    const classe = await classificar(v, [...fatos.map((x) => x.formula), ...tipos], fr.formula).catch(() => null)
    const situacao: Situacao = classe === 'segue' ? 'fato' : classe === 'contradiz' ? 'contraria' : classe === 'independente' ? 'observacao' : 'nao-decidido'
    confrontos.push({ ...fr, situacao, fatos: classe === 'segue' || classe === 'contradiz' ? await necessarios(classificar, v, fatos, tipos, fr.formula, classe) : [] })
  }

  // o mecanismo de cada observação que a base não decide: o que ela implica pelos fatos e as condições registradas que
  // produzem cada possibilidade. Tudo conferido pelo Z3; condição que já vale, que é impossível ou que é a própria
  // observação fica de fora
  const mecanismos: Mecanismo[] = []
  const especies = new Set(base.vocabulario.filter((t) => t.especie).map((t) => t.simbolo))
  // só estados e acontecimentos têm mecanismo ("esquentou"); dizer o que algo é ("Ana é uma pessoa") não tem causa física
  const temMecanismo = (f: string) => [...simbolosDe(f, v)].some((x) => nomesBase.has(x) && !especies.has(x))
  for (const c of confrontos.filter((x) => !x.conclusao && x.situacao === 'observacao' && temMecanismo(x.formula))) {
    const constantes = [...simbolosDe(c.formula, v)].filter((x) => v.find((t) => t.simbolo === x)?.tipo === 'constante')
    const fatos = relevantes([c.formula, ...tipos], base, v)
    const comFatos = [...fatos.map((f) => f.formula), ...tipos]
    // "Funcionando(celular)" se lê "celular está em funcionamento", pela leitura do termo; o resto, pela leitura de volta
    const ler = (f: string) => {
      const partes = f.split(' ∨ ').map((x) => /^(¬?)([A-Z]\w*)\(([a-z]\w*)\)$/.exec(x.trim()))
      if (partes.some((m) => !m || !v.find((t) => t.simbolo === m[2]))) return lerDeVolta(f, v)
      return partes.map((m) => { const leitura = v.find((t) => t.simbolo === m![2])!.leitura.replace(/x/, v.find((t) => t.simbolo === m![3])?.leitura ?? m![3]); return m![1] ? `não é verdade que ${leitura}` : leitura }).join(' ou ')
    }
    for (const k of constantes) {
      // 1. o que a observação implica: o consequente de cada fato de uma variável, aplicado a k
      const implica: string[] = []
      for (const fato of fatos) {
        const m = /^∀x \((.+) ⟹ (.+)\)$/.exec(fato.formula)
        if (!m || fato.formula.startsWith('∀x ∀')) continue
        const r = m[2].replace(/\bx\b/g, k)
        if (r === c.formula || implica.includes(r) || tipos.includes(r)) continue
        if (await classificar(v, [...comFatos, c.formula], r).catch(() => null) !== 'segue') continue
        if (await classificar(v, comFatos, r).catch(() => null) === 'segue') continue // já valia sem a observação
        implica.push(r)
      }
      // 2. as condições de um termo que, com os fatos, produzem cada possibilidade (a observação e as partes do que ela implica)
      const alvos = [...new Set([c.formula, ...implica.flatMap((r) => r.split(' ∨ ').map((s) => s.trim()))])]
      const preds = new Set(fatos.flatMap((f) => [...simbolosDe(f.formula, v)]))
      const caminhos: Caminho[] = []
      for (const alvo of alvos.filter(temMecanismo)) for (const t of base.vocabulario.filter((x) => x.aridade === 1 && !x.especie && preds.has(x.simbolo))) {
        const h = `${t.simbolo}(${k})`
        if (h === alvo || h === c.formula || tipos.includes(h)) continue
        if (await classificar(v, [...comFatos, h], alvo).catch(() => null) !== 'segue') continue
        if (await classificar(v, comFatos, h).catch(() => null) !== 'independente') continue // já vale, ou é impossível
        if (await classificar(v, [h], alvo).catch(() => 'segue') === 'segue') continue // a condição já é o alvo
        caminhos.push({ condicao: h, leitura: ler(h), produz: ler(alvo), fatos: await necessarios(classificar, v, fatos, [...tipos, h], alvo, 'segue') })
      }
      if (implica.length || caminhos.length) mecanismos.push({ frase: c.frase, implica: implica.map((r) => ({ formula: r, leitura: ler(r) })), caminhos })
    }
  }

  // a conclusão diante dos fatos e do relato compatível com eles (sem as premissas que contrariam os fatos)
  const relato = confrontos.filter((x) => !x.conclusao && x.situacao !== 'contraria' && x.situacao !== 'nao-decidido').map((x) => x.formula)
  const todos = relevantes([a.conclusao, ...relato, ...tipos], base, v).map((f) => f.formula)
  const conclusaoComRelato = await classificar(v, [...todos, ...tipos, ...relato], a.conclusao).catch(() => null)
  return { versao: REALIDADE, alinhamentos: a.alinhamentos, tipagens: a.tipagens, frases: confrontos, mecanismos, conclusaoComRelato }
}

/** Confere a forma de um resultado que veio de fora (o serviço local), antes de mostrar. */
export function lerResultadoRealidade(x: unknown): x is ResultadoRealidade {
  const o = x as ResultadoRealidade
  const texto = (s: unknown, max = 1000) => typeof s === 'string' && s.length <= max
  const ids = (xs: unknown) => Array.isArray(xs) && xs.length <= 40 && xs.every((i) => texto(i, 10))
  const lista = <T>(xs: unknown, ok: (y: T) => boolean, max = 40) => Array.isArray(xs) && xs.length <= max && (xs as T[]).every(ok)
  return !!o && typeof o === 'object' && o.versao === REALIDADE
    && lista<Alinhamento>(o.alinhamentos, (y) => texto(y.de, 80) && texto(y.para, 80) && texto(y.leituraDe, 300) && texto(y.leituraPara, 300))
    && lista<Tipagem>(o.tipagens, (y) => texto(y.constante, 80) && texto(y.formula, 300) && texto(y.leitura, 300) && texto(y.leituraTipo, 300))
    && lista<Confronto>(o.frases, (y) => texto(y.frase) && texto(y.formula) && typeof y.conclusao === 'boolean' && ['fato', 'contraria', 'observacao', 'fora', 'nao-decidido'].includes(y.situacao) && ids(y.fatos), 11)
    && lista<Mecanismo>(o.mecanismos, (y) => texto(y.frase) && lista<{ formula: string; leitura: string }>(y.implica, (z) => texto(z.formula) && texto(z.leitura))
      && lista<Caminho>(y.caminhos, (z) => texto(z.condicao, 300) && texto(z.leitura) && texto(z.produz) && ids(z.fatos)))
    && (o.conclusaoComRelato === null || ['segue', 'contradiz', 'independente'].includes(o.conclusaoComRelato))
}

/** Os fatos citados, com a fonte, para mostrar ao lado de cada frase. */
export const fatoPorId = (id: string, base: Base = BASE_REAL) => base.fatos.find((f) => f.id === id)
