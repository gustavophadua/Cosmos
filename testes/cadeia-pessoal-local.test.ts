import { describe, it, expect } from 'vitest'
import { anexar, conferirRevelacao, criarChave, deduzirFichas, montarRegistroFechado, receber, restaurarChave, type DadosRegistro, type VersaoConhecida } from '../src/interfaces/cadeiaLocal'
import { conferirCadeia, conferirCadeiaTexto } from '../src/motor/cadeiaPessoal'
import { conferirRegistro, sha256 } from '../src/motor/registro'
import { deHex } from '../src/motor/cadeiaPessoal'

// poucas iterações só no teste; o app usa 600 mil
const RAPIDO = 100_000
const SENHA = 'senha de teste longa'
const DADOS: DadosRegistro = { afirmacao: 'segue', formula: 'Voa(piu)', premissas: ['∀x (Ave(x) ⟹ Voa(x))', 'Ave(piu)'], teoriaNome: 'Aves v1', tipo: 'teorema', dominio: 'exemplo', estado: 'proposta' }

describe('Fase 3 · cadeia pessoal no app (1 aparelho)', () => {
  it('deduz as fichas pelo uso, com proposições e números', () => {
    expect(deduzirFichas(['∀x (Ave(x) ⟹ Voa(x))', 'Ave(piu)']).fichas).toEqual([
      { simbolo: 'Ave', tipo: 'predicado', aridade: 1 }, { simbolo: 'Voa', tipo: 'predicado', aridade: 1 }, { simbolo: 'piu', tipo: 'constante', aridade: 0 }])
    const p = deduzirFichas(['P ∧ ¬Q', 'P'])
    expect(p.erro).toBeNull()
    expect(p.fichas.map(f => `${f.simbolo}/${f.tipo}/${f.aridade}`).sort()).toEqual(['P/predicado/0', 'Q/predicado/0'])
    expect(deduzirFichas(['n > 2 ∧ m = n + 1']).fichas.every(f => f.numerico)).toBe(true)
    expect(deduzirFichas(['Ave(piu) ∧ Ave(piu, tom)']).erro).toMatch(/aridade/)
    expect(deduzirFichas(['∀x (']).erro).not.toBeNull()
  })

  it('a chave: a cópia cifrada restaura a mesma chave; senha errada e cópia alterada são recusadas', async () => {
    const { chave, copia } = await criarChave(SENHA, RAPIDO)
    expect(chave.privada.extractable).toBe(false)
    expect(copia.chave).toBe(chave.publica)
    const texto = JSON.stringify(copia)
    const de_volta = await restaurarChave(texto, SENHA)
    expect(de_volta.publica).toBe(chave.publica)
    expect(de_volta.privada.extractable).toBe(false)
    await expect(restaurarChave(texto, 'outra senha qualquer')).rejects.toThrow(/senha errada/)
    const alterada = { ...copia, cifrado: copia.cifrado.replace(/^./, c => c === '0' ? '1' : '0') }
    await expect(restaurarChave(JSON.stringify(alterada), SENHA)).rejects.toThrow(/senha errada ou cópia alterada/)
    const outraChave = { ...copia, chave: (await criarChave(SENHA, RAPIDO)).chave.publica }
    await expect(restaurarChave(JSON.stringify(outraChave), SENHA)).rejects.toThrow()
    await expect(criarChave('curta', RAPIDO)).rejects.toThrow(/12/)
  })

  it('o registro fechado é registro-v1 aceito, do autor da chave, e a revelação abre o compromisso', async () => {
    const { chave } = await criarChave(SENHA, RAPIDO)
    const { registroTexto, revelacao } = await montarRegistroFechado(DADOS, chave.publica)
    const reg = JSON.parse(registroTexto)
    expect(reg).toMatchObject({ formato: 'registro-v1', situacao: 'fechado', afirmacao: 'segue', tipo: 'teorema', autor: await sha256(deHex(chave.publica)) })
    expect(reg).not.toHaveProperty('formula')
    expect((await conferirRegistro(reg, { ler: () => null, arquivo: () => null, traduzir: () => '' })).motivo).toBeNull()
    expect(await conferirRevelacao(revelacao, registroTexto)).toBe(true)
    expect(await conferirRevelacao({ ...revelacao, formula: 'Ave(piu)', formaCanonica: '(Ave piu)' }, registroTexto)).toBe(false)
    expect(await conferirRevelacao({ ...revelacao, sal: '0'.repeat(64) }, registroTexto)).toBe(false)
    // o mesmo registro duas vezes dá compromissos diferentes: o sal esconde a fórmula
    expect((await montarRegistroFechado(DADOS, chave.publica)).revelacao.compromisso).not.toBe(revelacao.compromisso)
    await expect(montarRegistroFechado({ ...DADOS, tipo: 'hipótese' }, chave.publica)).rejects.toThrow(/teorema/)
  })

  it('anexa registros assinados; a cadeia é aceita pela conferência C1–C8 e qualquer alteração é acusada', async () => {
    const { chave } = await criarChave(SENHA, RAPIDO)
    let cadeia = null
    for (const formula of ['Voa(piu)', 'Ave(piu)']) {
      const { registroTexto } = await montarRegistroFechado({ ...DADOS, formula, afirmacao: formula === 'Voa(piu)' ? 'segue' : 'consistente', tipo: formula === 'Voa(piu)' ? 'teorema' : 'hipótese' }, chave.publica)
      cadeia = (await anexar(cadeia, chave, registroTexto)).cadeia
    }
    const texto = JSON.stringify(cadeia)
    const ok = await conferirCadeiaTexto(texto)
    expect(ok.veredito).toBe('aceita')
    expect(ok.resumos).toHaveLength(2)
    // um registro trocado (C8), um elo tirado (C4/C5), outro autor (C7)
    const c = JSON.parse(texto)
    const trocado = structuredClone(c); trocado.elos[1].registroTexto = trocado.elos[1].registroTexto.replace('"proposta"', '"corroborada"')
    expect((await conferirCadeia(trocado)).motivo).toBe('C8')
    const tirado = structuredClone(c); tirado.elos.splice(0, 1)
    expect(['C4', 'C5']).toContain((await conferirCadeia(tirado)).motivo)
    const outro = (await criarChave(SENHA, RAPIDO)).chave
    await expect(anexar(c, outro, c.elos[0].registroTexto)).rejects.toThrow(/outra chave/)
  })

  it('o teste dos três notebooks, num aparelho: B e C recebem a cadeia de A por arquivo e acusam corte e reescrita', async () => {
    const { chave } = await criarChave(SENHA, RAPIDO)
    const r1 = (await montarRegistroFechado(DADOS, chave.publica)).registroTexto
    const r2 = (await montarRegistroFechado({ ...DADOS, formula: 'Ave(piu)', afirmacao: 'consistente', tipo: 'hipótese' }, chave.publica)).registroTexto
    const v1 = (await anexar(null, chave, r1)).cadeia
    const v2 = (await anexar(v1, chave, r2)).cadeia
    // B já tinha a v1
    const b: VersaoConhecida[] = []
    const primeira = await receber(JSON.stringify(v1), b)
    expect(primeira.relacao).toBe('nova')
    b.push({ chave: chave.publica, resumos: primeira.conferencia.resumos, recebidaEm: 'teste', texto: JSON.stringify(v1) })
    expect((await receber(JSON.stringify(v2), b)).relacao).toBe('extensao')
    expect((await receber(JSON.stringify(v1), b)).relacao).toBe('igual')
    // A reescreve o elo 0 com outro registro: bifurcação, acusada no índice 0
    const reescrita = (await anexar(null, chave, r2)).cadeia
    expect(await receber(JSON.stringify(reescrita), b)).toMatchObject({ relacao: 'bifurcada', elo: 0 })
    // C tinha a v2 e recebe a v1: encurtada
    const c: VersaoConhecida[] = [{ chave: chave.publica, resumos: (await conferirCadeia(v2)).resumos, recebidaEm: 'teste', texto: JSON.stringify(v2) }]
    expect((await receber(JSON.stringify(v1), c)).relacao).toBe('encurtada')
    // e um byte trocado no arquivo é recusado antes de qualquer comparação
    const adulterado = JSON.stringify(v2).replace('consistente', 'Consistente')
    expect(adulterado).not.toBe(JSON.stringify(v2))
    expect((await receber(adulterado, b)).conferencia).toMatchObject({ veredito: 'recusada', motivo: 'C8', elo: 1 })
  })
})
