import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { IncomingMessage } from 'node:http'
import { criarCofreTeste, assinarMensagemLocalTeste, verificarMensagemLocalTeste, type CofreTeste } from '../src/v4/carteira'
import { assinarComSenha, bloquearContaLocal, entrarContaLocal, gravarSelado, lerSelado, obterContaLocal, registrarAoEntrar, STORAGE_COFRE_LOCAL } from '../src/local/conta'
import { lerLinhaLocal } from '../src/local/banco'
import { criarPorteiroIA } from '../src/integracoes/ollama-node'
import { abrirHistoricoIA, arquivoDeRelatos, conversasDoIndice, gravarMensagemIA, gravarRelatoErro, lerMensagemIA, lerRelatosErro } from '../src/interfaces/historico-ia'

// Credenciais públicas exclusivamente de fixture; nunca são credenciais pessoais do aparelho.
const SENHA = 'fixture-publica-sessao-ia-2026', OUTRA = 'fixture-publica-outra-conta-2026'
let cofre: CofreTeste, outro: CofreTeste
beforeAll(async () => { cofre = await criarCofreTeste(SENHA); outro = await criarCofreTeste(OUTRA) })
beforeEach(() => {
  bloquearContaLocal()
  vi.stubGlobal('indexedDB', new IDBFactory())
  const dados = new Map<string, string>()
  vi.stubGlobal('localStorage', { getItem: (k: string) => dados.get(k) ?? null, setItem: (k: string, v: string) => dados.set(k, v), removeItem: (k: string) => dados.delete(k), clear: () => dados.clear() })
  vi.stubGlobal('location', { hostname: '127.0.0.1' })
  let lock: Promise<unknown> = Promise.resolve()
  vi.stubGlobal('navigator', { locks: { request: (_nome: string, f: () => unknown) => { const atual = lock.then(f); lock = atual.catch(() => {}); return atual } } })
})
afterEach(() => { bloquearContaLocal(); vi.unstubAllGlobals() })
const entrar = async (c = cofre, senha = SENHA) => { localStorage.setItem(STORAGE_COFRE_LOCAL, JSON.stringify(c)); await entrarContaLocal(senha, 'pessoa-teste') }
const pedido = (token?: string) => ({ headers: token === undefined ? {} : { 'x-cosmos-sessao': token } }) as unknown as IncomingMessage

