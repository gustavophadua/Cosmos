/** M8: medição pública opt-in, sem mudança no prompt ou na guarda. */
import { describe, expect, it } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { CEGO_FORMALIZACAO, ESQUEMA_CONCLUSAO, ESQUEMA_PREMISSAS, formalizarCego, lerProposta, objetoDaResposta } from '../src/motor/formalizacao'
import { criarAdaptadorOllama, descreverModeloOllama } from '../src/integracoes/provedores/ollama'
import type { Item } from '../src/motor/avaliacao'

interface Caso { id: string; tipo: string; texto: { premissas: string[]; conclusao: string } }
const arquivo = 'avaliacao/injecao-publica-v1.jsonl'
const casos = readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Caso)
const hash = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
describe('M8: dez injeções públicas', () => {
  it('fixa dez ids públicos, sem alterar o filtro do piloto', () => {
    expect(casos).toHaveLength(10)
    expect(new Set(casos.map((c) => c.id)).size).toBe(10)
    expect(casos.every((c) => /^W-93[0-9]$/.test(c.id))).toBe(true)
  })
  it.runIf(process.env.MISSAO8_MEDIR === '1')('registra a execução local única sem atribuir classe', async () => {
    const pasta = 'tmp/missoes/m8-injecao'
    if (existsSync(pasta)) throw new Error('M8 já tem saída; não repetir automaticamente')
    const modelo = await descreverModeloOllama('qwen3:4b')
    expect(modelo.digest.startsWith('359d7dd4')).toBe(true)
    const premissas = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_PREMISSAS, temperatura: 0, semente: 0, contexto: 4096 })
    const conclusao = criarAdaptadorOllama({ modelo: modelo.modelo, formato: ESQUEMA_CONCLUSAO, temperatura: 0, semente: 0, contexto: 4096 })
    const exemplos = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
    mkdirSync(pasta, { recursive: true })
    const inicio = Date.now()
    const meta = { formato: 'cosmos-m8-injecao-v1', ...modelo, cego: CEGO_FORMALIZACAO, temperatura: 0, semente: 0, contexto: 4096,
      conjunto_sha256: hash(arquivo), formalizacao_sha256: hash('src/motor/formalizacao.ts'), inicio: new Date(inicio).toISOString() }
    writeFileSync(join(pasta, 'meta-inicio.json'), JSON.stringify(meta, null, 2) + '\n')
    const resultados: { id: string; legivel: boolean; vazia: boolean | null }[] = []
    for (const caso of casos) {
      const t = Date.now()
      try {
        const resposta = await formalizarCego(premissas, conclusao, caso.texto, null, exemplos)
        let legivel = false, vazia: boolean | null = null, motivo: string | null = null
        try { const o = objetoDaResposta(resposta.conteudo) as { conclusao?: unknown }; if (typeof o.conclusao === 'string') vazia = o.conclusao.trim() === '' } catch { /* ilegível não é vazio confirmado */ }
        try { lerProposta(resposta.conteudo, null); legivel = true } catch (e) { motivo = (e as Error).message }
        resultados.push({ id: caso.id, legivel, vazia })
        appendFileSync(join(pasta, 'respostas.jsonl'), JSON.stringify({ id: caso.id, tipo: caso.tipo, ms: Date.now() - t, legivel, vazia, motivo, ...resposta }) + '\n')
      } catch (e) {
        resultados.push({ id: caso.id, legivel: false, vazia: null })
        appendFileSync(join(pasta, 'respostas.jsonl'), JSON.stringify({ id: caso.id, tipo: caso.tipo, ms: Date.now() - t, legivel: false, vazia: null, erro: (e as Error).message }) + '\n')
      }
    }
    expect(hash('src/motor/formalizacao.ts')).toBe(meta.formalizacao_sha256)
    const resumo = { ...meta, fim: new Date().toISOString(), ms: Date.now() - inicio, itens: resultados.length,
      legiveis: resultados.filter((r) => r.legivel).length, vazias: resultados.filter((r) => r.vazia === true).length,
      respostas_sha256: hash(join(pasta, 'respostas.jsonl')) }
    writeFileSync(join(pasta, 'resumo.json'), JSON.stringify(resumo, null, 2) + '\n')
    expect(resultados).toHaveLength(10)
    console.log(JSON.stringify(resumo))
  }, 14_400_000)
})
