import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

it('M12: resumo HAR não copia sessão, userinfo, caminho, query ou corpos', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'cosmos-har-publico-'))
  const entrada = join(pasta, 'entrada.har'), saida = join(pasta, 'resumo.json')
  const dado = (url: string) => ({ request: { url, headers: [{ name: 'X-Cosmos-Sessao', value: 'TOKEN-FICTICIO' }], postData: { text: 'CORPO-FICTICIO' } },
    response: { status: 200, content: { text: 'RESPOSTA-FICTICIA' } } })
  writeFileSync(entrada, JSON.stringify({ log: { entries: [dado('http://usuario:senha@127.0.0.1:4175/caminho-privado?q=SEGREDO-FICTICIO'), dado('https://externo.example/conteudo')] } }))
  const r = spawnSync('python', ['-I', '-X', 'utf8', '-B', 'scripts/m12-resumir-har.py', entrada, saida], { encoding: 'utf8' })
  expect(r.status).toBe(0)
  const texto = readFileSync(saida, 'utf8'), resumo = JSON.parse(texto)
  expect(resumo.tentativasExternas).toBe(1); expect(resumo.resultado).toBe('requer-revisao')
  for (const trecho of ['TOKEN-FICTICIO', 'CORPO-FICTICIO', 'RESPOSTA-FICTICIA', 'usuario', 'senha', 'caminho-privado', 'SEGREDO-FICTICIO', 'X-Cosmos-Sessao']) expect(texto).not.toContain(trecho)
  expect(spawnSync('python', ['-I', '-X', 'utf8', '-B', 'scripts/m12-resumir-har.py', entrada, saida]).status).toBe(1)
})

it('M12: HAR vazio ou inválido nunca aprova', () => {
  const pasta = mkdtempSync(join(tmpdir(), 'cosmos-har-vazio-'))
  for (const [i, objeto] of [{ log: { entries: [] } }, { log: { entries: [{ request: { url: 'http://127.0.0.1:4175' }, response: {} }] } }].entries()) {
    const entrada = join(pasta, `${i}.har`), saida = join(pasta, `${i}.json`)
    writeFileSync(entrada, JSON.stringify(objeto))
    expect(spawnSync('python', ['-I', '-X', 'utf8', '-B', 'scripts/m12-resumir-har.py', entrada, saida]).status).toBe(0)
    expect(JSON.parse(readFileSync(saida, 'utf8')).resultado).toBe('requer-revisao')
  }
})
