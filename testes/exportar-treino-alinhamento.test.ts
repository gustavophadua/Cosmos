import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import type { Item } from '../src/motor/avaliacao'
import { formalizarCego, lerProposta, type Mensagem } from '../src/motor/formalizacao'
import { conversasCegas } from './exportar-treino.test'

const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
const EXEMPLOS = lerJsonl<Item>('avaliacao/exemplos-publicos-v1.jsonl')

it('o treino vê o que o serviço manda: as duas conversas exportadas são as do formalizarCego, e as respostas certas fecham', async () => {
  const itens = lerJsonl<{ item: Item }>('avaliacao/validacao-v1.jsonl').map((l) => l.item).slice(0, 40)
  let comDado = 0
  for (const item of itens) {
    const [p, c] = conversasCegas(item, EXEMPLOS)
    const dado = p.messages.at(-2)!.content.includes('Use exatamente este vocabulário')
    if (dado) comDado++
    // o serviço, com o modelo de mentira respondendo o que o treino ensina
    const vistas: Mensagem[][] = []
    const responder = (resposta: string) => async (m: Mensagem[]) => { vistas.push(m); return { conteudo: resposta, prompt: 0, completion: 0 } }
    const r = await formalizarCego(responder(p.messages.at(-1)!.content), responder(c.messages.at(-1)!.content), item.texto, dado ? item.vocabulario : null, EXEMPLOS)
    expect(vistas).toEqual([p.messages.slice(0, -1), c.messages.slice(0, -1)])
    expect(r.reparo).toBeNull()
    const lido = lerProposta(r.conteudo, null)
    expect([lido.premissas, lido.conclusao]).toEqual([item.gabarito.premissas, item.gabarito.conclusao])
  }
  expect(comDado).toBeGreaterThan(0)
  expect(comDado).toBeLessThan(itens.length / 2)
})
