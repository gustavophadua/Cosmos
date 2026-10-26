// A moeda de teste da rede cosmos-teste-1 (especificacao/moeda-teste.md): unidades sem valor, que só servem para testar
// a mecânica entre participantes conhecidos. Cada participante tem um livro: uma cadeia com a estrutura da cadeia-v1,
// assinada pela mesma chave da cadeia pessoal, mas com outro formato na primeira linha do texto assinado, para que uma
// assinatura de um não valha no outro. Cada elo do livro é uma operação (uma transferência). O estado da rede é uma
// função da gênese, dos livros e da lista de recompensas: qualquer um refaz a conta e chega ao mesmo saldo.
//
// As quantias são inteiros em centésimos de unidade. O que não se confere aqui: as datas das operações são declaradas
// por quem assina (não há relógio confiável; quem recebe recusa data no futuro), e a recompensa só vale se o registro
// foi aceito pelo verificador público, o que a CI confere à parte (testes/cadeias-publicadas.test.ts).

import { conferirCadeia, deHex, type Cadeia, type ConferenciaDaCadeia } from './cadeiaPessoal'
import { lerJsonEstrito, sha256 } from './registro'

export const FORMATO_LIVRO = 'livro-cosmos-teste-1'
export const FORMATO_OPERACAO = 'operacao-teste-v1'
export const FORMATO_GENESE = 'genese-teste-v1'
const QUANTIA_MAXIMA = 1e12

export interface Participante { nome: string; chave: string }
export interface Genese {
  formato: typeof FORMATO_GENESE
  rede: string
  unidade: string
  aviso: string
  inicio: string
  prazoDias: number
  casasDecimais: number
  porParticipante: number
  recompensaPorRegistro: number
  tetoSemanal: number
  queimaBps: number
  travaDias: number
  participantes: Participante[]
}
export interface Recompensa { chave: string; pasta: string; indice: number; data: string }
export type Motivo = 'pagamento' | 'certificado'
export interface Operacao {
  formato: typeof FORMATO_OPERACAO
  autor: string
  rede: string
  tipo: 'transferir'
  para: string
  quantia: number
  data: string
  motivo: Motivo
  /** no pagamento por certificado, o SHA-256 do registro pedido; senão null */
  referencia: string | null
}

const HEX64 = /^[0-9a-f]{64}$/
const ehObjeto = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
const camposExatos = (o: Record<string, unknown>, campos: string[]) => Object.keys(o).length === campos.length && campos.every((k) => k in o)
const inteiro = (x: unknown, min: number, max: number): x is number => Number.isSafeInteger(x) && (x as number) >= min && (x as number) <= max

// ---- datas: dias desde 1970-01-01, em UTC

/** O dia de uma data AAAA-MM-DD, ou null se ela não existe no calendário. */
export function diaDe(data: unknown): number | null {
  if (typeof data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data)) return null
  const t = Date.UTC(+data.slice(0, 4), +data.slice(5, 7) - 1, +data.slice(8, 10))
  return new Date(t).toISOString().slice(0, 10) === data ? t / 86_400_000 : null
}
export const dataDe = (dia: number) => new Date(dia * 86_400_000).toISOString().slice(0, 10)
/** A data de hoje no fuso do aparelho (a que a pessoa vê no relógio). */
export function hojeLocal(agora = new Date()): string {
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
}

// ---- a gênese

/** O texto que identifica a rede: o SHA-256 dele vai em toda operação, e uma operação de outra rede não vale nesta. */
export function textoDaGenese(g: Genese): string {
  const linhas = [g.formato, `rede ${g.rede}`, `unidade ${g.unidade}`, `inicio ${g.inicio}`, `prazoDias ${g.prazoDias}`, `casasDecimais ${g.casasDecimais}`,
    `porParticipante ${g.porParticipante}`, `recompensaPorRegistro ${g.recompensaPorRegistro}`, `tetoSemanal ${g.tetoSemanal}`, `queimaBps ${g.queimaBps}`,
    `travaDias ${g.travaDias}`, ...g.participantes.map((p) => `participante ${p.nome} ${p.chave}`), `aviso ${g.aviso}`]
  return linhas.map((l) => l + '\n').join('')
}
export const idDaRede = (g: Genese) => sha256(textoDaGenese(g))

