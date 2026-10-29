/**
 * O piloto sem treino (especificacao/formalizacao-v1.md): um modelo pronto propõe a formalização de cada item e as
 * respostas vão para um arquivo, que a nota de testes/avaliacao.test.ts confere depois pelo Z3. Só roda quando chamado:
 *   PILOTO_PROVEDOR=groq|ollama  PILOTO_SAIDA=<pasta>  [PILOTO_MODELO=...]  [PILOTO_CONJUNTO=<arquivo .jsonl>]
 * Sem PILOTO_CONJUNTO, usa os exemplos públicos. O conjunto fechado só vai para um modelo local (Ollama em 127.0.0.1):
 * com o Groq ele é recusado, porque mandar os itens para fora estragaria o conjunto. A chave do Groq vem do ambiente
 * (GROQ_API_KEY) e não é impressa nem gravada.
 *
 * No Ollama, o pedido sai com o "modo pensando" desligado, a resposta presa ao esquema JSON, temperatura 0, semente e
 * contexto fixos, e o digest do modelo vai para meta.json. No conjunto fechado, as respostas ficam na pasta dele (fora
 * do Git) e cada medição fica registrada em medicoes-no-fechado.jsonl: o plano permite 3; uma quarta só com
 * PILOTO_ALEM_DO_LIMITE=declarado, e o registro diz que foi além.
 *
 * Lote público gerado (a revisão de erros, PILOTO_PUBLICO=gerado): só itens R- ou V- de scripts/gerar-frases.py; vai
 * ao Ollama e não conta como medição no fechado. PILOTO_FATIA=início-fim roda só esse trecho (um processo por fatia).
 *
 * Reparo (PILOTO_REPARO=1): a resposta que não se lê, ou com premissa a mais ou a menos, volta uma vez ao modelo com
 * o erro (formalizarComReparo, versão REPARO_FORMALIZACAO, a mesma do serviço local); a versão vai para meta.json.
 *
 * Votação (passo D3 do plano, só no Ollama): com PILOTO_VOTOS=n, cada item recebe n respostas com temperatura
 * PILOTO_TEMPERATURA (0,7 por padrão) e sementes 1..n, e todas as que se leem vão para candidatos.jsonl. Quem escolhe
 * a resposta é testes/votacao.test.ts, pelo Z3 (a maior turma de fórmulas equivalentes), que grava respostas.jsonl.
 */
import { it, expect } from 'vitest'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, isAbsolute } from 'node:path'
import { createHash } from 'node:crypto'
import { criarAdaptadorGroq } from '../src/integracoes/provedores/groq'
import { criarAdaptadorOllama, descreverModeloOllama } from '../src/integracoes/provedores/ollama'
import type { ModeloGroq } from '../src/integracoes/groq-contratos'
import type { Item } from '../src/motor/avaliacao'
import { ESQUEMA_RESPOSTA, formalizarComReparo, lerProposta, mensagensDeFormalizacao, PROMPT_FORMALIZACAO, REPARO_FORMALIZACAO, SAIDA_FORMALIZACAO, type Mensagem } from '../src/motor/formalizacao'

const PROVEDOR = process.env.PILOTO_PROVEDOR, SAIDA = process.env.PILOTO_SAIDA
const PUBLICOS = 'avaliacao/exemplos-publicos-v1.jsonl'
const LIMITE_NO_FECHADO = 3
const lerJsonl = <T>(arquivo: string): T[] => readFileSync(arquivo, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as T)
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))
const dentro = (pasta: string, caminho: string) => { const r = relative(resolve(pasta), resolve(caminho)); return !!r && !r.startsWith('..') && !isAbsolute(r) }

