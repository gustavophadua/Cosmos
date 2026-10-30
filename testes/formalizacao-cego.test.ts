import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { formalizarCego, lerProposta, mensagensDasPremissas, mensagensDaConclusao, type Mensagem } from '../src/motor/formalizacao'
import type { Item, Termo } from '../src/motor/avaliacao'

const EXEMPLOS = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
const TEXTO = { premissas: ['Alguém só pode votar se estiver credenciado.', 'Rui está credenciado.'], conclusao: 'Rui pode votar.' }
const VOCAB: Termo[] = [{ simbolo: 'PodeVotar', tipo: 'predicado', aridade: 1, leitura: 'x pode votar' }, { simbolo: 'Credenciado', tipo: 'predicado', aridade: 1, leitura: 'x está credenciado' },
  { simbolo: 'rui', tipo: 'constante', aridade: 0, leitura: 'Rui' }]
const resposta = (o: unknown) => ({ conteudo: JSON.stringify(o), prompt: 100, completion: 20 })
const texto = (ms: Mensagem[]) => ms.map((m) => m.content).join('\n')

describe('tradução cega', () => {
  it('a chamada das premissas não vê a conclusão; a da conclusão não vê as premissas nem as fórmulas delas', async () => {
    const premissasVistas: Mensagem[][] = [], conclusaoVista: Mensagem[][] = []
    const r = await formalizarCego(
      async (m) => { premissasVistas.push(m); return resposta({ vocabulario: VOCAB.slice(0, 2).concat(VOCAB[2]), premissas: ['∀x (PodeVotar(x) ⟹ Credenciado(x))', 'Credenciado(rui)'] }) },
      async (m) => { conclusaoVista.push(m); return resposta({ vocabulario: VOCAB, conclusao: 'PodeVotar(rui)' }) },
      TEXTO, null, EXEMPLOS)
    const entradaPremissas = premissasVistas[0].at(-1)!.content, entradaConclusao = conclusaoVista[0].at(-1)!.content
    expect(entradaPremissas).toContain('Alguém só pode votar se estiver credenciado.')
    expect(texto(premissasVistas[0])).not.toContain('Rui pode votar')
    expect(entradaConclusao).toContain('Frase: Rui pode votar.')
    expect(texto(conclusaoVista[0])).not.toContain('credenciado.')
    expect(texto(conclusaoVista[0])).not.toContain('Credenciado(rui)')
    expect(texto(premissasVistas[0])).not.toMatch(/Classifique|"segue"/)
    const p = lerProposta(r.conteudo, null)
    expect(p).toMatchObject({ premissas: ['∀x (PodeVotar(x) ⟹ Credenciado(x))', 'Credenciado(rui)'], conclusao: 'PodeVotar(rui)', classe: null })
    expect(r).toMatchObject({ prompt: 200, completion: 40, reparo: null })
  })

  it('premissa de fora volta uma vez ao modelo; símbolo novo da conclusão entra no vocabulário; com vocabulário dado, só ele', async () => {
    const chamadas: string[] = []
    const premissas = [resposta({ vocabulario: VOCAB, premissas: ['∀x (PodeVotar(x) ⟹ Credenciado(x))'] }), resposta({ vocabulario: VOCAB, premissas: ['∀x (PodeVotar(x) ⟹ Credenciado(x))', 'Credenciado(rui)'] })]
    const r = await formalizarCego(async () => { chamadas.push('p'); return premissas.shift()! },
      async () => { chamadas.push('c'); return resposta({ vocabulario: [...VOCAB, { simbolo: 'Feliz', tipo: 'predicado', aridade: 1, leitura: 'x está feliz' }], conclusao: 'Feliz(rui)' }) },
      TEXTO, null, EXEMPLOS)
    expect(chamadas).toEqual(['p', 'p', 'c'])
    expect(r.reparo).toBe('premissas: o texto tem 2 premissa(s) e a resposta tem 1; escreva uma fórmula para cada premissa, na mesma ordem')
    expect(lerProposta(r.conteudo, null).vocabulario.map((t) => t.simbolo)).toEqual(['PodeVotar', 'Credenciado', 'rui', 'Feliz'])
    // vocabulário dado (o piloto): o símbolo de fora é erro do modelo, volta com o erro
    const conclusoes = [resposta({ vocabulario: VOCAB, conclusao: 'Feliz(rui)' }), resposta({ vocabulario: VOCAB, conclusao: 'PodeVotar(rui)' })]
    const s = await formalizarCego(async () => resposta({ vocabulario: VOCAB, premissas: ['∀x (PodeVotar(x) ⟹ Credenciado(x))', 'Credenciado(rui)'] }), async () => conclusoes.shift()!, TEXTO, VOCAB, EXEMPLOS)
    expect(s.reparo).toMatch(/^conclusão: .*Feliz/)
    expect(lerProposta(s.conteudo, VOCAB).conclusao).toBe('PodeVotar(rui)')
  })

  it('a conclusão que repete a fórmula de uma premissa de outro texto volta com o erro; se insistir, fica sem conclusão', async () => {
    // o caso real (29/10/2026): "o homem é eterno" virou Eterno(deus), a fórmula de "Deus é eterno"
    const DEUS = { premissas: ['Todo homem parte de Deus.', 'Deus é eterno.'], conclusao: 'O homem é eterno.' }
    const V: Termo[] = [{ simbolo: 'Homem', tipo: 'predicado', aridade: 1, leitura: 'x é homem' }, { simbolo: 'ParteDeDeus', tipo: 'predicado', aridade: 1, leitura: 'x é parte de Deus' },
      { simbolo: 'Eterno', tipo: 'predicado', aridade: 1, leitura: 'x é eterno' }, { simbolo: 'deus', tipo: 'constante', aridade: 0, leitura: 'Deus' }]
    const premissas = async () => resposta({ vocabulario: V, premissas: ['∀x (Homem(x) ⟹ ParteDeDeus(x))', 'Eterno(deus)'] })
    const vistas: Mensagem[][] = []
    const conclusoes = [resposta({ vocabulario: V, conclusao: 'Eterno(deus)' }), resposta({ vocabulario: V, conclusao: '∀x (Homem(x) ⟹ Eterno(x))' })]
    const r = await formalizarCego(premissas, async (m) => { vistas.push(m); return conclusoes.shift()! }, DEUS, null, EXEMPLOS)
    expect(r.reparo).toMatch(/^conclusão: essa fórmula repete uma das premissas/)
    expect(texto(vistas[1])).not.toContain('Deus é eterno.')
    expect(lerProposta(r.conteudo, null).conclusao).toBe('∀x (Homem(x) ⟹ Eterno(x))')
    const s = await formalizarCego(premissas, async () => resposta({ vocabulario: V, conclusao: 'Eterno(deus)' }), DEUS, null, EXEMPLOS)
    expect(() => lerProposta(s.conteudo, null)).toThrow()
    // a conclusão que repete a premissa de mesmo texto é legítima
    const t = await formalizarCego(premissas, async () => resposta({ vocabulario: V, conclusao: 'Eterno(deus)' }), { ...DEUS, conclusao: 'Deus é eterno.' }, null, EXEMPLOS)
    expect(t.reparo).toBeNull()
  })

  it('os exemplos do pedido vêm dos públicos, separados em premissas e conclusão', () => {
    const mp = mensagensDasPremissas(TEXTO.premissas, null, EXEMPLOS), mc = mensagensDaConclusao(TEXTO.conclusao, VOCAB, false, EXEMPLOS)
    expect(mp.map((m) => m.role)).toEqual(['system', 'user', 'assistant', 'user', 'assistant', 'user'])
    expect(JSON.parse(mp[2].content)).toEqual({ vocabulario: EXEMPLOS[0].vocabulario, premissas: EXEMPLOS[0].gabarito.premissas })
    expect(JSON.parse(mc[2].content)).toEqual({ vocabulario: EXEMPLOS[0].vocabulario, conclusao: EXEMPLOS[0].gabarito.conclusao })
    expect(mp[1].content).not.toContain(EXEMPLOS[0].texto.conclusao)
    expect(mc.at(-1)!.content).toContain('Vocabulário em uso')
    // cego-v2: na conclusão, os predicados antes das constantes (a ordem da lista decidia o sujeito: "o homem é eterno" virava Eterno(deus))
    const vocabEmUso = mensagensDaConclusao('O homem é eterno.', [VOCAB[2], VOCAB[0]], false, EXEMPLOS).at(-1)!.content
    expect(vocabEmUso.indexOf('"PodeVotar"')).toBeLessThan(vocabEmUso.indexOf('"rui"'))
    expect(mp[0].content).toContain('"O A é B" falando de A em geral')
  })
})
