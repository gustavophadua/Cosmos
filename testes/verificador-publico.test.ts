/**
 * O verificador público do Cosmos 502426c: o que qualquer pessoa pode refazer a partir deste repositório.
 * Os valores esperados ficam fixos aqui (os da passagem de 25/10/2026, Apêndice B): mudar um arquivo protegido, a
 * cadeia ou um compromisso faz este teste falhar; atualizar um valor exige mudar o verificador, não só os dados.
 * Integridade e autoria não comprovam a verdade das afirmações; o carimbo Bitcoin só conta quando confirmado.
 */
import { describe, it, expect, afterAll } from 'vitest'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'
import pacote from '../src/dados/elos-assinados.json'
import carimbo from '../src/dados/carimbo-bitcoin.json'
import { PACOTE_COSMOS } from '../src/dados/pacoteCosmos'
import { conferirElosCosmos } from '../src/motor/elosCosmos'
import { conferirCadeia } from '../src/motor/cadeiaPessoal'
import { verificarSelosCosmos } from '../src/motor/cadeiaCosmos'
import { raizMerkle, verificarInclusao, verificarConsistencia } from '../src/v2/transparencia'

const PROTEGIDOS: Record<string, string> = {
  'dist/cosmos-502426c.json': '9e4d4fd13f16ff48d79ebbbb6c354bf5802374b2a2d247dc31d8d9890492f267',
  'package-lock.json': '8508db14b5c9a6968ca83ed2e0b5687a91adbaa945aca0b2475f77f5c16e40ef',
  'package.json': 'ac8b9009f2b42258cb38e5d40ee75137dfd49a9da6028fbb51eb64bdee48430e',
  'src/dados/cadeia-F0-F4.json': 'aba1b7a19c4a1447bc9da61f404478ce2be79c49a896ecf80567f54dd3cb6587',
  'src/dados/cadeia-outras-F5-F8.json': '866c2bc76e65fb94186c76b72e6dbcb713ef72fff4e7a21f5b36a8b6e8edff22',
  'src/dados/elos-assinados.json': '4c19b93be7cadff2ce79a81679580e57d0865197bd607bac92700aa851676aca',
  'src/dados/selo-publico.json': 'ab32fe665f2a980d49fda6784df97bb6b01e7d20e35b499601a5d46d46cc032a',
  'src/integracoes/contratos.ts': 'eadf6e1a83e5a15f56c49a367c3549b1e67415b913f2631538c3fe350e17d53b',
  'src/integracoes/politica.ts': 'b49f7776298c752cc5bbfaae7fa1c0ebe21b99e781cf8b13d4c9424195d0987e',
  'src/interfaces/config.ts': '7d1cd0f57350c08bc087a0d03dc53dc3814ffa843228638c9bacd2df3f197ea9',
  'src/ui/icons/cosmos-moeda-oficial.png': 'ce6539f2398d5b577d0f9c7d952876f271332e05bfa755a14aa9f5beb1bb1593',
  'src/v2/api-node.ts': '276ec28ada31e8296d710ab59572b97f9170dba28248a2b8eb7ef51749009b81',
  'src/v2/servidor.ts': '3a38137c3c488faf274a5b564da2c634bed608ea5e451f6fd698d95afaa85695',
}
const RESUMO_CADEIA = '4bd9026dd6ed7ea5b637788081bf553475977b22e772fc4c4dc0e550e59656ff'
const ALVO_OTS = '02d262a9de3a63e32353a9c3a6f30fb9073a2e3481ed678ad25ae2185792330d'
const RAIZ_CHECKPOINT = '842ecb720637b4477272c892bd4d542376a52cf1e73e9e14b62c95cfc73e841c'
const PUBKEY_SELO = '6e97907683718d984dd96bd156ecd3c504bf35c513e1cf1d842f4bc9241b7382'
// a prova como saiu dos calendários em 2026, antes da confirmação; preservada byte a byte
const PROVA_CALENDARIO_ORIGINAL = 'a8d2c0b56fe95c661ea10ac13c3818da48f0d8cee56709a8188336af427952de'

const sha256 = (caminho: string) => createHash('sha256').update(readFileSync(caminho)).digest('hex')
// o dist só existe depois do build; na CI do verificador ele é exigido (VERIFICADOR_EXIGE_DIST=1)
const exigeDist = process.env.VERIFICADOR_EXIGE_DIST === '1'
const linhas: string[] = []

