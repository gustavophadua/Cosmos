/** M11 opt-in: somente metade pública G, lote de até 25; nenhuma rede no teste padrão. */
import { expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { medirM11, lerItensPublicosM11, temFormatoChaveM11 } from './fixtures/m11-sequencial'
import { criarAdaptadorGroq, ErroGroq } from '../src/integracoes/provedores/groq'
import { CEGO_FORMALIZACAO, PROMPT_FORMALIZACAO, formalizarCego, lerProposta } from '../src/motor/formalizacao'
import type { Item } from '../src/motor/avaliacao'

it('M11: quota interrompe sem retry nem chamar o próximo item; preserva os concluídos', async () => {
  const feitos: string[] = [], chamadas: string[] = [], falhas: string[] = []
  await expect(medirM11([{ id: 'G-1' }, { id: 'G-2' }, { id: 'G-3' }], {
    iniciar: () => undefined,
    traduzir: async i => { chamadas.push(i.id); if (i.id === 'G-2') throw new ErroGroq(429, 'sem-quota'); return 'ok' },
    gravar: i => { feitos.push(i.id) }, interromper: (_i, c) => { falhas.push(c) },
  })).rejects.toThrow('sem-quota')
  expect(chamadas).toEqual(['G-1', 'G-2']); expect(feitos).toEqual(['G-1']); expect(falhas).toEqual(['sem-quota'])
})
it('M11: erro desconhecido não revela texto livre e não repete; falha de gravação também encerra', async () => {
  const o = { iniciar: () => undefined, traduzir: async () => { throw new Error('SEGREDO-FICTICIO') }, gravar: () => undefined, interromper: () => undefined }
  await expect(medirM11([{ id: 'G-1' }], o)).rejects.toThrow('M11 interrompida: indisponivel')
  let chamadas = 0
  await expect(medirM11([{ id: 'G-1' }, { id: 'G-2' }], { ...o, traduzir: async () => ++chamadas, gravar: () => { throw new Error('disco') } })).rejects.toThrow('disco')
  expect(chamadas).toBe(1)
})
it('M11: lê os 100 itens dentro de item, como o piloto original, e recusa duplicatas/lote errado', () => {
  const exemplo = JSON.parse(readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n')[0]) as Item
  const diretos = Array.from({ length: 100 }, (_, n) => ({ ...exemplo, id: `G-${n + 1}` }))
  const linhas = diretos.map(item => ({ padrao: 'publico', parte: 'teste', leitura: 'metadado', perfil: 'fixture', item }))
  const jsonl = (v: unknown[]) => v.map(x => JSON.stringify(x)).join('\n') + '\n'
  expect(lerItensPublicosM11(jsonl(linhas)).map(i => i.id)).toEqual(diretos.map(i => i.id))
  expect(lerItensPublicosM11(jsonl(diretos))).toEqual(diretos)
  expect(() => lerItensPublicosM11(jsonl(linhas.slice(1)))).toThrow()
  expect(() => lerItensPublicosM11(jsonl([...linhas.slice(1), linhas[1]]))).toThrow()
  expect(() => lerItensPublicosM11(jsonl([...diretos.slice(1), { ...exemplo, id: 'FECHADO-1' }]))).toThrow()
})
it('M11: recusa chave vazia, curta, longa, com espaço, quebra de linha ou Unicode antes de reservar a fatia', () => {
  expect(temFormatoChaveM11('gsk_fixture_publica_123456')).toBe(true)
  for (const chave of [undefined, '', 'curta', 'x'.repeat(513), 'gsk_ com espaco', 'gsk_quebra\n', 'gsk_quebra\r', 'gsk_ação', 'gsk_tab\t']) expect(temFormatoChaveM11(chave)).toBe(false)
})
it.runIf(process.env.MISSAO11_MEDIR === '1')('M11: traduz uma fatia pública pelo 120b, sem nota Z3 simultânea', async () => {
  if (!temFormatoChaveM11(process.env.GROQ_API_KEY)) throw new Error('Formato local da chave invalido; nenhuma chamada iniciada; nao enviar chave pelo chat')
  const fatia = process.env.MISSAO11_FATIA ?? '0-25'
  if (!['0-25', '25-50', '50-75', '75-100'].includes(fatia)) throw new Error('Fatia invalida')
  const [de, ate] = fatia.split('-').map(Number)
  const arquivo = 'tmp/frases-gpt/teste.jsonl', raiz = 'tmp/frases-gpt/cosmos120-teste'
  const pasta = `${raiz}/respostas/fatia-${String(de / 25).padStart(2, '0')}`
  const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
  if (sha(arquivo) !== '5ec5cf95dcd1dcf354a41e25b296eff3fd2c86600db11489131c33102623c53c') throw new Error('Metade de teste mudou')
  if (sha('src/motor/formalizacao.ts') !== 'e297fa24e6929f7a050f498e7238b16597a0ae0796ce8e1a033de65a04b866f8') throw new Error('Formalizador mudou')
  if (sha('avaliacao/exemplos-publicos-v1.jsonl') !== '82d4a13e91fb045432bc1b3e3cfe1f29c0d0a7c215f76540b3dabef7d2680f51') throw new Error('Exemplos mudaram')
  if (CEGO_FORMALIZACAO !== 'cego-v2' || PROMPT_FORMALIZACAO !== 'formalizacao-v3') throw new Error('Protocolo mudou')
  const itens = lerItensPublicosM11(readFileSync(arquivo, 'utf8'))
  if (existsSync(pasta)) throw new Error('Fatia ja iniciada; nao repetir, nem trocar pasta para contornar')
  if (de > 0 && !existsSync(`${raiz}/respostas/fatia-${String(de / 25 - 1).padStart(2, '0')}/meta.json`)) throw new Error('Fatia anterior nao concluida; conferir antes de continuar')
  mkdirSync(`${raiz}/dias`, { recursive: true })
  // Reserva exclusiva antes de chamadas: uma fatia por dia UTC, inclusive se houver falha.
  writeFileSync(`${raiz}/dias/${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ fatia, inicio: new Date().toISOString() }) + '\n', { flag: 'wx' })
  mkdirSync(pasta, { recursive: true })
  const modelo = 'openai/gpt-oss-120b'
  writeFileSync(`${pasta}/meta-inicio.json`, JSON.stringify({ provedor: 'groq', modelo, prompt: PROMPT_FORMALIZACAO, cego: CEGO_FORMALIZACAO, temperatura: 0,
    conjunto: arquivo, conjunto_sha256: sha(arquivo), fatia, itens: ate - de, inicio: new Date().toISOString(), intervaloMinimoEntreChamadasMs: 20000,
    politica: 'uma-fatia-dia-UTC; sem retry de transporte; parar em 429; respostas incrementais; sem Z3 neste processo' }, null, 2) + '\n')
  const exemplos = readFileSync('avaliacao/exemplos-publicos-v1.jsonl', 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l) as Item)
  const groq = criarAdaptadorGroq({ chave: () => process.env.GROQ_API_KEY, prazoMs: 20000 })
  let ultimaChamada = 0, inicioItem = 0, lidas = 0, concluidos = 0
  const perguntar = async (messages: Parameters<typeof formalizarCego>[0] extends (m: infer M) => unknown ? M : never) => {
    const pausa = Math.max(0, 20000 - (Date.now() - ultimaChamada))
    if (pausa) await new Promise(r => setTimeout(r, pausa))
    ultimaChamada = Date.now()
    const r = await groq({ model: modelo, messages, max_tokens: 4096, temperature: 0 })
    return { conteudo: r.conteudo, prompt: r.usage.prompt_tokens, completion: r.usage.completion_tokens }
  }
  await medirM11(itens.slice(de, ate), {
    iniciar: i => { inicioItem = Date.now(); appendFileSync(`${pasta}/tentativas.jsonl`, JSON.stringify({ id: i.id, inicio: new Date().toISOString() }) + '\n') },
    traduzir: i => formalizarCego(perguntar, perguntar, i.texto, i.vocabulario, exemplos.filter(e => e.id !== i.id)),
    gravar: (i, r) => {
      let proposta: ReturnType<typeof lerProposta> | null = null
      try { proposta = lerProposta(r.conteudo, i.vocabulario) } catch { /* saída ilegível é resultado, não retry */ }
      const lida = proposta !== null
      if (proposta) {
        appendFileSync(`${pasta}/respostas.jsonl`, JSON.stringify({ id: i.id, premissas: proposta.premissas, conclusao: proposta.conclusao, classe: proposta.classe }) + '\n')
        lidas++
      }
      concluidos++
      const medicao = { id: i.id, lida, ms: Date.now() - inicioItem, prompt_tokens: r.prompt, completion_tokens: r.completion, houveReparo: !!r.reparo }
      appendFileSync(`${pasta}/medicoes.jsonl`, JSON.stringify(medicao) + '\n')
      console.log(JSON.stringify({ id: i.id, lida, concluidos, total: ate - de }))
    },
    interromper: (i, codigo) => { writeFileSync(`${pasta}/interrompido.json`, JSON.stringify({ id: i.id, codigo, concluidos, lidas, fim: new Date().toISOString(), retomar: 'nao repetir automaticamente; conferir resultados antes da proxima execucao' }, null, 2) + '\n') },
  })
  const corpo = existsSync(`${pasta}/respostas.jsonl`) ? readFileSync(`${pasta}/respostas.jsonl`) : Buffer.alloc(0)
  writeFileSync(`${pasta}/meta.json`, JSON.stringify({ provedor: 'groq', modelo, prompt: PROMPT_FORMALIZACAO, cego: CEGO_FORMALIZACAO, temperatura: 0, conjunto: arquivo,
    fatia, itens: ate - de, lidas, concluidos, respostas_sha256: createHash('sha256').update(corpo).digest('hex'), data: new Date().toISOString() }, null, 2) + '\n')
  expect(concluidos).toBe(25)
}, 14400000)
