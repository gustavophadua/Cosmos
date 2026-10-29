// O revisor de planos ("fato vs visão"): um modelo de linguagem quebra o texto de um plano em afirmações e diz qual
// conclusão o texto apoia em quais afirmações (o extrator); cada argumento passa pela formalização assistida
// (formalizacao.ts) e o Z3 decide se a conclusão decorre das afirmações do próprio plano. O que se classifica é o
// argumento, nunca a pessoa: "provado" quer dizer que decorre do que o plano afirma; "salto" quer dizer que não
// decorre, e vem com um cenário em que tudo o que o plano afirma vale e a conclusão falha. Se as afirmações de base são
// verdade no mundo, o revisor não diz: elas ficam listadas como o que precisa de fonte.

import type { Classe, Termo } from './avaliacao'
import { lerFormula } from './avaliacao'
import { lerProposta, type Mensagem, type Perguntar } from './formalizacao'
import { buscarModelo, nao, type Modelo } from './motor'
import { MAX_TEXTO_REVISOR, type ArgumentoRevisado, type RelatorioRevisor } from './revisor-relatorio'

export { MAX_TEXTO_REVISOR, relatorioEmMarkdown, tituloDoVeredito, type ArgumentoRevisado, type RelatorioRevisor, type Veredito } from './revisor-relatorio'

export const EXTRATOR = 'extrator-v1'
const MAX_BLOCO = 1_500

const SISTEMA_EXTRATOR = `Você lê um trecho de um plano, projeto ou proposta e separa o raciocínio dele. Não julga, não corrige e não completa nada.

1. "afirmacoes": cada ideia do trecho numa frase curta e completa em português simples, na ordem do texto, numeradas a partir de 1. Uma ideia por frase. Troque "ele", "ela", "isso", "esse", "nós" e "a gente" pelo nome a que se referem ("a empresa", "o produto"). Mantenha "todo", "algum", "nenhum", "só", "se", "não" e "ou" exatamente como o texto diz.
2. "argumentos": para cada afirmação que o texto apresenta como consequência de outras (marcas como "portanto", "então", "por isso", "logo", "assim", "com isso", "vamos", "devemos", "vai", "garante", "porque"), dê o número dela em "conclusao" e os números das afirmações em que o texto a apoia em "apoios" (de 1 a 4). Em "A porque B", a conclusão é A e o apoio é B. Uma conclusão pode servir de apoio para outra. Se o texto não liga uma afirmação a nada, ela não vira argumento.

Responda SÓ com um objeto JSON:
{"afirmacoes": [{"id": 1, "texto": "..."}], "argumentos": [{"conclusao": 3, "apoios": [1, 2]}]}`

const EXEMPLO_ENTRADA = 'Nossos clientes são pequenas empresas, e toda pequena empresa precisa controlar o caixa. Por isso, nossos clientes vão comprar o módulo de caixa. O módulo custa pouco.'
const EXEMPLO_SAIDA = JSON.stringify({
  afirmacoes: [
    { id: 1, texto: 'Os clientes da empresa são pequenas empresas.' },
    { id: 2, texto: 'Toda pequena empresa precisa controlar o caixa.' },
    { id: 3, texto: 'Os clientes da empresa vão comprar o módulo de caixa.' },
    { id: 4, texto: 'O módulo de caixa custa pouco.' },
  ],
  argumentos: [{ conclusao: 3, apoios: [1, 2] }],
})

export const ESQUEMA_EXTRACAO = {
  type: 'object',
  properties: {
    afirmacoes: { type: 'array', items: { type: 'object', properties: { id: { type: 'integer' }, texto: { type: 'string' } }, required: ['id', 'texto'] } },
    argumentos: { type: 'array', items: { type: 'object', properties: { conclusao: { type: 'integer' }, apoios: { type: 'array', items: { type: 'integer' } } }, required: ['conclusao', 'apoios'] } },
  },
  required: ['afirmacoes', 'argumentos'],
} as const

/** O texto em blocos de até MAX_BLOCO caracteres, sem partir parágrafo (nem frase, se o parágrafo for maior). */
export function blocosDoTexto(texto: string, max = MAX_BLOCO): string[] {
  const pedacos = texto.replace(/\r\n?/g, '\n').split(/\n\s*\n/).map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean)
    .flatMap((p) => p.length <= max ? [p] : (p.match(/[^.!?;]+[.!?;]*\s*/g) ?? [p]).map((s) => s.trim()).filter(Boolean))
  const blocos: string[] = []
  for (const p of pedacos) {
    const ultimo = blocos.at(-1)
    if (ultimo !== undefined && ultimo.length + 1 + p.length <= max) blocos[blocos.length - 1] = `${ultimo}\n${p}`
    else blocos.push(p.slice(0, max))
  }
  return blocos
}