describe('Verificador público · Cosmos 502426c', () => {
  it('os 13 arquivos protegidos têm os bytes exatos', () => {
    let conferidos = 0
    for (const [arquivo, esperado] of Object.entries(PROTEGIDOS)) {
      if (arquivo.startsWith('dist/') && !exigeDist && !existsSync(arquivo)) continue
      expect(sha256(arquivo), arquivo).toBe(esperado)
      conferidos++
    }
    if (exigeDist) expect(conferidos).toBe(13)
    linhas.push(`| Arquivos protegidos (SHA-256 dos bytes exatos) | ${conferidos} de 13 conferem |`)
  })

  it('a cadeia F0–F8 confere por C1–C8 e o resumo é o publicado', async () => {
    expect((await conferirCadeia(pacote.cadeia)).veredito).toBe('aceita')
    const elos = await conferirElosCosmos(PACOTE_COSMOS, PACOTE_COSMOS.fases)
    expect(elos.verificado).toBe(true)
    expect(elos.cabeca).toBe(RESUMO_CADEIA)
    expect(PACOTE_COSMOS.resumo_final).toBe(RESUMO_CADEIA)
    expect(PACOTE_COSMOS.pubkey).toBe(PUBKEY_SELO)
    linhas.push(`| Cadeia F0–F8 (C1–C8) | aceita · resumo ${RESUMO_CADEIA.slice(0, 16)}… |`)
  })

  it('cada fase: hash dos 13 campos recalculado e assinatura Ed25519 do selo', async () => {
    expect(PACOTE_COSMOS.fases.map(f => f.id)).toEqual(['F0', 'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8'])
    for (const fase of PACOTE_COSMOS.fases) {
      const r = await verificarSelosCosmos(fase as Record<string, unknown>, PACOTE_COSMOS)
      expect(r.integridade, fase.id).toBe('valida')
      expect(r.assinatura, fase.id).toBe('valida')
      // a afirmação de cada fase não é provada por integridade e autoria
      expect(r.conclusao, fase.id).toBe('inconclusivo')
    }
    linhas.push('| Fases F0–F8 | 9 de 9: integridade (SHA-256) e autoria (Ed25519) conferem · conteúdo não provado |')
  })

  it('o checkpoint: a raiz Merkle, a inclusão de cada elo e a continuidade', async () => {
    const checkpoint = JSON.parse(readFileSync('public/cosmos-checkpoint-v1.json', 'utf8'))
    const folhas = PACOTE_COSMOS.cadeia.elos.map(e => e.registroTexto)
    expect(await raizMerkle(folhas)).toBe(RAIZ_CHECKPOINT)
    expect(checkpoint.checkpoint).toEqual({ log: 'cosmos-v1-502426c', tamanho: 9, raiz: RAIZ_CHECKPOINT })
    expect(checkpoint.resumo_final).toBe(RESUMO_CADEIA)
    expect(checkpoint.inclusao).toHaveLength(9)
    for (const { indice, prova } of checkpoint.inclusao) expect(await verificarInclusao(folhas[indice], indice, 9, prova, RAIZ_CHECKPOINT), `inclusão ${indice}`).toBe(true)
    for (const { anterior, prova } of checkpoint.continuidade) expect(await verificarConsistencia(anterior.tamanho, 9, anterior.raiz, RAIZ_CHECKPOINT, prova), `continuidade ${anterior.tamanho}`).toBe(true)
    linhas.push(`| Checkpoint Merkle | raiz ${RAIZ_CHECKPOINT.slice(0, 16)}… · 9 inclusões e ${checkpoint.continuidade.length} continuidades conferem · publicação independente: ${checkpoint.publicacao_independente} |`)
  })

  it('o carimbo Bitcoin: o alvo é o resumo da cadeia, e o registro do site bate com a prova e com o status', () => {
    expect(sha256('public/cosmos-502426c-resumo.txt')).toBe(ALVO_OTS)
    expect(readFileSync('public/cosmos-502426c-resumo.txt', 'utf8').trim()).toBe(RESUMO_CADEIA)
    expect(carimbo.sha256_alvo).toBe(ALVO_OTS)
    expect(carimbo.resumo_cadeia).toBe(RESUMO_CADEIA)
    // a prova atualizada e a original dos calendários, preservada com outro nome
    expect(sha256(carimbo.prova)).toBe(carimbo.sha256_prova)
    expect(sha256(carimbo.prova_calendario_original.arquivo)).toBe(PROVA_CALENDARIO_ORIGINAL)
    expect(carimbo.prova_calendario_original.sha256).toBe(PROVA_CALENDARIO_ORIGINAL)
    const ots = JSON.parse(readFileSync('public/cosmos-ots-status.json', 'utf8'))
    expect(ots).toMatchObject({ estado: 'confirmado_bitcoin', confirmacaoVerificada: true, sha256_alvo: ALVO_OTS, altura: carimbo.altura, bloco: carimbo.bloco, tempo_bloco_utc: carimbo.tempo_bloco_utc, sha256_prova: carimbo.sha256_prova })
    // o pacote v1 continua como foi congelado: a confirmação vive na prova à parte, não no pacote
    expect(PACOTE_COSMOS.carimbo_ots).toBe('pendente')
    linhas.push(`| Carimbo OpenTimestamps | alvo ${ALVO_OTS.slice(0, 16)}… · bloco ${carimbo.altura} (${carimbo.tempo_bloco_utc}); a conferência contra os cabeçalhos está na parte "carimbo" |`)
  })

  afterAll(() => {
    const destino = process.env.VERIFICADOR_RELATORIO
    if (!destino) return
    appendFileSync(destino, ['## Verificador público · cadeia, selo e compromissos', '', '| Conferência | Resultado |', '| --- | --- |', ...linhas, '',
      'Integridade e autoria não comprovam a verdade das afirmações. O carimbo Bitcoin só vale confirmado por um cliente OTS.', ''].join('\n'))
  })
})
