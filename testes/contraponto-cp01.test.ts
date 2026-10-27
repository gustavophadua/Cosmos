/**
 * CP01 da resposta do GPT ao contraponto: um "verificado: true" vindo de fora nunca promove nada. Um registro com o
 * campo é recusado pela forma (R1), e uma cadeia com o campo também (C1): a aceitação é sempre refeita por quem confere.
 */
import { describe, it, expect } from 'vitest'
import { anexar, criarChave, montarRegistroFechado } from '../src/interfaces/cadeiaLocal'
import { conferirCadeia } from '../src/motor/cadeiaPessoal'
import { conferirRegistro } from '../src/motor/registro'

describe('CP01 · verificado vindo do cliente', () => {
  it('registro e cadeia com "verificado: true" são recusados pela forma', async () => {
    const { chave } = await criarChave('senha de teste longa', 100_000)
    const { registroTexto } = await montarRegistroFechado({ afirmacao: 'segue', formula: 'Q(a)', premissas: ['∀x (P(x) ⟹ Q(x))', 'P(a)'], teoriaNome: 'CP01', tipo: 'teorema', dominio: 'exemplo', estado: 'proposta' }, chave.publica)
    const comCampo = { ...JSON.parse(registroTexto), verificado: true }
    expect((await conferirRegistro(comCampo, { ler: () => null, arquivo: () => null, traduzir: () => '' })).motivo).toBe('R1')
    // um registro aberto que só DIZ ter certificado, sem os arquivos, também não passa
    const semArquivos = { ...JSON.parse(registroTexto), situacao: 'aberto', certificado: { refutacao: { problema: { caminho: 'p.smt2', sha256: '0'.repeat(64) }, prova: { caminho: 'p.alethe', sha256: '0'.repeat(64) } } } }
    expect((await conferirRegistro(semArquivos, { ler: () => null, arquivo: () => null, traduzir: () => '' })).motivo).not.toBeNull()
    const { cadeia } = await anexar(null, chave, registroTexto)
    expect((await conferirCadeia({ ...cadeia, verificado: true })).motivo).toBe('C1')
  }, 60_000)
})
