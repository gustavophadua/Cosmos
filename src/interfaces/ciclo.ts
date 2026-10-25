import { PACOTE_COSMOS } from '../dados/pacoteCosmos'
import { verificarSelosCosmos } from '../motor/cadeiaCosmos'
import type { RascunhoLocal } from '../local/dados'
import { REGISTROS_PUBLICOS, type RegistroPublico } from '../v3/catalogo'

/*
 * O ciclo Conversa → fonte → rascunho → evidência → verificação.
 * A fonte de um rascunho fica no começo da descrição ("Fonte: F2 · sha256:<hash>."): assim o formato cifrado da conta
 * (cosmos-dados-conta-v1) não muda e nenhum cofre precisa de migração. A marca é só uma referência: a verificação
 * confere de novo, contra o pacote público, o que ela aponta.
 */
const MARCA = /^Fonte: (F[0-9]{1,2}) · sha256:([a-f0-9]{64})\./
export const DESCRICAO_PADRAO = 'Rascunho local. Sem prova, assinatura ou publicação.'
export const LIMITE_DESCRICAO = 300

export interface ReferenciaFonte { id: string; hash: string }
export function fonteDoRascunho(descricao: string): ReferenciaFonte | null {
  const m = MARCA.exec(descricao)
  return m ? { id: m[1], hash: m[2] } : null
}
export function descricaoComFonte(fonte: ReferenciaFonte): string {
  return `Fonte: ${fonte.id} · sha256:${fonte.hash}. Trazido da Conversa. Rascunho sem prova: a fonte confere integridade e autoria, não a verdade da fórmula.`
}
export function registroPublico(id: string | null | undefined): RegistroPublico | null {
  return REGISTROS_PUBLICOS.find(r => r.id === id) ?? null
}
/** O id da fonte pedida na rota do Labs (#/lab?fonte=F2), se for um registro público. */
export function fonteDaRota(hash: string): RegistroPublico | null {
  return registroPublico(new URLSearchParams(hash.split('?')[1] ?? '').get('fonte'))
}

/**
 * Monta o rascunho a salvar. Ao editar, a descrição anterior (e a fonte dentro dela) é mantida; antes, a edição
 * trocava a descrição pelo texto padrão e a fonte se perdia.
 */
export function montarRascunho(campos: { id: string; nome: string; formula: string; dominio: string }, anterior: { descricao: string } | null, fonte: ReferenciaFonte | null): RascunhoLocal {
  const descricao = fonte ? descricaoComFonte(fonte) : anterior?.descricao ?? DESCRICAO_PADRAO
  return { id: campos.id, nome: campos.nome.trim().normalize('NFC'), formula: campos.formula.trim().normalize('NFC'), dominio: (campos.dominio.trim() || 'Sem domínio').normalize('NFC'), descricao, rascunho: true }
}
export function proximoIdRascunho(lista: readonly { id: string }[]): string {
  const maior = lista.reduce((m, r) => Math.max(m, Number(r.id.slice(1)) || 0), 0)
  return `D${String(maior + 1).padStart(2, '0')}`
}

export type Estado = 'confere' | 'diverge' | 'ausente' | 'pendente' | 'nao_provado'
export interface Conferencia { etapa: string; estado: Estado; fato: string; fonte: string; limite: string }
export interface VerificacaoFonte { fonte: ReferenciaFonte; conferencias: Conferencia[]; aceita: boolean }

/**
 * Confere a fonte de um rascunho contra o pacote público 502426c: se o registro existe, se o hash anotado é o
 * publicado, se o hash recalculado dos 13 campos confere e se a assinatura Ed25519 do selo vale. Nunca afirma a verdade
 * do conteúdo, nem um carimbo Bitcoin que não foi confirmado.
 */