it.runIf(!!PROVEDOR && !!SAIDA)('piloto: o modelo propõe a formalização de cada item', async () => {
  const arquivo = process.env.PILOTO_CONJUNTO ?? PUBLICOS
  const gerado = process.env.PILOTO_PUBLICO === 'gerado'
  const fechado = resolve(arquivo) !== resolve(PUBLICOS) && !gerado
  if (fechado && PROVEDOR !== 'ollama') throw new Error('o conjunto fechado só vai para um modelo local (PILOTO_PROVEDOR=ollama)')
  const registro = join(dirname(resolve(arquivo)), 'medicoes-no-fechado.jsonl')
  let alemDoLimite = false
  if (fechado) {
    // as respostas revelam os itens: ficam junto do conjunto, fora do Git
    if (!dentro(dirname(resolve(arquivo)), SAIDA!)) throw new Error(`no conjunto fechado, PILOTO_SAIDA fica dentro de ${dirname(resolve(arquivo))}`)
    const feitas = existsSync(registro) ? lerJsonl(registro).length : 0
    alemDoLimite = feitas >= LIMITE_NO_FECHADO
    if (alemDoLimite && process.env.PILOTO_ALEM_DO_LIMITE !== 'declarado') throw new Error(`o conjunto fechado já foi medido ${feitas} vezes (o plano permite ${LIMITE_NO_FECHADO}); para ir além, PILOTO_ALEM_DO_LIMITE=declarado`)
  }
  let linhas = lerJsonl<Item | { item: Item }>(arquivo).map((l) => ('item' in l ? l.item : l))
  // o lote gerado se reconhece pelos ids: um arquivo com outro id (o fechado, por exemplo) continua tratado como fechado
  if (gerado && !linhas.every((i) => /^[RV]-\d+$/.test(i.id))) throw new Error('PILOTO_PUBLICO=gerado só aceita itens R- e V- do gerador público')
  if (process.env.PILOTO_FATIA) {
    if (fechado) throw new Error('PILOTO_FATIA só no lote público')
    const [de, ate] = process.env.PILOTO_FATIA.split('-').map(Number)
    linhas = linhas.slice(de, ate)
  }
  const exemplos = lerJsonl<Item>(PUBLICOS)
  const modelo = process.env.PILOTO_MODELO ?? (PROVEDOR === 'groq' ? 'openai/gpt-oss-120b' : 'qwen3:4b')

  const votos = Number(process.env.PILOTO_VOTOS ?? 0), temperaturaVoto = Number(process.env.PILOTO_TEMPERATURA ?? 0.7)
  const reparar = process.env.PILOTO_REPARO === '1'
  if (reparar && votos) throw new Error('PILOTO_REPARO e PILOTO_VOTOS não se combinam')
  if (votos && (PROVEDOR !== 'ollama' || !Number.isInteger(votos) || votos < 2 || votos > 9)) throw new Error('PILOTO_VOTOS: de 2 a 9, só no Ollama')
  let perguntar: (m: Mensagem[]) => Promise<{ conteudo: string; prompt: number; completion: number }>
  let votantes: typeof perguntar[] = []
  let identidade: Record<string, unknown> = { modelo }
  if (PROVEDOR === 'groq') {
    const groq = criarAdaptadorGroq({ chave: () => process.env.GROQ_API_KEY, prazoMs: 20_000 })
    perguntar = async (messages) => {
      const r = await groq({ model: modelo as ModeloGroq, messages, max_tokens: 4096, temperature: 0 })
      return { conteudo: r.conteudo, prompt: r.usage.prompt_tokens, completion: r.usage.completion_tokens }
    }
  } else if (PROVEDOR === 'ollama') {
    identidade = await descreverModeloOllama(modelo) // só local: o conjunto fechado não sai do aparelho
    perguntar = criarAdaptadorOllama({ modelo, formato: ESQUEMA_RESPOSTA, temperatura: 0, semente: 0, contexto: 4096 })
    votantes = Array.from({ length: votos }, (_, k) => criarAdaptadorOllama({ modelo, formato: ESQUEMA_RESPOSTA, temperatura: temperaturaVoto, semente: k + 1, contexto: 4096 }))
  } else throw new Error('PILOTO_PROVEDOR é groq ou ollama')

  mkdirSync(SAIDA!, { recursive: true })
  const respostas: string[] = [], medicoes: string[] = []
  for (const item of linhas) {
    // os exemplos do pedido nunca são o próprio item
    const mensagens = mensagensDeFormalizacao(item.texto, item.vocabulario, exemplos.filter((e) => e.id !== item.id))
    const inicio = Date.now()
    if (votos) {
      const candidatos: unknown[] = [], motivos: string[] = []
      let prompt = 0, completion = 0
      for (const votar of votantes) {
        try {
          const r = await votar(mensagens)
          prompt += r.prompt; completion += r.completion
          const p = lerProposta(r.conteudo, item.vocabulario)
          candidatos.push({ premissas: p.premissas, conclusao: p.conclusao, classe: p.classe })
        } catch (e) { motivos.push((e as Error).message) }
      }
      respostas.push(JSON.stringify({ id: item.id, candidatos }))
      const medicao = { id: item.id, ms: Date.now() - inicio, prompt_tokens: prompt, completion_tokens: completion, lidas: candidatos.length, ...(motivos.length ? { motivos } : {}) }
      medicoes.push(JSON.stringify(medicao))
      console.log(JSON.stringify(medicao))
      continue
    }
    let medicao: Record<string, unknown> = { id: item.id }
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      try {
        const r = reparar ? await formalizarComReparo(perguntar, mensagens, item.vocabulario, item.texto.premissas.length) : { ...(await perguntar(mensagens)), reparo: null }
        medicao = { id: item.id, ms: Date.now() - inicio, prompt_tokens: r.prompt, completion_tokens: r.completion, ...(r.reparo ? { reparo: r.reparo } : {}) }
        try {
          const p = lerProposta(r.conteudo, item.vocabulario)
          respostas.push(JSON.stringify({ id: item.id, premissas: p.premissas, conclusao: p.conclusao, classe: p.classe }))
          medicao.lida = true
        } catch (e) { medicao = { ...medicao, lida: false, motivo: (e as Error).message } }
        break
      } catch (e) {
        // limite por minuto do Groq: espera e tenta de novo; outro erro fica registrado
        medicao = { id: item.id, ms: Date.now() - inicio, lida: false, motivo: `provedor: ${(e as Error).message}` }
        if (PROVEDOR === 'groq') await esperar(61_000)
      }
    }
    medicoes.push(JSON.stringify(medicao))
    console.log(JSON.stringify(medicao))
    if (PROVEDOR === 'groq') await esperar(20_000) // 8 mil tokens por minuto no plano grátis
  }
  const corpo = respostas.join('\n') + '\n'
  writeFileSync(join(SAIDA!, votos ? 'candidatos.jsonl' : 'respostas.jsonl'), corpo)
  writeFileSync(join(SAIDA!, 'medicoes.jsonl'), medicoes.join('\n') + '\n')
  const meta = {
    provedor: PROVEDOR, ...identidade, prompt: PROMPT_FORMALIZACAO, ...(reparar ? { reparo: REPARO_FORMALIZACAO } : {}),
    ...(PROVEDOR === 'ollama' ? { saida: SAIDA_FORMALIZACAO, pensando: false, contexto: 4096, ...(votos ? { votos, temperatura: temperaturaVoto, sementes: `1-${votos}` } : { temperatura: 0, semente: 0 }) } : { temperatura: 0 }),
    conjunto: fechado ? 'fechado' : gerado ? relative(resolve('.'), resolve(arquivo)).replace(/\\/g, '/') : PUBLICOS, ...(process.env.PILOTO_FATIA ? { fatia: process.env.PILOTO_FATIA } : {}), itens: linhas.length, lidas: respostas.length,
    [votos ? 'candidatos_sha256' : 'respostas_sha256']: createHash('sha256').update(corpo).digest('hex'), data: new Date().toISOString(),
  }
  writeFileSync(join(SAIDA!, 'meta.json'), JSON.stringify(meta, null, 2) + '\n')
  if (fechado) appendFileSync(registro, JSON.stringify({ ...meta, saida_pasta: resolve(SAIDA!), ...(alemDoLimite ? { alem_do_limite: true } : {}) }) + '\n')
  expect(medicoes).toHaveLength(linhas.length)
}, 14_400_000)
