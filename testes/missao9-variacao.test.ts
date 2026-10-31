/** M9: somente revisão pública, cinco execuções por item, sem ajuste de prompt. */
import { describe, expect, it } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { CEGO_FORMALIZACAO, ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, formalizarCego, lerProposta, type Perguntar } from '../src/motor/formalizacao'
import { criarAdaptadorOllama, descreverModeloOllama } from '../src/integracoes/provedores/ollama'
import type { Item } from '../src/motor/avaliacao'

const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
function variacao(rs: { conteudo?: string; formulas?: string | null }[]) {
  return { respostasDistintas: new Set(rs.map((r) => r.conteudo ?? null)).size,
    formulasDistintas: new Set(rs.map((r) => r.formulas ?? null)).size }
}

describe('M9: variação e tempo da tradução', () => {
  it('conta variação de texto separada de variação das fórmulas', () => {
    expect(variacao([{ conteudo: 'a', formulas: 'f' }, { conteudo: 'b', formulas: 'f' }])).toEqual({ respostasDistintas: 2, formulasDistintas: 1 })
    expect(variacao([{ conteudo: 'a', formulas: 'f' }, { conteudo: 'a', formulas: 'f' }])).toEqual({ respostasDistintas: 1, formulasDistintas: 1 })
  })
  it.runIf(process.env.MISSAO9_MEDIR === '1')('traduz dez itens da revisão cinco vezes, um por vez', async () => {
    const arquivo = 'tmp/frases-gpt/revisao.jsonl', pasta = 'tmp/missoes/m9-variacao'
    if (existsSync(pasta)) throw new Error('M9 já tem saída; não repetir automaticamente')
    const linhas = readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as { parte: string; item: Item }).slice(0, 10)
    expect(linhas).toHaveLength(10)
    expect(linhas.every((l) => l.parte === 'revisao')).toBe(true)
    expect(new Set(linhas.map((l) => l.item.id)).size).toBe(10)
    const modelo = await descreverModeloOllama('qwen3:4b')
    expect(modelo.digest.startsWith('359d7dd4')).toBe(true)
    const p = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_PREMISSAS, temperatura: 0, semente: 0, contexto: 4096 })
    const c = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_CONCLUSAO, temperatura: 0, semente: 0, contexto: 4096 })
    const exemplos = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
    mkdirSync(pasta, { recursive: true })
    const inicio = Date.now()
    const meta = { formato: 'cosmos-m9-variacao-v1', ...modelo, cego: CEGO_FORMALIZACAO, temperatura: 0, semente: 0, contexto: 4096,
      conjunto: arquivo, conjunto_sha256: hash(arquivo), ids: linhas.map((l) => l.item.id), repeticoes: 5,
      formalizacao_sha256: hash('src/motor/formalizacao.ts'), ponte_sha256: hash('src/motor/ponte.ts'), inicio: new Date(inicio).toISOString() }
    writeFileSync(join(pasta, 'meta-inicio.json'), JSON.stringify(meta, null, 2) + '\n')
    const resultados: { id: string; conteudo?: string; formulas: string | null; premissasMs: number; conclusaoMs: number }[] = []
    for (const { item } of linhas) for (let repeticao = 0; repeticao < 5; repeticao++) {
      const t = performance.now(), tempos = { premissasMs: 0, conclusaoMs: 0 }
      const medir = (f: Perguntar, chave: keyof typeof tempos): Perguntar => async (m) => {
        const antes = performance.now()
        try { return await f(m) } finally { tempos[chave] += performance.now() - antes }
      }
      try {
        // Mesmo protocolo do piloto M1: vocabulário do conjunto, exemplos públicos e cego-v2.
        const resposta = await formalizarCego(medir(p, 'premissasMs'), medir(c, 'conclusaoMs'), item.texto, item.vocabulario, exemplos)
        let formulas: string | null = null, motivo: string | null = null
        try { const lida = lerProposta(resposta.conteudo, item.vocabulario); formulas = JSON.stringify({ premissas: lida.premissas, conclusao: lida.conclusao }) }
        catch (e) { motivo = (e as Error).message }
        resultados.push({ id: item.id, conteudo: resposta.conteudo, formulas, ...tempos })
        appendFileSync(join(pasta, 'respostas.jsonl'), JSON.stringify({ id: item.id, repeticao, ...tempos, ms: performance.now() - t, formulas, motivo, ...resposta }) + '\n')
      } catch (e) {
        resultados.push({ id: item.id, formulas: null, ...tempos })
        appendFileSync(join(pasta, 'respostas.jsonl'), JSON.stringify({ id: item.id, repeticao, ...tempos, ms: performance.now() - t, formulas: null, erro: (e as Error).message }) + '\n')
      }
    }
    expect(hash('src/motor/formalizacao.ts')).toBe(meta.formalizacao_sha256)
    expect(hash('src/motor/ponte.ts')).toBe(meta.ponte_sha256)
    expect(hash(arquivo)).toBe(meta.conjunto_sha256)
    const porItem = linhas.map(({ item }) => ({ id: item.id, ...variacao(resultados.filter((r) => r.id === item.id)) }))
    const resumo = { ...meta, fim: new Date().toISOString(), ms: Date.now() - inicio, itens: resultados.length,
      porItem, mudaramTexto: porItem.filter((r) => r.respostasDistintas > 1).length,
      mudaramFormulas: porItem.filter((r) => r.formulasDistintas > 1).length,
      semLeitura: resultados.filter((r) => r.formulas === null).length, respostas_sha256: hash(join(pasta, 'respostas.jsonl')) }
    writeFileSync(join(pasta, 'resumo-traducao.json'), JSON.stringify(resumo, null, 2) + '\n')
    expect(resultados).toHaveLength(50)
    console.log(JSON.stringify(resumo))
  }, 28_800_000)
})