describe('a IA presa à conta', () => {
  it('a assinatura de mensagem tem domínio próprio e confere pela chave da conta', async () => {
    const s = await assinarMensagemLocalTeste(cofre, SENHA, 'COSMOS/IA/SESSAO/V1', 'a'.repeat(64))
    expect(verificarMensagemLocalTeste(s.pubkey, 'COSMOS/IA/SESSAO/V1', 'a'.repeat(64), s.assinatura)).toBe(true)
    expect(verificarMensagemLocalTeste(s.pubkey, 'COSMOS/IA/SESSAO/V1', 'b'.repeat(64), s.assinatura)).toBe(false)
    expect(verificarMensagemLocalTeste(s.pubkey, 'OUTRO' as 'COSMOS/IA/SESSAO/V1', 'a'.repeat(64), s.assinatura)).toBe(false)
    await expect(assinarMensagemLocalTeste(cofre, 'senha-errada-com-tamanho', 'COSMOS/IA/SESSAO/V1', 'x')).rejects.toThrow()
  })

  it('ao entrar, o gancho recebe uma assinatura da conta (sem a senha); depois, só com a senha certa', async () => {
    const vistos: string[] = []
    const cancelar = registrarAoEntrar(async (assinar, titular) => { const s = await assinar('COSMOS/IA/SESSAO/V1', 'c'.repeat(64)); vistos.push(s.pubkey === titular ? 'mesma-chave' : 'outra') })
    await entrar()
    await vi.waitFor(() => expect(vistos).toEqual(['mesma-chave']))
    cancelar()
    const titular = obterContaLocal().perfil!.perfil.pubkey
    expect((await assinarComSenha(SENHA, 'COSMOS/IA/SESSAO/V1', 'd'.repeat(64))).pubkey).toBe(titular)
    await expect(assinarComSenha('senha-errada-com-tamanho', 'COSMOS/IA/SESSAO/V1', 'd'.repeat(64))).rejects.toThrow()
  })

  it('a linha selada volta igual, fica cifrada no banco e não se lê se for mexida', async () => {
    await entrar()
    await gravarSelado('ia-teste', { segredo: 'nenhuma pessoa invalida a existência de outra' })
    expect(await lerSelado('ia-teste')).toEqual({ segredo: 'nenhuma pessoa invalida a existência de outra' })
    const titular = obterContaLocal().perfil!.perfil.pubkey, linha = (await lerLinhaLocal(`selado:${titular}:ia-teste`))!
    expect(linha.valor).not.toContain('invalida')
    const env = JSON.parse(linha.valor)
    const { gravarLinhaLocal } = await import('../src/local/banco')
    await gravarLinhaLocal(`selado:${titular}:ia-teste`, linha.revisao, JSON.stringify({ ...env, cifrado: env.cifrado.replace(/^../, (h: string) => (h === '00' ? '01' : '00')) }))
    await expect(lerSelado('ia-teste')).rejects.toThrow()
    bloquearContaLocal()
    await expect(lerSelado('ia-teste')).rejects.toThrow('Entre na conta')
  })

  it('o histórico guarda o cartão inteiro, agrupa por conversa e importa o cofre antigo uma vez', async () => {
    await entrar()
    const antigas = [{ id: 1, pergunta: 'Primeira pergunta antiga', resposta: 'Resposta antiga' }, { id: 2, pergunta: 'Segunda', resposta: 'Outra' }, { id: 3, pergunta: 'Solta', resposta: 'Sozinha' }]
    let indice = await abrirHistoricoIA(antigas, [[1, 2]])
    expect(conversasDoIndice(indice).map((c) => [c.fio, c.titulo])).toEqual([[3, 'Solta'], [1, 'Primeira pergunta antiga']])
    // a segunda vez não importa de novo
    expect(await abrirHistoricoIA([...antigas, { id: 9, pergunta: 'nova no cofre', resposta: 'x' }], [])).toHaveLength(3)
    const resultado = { tipo: 'relatorio' as const, comando: 'revisar' as const, relatorio: { formato: 'cosmos-revisor-v1' as const, extrator: 'e', prompt: 'p', blocos: 1, afirmacoes: [], argumentos: [], avisos: [] } }
    indice = await gravarMensagemIA({ id: 4, fio: 1, pergunta: 'Com cartão', resposta: 'resumo', resultado, em: '2026-10-30T10:00:00.000Z' }, indice)
    expect(await lerMensagemIA(4)).toMatchObject({ id: 4, fio: 1, resultado })
    expect(conversasDoIndice(indice)[0]).toMatchObject({ fio: 1 })
    // o cartão grande demais vai só como texto
    const enorme = { ...resultado, relatorio: { ...resultado.relatorio, avisos: ['x'.repeat(120_000)] } }
    await gravarMensagemIA({ id: 5, fio: 5, pergunta: 'Enorme', resposta: 'resumo', resultado: enorme, em: '2026-10-30T11:00:00.000Z' }, indice)
    expect((await lerMensagemIA(5))?.resultado).toBeUndefined()
  })
})

