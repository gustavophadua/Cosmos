// O histórico da Conversa, completo e cifrado com a chave da conta (linhas seladas de conta.ts): cada mensagem numa
// linha, com o cartão inteiro (o resultado da IA), e um índice pequeno com as conversas. Fica fora dos dados da conta,
// que têm formato fixo (50 mensagens, 12 mil caracteres por resposta). As mensagens antigas do cofre entram uma vez.

import { gravarSelado, lerSelado } from '../local/conta'
import type { ConversaLocal } from '../local/dados'
import type { ResultadoIA } from './assistente'

export const MAX_MENSAGENS_IA = 1000
export interface MensagemIA { id: number; fio: number; pergunta: string; resposta: string; resultado?: ResultadoIA; em: string }
export interface EntradaIA { id: number; fio: number; titulo: string; em: string }
interface Indice { formato: 'cosmos-historico-ia-v1'; mensagens: EntradaIA[] }

const titulo = (pergunta: string) => pergunta.replace(/\s+/g, ' ').trim().slice(0, 60)
const entradaValida = (e: unknown): e is EntradaIA => typeof e === 'object' && e !== null && Number.isSafeInteger((e as EntradaIA).id) && Number.isSafeInteger((e as EntradaIA).fio)
  && typeof (e as EntradaIA).titulo === 'string' && typeof (e as EntradaIA).em === 'string'

export async function lerIndiceIA(): Promise<EntradaIA[]> {
  const i = await lerSelado<Indice>('ia-indice')
  return i?.formato === 'cosmos-historico-ia-v1' && Array.isArray(i.mensagens) ? i.mensagens.filter(entradaValida) : []
}
export async function lerMensagemIA(id: number): Promise<MensagemIA | null> {
  const m = await lerSelado<MensagemIA>(`ia-msg-${id}`)
  return m && m.id === id && typeof m.pergunta === 'string' && typeof m.resposta === 'string' ? m : null
}
/**
 * Grava a mensagem e põe no índice (as mais antigas saem do índice depois de MAX_MENSAGENS_IA). O cartão grande demais
 * (um relatório de plano enorme) vai só como texto: a linha selada tem limite.
 */
export async function gravarMensagemIA(m: MensagemIA, indice: EntradaIA[]): Promise<EntradaIA[]> {
  const comCartao = JSON.stringify(m).length <= 110_000 ? m : { ...m, resultado: undefined }
  await gravarSelado(`ia-msg-${m.id}`, comCartao)
  const novo = [...indice.filter((e) => e.id !== m.id), { id: m.id, fio: m.fio, titulo: titulo(m.pergunta), em: m.em }].slice(-MAX_MENSAGENS_IA)
  await gravarSelado('ia-indice', { formato: 'cosmos-historico-ia-v1', mensagens: novo } satisfies Indice)
  return novo
}
/** O índice da conta; na primeira vez (sem índice), as conversas antigas do cofre entram nele. */
export async function abrirHistoricoIA(antigas: ConversaLocal[], fios: number[][]): Promise<EntradaIA[]> {
  const i = await lerSelado<Indice>('ia-indice')
  if (i) return i.formato === 'cosmos-historico-ia-v1' && Array.isArray(i.mensagens) ? i.mensagens.filter(entradaValida) : []
  return importarConversasAntigas(antigas, fios)
}
/** As conversas antigas do cofre (só texto) entram no histórico novo uma vez, nos fios que o navegador lembrava. */
export async function importarConversasAntigas(antigas: ConversaLocal[], fios: number[][]): Promise<EntradaIA[]> {
  let indice: EntradaIA[] = []
  const fioDe = (id: number) => fios.find((f) => f.includes(id))?.[0] ?? id
  for (const c of [...antigas].sort((a, b) => a.id - b.id)) indice = await gravarMensagemIA({ id: c.id, fio: fioDe(c.id), pergunta: c.pergunta, resposta: c.resposta, em: new Date(0).toISOString() }, indice)
  if (!antigas.length) await gravarSelado('ia-indice', { formato: 'cosmos-historico-ia-v1', mensagens: [] } satisfies Indice)
  return indice
}
/** As conversas para a lateral: agrupadas pelo fio, a mais recente primeiro, com o título da primeira pergunta. */
export function conversasDoIndice(indice: EntradaIA[]): { fio: number; titulo: string; ultima: string }[] {
  const porFio = new Map<number, EntradaIA[]>()
  for (const e of indice) porFio.set(e.fio, [...(porFio.get(e.fio) ?? []), e])
  return [...porFio.entries()].map(([fio, es]) => {
    const ordem = es.sort((a, b) => a.id - b.id)
    return { fio, titulo: ordem[0].titulo, ultima: ordem.at(-1)!.em }
  }).sort((a, b) => b.ultima.localeCompare(a.ultima) || b.fio - a.fio)
}