/** A forma da gênese; devolve o primeiro defeito, ou null. */
export function defeitoDaGenese(g: unknown): string | null {
  if (!ehObjeto(g)) return 'a gênese não é um objeto'
  if (!camposExatos(g, ['formato', 'rede', 'unidade', 'aviso', 'inicio', 'prazoDias', 'casasDecimais', 'porParticipante', 'recompensaPorRegistro', 'tetoSemanal', 'queimaBps', 'travaDias', 'participantes'])) return 'campos da gênese'
  if (g.formato !== FORMATO_GENESE) return 'formato da gênese'
  if (typeof g.rede !== 'string' || !/^[a-z0-9-]{1,40}$/.test(g.rede)) return 'nome da rede'
  if (g.unidade !== 'UNIDADE-TESTE-SEM-VALOR') return 'a unidade da rede de teste é UNIDADE-TESTE-SEM-VALOR'
  if (typeof g.aviso !== 'string' || !g.aviso.includes('sem valor') || g.aviso.includes('\n')) return 'o aviso diz "sem valor", numa linha'
  if (diaDe(g.inicio) === null) return 'data de início'
  if (!inteiro(g.prazoDias, 1, 366) || g.casasDecimais !== 2 || !inteiro(g.travaDias, 0, 366) || !inteiro(g.queimaBps, 0, 10_000)) return 'prazo, casas, trava ou queima'
  for (const k of ['porParticipante', 'recompensaPorRegistro', 'tetoSemanal'] as const) if (!inteiro(g[k], 0, QUANTIA_MAXIMA)) return k
  if (!Array.isArray(g.participantes) || !g.participantes.length) return 'participantes'
  const vistos = new Set<string>()
  for (const p of g.participantes) {
    if (!ehObjeto(p) || !camposExatos(p, ['nome', 'chave']) || typeof p.nome !== 'string' || !/^[\p{L}\p{N}_-]{1,20}$/u.test(p.nome) || typeof p.chave !== 'string' || !HEX64.test(p.chave)) return 'um participante tem nome e chave (64 dígitos hexadecimais)'
    if (vistos.has(p.chave) || vistos.has('nome:' + p.nome)) return 'participante repetido'
    vistos.add(p.chave); vistos.add('nome:' + p.nome)
  }
  return null
}
export const ultimoDia = (g: Genese) => diaDe(g.inicio)! + g.prazoDias - 1
export const queimaDe = (quantia: number, g: Genese) => Math.floor((quantia * g.queimaBps) / 10_000)
/** Centésimos como texto: 1234 → "12,34". */
export const emUnidades = (centesimos: number) => `${centesimos < 0 ? '-' : ''}${Math.floor(Math.abs(centesimos) / 100)},${String(Math.abs(centesimos) % 100).padStart(2, '0')}`

// ---- a operação

/** O texto de uma operação, com os campos sempre na mesma ordem; recusa o que lerOperacao recusaria. */
export async function montarOperacao(g: Genese, chave: string, o: { para: string; quantia: number; data: string; motivo: Motivo; referencia?: string | null }): Promise<string> {
  const op: Operacao = { formato: FORMATO_OPERACAO, autor: await sha256(deHex(chave)), rede: await idDaRede(g), tipo: 'transferir', para: o.para, quantia: o.quantia, data: o.data, motivo: o.motivo, referencia: o.referencia ?? null }
  const texto = JSON.stringify(op)
  const lida = await lerOperacao(texto, g, chave)
  if (typeof lida === 'string') throw new Error(lida)
  return texto
}

/** Lê uma operação de um elo do livro de `chave`: a forma, a rede, o destino, a quantia e a data no prazo. */
export async function lerOperacao(texto: string, g: Genese, chave: string): Promise<Operacao | string> {
  let o: unknown
  try { o = lerJsonEstrito(texto) } catch (e) { return `a operação não se lê: ${(e as Error).message}` }
  if (!ehObjeto(o) || !camposExatos(o, ['formato', 'autor', 'rede', 'tipo', 'para', 'quantia', 'data', 'motivo', 'referencia'])) return 'a operação não tem os campos do formato'
  if (o.formato !== FORMATO_OPERACAO || o.tipo !== 'transferir') return 'formato ou tipo de operação desconhecido'
  if (o.autor !== (await sha256(deHex(chave)))) return 'o autor não é o SHA-256 da chave do livro'
  if (o.rede !== (await idDaRede(g))) return `a operação é de outra rede, não da ${g.rede}`
  if (typeof o.para !== 'string' || !g.participantes.some((p) => p.chave === o.para)) return 'o destino não é participante da rede'
  if (o.para === chave) return 'transferência para a própria chave'
  if (!inteiro(o.quantia, 1, QUANTIA_MAXIMA)) return 'a quantia é um inteiro positivo de centésimos'
  const dia = diaDe(o.data)
  if (dia === null) return 'data inválida'
  if (dia < diaDe(g.inicio)! || dia > ultimoDia(g)) return `a data ${o.data} está fora do prazo da rede`
  if (o.motivo !== 'pagamento' && o.motivo !== 'certificado') return 'motivo desconhecido'
  if (o.motivo === 'certificado' ? typeof o.referencia !== 'string' || !HEX64.test(o.referencia) : o.referencia !== null) return 'o pagamento por certificado leva o SHA-256 do registro; o pagamento comum, nenhuma referência'
  return o as unknown as Operacao
}