export async function verificarFonte(ref: ReferenciaFonte): Promise<VerificacaoFonte> {
  const fase = PACOTE_COSMOS.fases.find(f => f.id === ref.id) as Record<string, unknown> | undefined
  const fontePacote = 'pacote público cosmos-502426c-v1 (cadeia F0–F8 e elos assinados)'
  if (!fase) {
    return { fonte: ref, aceita: false, conferencias: [{ etapa: 'Registro', estado: 'ausente', fato: `${ref.id} não está entre os registros públicos.`, fonte: fontePacote, limite: 'Sem registro, nada mais é conferido.' }] }
  }
  const anotado: Conferencia = ref.hash === fase.hash_teoria
    ? { etapa: 'Hash anotado', estado: 'confere', fato: `O hash do rascunho é o hash_teoria publicado de ${ref.id}.`, fonte: fontePacote, limite: 'Só liga o rascunho ao registro; não diz nada da fórmula escrita.' }
    : { etapa: 'Hash anotado', estado: 'diverge', fato: `O hash do rascunho não é o hash_teoria publicado de ${ref.id}.`, fonte: fontePacote, limite: 'A referência foi alterada ou aponta para outro conteúdo.' }
  const selos = await verificarSelosCosmos(fase, PACOTE_COSMOS)
  const integridade: Conferencia = selos.integridade === 'valida'
    ? { etapa: 'Integridade · SHA-256', estado: 'confere', fato: 'O hash recalculado dos 13 campos da fase é o publicado.', fonte: 'cálculo neste aparelho', limite: 'Integridade mostra que o registro não mudou, não que ele é verdadeiro.' }
    : { etapa: 'Integridade · SHA-256', estado: 'diverge', fato: 'O hash recalculado dos 13 campos difere do publicado.', fonte: 'cálculo neste aparelho', limite: 'Registro alterado ou corrompido.' }
  const assinatura: Conferencia = selos.assinatura === 'valida'
    ? { etapa: 'Autoria · Ed25519', estado: 'confere', fato: 'A assinatura do selo 502426c sobre esse hash vale para a chave pública publicada.', fonte: 'elos-assinados.json + selo-publico.json', limite: 'Autoria prova quem assinou, não que o conteúdo é verdadeiro.' }
    : { etapa: 'Autoria · Ed25519', estado: selos.assinatura === 'ausente' ? 'ausente' : 'diverge', fato: selos.assinatura === 'ausente' ? 'Não há elo assinado para essa fase.' : 'A assinatura não confere.', fonte: 'elos-assinados.json + selo-publico.json', limite: 'Sem assinatura válida, a autoria não está demonstrada.' }
  const tempo: Conferencia = { etapa: 'Timestamp · Bitcoin', estado: 'pendente', fato: 'O carimbo OpenTimestamps está pendente; nenhuma confirmação Bitcoin foi verificada aqui.', fonte: 'pacote público (carimbo_ots)', limite: 'Uma data declarada não é uma confirmação na blockchain.' }
  const conteudo: Conferencia = { etapa: 'Conteúdo', estado: 'nao_provado', fato: 'Nenhuma prova formal da afirmação foi conferida.', fonte: 'ficha v1 (prova formal não aplicável)', limite: 'A verdade da fórmula continua em aberto.' }
  const aceita = anotado.estado === 'confere' && integridade.estado === 'confere' && assinatura.estado === 'confere'
  return { fonte: ref, aceita, conferencias: [anotado, integridade, assinatura, tempo, conteudo] }
}

// Sem conta (site público), os rascunhos vivem só nesta sessão: nada vai para o disco e tudo some ao recarregar.
let sessao: RascunhoLocal[] = []
const ouvintes = new Set<() => void>()
export const rascunhosSessao = {
  ler: () => sessao,
  observar: (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } },
  salvar(r: RascunhoLocal) {
    sessao = sessao.some(x => x.id === r.id) ? sessao.map(x => x.id === r.id ? r : x) : [...sessao, r].slice(-100)
    ouvintes.forEach(f => f())
  },
  limpar() { sessao = []; ouvintes.forEach(f => f()) },
}