export function mensagensDeExtracao(bloco: string): Mensagem[] {
  return [{ role: 'system', content: SISTEMA_EXTRATOR }, { role: 'user', content: `Trecho:\n${EXEMPLO_ENTRADA}` }, { role: 'assistant', content: EXEMPLO_SAIDA },
    { role: 'user', content: `Trecho:\n${bloco}` }]
}

export interface Extracao { afirmacoes: { id: number; texto: string }[]; argumentos: { conclusao: number; apoios: number[] }[] }
/**
 * A resposta do extrator, conferida: ids únicos, textos curtos, e só os argumentos cujos números existem (o apoio
 * repetido, ou igual à conclusão, sai). Lança só se a resposta não é o objeto pedido.
 */
export function lerExtracao(conteudo: string): Extracao {
  let o: unknown
  try { o = JSON.parse(conteudo) } catch { throw new Error('a resposta do extrator não é JSON') }
  const x = o as { afirmacoes?: unknown; argumentos?: unknown }
  if (typeof o !== 'object' || o === null || !Array.isArray(x.afirmacoes) || !Array.isArray(x.argumentos)) throw new Error('a resposta do extrator não tem afirmações e argumentos')
  const afirmacoes: Extracao['afirmacoes'] = []
  for (const a of x.afirmacoes as { id?: unknown; texto?: unknown }[]) {
    if (!Number.isSafeInteger(a?.id) || typeof a.texto !== 'string' || !a.texto.trim() || afirmacoes.some((b) => b.id === a.id)) continue
    afirmacoes.push({ id: a.id as number, texto: a.texto.replace(/\s+/g, ' ').trim().slice(0, 300) })
  }
  const existe = (n: unknown) => afirmacoes.some((a) => a.id === n)
  const argumentos: Extracao['argumentos'] = []
  for (const g of x.argumentos as { conclusao?: unknown; apoios?: unknown }[]) {
    if (!existe(g?.conclusao) || !Array.isArray(g.apoios)) continue
    const apoios = [...new Set(g.apoios.filter((n) => existe(n) && n !== g.conclusao) as number[])].slice(0, 6)
    if (apoios.length && !argumentos.some((a) => a.conclusao === g.conclusao)) argumentos.push({ conclusao: g.conclusao as number, apoios })
  }
  return { afirmacoes, argumentos }
}

/** "x pode votar na assembleia" com x = "o representante" → "o representante pode votar na assembleia". */
function preencher(leitura: string, nomes: string[]): string {
  return leitura.replace(/(?<![\p{L}\p{N}_])([xyzw])(?![\p{L}\p{N}_])/gu, (v) => nomes['xyzw'.indexOf(v)] ?? v).replace(/\s*\(.*?\)\s*$/, '')
}
/**
 * Um cenário do motor finito em português: cada objeto pelo nome das constantes que o designam (ou "alguém n"), e o
 * que vale e o que não vale para ele, nas leituras do vocabulário.
 */
export function cenarioEmPortugues(m: Modelo, vocabulario: Termo[]): string[] {
  const nomeDe = (o: number) => {
    const cs = m.constantes.filter((c) => c.valor === o).map((c) => vocabulario.find((t) => t.simbolo === c.nome)?.leitura ?? c.nome)
    return cs.length ? cs.join(' = ') : `alguém ${o + 1}`
  }
  const linhas: string[] = []
  for (let o = 0; o < m.n; o++) {
    const nome = nomeDe(o), vale: string[] = [], naoVale: string[] = []
    for (const t of vocabulario.filter((v) => v.tipo === 'predicado' && v.aridade === 1)) {
      const p = m.predicados.find((q) => q.nome === t.simbolo)
      ;(p?.verdadeiros.some((v) => v.w === 0 && v.args[0] === o) ? vale : naoVale).push(preencher(t.leitura, ['']).trim())
    }
    linhas.push(`${nome}: ${[...vale, ...naoVale.map((s) => `não: ${s}`)].join('; ') || 'nada dito'}`)
  }
  for (const t of vocabulario.filter((v) => v.tipo === 'predicado' && v.aridade >= 2)) {
    const p = m.predicados.find((q) => q.nome === t.simbolo)
    for (const v of p?.verdadeiros.filter((x) => x.w === 0) ?? []) linhas.push(preencher(t.leitura, v.args.map(nomeDe)))
  }
  return linhas
}

/**
 * O salto em português: um cenário pequeno com as premissas verdadeiras e a conclusão falsa, pelo motor finito do
 * Caderno (sem Z3). Undefined se não achar até 4 objetos em 5 segundos; o veredito do Z3 continua valendo.
 */
export function cenarioDoSalto(f: { vocabulario: Termo[]; premissas: string[]; conclusao: string }): string[] | undefined {
  try {
    const fs = [...f.premissas.map((p) => lerFormula(p, f.vocabulario)), nao(lerFormula(f.conclusao, f.vocabulario))]
    const b = buscarModelo(fs, { N: 4, limite: 200_000, K: 1, prazo: Date.now() + 5_000 })
    return b.status === 'modelo' ? cenarioEmPortugues(b.modelo, f.vocabulario) : undefined
  } catch { return undefined }
}

