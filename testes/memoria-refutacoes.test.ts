/**
 * A memória de refutações (src/motor/memoriaRefutacoes.ts): o par CP07/CP08 da resposta do GPT ao contraponto. O
 * caso original fica refutado com contramodelo exportável; a mesma conclusão com P(b) acrescentado é outra obrigação e
 * não é bloqueada; Q(a) também não. A memória só informa. O caminho com o cvc5 e o Carcara de verdade roda no
 * verificador público (cadeias/exemplo-contraponto).
 */
import { describe, it, expect } from 'vitest'
import { criarChave, montarRegistroFechado, type DadosRegistro } from '../src/interfaces/cadeiaLocal'
import { abrirRegistro } from '../src/motor/abrirRegistro'
import { consultar, memoriaVazia, obrigacaoDe, registrar } from '../src/motor/memoriaRefutacoes'

const base: Omit<DadosRegistro, 'formula' | 'premissas'> = { afirmacao: 'segue', teoriaNome: 'Contraponto', tipo: 'teorema', dominio: 'exemplo', estado: 'proposta' }

describe('Memória de refutações', () => {
  it('CP07 e CP08: a refutação fica com a obrigação exata, informa e não bloqueia', async () => {
    const { chave } = await criarChave('senha de teste longa', 100_000)
    const premissas = ['∀x (P(x) ⟹ Q(x))', 'P(a)']
    const falso = await montarRegistroFechado({ ...base, formula: 'Q(b)', premissas }, chave.publica)
    // CP07: o "segue" falso não se sustenta, com contramodelo exportável (o cvc5 simulado responde sat; o modelo é do motor)
    const aberto = await abrirRegistro(JSON.parse(falso.registroTexto), falso.revelacao, 'CP07', { traduzir: () => '', refutar: async () => ({ veredito: 'sat' }) })
    expect(aberto.estado).toBe('nao-se-sustenta')
    if (aberto.estado !== 'nao-se-sustenta') throw new Error('CP07')
    expect(aberto.contra.registro).toMatchObject({ afirmacao: 'nao-segue', certificado: { modelo: expect.anything() } })

    let memoria = memoriaVazia()
    const original = await obrigacaoDe('segue', falso.revelacao)
    memoria = await registrar(memoria, { obrigacao: original, resultado: 'contramodelo-conferido', evidencia: 'contra-registro CP07', origem: 'CP07', em: '2026-10-26' })
    const mesma = await consultar(memoria, original)
    expect(mesma).toMatchObject({ bloqueia: false, exatas: [expect.objectContaining({ resultado: 'contramodelo-conferido' })] })
    expect(mesma.aviso).toMatch(/Tentar de novo é permitido/)

    // CP08: com P(b) acrescentado, a teoria muda: outra obrigação, que a memória não toca (só sugere)
    const comPb = await montarRegistroFechado({ ...base, formula: 'Q(b)', premissas: [...premissas, 'P(b)'] }, chave.publica)
    const nova = await consultar(memoria, await obrigacaoDe('segue', comPb.revelacao))
    expect(nova).toMatchObject({ bloqueia: false, exatas: [], parecidas: [expect.objectContaining({ origem: 'CP07' })] })
    expect(nova.aviso).toMatch(/vale por si/)
    // e a busca de contramodelo do motor não acha nenhum: com P(b), Q(b) segue (a prova de verdade é a do cvc5 na CI)
    const semContra = await abrirRegistro(JSON.parse(comPb.registroTexto), comPb.revelacao, 'CP08', { traduzir: () => '', refutar: async () => ({ veredito: 'unknown' }) })
    expect(semContra.estado).toBe('pendente')

    // Q(a), na teoria original, é outra fórmula: nada registrado
    const qa = await montarRegistroFechado({ ...base, formula: 'Q(a)', premissas }, chave.publica)
    expect(await consultar(memoria, await obrigacaoDe('segue', qa.revelacao))).toMatchObject({ exatas: [], parecidas: [] })
  }, 60_000)

  it('tempo esgotado e prova inválida não estabelecem refutação; o histórico só cresce', async () => {
    const o = { semantica: 'm2/t1' as const, afirmacao: 'segue', teoria: 'a'.repeat(64), formula: 'b'.repeat(64) }
    let m = await registrar(memoriaVazia(), { obrigacao: o, resultado: 'tempo-esgotado', evidencia: null, origem: 'tentativa 1', em: '2026-10-26' })
    m = await registrar(m, { obrigacao: o, resultado: 'prova-invalida', evidencia: null, origem: 'tentativa 2', em: '2026-10-26' })
    const c = await consultar(m, o)
    expect(c.exatas).toHaveLength(2)
    expect(c.aviso).toMatch(/sem resultado conclusivo/)
    expect(m.tentativas.map((t) => t.origem)).toEqual(['tentativa 1', 'tentativa 2'])
  })
})
