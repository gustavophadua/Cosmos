// O observador num processo próprio: as consultas com ∀∃ pesam, e o Z3 em WebAssembly se desgasta depois de muitas
// chamadas na mesma instância (testes/realidade.test.ts já faz dezenas)
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Termo } from '../src/motor/avaliacao'
import { confrontarRealidade, type ClassificarComVocabulario } from '../src/motor/realidade'

const t = (simbolo: string, leitura: string, aridade = 1, tipo: 'predicado' | 'constante' = 'predicado'): Termo => ({ simbolo, tipo, aridade, leitura })

describe('o observador (Z3 real)', () => {
  let api: Awaited<ReturnType<typeof import('z3-solver')['init']>>
  let encerrar: typeof import('z3-solver')['killThreads']
  beforeAll(async () => { const z3 = await import('z3-solver'); encerrar = z3.killThreads; api = await z3.init() }, 120_000)
  afterAll(async () => { if (api) await encerrar(api.em) })
  const classificar: ClassificarComVocabulario = async (v, ps, c) => (await import('../src/motor/avaliacaoZ3')).classificar(api, v, ps, c, 5_000)

  it('"toda pessoa está limitada no que vê" sai como fato, derivado da percepção e do cone de luz; "a pessoa vê tudo" contraria os fatos', async () => {
    const r = await confrontarRealidade(classificar,
      { vocabulario: [t('Pessoa', 'x é uma pessoa'), t('Limitada', 'x está limitada no que vê'), t('VeTudo', 'x vê tudo')], premissas: ['∀x (Pessoa(x) ⟹ Limitada(x))'], conclusao: '∃x (Pessoa(x) ∧ VeTudo(x))' },
      { premissas: ['Toda pessoa está limitada no que vê.'], conclusao: 'Logo, alguma pessoa vê tudo.' })
    expect(r.frases.map((f) => [f.situacao, f.fatos])).toEqual([['fato', ['R27', 'R28', 'R29', 'R30']], ['contraria', ['R27', 'R28', 'R29']]])
  }, 120_000)
})
