// A sessão da IA local presa à conta. Ao entrar na conta, o Cosmos pede um desafio ao serviço do modelo, assina com a
// chave da conta e recebe a sessão (ollama-node.ts, criarPorteiroIA); a senha não sai do módulo da conta. Bloquear ou
// sair da conta derruba a sessão. Se o serviço subiu depois da entrada (ou reiniciou), a Conversa pede a senha de novo.

import { assinarComSenha, observarContaLocal, obterContaLocal, registrarAoEntrar } from '../local/conta'
import { criarClienteOllama } from './ollama-cliente'
import { ErroIntegracoes } from './integracoes-cliente'
import type { DominioMensagem } from '../v4/carteira'

export type EstadoSessaoIA = { estado: 'sem-sessao' } | { estado: 'ligando' } | { estado: 'ligada' } | { estado: 'outra-conta' } | { estado: 'erro'; motivo: string }
let token: string | null = null
let estado: EstadoSessaoIA = { estado: 'sem-sessao' }
const ouvintes = new Set<() => void>()
const publicar = (e: EstadoSessaoIA) => { estado = e; ouvintes.forEach((f) => f()) }
export const tokenSessaoIA = () => token
export const obterSessaoIA = () => estado
export const observarSessaoIA = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }

/** O cliente do serviço local com a sessão (null fora de 127.0.0.1: a IA só roda no computador da pessoa). */
let cliente: ReturnType<typeof criarClienteOllama> | null | undefined
export function clienteIA() {
  if (cliente === undefined) { try { cliente = criarClienteOllama(location.origin, fetch, tokenSessaoIA) } catch { cliente = null } }
  return cliente
}

type Assinar = (dominio: DominioMensagem, mensagem: string) => Promise<{ pubkey: string; assinatura: string }>
async function ligar(assinar: Assinar) {
  const c = clienteIA()
  if (!c) return
  publicar({ estado: 'ligando' })
  try {
    const d = await c.desafio()
    const s = await assinar('COSMOS/IA/SESSAO/V1', d.desafio)
    token = (await c.abrirSessao({ desafio: d.desafio, ...s })).token
    publicar({ estado: 'ligada' })
  } catch (e) {
    token = null
    publicar(e instanceof ErroIntegracoes && e.tipo === 'conflito' ? { estado: 'outra-conta' }
      : e instanceof ErroIntegracoes && (e.tipo === 'sem-servico' || e.tipo === 'indisponivel') ? { estado: 'sem-sessao' }
      : { estado: 'erro', motivo: (e as Error).message })
  }
}
/** Religa com a senha da conta aberta (o serviço reiniciou, ou a sessão caiu por inatividade). */
export const ligarComSenha = (senha: string) => ligar((dominio, mensagem) => assinarComSenha(senha, dominio, mensagem))
/** O serviço respondeu 401: a sessão acabou. */
export function esquecerSessaoIA() { token = null; if (estado.estado !== 'sem-sessao') publicar({ estado: 'sem-sessao' }) }

if (typeof window !== 'undefined') {
  registrarAoEntrar((assinar) => ligar(assinar))
  observarContaLocal(() => { if (!obterContaLocal().perfil && (token || estado.estado !== 'sem-sessao')) { token = null; publicar({ estado: 'sem-sessao' }) } })
}
