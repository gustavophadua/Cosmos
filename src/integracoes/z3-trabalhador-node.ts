// O Z3 da conferência automática (src/integracoes/ollama-node.ts), numa thread à parte: a ponte encerra a thread
// antes de chamar o modelo, e a memória da instância WebAssembly (cerca de 2 GB) volta ao sistema. O Z3 e o modelo
// carregados juntos não cabem neste computador.
import { parentPort } from 'node:worker_threads'
import { conferirProposta } from '../motor/avaliacaoZ3'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let api: Promise<any> | null = null
parentPort?.on('message', async (m: { id: number; proposta: Parameters<typeof conferirProposta>[1] }) => {
  try {
    api ??= import('z3-solver').then((z3) => z3.init())
    parentPort!.postMessage({ id: m.id, conferencia: await conferirProposta(await api, m.proposta) })
  } catch (e) { parentPort!.postMessage({ id: m.id, erro: (e as Error).message }) }
})
