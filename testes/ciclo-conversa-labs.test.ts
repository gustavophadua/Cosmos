import { describe, it, expect, beforeEach } from 'vitest'
import { DESCRICAO_PADRAO, LIMITE_DESCRICAO, descricaoComFonte, fonteDaRota, fonteDoRascunho, montarRascunho, proximoIdRascunho, rascunhosSessao, verificarFonte } from '../src/interfaces/ciclo'
import { dadosVazios, validarDadosConta } from '../src/local/dados'
import { REGISTROS_PUBLICOS, pesquisarPublicos } from '../src/v3/catalogo'
import { consultarCatalogoLocal } from '../src/interfaces/dados'

const F2 = REGISTROS_PUBLICOS.find(r => r.id === 'F2')!

describe('Ciclo Conversa → fonte → rascunho → evidência → verificação', () => {
  beforeEach(() => rascunhosSessao.limpar())

  it('a Conversa e os cartões de fonte usam a mesma busca: cada registro citado na resposta vira uma fonte', () => {
    for (const pergunta of ['F2', 'campo', 'pessoa', 'cosmos']) {
      const fontes = pesquisarPublicos(pergunta)
      const resposta = consultarCatalogoLocal(pergunta)
      for (const f of fontes.slice(0, 9)) expect(resposta).toContain(f.hash)
    }
  })

  it('a rota do Labs só aceita fonte que é registro público', () => {
    expect(fonteDaRota('#/lab?secao=rascunhos&fonte=F2')?.hash).toBe(F2.hash)
    expect(fonteDaRota('#/lab?fonte=F99')).toBeNull()
    expect(fonteDaRota('#/lab?secao=rascunhos')).toBeNull()
    expect(fonteDaRota('#/lab')).toBeNull()
  })

  it('a fonte cabe na descrição e volta igual, sem mudar o formato cifrado da conta', () => {
    for (const r of REGISTROS_PUBLICOS) {
      const descricao = descricaoComFonte({ id: r.id, hash: r.hash })
      expect(descricao.length).toBeLessThanOrEqual(LIMITE_DESCRICAO)
      expect(fonteDoRascunho(descricao)).toEqual({ id: r.id, hash: r.hash })
    }
    const rascunho = montarRascunho({ id: 'D01', nome: 'F2 · teorema', formula: 'F2: teorema', dominio: 'campo' }, null, { id: F2.id, hash: F2.hash })
    const dados = { ...dadosVazios(), rascunhos: [rascunho] }
    expect(() => validarDadosConta(dados)).not.toThrow()
    expect(fonteDoRascunho(DESCRICAO_PADRAO)).toBeNull()
  })

  it('editar um rascunho mantém a descrição e a fonte (antes a edição trocava pelo texto padrão)', () => {
    const original = montarRascunho({ id: 'D01', nome: 'a', formula: 'A', dominio: '' }, null, { id: F2.id, hash: F2.hash })
    const editado = montarRascunho({ id: 'D01', nome: 'b', formula: '¬A', dominio: 'Lógica' }, original, null)
    expect(editado.descricao).toBe(original.descricao)
    expect(fonteDoRascunho(editado.descricao)).toEqual({ id: 'F2', hash: F2.hash })
    expect(montarRascunho({ id: 'D02', nome: 'c', formula: 'B', dominio: '' }, null, null).descricao).toBe(DESCRICAO_PADRAO)
  })

  it('ids de rascunho seguem o formato validado e não repetem', () => {
    expect(proximoIdRascunho([])).toBe('D01')
    expect(proximoIdRascunho([{ id: 'D01' }, { id: 'D07' }])).toBe('D08')
  })

  it('sem conta, o rascunho fica só na memória da sessão', () => {
    const r = montarRascunho({ id: 'D01', nome: 'x', formula: 'A', dominio: '' }, null, { id: F2.id, hash: F2.hash })
    let avisos = 0
    const parar = rascunhosSessao.observar(() => { avisos++ })
    rascunhosSessao.salvar(r); rascunhosSessao.salvar({ ...r, nome: 'y' })
    expect(rascunhosSessao.ler()).toEqual([{ ...r, nome: 'y' }])
    expect(avisos).toBe(2)
    parar()
  })

  it('a verificação aceita as nove fontes públicas por integridade e autoria, e nunca afirma a verdade nem o Bitcoin', async () => {
    for (const r of REGISTROS_PUBLICOS) {
      const v = await verificarFonte({ id: r.id, hash: r.hash })
      expect(v.aceita, r.id).toBe(true)
      const por = Object.fromEntries(v.conferencias.map(c => [c.etapa, c.estado]))
      expect(por['Hash anotado']).toBe('confere')
      expect(por['Integridade · SHA-256']).toBe('confere')
      expect(por['Autoria · Ed25519']).toBe('confere')
      expect(por['Timestamp · Bitcoin']).toBe('pendente')
      expect(por['Conteúdo']).toBe('nao_provado')
      for (const c of v.conferencias) { expect(c.fonte.length).toBeGreaterThan(0); expect(c.limite.length).toBeGreaterThan(0) }
    }
  })

  it('a verificação recusa hash alterado e registro inexistente', async () => {
    const alterado = await verificarFonte({ id: 'F2', hash: F2.hash.replace(/^./, c => c === '0' ? '1' : '0') })
    expect(alterado.aceita).toBe(false)
    expect(alterado.conferencias.find(c => c.etapa === 'Hash anotado')?.estado).toBe('diverge')
    const inexistente = await verificarFonte({ id: 'F42', hash: F2.hash })
    expect(inexistente.aceita).toBe(false)
    expect(inexistente.conferencias).toHaveLength(1)
    expect(inexistente.conferencias[0].estado).toBe('ausente')
  })
})
