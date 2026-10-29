// O revisor de planos como serviço para clientes (especificacao/revisor-v1.md §6).
//
//   node scripts/servidor-revisor.mjs                              liga o serviço (127.0.0.1:4180; HTTPS com proxy na frente)
//   node scripts/servidor-revisor.mjs --nova-conta "Empresa X" [--limite 20]   cria a conta e mostra a chave uma vez
//   node scripts/servidor-revisor.mjs --contas                     lista as contas (sem chave)
//   node scripts/servidor-revisor.mjs --remover-conta ID           remove a conta
//
// COSMOS_REVISOR_HOST, COSMOS_REVISOR_PORTA, COSMOS_REVISOR_CONTAS (padrão privado/revisor/contas.json, fora do Git) e
// COSMOS_REVISOR_MODELO (padrão qwen3:4b) mudam o padrão. O Ollama tem de estar rodando no mesmo computador.

const { build } = await import('vite')
await build({ configFile: false, envDir: false, envPrefix: [], publicDir: false, logLevel: 'silent',
  build: { ssr: true, outDir: 'tmp/servidor-revisor-runtime', emptyOutDir: true,
    rolldownOptions: { input: { revisor: 'src/integracoes/revisor-servidor-node.ts', 'z3-trabalhador': 'src/integracoes/z3-trabalhador-node.ts' },
      output: { entryFileNames: '[name].mjs' } } },
})
const { arquivoDeContas, iniciarServidorRevisor } = await import(new URL('../tmp/servidor-revisor-runtime/revisor.mjs', import.meta.url).href)

const arg = (nome) => { const i = process.argv.indexOf(nome); return i >= 0 ? process.argv[i + 1] : undefined }
const caminhoContas = process.env.COSMOS_REVISOR_CONTAS ?? 'privado/revisor/contas.json'
const contas = arquivoDeContas(caminhoContas)

if (process.argv.includes('--nova-conta')) {
  const { conta, chave } = contas.nova(arg('--nova-conta') ?? '', Number(arg('--limite') ?? 20))
  console.log(`Conta ${conta.id} (${conta.nome}), ${conta.limiteDia} revisões por dia.`)
  console.log(`Chave (mostrada só agora; o servidor guarda só o hash): ${chave}`)
} else if (process.argv.includes('--contas')) {
  for (const c of contas.ler()) console.log(`${c.id}  ${c.nome}  criada ${c.criadaEm}  ${c.limiteDia}/dia`)
} else if (process.argv.includes('--remover-conta')) {
  console.log(contas.remover(arg('--remover-conta') ?? '') ? 'Conta removida.' : 'Conta não encontrada.')
} else {
  const host = process.env.COSMOS_REVISOR_HOST ?? '127.0.0.1', porta = Number(process.env.COSMOS_REVISOR_PORTA ?? 4180)
  const s = await iniciarServidorRevisor({ host, porta, contas: caminhoContas, modelo: process.env.COSMOS_REVISOR_MODELO,
    trabalhadorZ3: new URL('../tmp/servidor-revisor-runtime/z3-trabalhador.mjs', import.meta.url) })
  console.log(`Revisor de planos em http://${host}:${porta}/api (contas em ${caminhoContas}).`)
  const parar = () => { void s.encerrar().then(() => process.exit(0)) }
  process.once('SIGINT', parar); process.once('SIGTERM', parar)
}
