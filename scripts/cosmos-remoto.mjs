import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'

// O Cosmos aberto de fora (do telefone), com login, por um túnel da Cloudflare até este computador.
//   node scripts/cosmos-remoto.mjs --definir-senha   cria (ou troca) a senha da dona, aqui, digitada no terminal
//   node scripts/cosmos-remoto.mjs                   sobe o Cosmos remoto e o túnel rápido (endereço *.trycloudflare.com)
//   node scripts/cosmos-remoto.mjs --host=cosmos.seu-dominio.com   usa um túnel nomeado que você já roda à parte
//   node scripts/cosmos-remoto.mjs --sem-tunel       só no computador (http://127.0.0.1:4180), para testar
// A tradução vai pelo Groq (GROQ_API_KEY no ambiente, só neste processo) e, quando ele falha, pelo Ollama daqui.
// O modo local cifrado (Abrir-Cosmos-IA.cmd) continua igual, para quem quer rodar só no computador.
const CONTA = 'privado/remoto-conta.json', DADOS = 'privado/remoto-dados', PORTA = 4180
const local = `127.0.0.1:${PORTA}`

function lerSenha(pergunta) {
  return new Promise((ok, falha) => {
    if (!process.stdin.isTTY) { falha(new Error('Rode num terminal: a senha é digitada sem aparecer na tela.')); return }
    process.stdout.write(pergunta)
    let senha = ''
    process.stdin.setRawMode(true); process.stdin.resume(); process.stdin.setEncoding('utf8')
    const ler = (c) => {
      for (const ch of c) {
        if (ch === '\r' || ch === '\n') { fim(); ok(senha); return }
        if (ch === '\u0003') { fim(); falha(new Error('Cancelado.')); return }
        if (ch === '\u007f' || ch === '\b') senha = senha.slice(0, -1)
        else if (ch >= ' ') senha += ch
      }
    }
    const fim = () => { process.stdin.off('data', ler); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write('\n') }
    process.stdin.on('data', ler)
  })
}

console.log('Cosmos remoto: preparando…')
const { build } = await import('vite')
// o mesmo empacotamento do serviço local, em pastas próprias (os dois podem rodar juntos)
await build({ configFile: false, envDir: false, envPrefix: [], publicDir: false, logLevel: 'silent',
  build: { ssr: true, outDir: 'tmp/remoto-runtime', emptyOutDir: true,
    rolldownOptions: { input: { servidor: 'src/integracoes/servidor-node.ts', ponte: 'src/integracoes/ponte-node.ts', remoto: 'src/integracoes/remoto-node.ts', 'z3-trabalhador': 'src/integracoes/z3-trabalhador-node.ts' },
      output: { entryFileNames: '[name].mjs' } } },
})
const { criarContaRemota, lerContaRemota, criarPortaRemota, exigirSegredo, ICONES_APP } = await import(new URL('../tmp/remoto-runtime/remoto.mjs', import.meta.url).href)

if (process.argv.includes('--definir-senha')) {
  try {
    const senha = await lerSenha('Senha da dona (12 a 256 caracteres): ')
    if (senha !== await lerSenha('Repita a senha: ')) throw new Error('As senhas não coincidem.')
    mkdirSync('privado', { recursive: true })
    // a senha nova gera outra chave do histórico: o histórico remoto antigo deixa de se ler
    if (existsSync(CONTA) && existsSync(DADOS)) console.log(`Aviso: o histórico remoto antigo (${DADOS}) era da senha anterior e não vai mais se ler.`)
    writeFileSync(CONTA, JSON.stringify(await criarContaRemota(senha), null, 2) + '\n')
    console.log(`Senha guardada (só o resumo scrypt, em ${CONTA}). Agora rode: node scripts/cosmos-remoto.mjs`)
  } catch (e) { console.error(e.message); process.exitCode = 1 }
  process.exit()
}
if (!existsSync(CONTA)) { console.error('Ainda não há senha. Rode primeiro: node scripts/cosmos-remoto.mjs --definir-senha'); process.exit(1) }
const conta = lerContaRemota(JSON.parse(readFileSync(CONTA, 'utf8')))

