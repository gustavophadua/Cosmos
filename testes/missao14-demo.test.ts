/** M14: três demonstrações públicas, primeiro tradução real, depois Z3 sem modelo carregado. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { executar, notasDaLeitura, resumoEmTexto, separarArgumento, type ClienteIA } from '../src/interfaces/assistente'
import { CEGO_FORMALIZACAO, ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, formalizarCego, lerProposta } from '../src/motor/formalizacao'
import { criarAdaptadorOllama, descreverModeloOllama } from '../src/integracoes/provedores/ollama'
import { conferirProposta } from '../src/motor/avaliacaoZ3'
import { cenarioDoSalto } from '../src/motor/revisor'
import type { Item } from '../src/motor/avaliacao'

const casos = [
  { id: 'D-001', objetivo: 'segue', texto: 'Todo cliente tem suporte. A loja é cliente. Então a loja tem suporte.' },
  { id: 'D-002', objetivo: 'nao-segue', texto: 'Todo cliente tem suporte. A loja tem suporte. Então a loja é cliente.' },
  { id: 'D-003', objetivo: 'ambiguo', texto: 'Clientes do plano anual normalmente renovam. A padaria é cliente do plano anual. Então a padaria renova.' },
]
const pasta = 'tmp/missoes/m14-demo', fase = process.env.MISSAO14_FASE
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
let api: Awaited<ReturnType<typeof import('z3-solver')['init']>>
let encerrar: typeof import('z3-solver')['killThreads']
beforeAll(async () => { if (fase === 'conferir') { const z3 = await import('z3-solver'); encerrar = z3.killThreads; api = await z3.init() } }, 120_000)
afterAll(async () => { if (api) await encerrar(api.em) })

describe('M14: demonstrações públicas do Cosmos', () => {
  it('tem três argumentos e mantém aviso de normalmente no terceiro', () => {
    expect(casos.every((c) => separarArgumento(c.texto))).toBe(true)
    expect(notasDaLeitura({ texto: separarArgumento(casos[2].texto)!, classe: 'segue' }).join(' ')).toContain('normalmente')
  })
  it.runIf(fase === 'traduzir')('traduz três casos uma vez com qwen local', async () => {
    if (existsSync(pasta)) throw new Error('M14 já tem saída; não repetir')
    const modelo = await descreverModeloOllama('qwen3:4b')
    expect(modelo.digest.startsWith('359d7dd4')).toBe(true)
    const p = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_PREMISSAS, temperatura: 0, semente: 0, contexto: 4096 })
    const c = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_CONCLUSAO, temperatura: 0, semente: 0, contexto: 4096 })
    const exemplos = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
    mkdirSync(pasta, { recursive: true })
    const meta = { formato: 'cosmos-m14-demo-v1', ...modelo, cego: CEGO_FORMALIZACAO, temperatura: 0, semente: 0, contexto: 4096,
      inicio: new Date().toISOString(), casos, formalizacao_sha256: hash('src/motor/formalizacao.ts') }
    writeFileSync(`${pasta}/meta.json`, JSON.stringify(meta, null, 2) + '\n')
    for (const caso of casos) {
      const t = Date.now(), texto = separarArgumento(caso.texto)!
      const r = await formalizarCego(p, c, texto, null, exemplos)
      appendFileSync(`${pasta}/traducoes.jsonl`, JSON.stringify({ id: caso.id, ms: Date.now() - t, ...r }) + '\n')
    }
    writeFileSync(`${pasta}/traducao-concluida.json`, JSON.stringify({ itens: 3, traducoes_sha256: hash(`${pasta}/traducoes.jsonl`), fim: new Date().toISOString() }) + '\n')
  }, 3_600_000)

  it.runIf(fase === 'conferir')('executa o assistente real nas traduções já registradas, sem outra chamada neural', async () => {
    const destino = `${pasta}/respostas.jsonl`
    if (existsSync(destino)) throw new Error('M14 já conferida; não repetir')
    const fim = JSON.parse(readFileSync(`${pasta}/traducao-concluida.json`, 'utf8'))
    expect(hash(`${pasta}/traducoes.jsonl`)).toBe(fim.traducoes_sha256)
    const meta = JSON.parse(readFileSync(`${pasta}/meta.json`, 'utf8'))
    expect(hash('src/motor/formalizacao.ts')).toBe(meta.formalizacao_sha256)
    const traducoes = readFileSync(`${pasta}/traducoes.jsonl`, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    expect(traducoes.map((r) => r.id)).toEqual(casos.map((c) => c.id))
    for (const caso of casos) {
      const traducao = traducoes.find((r) => r.id === caso.id)
      const cliente: ClienteIA = {
        formalizar: async () => traducao,
        conferir: async (p) => {
          const c = await conferirProposta(api, p)
          const cenario = c.classeZ3 === 'independente' ? cenarioDoSalto(p) : undefined
          return { classeZ3: c.classeZ3, motivo: c.motivo, ...(cenario ? { cenario } : {}) }
        },
        revisar: async () => { throw new Error('revisão fora desta demo') },
        estadoRevisao: async () => { throw new Error('revisão fora desta demo') },
      }
      const resultado = await executar(cliente, 'verificar', caso.texto, (c) => lerProposta(c, null), () => undefined)
      appendFileSync(destino, JSON.stringify({ ...caso, resultado, resposta: resumoEmTexto(resultado) }) + '\n')
    }
    writeFileSync(`${pasta}/conferencia-concluida.json`, JSON.stringify({ itens: 3, respostas_sha256: hash(destino), fim: new Date().toISOString() }) + '\n')
  }, 300_000)
})
