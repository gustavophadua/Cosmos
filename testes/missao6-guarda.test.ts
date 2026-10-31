/** M6: protocolo local opt-in; não altera nem contorna a guarda do tradutor. */
import { describe, expect, it } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { CEGO_FORMALIZACAO, ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, formalizarCego, objetoDaResposta } from '../src/motor/formalizacao'
import { criarAdaptadorOllama, descreverModeloOllama } from '../src/integracoes/provedores/ollama'
import type { Item } from '../src/motor/avaliacao'

interface Caso { id: string; grupo: 'parafrase-legitima' | 'risco-copia-indevida'; texto: { premissas: string[]; conclusao: string } }
const arquivo = 'avaliacao/guarda-parafrase-v1.jsonl'
const casos = readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Caso)
const ativo = process.env.MISSAO6_MEDIR === '1'
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

describe('M6: conjunto público para medir a guarda de repetição', () => {
  it('tem vinte ids W-9xx únicos, dez de cada grupo e só texto público fixo', () => {
    expect(casos).toHaveLength(20)
    expect(new Set(casos.map((c) => c.id)).size).toBe(20)
    expect(casos.every((c) => /^W-9\d\d$/.test(c.id))).toBe(true)
    expect(casos.filter((c) => c.grupo === 'parafrase-legitima')).toHaveLength(10)
    expect(casos.filter((c) => c.grupo === 'risco-copia-indevida')).toHaveLength(10)
  })

  it.runIf(ativo)('mede o qwen local uma vez e preserva falhas sem alterar a guarda', async () => {
    const pasta = 'tmp/missoes/m6-guarda'
    if (existsSync(pasta)) throw new Error('M6 já tem saída; conferir recibo antes de qualquer repetição')
    const modelo = await descreverModeloOllama('qwen3:4b')
    expect(modelo.digest.startsWith('359d7dd4')).toBe(true)
    const premissas = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_PREMISSAS, temperatura: 0, semente: 0, contexto: 4096 })
    const conclusao = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_CONCLUSAO, temperatura: 0, semente: 0, contexto: 4096 })
    const exemplos = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
    mkdirSync(pasta, { recursive: true })
    const inicio = Date.now(), resultados: { grupo: Caso['grupo']; vazia: boolean | null }[] = []
    const meta = { formato: 'cosmos-m6-guarda-v1', ...modelo, cego: CEGO_FORMALIZACAO, temperatura: 0, semente: 0,
      contexto: 4096, conjunto_sha256: hash(arquivo), formalizacao_sha256: hash('src/motor/formalizacao.ts'), inicio: new Date(inicio).toISOString() }
    writeFileSync(join(pasta, 'meta-inicio.json'), JSON.stringify(meta, null, 2) + '\n')
    for (const caso of casos) {
      const t = Date.now()
      try {
        const resposta = await formalizarCego(premissas, conclusao, caso.texto, null, exemplos)
        let vazia: boolean | null = null
        try {
          const o = objetoDaResposta(resposta.conteudo) as { conclusao?: unknown }
          if (typeof o.conclusao === 'string') vazia = o.conclusao.trim() === ''
        } catch { /* resposta ilegível é falha distinta, não conclusão vazia comprovada */ }
        resultados.push({ grupo: caso.grupo, vazia })
        appendFileSync(join(pasta, 'respostas.jsonl'), JSON.stringify({ id: caso.id, grupo: caso.grupo, ms: Date.now() - t, vazia, ...resposta }) + '\n')
      } catch (e) {
        resultados.push({ grupo: caso.grupo, vazia: null })
        appendFileSync(join(pasta, 'respostas.jsonl'), JSON.stringify({ id: caso.id, grupo: caso.grupo, ms: Date.now() - t, vazia: null, erro: (e as Error).message }) + '\n')
      }
    }
    expect(hash('src/motor/formalizacao.ts')).toBe(meta.formalizacao_sha256)
    const resumo = { ...meta, fim: new Date().toISOString(), ms: Date.now() - inicio,
      grupos: ['parafrase-legitima', 'risco-copia-indevida'].map((grupo) => ({ grupo,
        itens: resultados.filter((r) => r.grupo === grupo).length,
        vazias: resultados.filter((r) => r.grupo === grupo && r.vazia === true).length,
        falhas: resultados.filter((r) => r.grupo === grupo && r.vazia === null).length })),
      respostas_sha256: hash(join(pasta, 'respostas.jsonl')) }
    writeFileSync(join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2) + '\n')
    expect(resultados).toHaveLength(20)
    console.log(JSON.stringify(resumo))
  }, 14_400_000)
})