await build({ envDir: false, envPrefix: [], mode: 'arquivo', logLevel: 'silent', build: { outDir: 'tmp/remoto-interface' } })
const html = await readFile('tmp/remoto-interface/index.html')
const { iniciarServidorIntegracoes } = await import(new URL('../tmp/remoto-runtime/servidor.mjs', import.meta.url).href)
const { criarPonteIntegracoes } = await import(new URL('../tmp/remoto-runtime/ponte.mjs', import.meta.url).href)

let api, ponte, porta, interno, tunel, encerrando = false
async function encerrar() {
  if (encerrando) return
  encerrando = true
  tunel?.kill(); porta?.encerrar(); ponte?.encerrar(); await api?.encerrar()
  for (const s of [remoto, interno]) if (s?.listening) await new Promise((r) => { s.close(r); s.closeAllConnections() })
}
// a ponte interna escuta numa porta qualquer de 127.0.0.1 e só atende quem traz o segredo deste processo
const segredo = randomBytes(32).toString('hex')
let tratarInterno = (_req, res) => { res.writeHead(503); res.end() }
interno = createServer({ maxHeaderSize: 8192 }, exigirSegredo(segredo, (req, res) => tratarInterno(req, res)))
await new Promise((ok, falha) => { interno.once('error', falha); interno.listen(0, '127.0.0.1', ok) })
const portaInterna = interno.address().port, origemInterna = `http://127.0.0.1:${portaInterna}`
api = await iniciarServidorIntegracoes({ origemPermitida: origemInterna })
const groq = process.env.GROQ_API_KEY ? { groq: { chave: () => process.env.GROQ_API_KEY } } : {}
ponte = criarPonteIntegracoes({ origem: origemInterna, portaApi: api.endereco.porta, token: api.sessao.token, ...groq, ollama: { reservaLocal: true } })
tratarInterno = ponte.tratar

const hosts = [local]
const fixo = process.argv.find((a) => a.startsWith('--host='))?.slice(7)
if (fixo) { if (!/^[a-z0-9.-]{1,253}$/.test(fixo)) { console.error('Host inválido'); process.exit(1) } hosts.push(fixo) }
// os ícones do app, para o telefone instalar o Cosmos na tela inicial a partir deste endereço
const icones = Object.fromEntries(ICONES_APP.filter((n) => existsSync(`public/${n}`)).map((n) => [n, readFileSync(`public/${n}`)]))
porta = criarPortaRemota({ conta, html, interno: { porta: portaInterna, segredo }, hosts: () => hosts, pastaDados: DADOS, icones })
const remoto = createServer({ maxHeaderSize: 8192 }, porta)
remoto.requestTimeout = 12 * 60_000; remoto.headersTimeout = 10_000
await new Promise((ok, falha) => { remoto.once('error', falha); remoto.listen(PORTA, '127.0.0.1', ok) })
process.once('SIGINT', () => { void encerrar().then(() => process.exit()) })
process.once('SIGTERM', () => { void encerrar().then(() => process.exit()) })

console.log(`Neste computador: http://${local}/cosmos/  ·  tradução: ${process.env.GROQ_API_KEY ? 'Groq, com o Ollama de reserva' : 'Ollama (sem GROQ_API_KEY no ambiente)'}`)
if (fixo) console.log(`Pelo túnel nomeado: https://${fixo}/cosmos/`)
else if (!process.argv.includes('--sem-tunel')) {
  // o túnel rápido da Cloudflare: sem conta e sem abrir porta no roteador; o endereço muda a cada vez que abre
  tunel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://${local}`], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  tunel.once('error', () => console.log('O cloudflared não está instalado. Instale com: winget install --id Cloudflare.cloudflared  (e abra este programa de novo).'))
  let achado = false
  tunel.stderr.setEncoding('utf8').on('data', (t) => {
    const m = /https:\/\/([a-z0-9-]+\.trycloudflare\.com)/.exec(t)
    if (m && !achado) { achado = true; hosts.push(m[1]); console.log(`\nNo telefone, abra: https://${m[1]}/cosmos/\n(o endereço muda cada vez que este programa abre; a senha é a da dona)`) }
  })
  tunel.once('exit', (c) => { if (!encerrando) console.log(`O túnel fechou (código ${c}). O Cosmos segue só neste computador.`) })
}
console.log('Para fechar, feche esta janela (ou Ctrl+C).')