// ---- o estado da rede

export interface Conta {
  nome: string
  chave: string
  genese: number
  recompensas: number
  recebido: number
  enviado: number
  queimadoNosEnvios: number
  livre: number
  travado: number
  /** as quantias ainda presas e o dia em que se soltam */
  liberacoes: { quantia: number; em: string }[]
}
export interface ResultadoDoLivro {
  chave: string
  conferencia: ConferenciaDaCadeia
  /** quantas operações, do começo, valem */
  validas: number
  /** a primeira operação recusada; as seguintes do mesmo livro não contam */
  recusa: { indice: number | null; motivo: string } | null
}
export interface OperacaoAceita { chave: string; indice: number; op: Operacao; queima: number }
export interface EstadoDaRede {
  id: string
  hoje: string
  contas: Conta[]
  livros: ResultadoDoLivro[]
  operacoes: OperacaoAceita[]
  recompensas: { recompensa: Recompensa; valida: boolean; motivo: string }[]
  emitido: number
  queimado: number
  emCirculacao: number
  /** emitido − queimado = soma dos saldos (regra 8 de moeda-teste.md) */
  conserva: boolean
}

/**
 * O estado da rede no dia `hoje`, a partir da gênese, de um livro por chave e da lista de recompensas. As operações
 * são conferidas em ordem de data: cada uma só gasta o saldo livre naquele dia (a gênese, mais o que foi recebido há
 * pelo menos travaDias, menos o que já saiu). A primeira operação que não vale recusa o resto daquele livro.
 */
