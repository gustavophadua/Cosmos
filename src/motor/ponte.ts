// A ligação que falta (versão PONTE). Quando o Z3 diz que a conclusão não decorre (salto), o que falta quase nunca está
// no texto: está na cabeça de quem escreveu. A ligação é uma premissa a mais, geral, que liga o que as premissas dizem ao
// que a conclusão diz. Quem decide se ela serve é o Z3: com ela, a conclusão tem de decorrer; sozinha, não pode bastar
// (senão é a conclusão com outras palavras); e ela não pode contradizer as premissas. A ligação não é um fato: é a visão
// que a pessoa precisa aceitar para a conclusão ficar de pé, e a resposta diz isso com essas palavras.
//
// Primeiro, sem modelo, a busca pela forma: "para todo x (e y): se [o que as premissas dizem de x e y], então [o que a
// conclusão diz]", com o que as premissas dizem em uma ou duas condições. Costuma haver mais de uma que fecha; a escolha
// entre elas é a visão da pessoa, e a resposta mostra até quatro. Só se a busca não achar nada, o modelo propõe (o modelo
// pequeno erra muito aqui: no argumento "nenhuma pessoa invalida outra" ele propôs "ninguém invalida a si mesmo").

import { lerFormula, type Classe, type Termo } from './avaliacao'
import { lerDeVolta, objetoDaResposta, type Mensagem, type Perguntar } from './formalizacao'
import { imprimir } from '../logica/impressao'
import type { Formula } from '../logica/ast'

export const PONTE = 'ponte-v1'
export const ESQUEMA_PONTE = { type: 'object', properties: { ponte: { type: 'string' } }, required: ['ponte'] } as const

const SISTEMA_PONTE = `Você recebe um argumento já formalizado na linguagem m2 (lógica de primeira ordem): o vocabulário, as premissas, a conclusão e um cenário em que todas as premissas valem e a conclusão não. A conclusão não decorre das premissas: falta uma ligação.

Proponha UMA premissa a mais, geral, que ligue o que as premissas dizem ao que a conclusão diz, de modo que, com ela, a conclusão passe a decorrer.
- use só os símbolos do vocabulário, com a sintaxe do m2: ∀x (…), ∃x (…), ¬, ∧, ∨, ⟹; toda variável dentro de um ∀ ou ∃; feche todos os parênteses;
- não copie a conclusão nem a reescreva: no "se" da ligação entra o que as premissas dizem; no "então", o que a conclusão diz;
- a ligação mais fraca que fecha é a melhor: não acrescente nada que não precise;
- não contradiga as premissas.

Responda SÓ com um objeto JSON, sem texto antes ou depois: {"ponte": "..."}`

const EXEMPLO = {
  vocabulario: [{ simbolo: 'Cliente', tipo: 'predicado', aridade: 1, leitura: 'x é cliente' }, { simbolo: 'Anual', tipo: 'predicado', aridade: 1, leitura: 'x tem o plano anual' },
    { simbolo: 'Suporte', tipo: 'predicado', aridade: 1, leitura: 'x tem suporte' }, { simbolo: 'padaria', tipo: 'constante', aridade: 0, leitura: 'a padaria' }] as Termo[],
  premissas: ['∀x (Cliente(x) ⟹ Anual(x))', 'Cliente(padaria)'], conclusao: 'Suporte(padaria)', cenario: ['a padaria: é cliente; tem o plano anual; não: tem suporte'],
  ponte: '∀x (Anual(x) ⟹ Suporte(x))',
}

export interface ArgumentoFormal { vocabulario: Termo[]; premissas: string[]; conclusao: string; cenario?: string[] }
const entrada = (a: ArgumentoFormal) => [`Vocabulário:\n${JSON.stringify(a.vocabulario)}`, `Premissas:\n${a.premissas.map((p) => `- ${p}`).join('\n')}`,
  `Conclusão: ${a.conclusao}`, `Cenário em que as premissas valem e a conclusão não:\n${(a.cenario?.length ? a.cenario : ['(não calculado)']).map((c) => `- ${c}`).join('\n')}`].join('\n\n')
export function mensagensDaPonte(a: ArgumentoFormal): Mensagem[] {
  return [{ role: 'system', content: SISTEMA_PONTE }, { role: 'user', content: entrada(EXEMPLO) }, { role: 'assistant', content: JSON.stringify({ ponte: EXEMPLO.ponte }) },
    { role: 'user', content: entrada(a) }]
}

