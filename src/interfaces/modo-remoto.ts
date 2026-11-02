// O modo remoto: o Cosmos aberto de fora (do telefone), servido pela porta remota deste computador (remoto-node.ts),
// depois do login. A porta põe a marca <meta name="cosmos-remoto"> na página; sem ela, vale o modo local de sempre.
// No remoto não há conta cifrada no aparelho: o login é a porta, e o histórico fica no computador, cifrado lá.

export const modoRemoto = () => typeof document !== 'undefined' && document.querySelector('meta[name="cosmos-remoto"]')?.getAttribute('content') === '1'

/** A sessão do login acabou (12 horas parada, 7 dias no total, ou o computador reiniciou o Cosmos): volta ao login. */
export class ErroLoginRemoto extends Error { constructor() { super('login-remoto') } }

async function pedir(chave: string, init: RequestInit) {
  const r = await fetch(`/cosmos/__remoto/dados/${chave}`, { ...init, credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { 'X-Cosmos-Remoto': '1', Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}) } })
  if (r.status === 401) throw new ErroLoginRemoto()
  if (!r.ok) throw new Error('O computador não guardou a conversa')
  return await r.json() as { valor?: unknown }
}
/** O mesmo papel de lerSelado/gravarSelado da conta local, guardado no computador (cifrado lá, com a chave da senha). */
export const lerRemoto = async <T>(chave: string) => ((await pedir(chave, { method: 'GET' })).valor ?? null) as T | null
export const gravarRemoto = async (chave: string, valor: unknown) => { await pedir(chave, { method: 'PUT', body: JSON.stringify({ valor }) }) }