export async function estadoDaRede(g: Genese, livros: unknown[], recompensas: unknown[], hoje: string): Promise<EstadoDaRede> {
  const defeito = defeitoDaGenese(g)
  if (defeito) throw new Error(`gênese inválida: ${defeito}`)
  const diaHoje = diaDe(hoje)
  if (diaHoje === null) throw new Error('data de hoje inválida')
  const inicio = diaDe(g.inicio)!, fim = ultimoDia(g)
  const id = await idDaRede(g)
  const creditos = new Map<string, { quantia: number; libera: number }[]>(g.participantes.map((p) => [p.chave, [{ quantia: g.porParticipante, libera: inicio }]]))
  const contas = new Map<string, Conta>(g.participantes.map((p) => [p.chave, { nome: p.nome, chave: p.chave, genese: g.porParticipante, recompensas: 0, recebido: 0, enviado: 0, queimadoNosEnvios: 0, livre: 0, travado: 0, liberacoes: [] }]))

  // as recompensas: participante, prazo, sem repetir o mesmo registro e até o teto por chave e por semana
  const resultadoRec: EstadoDaRede['recompensas'] = []
  const usadas = new Set<string>(), porSemana = new Map<string, number>()
  const ordenadas = recompensas.map((r, i) => ({ r, i })).sort((a, b) => (ehObjeto(a.r) && ehObjeto(b.r) ? String(a.r.data).localeCompare(String(b.r.data)) : 0) || a.i - b.i)
  for (const { r } of ordenadas) {
    const rec = r as Recompensa
    const recusar = (motivo: string) => resultadoRec.push({ recompensa: rec, valida: false, motivo })
    if (!ehObjeto(r) || !camposExatos(r, ['chave', 'pasta', 'indice', 'data']) || typeof r.pasta !== 'string' || !/^[a-z0-9-]{1,80}$/.test(r.pasta) || !inteiro(r.indice, 0, 1e6)) { recusar('forma da recompensa'); continue }
    const dia = diaDe(r.data)
    if (typeof r.chave !== 'string' || !contas.has(r.chave)) { recusar('a chave não é participante'); continue }
    if (dia === null || dia < inicio || dia > fim || dia > diaHoje) { recusar('data fora do prazo ou no futuro'); continue }
    if (usadas.has(`${r.pasta}#${r.indice}`)) { recusar('o mesmo registro já foi recompensado'); continue }
    const semana = `${r.chave}#${Math.floor((dia - inicio) / 7)}`
    if ((porSemana.get(semana) ?? 0) + g.recompensaPorRegistro > g.tetoSemanal) { recusar('passa do teto semanal da chave'); continue }
    usadas.add(`${r.pasta}#${r.indice}`); porSemana.set(semana, (porSemana.get(semana) ?? 0) + g.recompensaPorRegistro)
    creditos.get(r.chave)!.push({ quantia: g.recompensaPorRegistro, libera: dia + g.travaDias })
    contas.get(r.chave)!.recompensas += g.recompensaPorRegistro
    resultadoRec.push({ recompensa: rec, valida: true, motivo: '' })
  }

  // os livros: a conferência da cadeia e a leitura de cada operação, até a primeira que não se lê
  const resultados: ResultadoDoLivro[] = []
  const candidatas: { chave: string; indice: number; op: Operacao; dia: number; livro: ResultadoDoLivro }[] = []
  const comLivro = new Set<string>()
  for (const livro of livros) {
    const conferencia = await conferirCadeia(livro, FORMATO_LIVRO)
    const chave = conferencia.veredito === 'aceita' ? (livro as Cadeia).chave : ehObjeto(livro) && typeof livro.chave === 'string' ? livro.chave : ''
    const res: ResultadoDoLivro = { chave, conferencia, validas: 0, recusa: null }
    resultados.push(res)
    if (conferencia.veredito !== 'aceita') { res.recusa = { indice: conferencia.elo, motivo: `${conferencia.motivo}: ${conferencia.detalhe}` }; continue }
    if (!contas.has(chave)) { res.recusa = { indice: null, motivo: 'a chave do livro não é participante da rede' }; continue }
    if (comLivro.has(chave)) { res.recusa = { indice: null, motivo: 'outro livro da mesma chave já foi lido' }; continue }
    comLivro.add(chave)
    let diaAnterior = inicio
    for (const [indice, elo] of (livro as Cadeia).elos.entries()) {
      const op = await lerOperacao(elo.registroTexto, g, chave)
      if (typeof op === 'string') { res.recusa = { indice, motivo: op }; break }
      const dia = diaDe(op.data)!
      if (dia < diaAnterior) { res.recusa = { indice, motivo: 'a data é anterior à da operação de antes' }; break }
      if (dia > diaHoje) { res.recusa = { indice, motivo: `a data ${op.data} está no futuro` }; break }
      diaAnterior = dia
      candidatas.push({ chave, indice, op, dia, livro: res })
    }
  }

  // as operações em ordem de data: cada uma gasta só o saldo livre daquele dia
  const operacoes: OperacaoAceita[] = []
  candidatas.sort((a, b) => a.dia - b.dia || a.chave.localeCompare(b.chave) || a.indice - b.indice)
  let queimado = 0
  for (const c of candidatas) {
    if (c.livro.recusa && c.livro.recusa.indice !== null && c.indice >= c.livro.recusa.indice) continue
    const conta = contas.get(c.chave)!
    const livre = creditos.get(c.chave)!.filter((k) => k.libera <= c.dia).reduce((s, k) => s + k.quantia, 0) - conta.enviado
    if (c.op.quantia > livre) { c.livro.recusa = { indice: c.indice, motivo: `saldo livre insuficiente em ${c.op.data}: há ${emUnidades(livre)}, a operação gasta ${emUnidades(c.op.quantia)}` }; continue }
    const queima = queimaDe(c.op.quantia, g)
    conta.enviado += c.op.quantia
    conta.queimadoNosEnvios += queima
    queimado += queima
    contas.get(c.op.para)!.recebido += c.op.quantia - queima
    creditos.get(c.op.para)!.push({ quantia: c.op.quantia - queima, libera: c.dia + g.travaDias })
    operacoes.push({ chave: c.chave, indice: c.indice, op: c.op, queima })
    c.livro.validas++
  }

  // os saldos no dia de hoje
  let emCirculacao = 0
  for (const conta of contas.values()) {
    const ks = creditos.get(conta.chave)!
    conta.livre = ks.filter((k) => k.libera <= diaHoje).reduce((s, k) => s + k.quantia, 0) - conta.enviado
    conta.liberacoes = ks.filter((k) => k.libera > diaHoje).map((k) => ({ quantia: k.quantia, em: dataDe(k.libera) }))
    conta.travado = conta.liberacoes.reduce((s, k) => s + k.quantia, 0)
    emCirculacao += conta.livre + conta.travado
  }
  const emitido = g.porParticipante * g.participantes.length + [...contas.values()].reduce((s, c) => s + c.recompensas, 0)
  return { id, hoje, contas: [...contas.values()], livros: resultados, operacoes, recompensas: resultadoRec, emitido, queimado, emCirculacao, conserva: emCirculacao === emitido - queimado }
}