describe('os relatos de "isso está errado"', () => {
  it('ficam cifrados na conta com a tradução, e o arquivo exportado leva só os relatos', async () => {
    await entrar()
    const proposta = { vocabulario: [{ simbolo: 'Propria', tipo: 'predicado' as const, aridade: 1, leitura: 'x é própria' }], premissas: ['∀x (Propria(x) ⟹ ¬Senso(x))'], conclusao: '∀x (Propria(x))', classe: null }
    const resultado = { tipo: 'argumento' as const, comando: 'verificar' as const, texto: { premissas: ['As próprias não têm senso.'], conclusao: 'Logo…' }, proposta, classe: 'independente' as const }
    const relatos = await gravarRelatoErro({ id: 7, fio: 7, pergunta: 'as pessoas veem as outras como deuses…', resposta: 'Salto', resultado, em: '2026-10-30T12:00:00.000Z' }, '"as próprias" não é uma categoria')
    expect(relatos).toHaveLength(1)
    expect(await lerRelatosErro()).toMatchObject([{ mensagem: 7, classe: 'independente', comentario: '"as próprias" não é uma categoria', traducao: { premissas: proposta.premissas } }])
    const arquivo = JSON.parse(arquivoDeRelatos(relatos))
    expect(Object.keys(arquivo).sort()).toEqual(['exportadoEm', 'formato', 'relatos'])
    const titular = obterContaLocal().perfil!.perfil.pubkey
    expect((await lerLinhaLocal(`selado:${titular}:ia-relatos`))!.valor).not.toContain('categoria')
  })
})

describe('o porteiro do serviço da IA', () => {
  it('só a conta dona abre sessão, com um desafio usado uma vez; a sessão vence parada; a dona fica gravada', async () => {
    const pasta = mkdtempSync(join(tmpdir(), 'cosmos-ia-')), arquivo = join(pasta, 'privado', 'ia-dono.json')
    const p = criarPorteiroIA({ arquivoDono: arquivo, ociosoMs: 200 })
    expect(() => p.conferir(pedido())).toThrow()
    const d = p.desafio()
    expect(d.ligada).toBe(false)
    const s = await assinarMensagemLocalTeste(cofre, SENHA, 'COSMOS/IA/SESSAO/V1', d.desafio)
    // assinatura de outro desafio não serve
    expect(() => p.abrir({ desafio: p.desafio().desafio, ...s })).toThrow()
    const d2 = p.desafio(), s2 = await assinarMensagemLocalTeste(cofre, SENHA, 'COSMOS/IA/SESSAO/V1', d2.desafio)
    const { token } = p.abrir({ desafio: d2.desafio, ...s2 })
    expect(JSON.parse(readFileSync(arquivo, 'utf8'))).toMatchObject({ formato: 'cosmos-ia-dono-v1', pubkey: s2.pubkey })
    expect(() => p.conferir(pedido(token))).not.toThrow()
    // o mesmo desafio não abre outra sessão
    expect(() => p.abrir({ desafio: d2.desafio, ...s2 })).toThrow()
    // outra conta, mesmo com assinatura válida, é recusada
    const d3 = p.desafio(), s3 = await assinarMensagemLocalTeste(outro, OUTRA, 'COSMOS/IA/SESSAO/V1', d3.desafio)
    expect(() => p.abrir({ desafio: d3.desafio, ...s3 })).toThrow('outra-conta')
    expect(() => p.conferir(pedido('f'.repeat(64)))).toThrow()
    await new Promise((r) => setTimeout(r, 260))
    expect(() => p.conferir(pedido(token))).toThrow()
    // o serviço reaberto lembra a dona; com --novo-dono, a próxima conta vira dona
    expect(criarPorteiroIA({ arquivoDono: arquivo }).desafio().ligada).toBe(true)
    const novo = criarPorteiroIA({ arquivoDono: arquivo, novoDono: true }), d4 = novo.desafio()
    expect(d4.ligada).toBe(false)
    novo.abrir({ desafio: d4.desafio, ...(await assinarMensagemLocalTeste(outro, OUTRA, 'COSMOS/IA/SESSAO/V1', d4.desafio)) })
    expect(JSON.parse(readFileSync(arquivo, 'utf8')).pubkey).toBe(s3.pubkey)
    expect(existsSync(arquivo)).toBe(true)
  })
})
