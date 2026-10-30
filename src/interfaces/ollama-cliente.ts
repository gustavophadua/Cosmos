import { ErroIntegracoes } from './integracoes-cliente'
import { CLASSES, type Classe, type Termo } from '../motor/avaliacao'
import type { RelatorioRevisor } from '../motor/revisor-relatorio'

export interface EstadoRevisao { estado: 'livre' | 'rodando' | 'pronto' | 'erro'; id?: number; fase?: string; feito?: number; total?: number; ms?: number; relatorio?: RelatorioRevisor; erro?: string }
const relatorioValido = (r: unknown): r is RelatorioRevisor => typeof r === 'object' && r !== null && (r as RelatorioRevisor).formato === 'cosmos-revisor-v1'
  && Array.isArray((r as RelatorioRevisor).argumentos) && Array.isArray((r as RelatorioRevisor).afirmacoes) && Array.isArray((r as RelatorioRevisor).avisos)
/** A ligação que falta: a fórmula, a leitura em português e as premissas que a conclusão ainda usa; ou o motivo de não achar. */
export interface OpcaoLigacao { ponte: string; leitura: string; essenciais: number[] }
export type Ligacao = { opcoes: OpcaoLigacao[]; fonte: 'busca' | 'modelo'; outras: number } | { opcoes: []; motivo: string }
export interface EstadoOllama { estado: 'pronto' | 'sem-modelo' | 'indisponivel'; modelo: string; digest?: string; ollama?: string; nuvem?: string; sessao?: 'exigida' | 'livre' }

/**
 * A formalização pelo Ollama local, pela ponte do serviço local (rotas ollama/estado e ollama). O navegador manda só
 * premissas e conclusão; o pedido, o modelo e as opções ficam no processo Node.
 */
