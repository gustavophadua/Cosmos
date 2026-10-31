/** M12 opt-in: processo real, dados públicos, identidade descartável; não é um teste padrão. */
import { createServer } from 'node:http'
import { existsSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as esperar } from 'node:timers/promises'
import { iniciarServidorIntegracoes } from '../../src/integracoes/servidor-node'
import { criarPonteIntegracoes } from '../../src/integracoes/ponte-node'
import { criarPaginaLocal } from '../../src/integracoes/html-local-node'
import { criarClienteOllama } from '../../src/interfaces/ollama-cliente'
import { separarArgumento } from '../../src/interfaces/assistente'
import { lerProposta } from '../../src/motor/formalizacao'
import { criarCofreTeste, assinarMensagemLocalTeste } from '../../src/v4/carteira'
import { descarregarModeloOllama } from '../../src/integracoes/provedores/ollama'

const pasta = resolve(process.argv[2] ?? '')
if (!pasta.startsWith(resolve('tmp/missoes') + '/') && !pasta.startsWith(resolve('tmp/missoes') + '\\')) throw new Error('Saída M12 fora de tmp/missoes')
if (!existsSync(pasta) || existsSync(`${pasta}/meta-node.json`)) throw new Error('Saída ausente ou ensaio já iniciado; não repetir')
const origem = 'http://127.0.0.1:4175'
const gravar = (nome: string, o: unknown) => writeFileSync(`${pasta}/${nome}`, JSON.stringify(o, null, 2) + '\n')
const casos = [
  { id: 'M12-01', texto: 'Todo cliente tem suporte. A loja é cliente. Então a loja tem suporte.' },
  { id: 'M12-02', texto: 'Todo cliente tem suporte. A loja tem suporte. Então a loja é cliente.' },
  { id: 'M12-03', texto: 'Clientes do plano anual normalmente renovam. A padaria é cliente do plano anual. Então a padaria renova.' },
]
let api: Awaited<ReturnType<typeof iniciarServidorIntegracoes>> | undefined
let ponte: ReturnType<typeof criarPonteIntegracoes> | undefined
const server = createServer((req, res) => pagina(req, res))
let pagina: ReturnType<typeof criarPaginaLocal>
let sucesso = false
try {
  api = await iniciarServidorIntegracoes({ origemPermitida: origem })
  // Mesma fixture criptográfica dos testes da ponte. Chave/cofre/sessão só em memória.
  ponte = criarPonteIntegracoes({ origem, portaApi: api.endereco.porta, token: api.sessao.token,
    ollama: { ...{ sessao: { arquivoDono: `${pasta}/dono-fixture-publico.json` } } } })
  pagina = criarPaginaLocal({ origem, html: readFileSync('tmp/integracoes-p0-interface/index.html'), ponte: ponte.tratar })
  server.maxConnections = 8; server.requestTimeout = 0; server.headersTimeout = 5000; server.keepAliveTimeout = 1
  await new Promise<void>((ok, nao) => { server.once('error', nao); server.listen(4175, '127.0.0.1', ok) })
  gravar('meta-node.json', { formato: 'cosmos-m12-node-v1', pid: process.pid, inicio: new Date().toISOString(), origem,
    nuvem: false, sessao: 'fixture-descartavel', autenticacao: 'desafio-assinado-real', modelo: 'qwen3:4b', casos,
    escopo: 'Node Cosmos e cliente de ensaio no mesmo PID; Chrome e Ollama fora do escopo' })
  // O coletor sinaliza depois de sua primeira amostra; nenhuma pergunta antes disso.
  for (let n = 0; !existsSync(`${pasta}/iniciar`); n++) { if (n >= 120) throw new Error('Coletor não iniciou'); await esperar(500) }
  const html = await fetch(`${origem}/cosmos/`, { cache: 'no-store', redirect: 'error' })
  const csp = html.headers.get('content-security-policy'), corpo = await html.text()
  if (html.status !== 200 || csp !== "connect-src 'self'" || !corpo.includes('Cosmos')) throw new Error('HTML/CSP inválido')
  gravar('html.json', { status: html.status, csp, bytes: Buffer.byteLength(corpo), conversaNoHtml: corpo.includes('Pergunte ao Cosmos') || corpo.includes('Cosmos') })
  let token: string | null = null
  const transporte = (async (url, opcoes) => {
    const h = new Headers(opcoes?.headers); h.set('Origin', origem); h.set('Sec-Fetch-Site', 'same-origin')
    return fetch(url, { ...opcoes, headers: h })
  }) as typeof fetch
  const cliente = criarClienteOllama(origem, transporte, () => token)
  const estado = await cliente.carregar()
  if (estado.estado !== 'pronto' || estado.nuvem !== undefined || !estado.digest?.startsWith('359d7dd4')) throw new Error('Modelo indisponível ou configuração divergente')
  gravar('estado-modelo.json', estado)
  const senhaFixture = 'fixture-publica-ponte-ia-2026'
  const cofre = await criarCofreTeste(senhaFixture)
  const d = await cliente.desafio()
  token = (await cliente.abrirSessao({ desafio: d.desafio, ...(await assinarMensagemLocalTeste(cofre, senhaFixture, 'COSMOS/IA/SESSAO/V1', d.desafio)) })).token
  const rotas = { ollama: 0, conferir: 0, ponte: 0 }
  for (const caso of casos) {
    const inicio = new Date().toISOString(), t = performance.now()
    const texto = separarArgumento(caso.texto)
    if (!texto) throw new Error('Texto público não separável')
    const traducao = await cliente.formalizar(texto); rotas.ollama++
    const proposta = lerProposta(traducao.conteudo, null)
    const conferencia = await cliente.conferir({ ...proposta, classe: null }); rotas.conferir++
    if (!conferencia.classeZ3) throw new Error('Conferidor sem classe')
    const ligacao = conferencia.classeZ3 === 'independente' ? await cliente.ponte({ ...proposta, cenario: conferencia.cenario ?? [] }) : null
    if (ligacao) rotas.ponte++
    appendFileSync(`${pasta}/perguntas.jsonl`, JSON.stringify({ ...caso, inicio, fim: new Date().toISOString(), ms: Math.round(performance.now() - t),
      modelo: traducao.modelo, classe: conferencia.classeZ3, ponte: ligacao ? ligacao.opcoes.length : null, proposta }) + '\n')
  }
  if (rotas.ollama !== 3 || rotas.conferir !== 3 || rotas.ponte < 1) throw new Error('Rotas exigidas incompletas')
  gravar('resultado-node.json', { formato: 'cosmos-m12-node-resultado-v1', estado: 'perguntas-concluidas', fim: new Date().toISOString(), rotas, perguntas: 3 })
  sucesso = true
} catch {
  gravar('falha-node.json', { estado: 'falha-sem-reinicio-automatico', fim: new Date().toISOString() })
  process.exitCode = 1
} finally {
  ponte?.encerrar()
  await api?.encerrar()
  if (server.listening) await new Promise<void>(r => { server.close(() => r()); server.closeAllConnections() })
  await descarregarModeloOllama('qwen3:4b').catch(() => undefined)
  gravar('fim-node.json', { sucesso, pid: process.pid, fim: new Date().toISOString() })
}