export interface PassosRevisor {
  /** a versão do pedido de formalização, para o relatório */
  prompt: string
  extrair: Perguntar
  /** a formalização de um argumento, com o reparo (o pedido, os exemplos e o modo, cego ou não, ficam com quem chama) */
  traduzir: (texto: { premissas: string[]; conclusao: string }) => Promise<{ conteudo: string; reparo: string | null }>
  /** tira o modelo da memória antes do Z3 */
  descarregar: () => Promise<void>
  /** a classe pelo Z3; lança com o motivo (premissas inconsistentes, Z3 sem decidir) */
  classificar: (p: { vocabulario: Termo[]; premissas: string[]; conclusao: string }) => Promise<Classe>
  progresso?: (fase: string, feito: number, total: number) => void
}

/**
 * O revisor inteiro: primeiro tudo o que usa o modelo (extração bloco a bloco e formalização de cada argumento), depois
 * o modelo sai da memória e vem o Z3, porque os dois juntos não cabem neste computador.
 */
export async function revisarPlano(texto: string, passos: PassosRevisor): Promise<RelatorioRevisor> {
  const blocos = blocosDoTexto(texto.slice(0, MAX_TEXTO_REVISOR))
  const afirmacoes: { id: number; texto: string }[] = [], argumentos: { conclusao: number; apoios: number[] }[] = [], avisos: string[] = []
  for (const [i, bloco] of blocos.entries()) {
    passos.progresso?.('extraindo', i, blocos.length)
    try {
      const e = lerExtracao((await passos.extrair(mensagensDeExtracao(bloco))).conteudo)
      const novo = new Map(e.afirmacoes.map((a) => [a.id, afirmacoes.length + 1 + e.afirmacoes.indexOf(a)]))
      afirmacoes.push(...e.afirmacoes.map((a) => ({ id: novo.get(a.id)!, texto: a.texto })))
      argumentos.push(...e.argumentos.map((g) => ({ conclusao: novo.get(g.conclusao)!, apoios: g.apoios.map((n) => novo.get(n)!) })))
    } catch (err) { avisos.push(`bloco ${i + 1}: ${(err as Error).message}`) }
  }
  const textoDe = (id: number) => afirmacoes.find((a) => a.id === id)!.texto
  const traduzidos: { arg: (typeof argumentos)[number]; proposta?: ReturnType<typeof lerProposta>; motivo?: string; reparo?: string }[] = []
  for (const [i, arg] of argumentos.entries()) {
    passos.progresso?.('traduzindo', i, argumentos.length)
    const t = { premissas: arg.apoios.map(textoDe), conclusao: textoDe(arg.conclusao) }
    try {
      const r = await passos.traduzir(t)
      try { traduzidos.push({ arg, proposta: lerProposta(r.conteudo, null), ...(r.reparo ? { reparo: r.reparo } : {}) }) } catch (e) { traduzidos.push({ arg, motivo: (e as Error).message }) }
    } catch (e) { traduzidos.push({ arg, motivo: (e as Error).message }) }
  }
  await passos.descarregar().catch(() => undefined)
  const revisados: ArgumentoRevisado[] = []
  for (const [i, { arg, proposta, motivo, reparo }] of traduzidos.entries()) {
    passos.progresso?.('conferindo', i, traduzidos.length)
    const base = { conclusao: textoDe(arg.conclusao), apoios: arg.apoios.map(textoDe), ...(reparo ? { reparo } : {}) }
    if (!proposta) { revisados.push({ ...base, veredito: 'sem-traducao', motivo }); continue }
    const formulas = { vocabulario: proposta.vocabulario, premissas: proposta.premissas, conclusao: proposta.conclusao }
    let classe: Classe
    try { classe = await passos.classificar(formulas) } catch (e) {
      const m = (e as Error).message
      revisados.push({ ...base, formulas, veredito: /inconsistentes/.test(m) ? 'incompativel' : 'sem-traducao', motivo: m }); continue
    }
    if (classe === 'segue') { revisados.push({ ...base, formulas, veredito: 'provado' }); continue }
    if (classe === 'contradiz') { revisados.push({ ...base, formulas, veredito: 'contradiz' }); continue }
    const cenario = cenarioDoSalto(formulas)
    revisados.push({ ...base, formulas, veredito: 'salto', ...(cenario ? { cenario } : {}) })
  }
  const conclusoes = new Set(argumentos.map((a) => a.conclusao)), apoios = new Set(argumentos.flatMap((a) => a.apoios))
  return {
    formato: 'cosmos-revisor-v1', extrator: EXTRATOR, prompt: passos.prompt, blocos: blocos.length, avisos,
    afirmacoes: afirmacoes.map((a) => ({ ...a, papel: conclusoes.has(a.id) ? 'conclusao' : apoios.has(a.id) ? 'base' : 'solta' })),
    argumentos: revisados,
  }
}