export function criarClienteOllama(origem: string, buscar: typeof fetch = fetch, sessao: () => string | null = () => null) {
  if (!/^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/.test(origem) || new URL(origem).origin !== origem) throw new ErroIntegracoes('sem-servico')
  async function chamar(rota: 'ollama/estado' | 'ollama' | 'ollama/conferir' | 'ollama/ponte' | 'ollama/desafio' | 'ollama/sessao' | 'ollama/revisar' | 'ollama/revisar/estado', corpo: unknown, prazoMs: number, signal?: AbortSignal, limite = 131072) {
    const controle = new AbortController(), abortar = () => controle.abort()
    if (signal?.aborted) controle.abort()
    else signal?.addEventListener('abort', abortar, { once: true })
    const timer = setTimeout(abortar, prazoMs)
    try {
      const r = await buscar(`${origem}/cosmos/__p0/${rota}`, { method: corpo === undefined ? 'GET' : 'POST',
        headers: { 'X-Cosmos-P0': '1', Accept: 'application/json', ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }), ...(sessao() ? { 'X-Cosmos-Sessao': sessao()! } : {}) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo), signal: controle.signal, credentials: 'omit', redirect: 'error', cache: 'no-store', referrerPolicy: 'same-origin' })
      // 401: sem a sessão da conta; 403 ao abrir a sessão: o serviço é de outra conta
      if (!r.ok) throw new ErroIntegracoes(r.status === 401 ? 'sessao-expirada' : r.status === 403 ? 'conflito' : r.status === 429 ? 'limite' : r.status === 400 ? 'invalido' : 'sem-servico')
      if (!r.headers.get('content-type')?.startsWith('application/json')) throw new ErroIntegracoes('invalido')
      const texto = await r.text()
      if (texto.length > limite) throw new ErroIntegracoes('invalido')
      return JSON.parse(texto) as Record<string, unknown>
    } catch (e) { throw e instanceof ErroIntegracoes ? e : new ErroIntegracoes('indisponivel') }
    finally { clearTimeout(timer); signal?.removeEventListener('abort', abortar) }
  }
  return Object.freeze({
    async carregar(signal?: AbortSignal): Promise<EstadoOllama> {
      const o = await chamar('ollama/estado', undefined, 15000, signal)
      if (o.formato !== 'cosmos-ollama-v1' || !['pronto', 'sem-modelo', 'indisponivel'].includes(o.estado as string) || typeof o.modelo !== 'string') throw new ErroIntegracoes('invalido')
      return { estado: o.estado as EstadoOllama['estado'], modelo: o.modelo, ...(typeof o.digest === 'string' ? { digest: o.digest } : {}), ...(typeof o.ollama === 'string' ? { ollama: o.ollama } : {}),
        ...(typeof o.nuvem === 'string' && o.nuvem.length <= 80 ? { nuvem: o.nuvem } : {}), ...(o.sessao === 'exigida' || o.sessao === 'livre' ? { sessao: o.sessao } : {}) }
    },
    /** Na CPU, uma proposta leva cerca de um minuto; o prazo aqui é o mesmo da ponte. */
    async formalizar(texto: { premissas: string[]; conclusao: string; vocabulario?: Termo[]; nuvem?: boolean }, signal?: AbortSignal) {
      const o = await chamar('ollama', { premissas: texto.premissas, conclusao: texto.conclusao, ...(texto.vocabulario ? { vocabulario: texto.vocabulario } : {}), ...(texto.nuvem ? { nuvem: true } : {}) }, 620000, signal)
      if (o.formato !== 'cosmos-ollama-resposta-v1' || typeof o.conteudo !== 'string' || !Number.isSafeInteger(o.prompt_tokens) || !Number.isSafeInteger(o.completion_tokens)) throw new ErroIntegracoes('invalido')
      return { conteudo: o.conteudo, prompt_tokens: o.prompt_tokens as number, completion_tokens: o.completion_tokens as number, ...(typeof o.reparo === 'string' ? { reparo: o.reparo } : {}),
        ...(typeof o.modelo === 'string' && o.modelo.length <= 80 ? { modelo: o.modelo } : {}) }
    },
    /** O modo automático: o Z3 dá a classe das fórmulas do modelo (a primeira abre o Z3). */
    async conferir(p: { vocabulario: Termo[]; premissas: string[]; conclusao: string; classe: Classe | null }, signal?: AbortSignal) {
      const o = await chamar('ollama/conferir', { vocabulario: p.vocabulario, premissas: p.premissas, conclusao: p.conclusao, classe: p.classe }, 120000, signal)
      if (o.formato !== 'cosmos-ollama-conferencia-v1' || typeof o.aceita !== 'boolean' || typeof o.motivo !== 'string' || !(o.classe_z3 === null || CLASSES.includes(o.classe_z3 as Classe))) throw new ErroIntegracoes('invalido')
      const cenario = Array.isArray(o.cenario) && o.cenario.length <= 60 && o.cenario.every((l) => typeof l === 'string' && l.length <= 600) ? o.cenario as string[] : undefined
      return { classeZ3: o.classe_z3 as Classe | null, aceita: o.aceita, motivo: o.motivo, ...(cenario ? { cenario } : {}) }
    },
    /** A ligação que falta num salto: a busca pela forma (Z3) e, se ela não achar, o modelo; até quatro opções, conferidas. */
    async ponte(a: { vocabulario: Termo[]; premissas: string[]; conclusao: string; cenario: string[] }, signal?: AbortSignal): Promise<Ligacao> {
      const o = await chamar('ollama/ponte', { vocabulario: a.vocabulario, premissas: a.premissas, conclusao: a.conclusao, cenario: a.cenario.slice(0, 20).map((c) => c.slice(0, 300)) }, 620000, signal)
      if (o.formato !== 'cosmos-ollama-ponte-v1') throw new ErroIntegracoes('invalido')
      const opcao = (x: unknown): x is OpcaoLigacao => typeof x === 'object' && x !== null && typeof (x as OpcaoLigacao).ponte === 'string' && (x as OpcaoLigacao).ponte.length <= 1000
        && typeof (x as OpcaoLigacao).leitura === 'string' && Array.isArray((x as OpcaoLigacao).essenciais)
        && (x as OpcaoLigacao).essenciais.every((i) => Number.isSafeInteger(i) && i >= 0 && i < a.premissas.length)
      if (!Array.isArray(o.opcoes) || o.opcoes.length > 4 || !o.opcoes.every(opcao)) throw new ErroIntegracoes('invalido')
      const opcoes = (o.opcoes as OpcaoLigacao[]).map(({ ponte, leitura, essenciais }) => ({ ponte, leitura: leitura.slice(0, 1000), essenciais }))
      if (opcoes.length && (o.fonte === 'busca' || o.fonte === 'modelo') && Number.isSafeInteger(o.outras)) return { opcoes, fonte: o.fonte, outras: o.outras as number }
      if (!opcoes.length && typeof o.motivo === 'string') return { opcoes: [], motivo: o.motivo.slice(0, 500) }
      throw new ErroIntegracoes('invalido')
    },
    /** O desafio que a conta assina para abrir a sessão da IA; `ligada`: o serviço já tem dona. */
    async desafio(signal?: AbortSignal): Promise<{ desafio: string; ligada: boolean }> {
      const o = await chamar('ollama/desafio', undefined, 15000, signal)
      if (o.formato !== 'cosmos-ia-desafio-v1' || typeof o.desafio !== 'string' || !/^[a-f0-9]{64}$/.test(o.desafio) || typeof o.ligada !== 'boolean') throw new ErroIntegracoes('invalido')
      return { desafio: o.desafio, ligada: o.ligada }
    },
    async abrirSessao(p: { desafio: string; pubkey: string; assinatura: string }, signal?: AbortSignal): Promise<{ token: string; ociosoMs: number }> {
      const o = await chamar('ollama/sessao', { desafio: p.desafio, pubkey: p.pubkey, assinatura: p.assinatura }, 15000, signal)
      if (o.formato !== 'cosmos-ia-sessao-v1' || typeof o.token !== 'string' || !/^[a-f0-9]{64}$/.test(o.token) || !Number.isSafeInteger(o.ociosoMs)) throw new ErroIntegracoes('invalido')
      return { token: o.token, ociosoMs: o.ociosoMs as number }
    },
    /** O revisor de planos: começa em segundo plano (minutos) e se acompanha por estadoRevisao. */
    async revisar(texto: string, signal?: AbortSignal): Promise<EstadoRevisao> {
      const o = await chamar('ollama/revisar', { texto }, 30000, signal)
      if (o.formato !== 'cosmos-revisor-estado-v1' || o.estado !== 'rodando' || !Number.isSafeInteger(o.id)) throw new ErroIntegracoes('invalido')
      return { estado: 'rodando', id: o.id as number }
    },
    async estadoRevisao(signal?: AbortSignal): Promise<EstadoRevisao> {
      const o = await chamar('ollama/revisar/estado', undefined, 15000, signal, 4_194_304)
      if (o.formato !== 'cosmos-revisor-estado-v1' || !['livre', 'rodando', 'pronto', 'erro'].includes(o.estado as string)) throw new ErroIntegracoes('invalido')
      if (o.estado === 'pronto' && !relatorioValido(o.relatorio)) throw new ErroIntegracoes('invalido')
      return { estado: o.estado as EstadoRevisao['estado'], ...(Number.isSafeInteger(o.id) ? { id: o.id as number } : {}), ...(typeof o.fase === 'string' ? { fase: o.fase } : {}),
        ...(Number.isSafeInteger(o.feito) ? { feito: o.feito as number } : {}), ...(Number.isSafeInteger(o.total) ? { total: o.total as number } : {}), ...(Number.isSafeInteger(o.ms) ? { ms: o.ms as number } : {}),
        ...(o.estado === 'pronto' ? { relatorio: o.relatorio as RelatorioRevisor } : {}), ...(typeof o.erro === 'string' ? { erro: o.erro } : {}) }
    },
  })
}
