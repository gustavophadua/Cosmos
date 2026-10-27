/**
 * A moeda de teste da rede cosmos-teste-1 (src/motor/moedaTeste.ts, especificacao/moeda-teste.md): cada regra decidida
 * num cenário com chaves geradas na hora (M01–M10), e a rede publicada em redes/cosmos-teste-1/ (gênese, recompensas e
 * livros), que tem de fechar a conta: emitido − queimado = soma dos saldos, sem livro nem recompensa recusados.
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { anexar, criarChave, receber, type ChaveLocal } from '../src/interfaces/cadeiaLocal'
import { conferirCadeia, FORMATO_CADEIA, type Cadeia } from '../src/motor/cadeiaPessoal'
import { dataDe, defeitoDaGenese, diaDe, emUnidades, estadoDaRede, FORMATO_LIVRO, hojeLocal, idDaRede, montarOperacao, type Genese, type Motivo } from '../src/motor/moedaTeste'
import genesePublicada from '../redes/cosmos-teste-1/genese.json'
import recompensasPublicadas from '../redes/cosmos-teste-1/recompensas.json'

const RAPIDO = 100_000
const G0 = genesePublicada as Genese
const dia = (n: number) => dataDe(diaDe(G0.inicio)! + n)

async function rede() {
  const chaves: ChaveLocal[] = []
  for (let i = 0; i < 3; i++) chaves.push((await criarChave('senha de teste longa', RAPIDO)).chave)
  const g: Genese = { ...G0, participantes: chaves.map((c, i) => ({ nome: 'ABC'[i], chave: c.publica })) }
  const [A, B, C] = chaves
  const transferir = async (livro: Cadeia | null, de: ChaveLocal, para: ChaveLocal, quantia: number, data: string, motivo: Motivo = 'pagamento', referencia: string | null = null) =>
    (await anexar(livro, de, await montarOperacao(g, de.publica, { para: para.publica, quantia, data, motivo, referencia }), FORMATO_LIVRO)).cadeia
  return { g, A, B, C, transferir }
}
const conta = (e: Awaited<ReturnType<typeof estadoDaRede>>, chave: ChaveLocal) => e.contas.find(c => c.chave === chave.publica)!

describe('Moeda de teste · cosmos-teste-1', () => {
  it('M01 · gênese: 100 unidades livres por participante, a conta fecha, e a gênese tem a forma decidida', async () => {
    expect(defeitoDaGenese(G0)).toBeNull()
    expect([G0.porParticipante, G0.recompensaPorRegistro, G0.tetoSemanal, G0.queimaBps, G0.travaDias, G0.prazoDias]).toEqual([10_000, 1_000, 10_000, 500, 30, 90])
    expect(defeitoDaGenese({ ...G0, unidade: 'COSM' })).toMatch(/UNIDADE-TESTE-SEM-VALOR/)
    const { g, A } = await rede()
    const e = await estadoDaRede(g, [], [], g.inicio)
    expect(conta(e, A)).toMatchObject({ livre: 10_000, travado: 0 })
    expect([e.emitido, e.queimado, e.emCirculacao, e.conserva]).toEqual([30_000, 0, 30_000, true])
    expect(emUnidades(10_000)).toBe('100,00')
  })

  it('M02 · transferência: queima 5%, e o que chega fica preso 30 dias', async () => {
    const { g, A, B, transferir } = await rede()
    const livroA = await transferir(null, A, B, 2_000, g.inicio)
    const e = await estadoDaRede(g, [livroA], [], g.inicio)
    expect(conta(e, A)).toMatchObject({ livre: 8_000, enviado: 2_000, queimadoNosEnvios: 100 })
    expect(conta(e, B)).toMatchObject({ livre: 10_000, travado: 1_900, liberacoes: [{ quantia: 1_900, em: dia(30) }] })
    expect([e.queimado, e.conserva]).toEqual([100, true])
    expect(conta(await estadoDaRede(g, [livroA], [], dia(30)), B)).toMatchObject({ livre: 11_900, travado: 0 })
  })

  it('M03 · trava: gastar o que ainda está preso é recusado; depois de 30 dias, vale', async () => {
    const { g, A, B, C, transferir } = await rede()
    const livroA = await transferir(null, A, B, 2_000, g.inicio)
    const cedo = await transferir(null, B, C, 11_000, dia(10))
    const e = await estadoDaRede(g, [livroA, cedo], [], dia(10))
    expect(e.livros[1].recusa?.motivo).toMatch(/saldo livre insuficiente/)
    expect(conta(e, B).enviado).toBe(0)
    const depois = await transferir(null, B, C, 11_900, dia(30))
    const e2 = await estadoDaRede(g, [livroA, depois], [], dia(30))
    expect(e2.livros[1].recusa).toBeNull()
    expect(conta(e2, B).livre).toBe(0)
    expect(e2.conserva).toBe(true)
  })

  it('M04 · gasto duplo: duas histórias da mesma chave são uma bifurcação, e a rede só lê um livro por chave', async () => {
    const { g, A, B, C, transferir } = await rede()
    const paraB = await transferir(null, A, B, 9_000, g.inicio)
    const paraC = await transferir(null, A, C, 9_000, g.inicio)
    const conhecida = await receber(JSON.stringify(paraB), [], FORMATO_LIVRO)
    expect(conhecida.relacao).toBe('nova')
    const segunda = await receber(JSON.stringify(paraC), [{ chave: A.publica, resumos: conhecida.conferencia.resumos, recebidaEm: 'teste', texto: JSON.stringify(paraB) }], FORMATO_LIVRO)
    expect(segunda).toMatchObject({ relacao: 'bifurcada', elo: 0 })
    const e = await estadoDaRede(g, [paraB, paraC], [], g.inicio)
    expect(e.livros[1].recusa?.motivo).toMatch(/outro livro da mesma chave/)
    expect(e.conserva).toBe(true)
  })

  it('M05 · alteração: mudar a quantia no arquivo derruba a assinatura (C8)', async () => {
    const { g, A, B, transferir } = await rede()
    const livro = await transferir(null, A, B, 2_000, g.inicio)
    const alterado = JSON.parse(JSON.stringify(livro).replace('\\"quantia\\":2000', '\\"quantia\\":20000')) as Cadeia
    expect(alterado.elos[0].registroTexto).toContain('"quantia":20000')
    const e = await estadoDaRede(g, [alterado], [], g.inicio)
    expect(e.livros[0].conferencia.motivo).toBe('C8')
    expect(conta(e, A).enviado).toBe(0)
  })

  it('M06 · domínios separados: o livro não passa por cadeia-v1, nem a cadeia-v1 por livro', async () => {
    const { g, A, B, transferir } = await rede()
    const livro = await transferir(null, A, B, 2_000, g.inicio)
    expect((await conferirCadeia(livro)).motivo).toBe('C2')
    expect((await conferirCadeia({ ...livro, formato: FORMATO_CADEIA })).motivo).toBe('C8')
    expect((await estadoDaRede(g, [{ ...livro, formato: FORMATO_CADEIA }], [], g.inicio)).livros[0].conferencia.motivo).toBe('C2')
  })

  it('M07 · outra rede, prazo e futuro: operação de outra gênese, fora dos 90 dias ou com data no futuro não vale', async () => {
    const { g, A, B, transferir } = await rede()
    const outra: Genese = { ...g, rede: 'cosmos-teste-2' }
    expect(await idDaRede(outra)).not.toBe(await idDaRede(g))
    const deOutra = (await anexar(null, A, await montarOperacao(outra, A.publica, { para: B.publica, quantia: 100, data: g.inicio, motivo: 'pagamento' }), FORMATO_LIVRO)).cadeia
    expect((await estadoDaRede(g, [deOutra], [], g.inicio)).livros[0].recusa?.motivo).toMatch(/outra rede/)
    await expect(montarOperacao(g, A.publica, { para: B.publica, quantia: 100, data: dia(90), motivo: 'pagamento' })).rejects.toThrow(/fora do prazo/)
    await expect(montarOperacao(g, A.publica, { para: A.publica, quantia: 100, data: g.inicio, motivo: 'pagamento' })).rejects.toThrow(/própria chave/)
    const futuro = await transferir(null, A, B, 100, dia(5))
    expect((await estadoDaRede(g, [futuro], [], dia(4))).livros[0].recusa?.motivo).toMatch(/no futuro/)
  })

  it('M08 · recompensas: 10 por registro, presas 30 dias, até 100 por semana, sem repetir o registro', async () => {
    const { g, A, B } = await rede()
    const onze = Array.from({ length: 11 }, (_, i) => ({ chave: A.publica, pasta: 'uma-cadeia', indice: i, data: g.inicio }))
    const e = await estadoDaRede(g, [], [...onze, { chave: A.publica, pasta: 'uma-cadeia', indice: 0, data: dia(7) }, { chave: B.publica, pasta: 'uma-cadeia', indice: 20, data: dia(7) }], g.inicio)
    expect(e.recompensas.filter(r => r.valida)).toHaveLength(10)
    expect(e.recompensas.find(r => !r.valida && r.recompensa.indice === 10)?.motivo).toMatch(/teto semanal/)
    expect(conta(e, A)).toMatchObject({ recompensas: 10_000, livre: 10_000, travado: 10_000 })
    const semana2 = await estadoDaRede(g, [], [...onze, { chave: A.publica, pasta: 'uma-cadeia', indice: 0, data: dia(7) }], dia(7))
    expect(semana2.recompensas.find(r => r.recompensa.data === dia(7))?.motivo).toMatch(/já foi recompensado/)
    expect(e.recompensas.find(r => r.recompensa.chave === B.publica)?.motivo).toMatch(/futuro/)
    expect(e.conserva).toBe(true)
  })

  it('M09 · pagamento por certificado leva a referência do registro; queima igual', async () => {
    const { g, A, B, transferir } = await rede()
    await expect(montarOperacao(g, A.publica, { para: B.publica, quantia: 1_000, data: g.inicio, motivo: 'certificado' })).rejects.toThrow(/SHA-256 do registro/)
    const livro = await transferir(null, A, B, 1_000, g.inicio, 'certificado', 'ab'.repeat(32))
    const e = await estadoDaRede(g, [livro], [], g.inicio)
    expect(e.operacoes[0]).toMatchObject({ queima: 50, op: { motivo: 'certificado', referencia: 'ab'.repeat(32) } })
  })

  it('M10 · uma recusa no meio do livro corta o resto, e quem recebeu dela não ganha nada', async () => {
    const { g, A, B, C, transferir } = await rede()
    let livroA = await transferir(null, A, B, 9_000, g.inicio)
    livroA = await transferir(livroA, A, C, 5_000, dia(1))
    livroA = await transferir(livroA, A, C, 500, dia(2))
    const e = await estadoDaRede(g, [livroA], [], dia(40))
    expect(e.livros[0]).toMatchObject({ validas: 1, recusa: { indice: 1 } })
    expect(conta(e, C).recebido).toBe(0)
    expect(e.conserva).toBe(true)
  })
})

describe('A rede publicada em redes/cosmos-teste-1/', () => {
  it('a gênese tem os três notebooks do teste da Fase 3, e a conta da rede fecha sem recusas', async () => {
    expect(G0.participantes.map(p => p.chave.slice(0, 8))).toEqual(['c39ce485', 'd84233c1', '36fe5abf'])
    const pasta = 'redes/cosmos-teste-1/livros'
    const livros = existsSync(pasta) ? readdirSync(pasta).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(readFileSync(join(pasta, f), 'utf8'))) : []
    const hoje = hojeLocal(new Date(Date.now() + 14 * 3_600_000)) // folga de fuso: o dia de quem assinou pode estar à frente do UTC da CI
    const e = await estadoDaRede(G0, livros, recompensasPublicadas, diaDe(hoje)! > diaDe(G0.inicio)! + G0.prazoDias - 1 ? dataDe(diaDe(G0.inicio)! + G0.prazoDias - 1) : hoje)
    expect(e.livros.filter(l => l.recusa).map(l => `${l.chave.slice(0, 8)}: ${l.recusa!.motivo}`)).toEqual([])
    expect(e.recompensas.filter(r => !r.valida).map(r => r.motivo)).toEqual([])
    expect(e.conserva).toBe(true)
  })

  it('o teste de 27/10 com os notebooks A e C: a conta do dia, o gasto duplo e a alteração guardados como evidência', async () => {
    const ler = (p: string) => readFileSync(join('redes/cosmos-teste-1', p), 'utf8')
    const a = ler('livros/cosmos-livro-c39ce485-1.json'), c = ler('livros/cosmos-livro-36fe5abf-1.json')
    const e = await estadoDaRede(G0, [JSON.parse(a), JSON.parse(c)], recompensasPublicadas, '2026-10-27')
    expect(e.contas.map(k => `${k.nome} ${emUnidades(k.livre)} ${emUnidades(k.travado)}`)).toEqual(['A 80,00 38,50', 'B 100,00 0,00', 'C 70,00 19,00'])
    expect([e.emitido, e.queimado, e.emCirculacao, e.conserva]).toEqual([31_000, 250, 30_750, true])
    const ra = await receber(a, [], FORMATO_LIVRO)
    const conhecidas = [{ chave: ra.chave!, resumos: ra.conferencia.resumos, recebidaEm: '', texto: a }]
    expect((await receber(a, conhecidas, FORMATO_LIVRO)).relacao).toBe('igual')
    // M04: a mesma chave de A, restaurada no Edge, assinou outra operação 0 (90 para C)
    expect(await receber(ler('acusacoes/A-livro-edge.json'), conhecidas, FORMATO_LIVRO)).toMatchObject({ relacao: 'bifurcada', elo: 0 })
    // M05: a quantia trocada no Bloco de Notas (2000 → 9000) derruba a assinatura
    expect((await receber(ler('acusacoes/A-alterado.json'), [], FORMATO_LIVRO)).conferencia).toMatchObject({ veredito: 'recusada', motivo: 'C8', elo: 0 })
  })
})