/** A classe pelo Z3 (lança com o motivo, como "as premissas são inconsistentes"). */
export type ClassificarZ3 = (premissas: string[], conclusao: string) => Promise<Classe>
export interface OpcaoPonte { ponte: string; leitura: string; essenciais: number[] }
export type ResultadoPonte = { opcoes: OpcaoPonte[]; fonte: 'busca' | 'modelo'; outras: number } | { opcoes: []; motivo: string }

const sem = (s: string) => s.replace(/\s+/g, '')
/**
 * A classe, ou o motivo de não haver (premissas inconsistentes). Uma falha do Z3 (encerrado, sem decidir) tem uma segunda
 * chance e, se repetir, vira 'falhou': quem chama não pode ler a falha como "não segue".
 */
async function classeOuMotivo(classificar: ClassificarZ3, ps: string[], c: string): Promise<string> {
  for (let t = 0; t < 2; t++) {
    try { return await classificar(ps, c) } catch (e) { if (/inconsistentes/.test((e as Error).message)) return (e as Error).message }
  }
  return 'falhou'
}

/**
 * A ligação que falta: primeiro a busca pela forma (só o Z3), depois, se ela não achar, o modelo (com uma volta pelo
 * motivo). `antesDoModelo` e `antesDoZ3` são para quem chama tirar um da memória antes do outro.
 */
export async function buscarPonte(perguntar: Perguntar | null, classificar: ClassificarZ3, a: ArgumentoFormal,
  passos: { antesDoModelo?: () => Promise<void> | void; antesDoZ3?: () => Promise<void> | void } = {}, tentativas = 2): Promise<ResultadoPonte> {
  await passos.antesDoZ3?.()
  const achadas = await buscarPelaForma(classificar, a)
  if (achadas.length) return { opcoes: await comEssenciais(classificar, a, variadas(achadas, 4)), fonte: 'busca', outras: achadas.length - Math.min(4, achadas.length) }
  if (!perguntar) return { opcoes: [], motivo: 'nenhuma ligação simples fecha o argumento' }
  const mensagens = mensagensDaPonte(a)
  let motivo = 'o modelo não respondeu'
  for (let t = 1; t <= tentativas; t++) {
    await passos.antesDoModelo?.()
    const r = await perguntar(mensagens)
    mensagens.push({ role: 'assistant', content: r.conteudo })
    await passos.antesDoZ3?.()
    const problema = await conferirDoModelo(r.conteudo, classificar, a)
    if (typeof problema !== 'string') return { opcoes: await comEssenciais(classificar, a, [problema]), fonte: 'modelo', outras: 0 }
    motivo = problema
    mensagens.push({ role: 'user', content: `Essa ligação não serve: ${problema}. Proponha outra, só o objeto JSON.` })
  }
  return { opcoes: [], motivo }
}

