// O que a cadeia pessoal guarda neste navegador, no IndexedDB: a chave (CryptoKey não exportável), a cadeia, as
// revelações dos registros fechados e as versões conhecidas das cadeias recebidas de outros aparelhos.
import type { Cadeia } from '../motor/cadeiaPessoal'
import type { ChaveLocal, Revelacao, VersaoConhecida } from './cadeiaLocal'

export interface EstadoCadeiaLocal {
  chave: ChaveLocal | null
  cadeia: Cadeia | null
  revelacoes: { indice: number; revelacao: Revelacao }[]
  conhecidas: VersaoConhecida[]
  /** versões que bifurcaram de uma conhecida: as duas ficam guardadas, como prova */
  conflitos: { chave: string; elo: number; texto: string; recebidaEm: string }[]
}
const BANCO = 'cosmos-cadeia-pessoal', LOJA = 'itens'
const vazio = (): EstadoCadeiaLocal => ({ chave: null, cadeia: null, revelacoes: [], conhecidas: [], conflitos: [] })

function abrir(): Promise<IDBDatabase> {
  return new Promise((ok, erro) => {
    const r = indexedDB.open(BANCO, 1)
    r.onupgradeneeded = () => r.result.createObjectStore(LOJA)
    r.onsuccess = () => ok(r.result)
    r.onerror = () => erro(r.error ?? new Error('IndexedDB indisponível'))
  })
}
export async function lerEstado(): Promise<EstadoCadeiaLocal> {
  const db = await abrir()
  try {
    return await new Promise((ok, erro) => {
      const r = db.transaction(LOJA, 'readonly').objectStore(LOJA).get('estado')
      r.onsuccess = () => ok({ ...vazio(), ...(r.result ?? {}) })
      r.onerror = () => erro(r.error)
    })
  } finally { db.close() }
}
export async function gravarEstado(e: EstadoCadeiaLocal): Promise<void> {
  const db = await abrir()
  try {
    await new Promise<void>((ok, erro) => {
      const t = db.transaction(LOJA, 'readwrite')
      t.objectStore(LOJA).put(e, 'estado')
      t.oncomplete = () => ok()
      t.onerror = () => erro(t.error)
      t.onabort = () => erro(t.error ?? new Error('gravação cancelada'))
    })
  } finally { db.close() }
}

/** O livro da moeda de teste (cosmos-teste-1), no mesmo banco, noutra entrada: o próprio livro e os recebidos. */
export interface EstadoMoedaLocal {
  livro: Cadeia | null
  conhecidos: VersaoConhecida[]
  /** livros que bifurcaram de um conhecido: gasto duplo, as duas versões ficam como prova */
  conflitos: { chave: string; elo: number; texto: string; recebidaEm: string }[]
}
const ENTRADA_MOEDA = 'moeda-cosmos-teste-1'
export async function lerMoeda(): Promise<EstadoMoedaLocal> {
  const db = await abrir()
  try {
    return await new Promise((ok, erro) => {
      const r = db.transaction(LOJA, 'readonly').objectStore(LOJA).get(ENTRADA_MOEDA)
      r.onsuccess = () => ok({ livro: null, conhecidos: [], conflitos: [], ...(r.result ?? {}) })
      r.onerror = () => erro(r.error)
    })
  } finally { db.close() }
}
export async function gravarMoeda(m: EstadoMoedaLocal): Promise<void> {
  const db = await abrir()
  try {
    await new Promise<void>((ok, erro) => {
      const t = db.transaction(LOJA, 'readwrite')
      t.objectStore(LOJA).put(m, ENTRADA_MOEDA)
      t.oncomplete = () => ok()
      t.onerror = () => erro(t.error)
      t.onabort = () => erro(t.error ?? new Error('gravação cancelada'))
    })
  } finally { db.close() }
}
