// Compila só fontes do ensaio. Não inicia conta, navegador, modelo ou rede externa.
import { build } from 'vite'
await build({ envDir: false, envPrefix: [], mode: 'arquivo', logLevel: 'warn', build: { outDir: 'tmp/integracoes-p0-interface' } })
await build({ configFile: false, envDir: false, envPrefix: [], publicDir: false, logLevel: 'warn',
  build: { ssr: true, outDir: 'tmp/m12-runtime', emptyOutDir: true,
    rolldownOptions: { input: { 'm12-node': 'testes/fixtures/m12-node.ts', 'z3-trabalhador': 'src/integracoes/z3-trabalhador-node.ts' }, output: { entryFileNames: '[name].mjs' } } } })