/** Até n ligações, cada uma com o máximo de condições que as anteriores ainda não usaram (a escolha é da pessoa). */
function variadas<T extends { ponte: string }>(achadas: T[], n: number): T[] {
  const condicoesDe = (p: string) => new Set(p.slice(0, p.indexOf('⟹')).split(/\s*∧\s*/).map((c) => c.replace(/^.*\(\s*(?=¬?[A-Z])/, '').trim()))
  const escolhidas: T[] = [], vistas = new Set<string>()
  const restantes = [...achadas]
  while (escolhidas.length < n && restantes.length) {
    let melhor = 0, nota = -1
    restantes.forEach((x, i) => { const novas = [...condicoesDe(x.ponte)].filter((c) => !vistas.has(c)).length; if (novas > nota) { nota = novas; melhor = i } })
    const [x] = restantes.splice(melhor, 1)
    condicoesDe(x.ponte).forEach((c) => vistas.add(c)); escolhidas.push(x)
  }
  return escolhidas
}

/**
 * Com a ligação, as premissas que a conclusão ainda usa (as outras não fazem falta). Se o Z3 falhar numa delas, a conta
 * não vale: a opção vai com todas as premissas como usadas (o que não afirma nada de errado).
 */
async function comEssenciais(classificar: ClassificarZ3, a: ArgumentoFormal, opcoes: { ponte: string; leitura: string }[]): Promise<OpcaoPonte[]> {
  const r: OpcaoPonte[] = []
  for (const o of opcoes) {
    const classes = []
    for (let i = 0; i < a.premissas.length; i++) classes.push(await classeOuMotivo(classificar, [...a.premissas.filter((_, j) => j !== i), o.ponte], a.conclusao))
    r.push({ ...o, essenciais: classes.includes('falhou') ? a.premissas.map((_, i) => i) : classes.flatMap((c, i) => c === 'segue' ? [] : [i]) })
  }
  return r
}

/** Serve se: com as premissas, a conclusão decorre; sozinha, não; e não contradiz as premissas (aí não seria "segue"). */
async function serve(classificar: ClassificarZ3, a: ArgumentoFormal, ponte: string): Promise<string | null> {
  if (sem(ponte) === sem(a.conclusao) || a.premissas.some((p) => sem(p) === sem(ponte))) return 'ela repete a conclusão ou uma premissa'
  const junto = await classeOuMotivo(classificar, [...a.premissas, ponte], a.conclusao)
  if (junto !== 'segue') return /inconsistentes/.test(junto) ? 'ela contradiz as premissas' : `com ela, a conclusão ainda não decorre (${junto})`
  const sozinha = await classeOuMotivo(classificar, [ponte], a.conclusao)
  if (sozinha === 'segue') return 'ela sozinha já prova a conclusão: é a conclusão com outras palavras, sem usar as premissas'
  if (sozinha === 'falhou') return 'o Z3 não conseguiu conferir se ela sozinha basta'
  return null
}

async function conferirDoModelo(conteudo: string, classificar: ClassificarZ3, a: ArgumentoFormal): Promise<{ ponte: string; leitura: string } | string> {
  let ponte: string
  try {
    const o = objetoDaResposta(conteudo) as { ponte?: unknown }
    if (typeof o?.ponte !== 'string' || !o.ponte.trim()) return 'falta a fórmula da ligação'
    ponte = o.ponte.trim()
    lerFormula(ponte, a.vocabulario)
  } catch (e) { return `a fórmula não se lê (${(e as Error).message})` }
  const problema = await serve(classificar, a, ponte)
  if (problema) return problema
  let leitura: string
  try { leitura = lerDeVolta(ponte, a.vocabulario) } catch { leitura = ponte }
  return { ponte, leitura }
}

// ---- a busca pela forma ----

interface Literal { pred: string; v: string; neg: boolean }
/** O "então" da ligação: o que a conclusão afirma, sobre as variáveis do ∀ (ou sobre x, se a conclusão fala de um indivíduo). */
interface Alvo { vars: string[]; texto: string; literal: { pred: string; args: string[]; neg: boolean } | null }

const varDoTermo = (t: unknown) => (t as { k?: string; nome?: string }).k === 'nome' ? (t as { nome: string }).nome : null
function literalDe(f: Formula): Alvo['literal'] {
  const neg = f.k === 'not', g = f.k === 'not' ? f.f : f
  if (g.k !== 'pred') return null
  const args = g.args.map(varDoTermo)
  return args.every((x): x is string => x !== null) ? { pred: g.nome, args, neg } : null
}

function alvoDaConclusao(conclusao: string, v: Termo[]): Alvo | null {
  let f = lerFormula(conclusao, v)
  const vars: string[] = []
  // "∀x (Pessoa(x) ⟹ ∀y (Pessoa(y) ⟹ C(x, y)))" é o mesmo que "∀x ∀y (Pessoa(x) ∧ Pessoa(y) ⟹ C(x, y))": o "então" é C.
  // E "… ⟹ ¬∃y (Pessoa(y) ∧ C(x, y))" é "… ⟹ ∀y (Pessoa(y) ⟹ ¬C(x, y))": o "então" é ¬C
  for (;;) {
    if (f.k === 'forall') { vars.push(f.v); f = f.corpo; continue }
    if (f.k === 'imp' && f.r.k === 'forall') { f = f.r; continue }
    if (f.k === 'imp' && f.r.k === 'not' && f.r.f.k === 'exists' && f.r.f.corpo.k === 'and') {
      const e = f.r.f, corpo = f.r.f.corpo
      vars.push(e.v)
      f = { ...f, l: corpo.l, r: { ...corpo.r, k: 'not', f: corpo.r } as Formula }
      continue
    }
    break
  }
  if (vars.length) {
    const cons = f.k === 'imp' ? f.r : f
    return { vars, texto: imprimir(cons), literal: literalDe(cons) }
  }
  // sobre um indivíduo só: "Eterno(socrates)" vira "Eterno(x)", e a ligação fala de todo x
  const l = literalDe(f)
  const constantes = new Set(v.filter((t) => t.tipo === 'constante').map((t) => t.simbolo))
  if (!l || l.args.length !== 1 || !constantes.has(l.args[0])) return null
  const literal = { ...l, args: ['x'] }
  return { vars: ['x'], texto: `${literal.neg ? '¬' : ''}${literal.pred}(x)`, literal }
}

/**
 * As condições possíveis: os predicados de um lugar das premissas, com o sinal com que aparecem lá, em cada variável. Os
 * da própria conclusão ficam de fora: "se A é homem, então A é eterno" é a conclusão, não a ligação.
 */
function condicoes(a: ArgumentoFormal, alvo: Alvo): Literal[] {
  const usados = new Set([...a.conclusao.matchAll(/([A-Za-z][A-Za-z0-9_]*)\(/g)].map((m) => m[1]))
  const r: Literal[] = []
  for (const t of a.vocabulario) {
    if (t.tipo !== 'predicado' || t.aridade !== 1 || usados.has(t.simbolo)) continue
    const nome = t.simbolo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const positivo = a.premissas.some((p) => new RegExp(`(^|[^¬A-Za-z0-9_])${nome}\\(`).test(p)), negativo = a.premissas.some((p) => new RegExp(`¬\\s*${nome}\\(`).test(p))
    for (const v of alvo.vars) {
      if (positivo) r.push({ pred: t.simbolo, v, neg: false })
      if (negativo) r.push({ pred: t.simbolo, v, neg: true })
    }
  }
  return r
}

const formulaDaPonte = (alvo: Alvo, ls: Literal[]) =>
  `${alvo.vars.map((v) => `∀${v}`).join(' ')} (${ls.map((l) => `${l.neg ? '¬' : ''}${l.pred}(${l.v})`).join(' ∧ ')} ⟹ ${alvo.texto})`

/** As ligações de uma e duas condições que servem, da mais fraca (duas condições, uma em cada variável) para a mais forte. */
async function buscarPelaForma(classificar: ClassificarZ3, a: ArgumentoFormal, limite = 80): Promise<{ ponte: string; leitura: string }[]> {
  let alvo: Alvo | null
  try { alvo = alvoDaConclusao(a.conclusao, a.vocabulario) } catch { return [] }
  if (!alvo) return []
  const cs = condicoes(a, alvo)
  const candidatas: Literal[][] = []
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) if (cs[i].pred !== cs[j].pred || cs[i].v !== cs[j].v) candidatas.push([cs[i], cs[j]])
  candidatas.sort((x, y) => new Set(y.map((l) => l.v)).size - new Set(x.map((l) => l.v)).size)
  candidatas.push(...cs.map((l) => [l]))
  const achadas: { ponte: string; leitura: string }[] = []
  for (const ls of candidatas.slice(0, limite)) {
    const ponte = formulaDaPonte(alvo, ls)
    if (await serve(classificar, a, ponte)) continue
    achadas.push({ ponte, leitura: leituraDaPonte(alvo, ls, a.vocabulario) ?? lerDeVolta(ponte, a.vocabulario) })
  }
  return achadas
}

// ---- a leitura em português, pelas leituras do vocabulário ("x invalida a existência de y") ----

const NOMES: Record<string, string> = { x: 'A', y: 'B', z: 'C', w: 'D' }
const nome = (v: string) => NOMES[v] ?? v.toUpperCase()
/** "x é dona da sua função" com x = A, negado: "A não é dona da sua função". Null se a leitura não começa pela variável. */
function frase(t: Termo | undefined, args: string[], neg: boolean): string | null {
  if (!t || !/^[xy]\s/.test(t.leitura)) return null
  const lugares: Record<string, string> = { x: nome(args[0] ?? 'x'), y: nome(args[1] ?? 'y') }
  const texto = t.leitura.replace(/\b[xy]\b/g, (m) => lugares[m])
  if (!neg) return texto
  const i = texto.indexOf(' ')
  return `${texto.slice(0, i)} não ${texto.slice(i + 1)}`
}
function leituraDaPonte(alvo: Alvo, ls: Literal[], v: Termo[]): string | null {
  if (!alvo.literal) return null
  const termo = (s: string) => v.find((t) => t.simbolo === s)
  const condicao = ls.map((l) => frase(termo(l.pred), [l.v], l.neg))
  const entao = frase(termo(alvo.literal.pred), alvo.literal.args, alvo.literal.neg)
  if (condicao.some((c) => c === null) || !entao) return null
  const quem = alvo.vars.length === 1 ? `Para qualquer ${nome(alvo.vars[0])}` : `Para quaisquer ${alvo.vars.slice(0, -1).map(nome).join(', ')} e ${nome(alvo.vars.at(-1)!)}`
  return `${quem}: se ${condicao.join(' e ')}, então ${entao}.`
}
