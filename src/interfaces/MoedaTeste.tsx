/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { anexar, MOTIVOS_CADEIA, receber, type Recebimento } from './cadeiaLocal'
import { gravarMoeda, lerEstado, lerMoeda, type EstadoCadeiaLocal, type EstadoMoedaLocal } from './armazemCadeia'
import type { Cadeia } from '../motor/cadeiaPessoal'
import { dataDe, diaDe, emUnidades, estadoDaRede, FORMATO_LIVRO, hojeLocal, montarOperacao, queimaDe, ultimoDia, type EstadoDaRede, type Genese, type Motivo } from '../motor/moedaTeste'
import { somenteHostLocal } from '../v4/localnet'
import genese from '../../redes/cosmos-teste-1/genese.json'
import recompensas from '../../redes/cosmos-teste-1/recompensas.json'

const G = genese as Genese
function baixar(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' })), a = document.createElement('a')
  a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const lerArquivo = (f: File) => f.size > 5 * 1024 * 1024 ? Promise.reject(new Error('arquivo maior que 5 MB')) : f.text()
/** "10", "10,5" ou "10.50" em centésimos; null se não é uma quantia. */
function centesimos(texto: string): number | null {
  const m = /^(\d{1,9})(?:[.,](\d{1,2}))?$/.exec(texto.trim())
  return m ? Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0')) : null
}
const nomeDe = (chave: string) => G.participantes.find(p => p.chave === chave)?.nome ?? chave.slice(0, 8)
const RELACOES: Record<string, string> = {
  nova: 'Livro novo para este aparelho: guardado como a versão conhecida desta chave.',
  igual: 'Igual à versão que este aparelho já tinha.',
  extensao: 'Extensão da versão conhecida: as operações antigas são o começo das novas. Trocado pelo novo.',
  encurtada: 'ALTERAÇÃO: o livro recebido é mais curto do que o conhecido. Somem operações que a chave já tinha assinado. A versão conhecida foi mantida.',
  bifurcada: 'GASTO DUPLO: a mesma chave assinou duas histórias diferentes. As duas versões ficam guardadas como prova, e a rede continua lendo a primeira.',
  'outra-chave': 'Livro de outra chave.',
}

/**
 * A rede de teste cosmos-teste-1 vista deste aparelho: o próprio livro, os livros recebidos de outros aparelhos e o
 * estado que sai deles. Assinar só pelo localhost, com a chave de Minha cadeia; conferir funciona em qualquer lugar.
 */
export function MoedaTeste() {
  const local = somenteHostLocal(location.hostname), hoje = hojeLocal()
  const [cadeia, setCadeia] = useState<EstadoCadeiaLocal | null>(null)
  const [moeda, setMoeda] = useState<EstadoMoedaLocal | null>(null)
  const [estado, setEstado] = useState<EstadoDaRede | null>(null)
  const [erro, setErro] = useState(''), [aviso, setAviso] = useState(''), [ocupado, setOcupado] = useState(false)
  const [recebido, setRecebido] = useState<(Recebimento & { nome: string }) | null>(null)
  const [para, setPara] = useState(''), [quantia, setQuantia] = useState(''), [motivo, setMotivo] = useState<Motivo>('pagamento'), [referencia, setReferencia] = useState('')

  useEffect(() => { void Promise.all([lerEstado(), lerMoeda()]).then(([c, m]) => { setCadeia(c); setMoeda(m) }).catch(() => setErro('Este navegador não deixa guardar o livro (IndexedDB indisponível).')) }, [])
  const minha = cadeia?.chave?.publica ?? null
  const livrosDe = (m: EstadoMoedaLocal, proprio: Cadeia | null): unknown[] => [...(proprio ? [proprio] : []), ...m.conhecidos.filter(v => v.chave !== minha).map(v => JSON.parse(v.texto))]
  useEffect(() => { if (moeda) void estadoDaRede(G, livrosDe(moeda, moeda.livro), recompensas, hoje).then(setEstado).catch(e => setErro((e as Error).message)) }, [moeda])

  const salvar = async (m: EstadoMoedaLocal) => { await gravarMoeda(m); setMoeda(m) }
  const executar = async (acao: () => Promise<void>) => {
    if (ocupado) return
    setOcupado(true); setErro(''); setAviso('')
    try { await acao() } catch (e) { setErro(e instanceof Error ? e.message : 'operação recusada') } finally { setOcupado(false) }
  }

  const receberArquivo = (f: File | undefined) => moeda && f && executar(async () => {
    const texto = await lerArquivo(f)
    const conhecidas = [...moeda.conhecidos.filter(v => v.chave !== minha), ...(moeda.livro ? [{ chave: moeda.livro.chave, resumos: (await receber(JSON.stringify(moeda.livro), [], FORMATO_LIVRO)).conferencia.resumos, recebidaEm: '', texto: JSON.stringify(moeda.livro) }] : [])]
    const r = await receber(texto, conhecidas, FORMATO_LIVRO)
    setRecebido({ ...r, nome: f.name })
    if (r.conferencia.veredito !== 'aceita' || !r.chave) return
    const agora = new Date().toISOString()
    if (r.relacao === 'bifurcada') { await salvar({ ...moeda, conflitos: [...moeda.conflitos, { chave: r.chave, elo: r.elo ?? 0, texto, recebidaEm: agora }] }); return }
    if (r.relacao !== 'nova' && r.relacao !== 'extensao') return
    // o próprio livro, trazido de outro navegador (com a chave restaurada), continua daqui
    if (r.chave === minha) { await salvar({ ...moeda, livro: JSON.parse(texto) }); return }
    await salvar({ ...moeda, conhecidos: [...moeda.conhecidos.filter(v => v.chave !== r.chave), { chave: r.chave, resumos: r.conferencia.resumos, recebidaEm: agora, texto }] })
  })

  const painelReceber = <section className="labs-surface cadeia-receber">
    <h3>Receber o livro de outro aparelho</h3>
    <p>Abra o arquivo de livro que veio de outro participante. A conferência refaz cada elo (C1–C8, no formato do livro), compara com a versão que este aparelho já tinha e refaz a conta da rede. <a href="https://github.com/gustavophadua/Cosmos/blob/main/especificacao/teste-moeda-3-notebooks.md" target="_blank" rel="noopener">Roteiro do teste com três computadores ↗</a></p>
    <label className="cadeia-arquivo"><span>Escolher arquivo .json</span><input type="file" accept="application/json,.json" disabled={ocupado || !moeda} onChange={e => { receberArquivo(e.target.files?.[0]); e.target.value = '' }} /></label>
    {recebido && <div className="cadeia-recebido" data-veredito={recebido.conferencia.veredito} data-relacao={recebido.relacao ?? ''} role="status">
      <strong>{recebido.nome}: {recebido.conferencia.veredito === 'aceita' ? `aceito · ${recebido.conferencia.resumos.length} operação(ões) · ${nomeDe(recebido.chave ?? '')}` : `recusado (${recebido.conferencia.motivo}${recebido.conferencia.elo !== null ? `, elo ${recebido.conferencia.elo}` : ''})`}</strong>
      <p>{recebido.conferencia.veredito === 'aceita' ? RELACOES[recebido.relacao ?? ''] + (recebido.relacao === 'bifurcada' ? ` Primeira operação diferente: ${recebido.elo}.` : '') : `${MOTIVOS_CADEIA[recebido.conferencia.motivo ?? ''] ?? ''}. ${recebido.conferencia.detalhe}`}</p>
    </div>}
  </section>

  const minhaConta = estado?.contas.find(c => c.chave === minha)
  const meuLivro = estado?.livros.find(l => l.chave === minha)
  const participa = !!minha && G.participantes.some(p => p.chave === minha)
  const q = centesimos(quantia)

  return <div className="cadeia-pessoal moeda-teste">
    <div className="labs-result has-conflict" role="note"><strong>Unidade de teste, sem valor.</strong><p>{G.aviso} Rede {G.rede}, de {G.inicio} a {dataDe(ultimoDia(G))}; só os participantes da gênese.</p></div>

    {!local && <div className="labs-result" role="note"><strong>Assinar só pelo localhost.</strong><p>Como a cadeia pessoal, o livro é assinado pela chave deste aparelho, que não fica num site publicado. Rode o Cosmos no seu computador (npm run dev) para transferir. Aqui você confere livros recebidos.</p></div>}
    {local && cadeia && !minha && <div className="labs-result" role="note"><strong>Falta a chave.</strong><p>Crie ou restaure a sua chave em Minha cadeia: o livro usa a mesma chave.</p></div>}
    {local && minha && !participa && <div className="labs-result has-conflict" role="note"><strong>Esta chave não participa da {G.rede}.</strong><p>A gênese lista as chaves dos participantes; uma chave nova precisa de uma gênese nova (outra versão da rede).</p></div>}

    {local && participa && minhaConta && <section className="labs-surface cadeia-resumo">
      <div><p className="labs-eyebrow">VOCÊ · {nomeDe(minha!)}</p><strong>{emUnidades(minhaConta.livre)} livres</strong><small>{minhaConta.travado ? `${emUnidades(minhaConta.travado)} presas: ${minhaConta.liberacoes.map(l => `${emUnidades(l.quantia)} em ${l.em}`).join(' · ')}` : 'nada preso'}</small></div>
      <div><p className="labs-eyebrow">SEU LIVRO</p><strong>{moeda?.livro?.elos.length ?? 0} operação(ões)</strong><small>{meuLivro?.recusa ? `NÃO confere: ${meuLivro.recusa.motivo}` : `recebido ${emUnidades(minhaConta.recebido)} · enviado ${emUnidades(minhaConta.enviado)} · queimado ${emUnidades(minhaConta.queimadoNosEnvios)}`}</small></div>
      <div className="cadeia-acoes"><Button variant="outline" disabled={!moeda?.livro} onClick={() => moeda?.livro && baixar(`cosmos-livro-${minha!.slice(0, 8)}-${moeda.livro.elos.length}.json`, JSON.stringify(moeda.livro))}>Exportar o livro</Button></div>
    </section>}

    {local && participa && minhaConta && moeda && cadeia?.chave && <section className="labs-surface">
      <h3>Transferir</h3>
      <p>A operação vai assinada pela sua chave, com a data de hoje ({hoje}). Queima de {G.queimaBps / 100}%; o que chega fica preso {G.travaDias} dias. Só se gasta o saldo livre.</p>
      <form className="cadeia-form" onSubmit={e => { e.preventDefault(); void executar(async () => {
        if (q === null || q < 1) throw new Error('quantia: um número com até duas casas, maior que zero')
        if (diaDe(hoje)! < diaDe(G.inicio)!) throw new Error(`a rede começa em ${G.inicio}`)
        const texto = await montarOperacao(G, minha!, { para, quantia: q, data: hoje, motivo, referencia: motivo === 'certificado' ? referencia.trim().toLowerCase() : null })
        const { cadeia: livro } = await anexar(moeda.livro, cadeia.chave!, texto, FORMATO_LIVRO)
        // a conta da rede com a operação nova, antes de guardar: se ela não vale, nada é guardado
        const depois = await estadoDaRede(G, livrosDe(moeda, livro), recompensas, hoje)
        const meu = depois.livros.find(l => l.chave === minha)
        if (meu?.recusa) throw new Error(`a operação não vale: ${meu.recusa.motivo}`)
        await salvar({ ...moeda, livro })
        setAviso(`Operação ${livro.elos.length - 1} assinada: ${emUnidades(q)} para ${nomeDe(para)} (chegam ${emUnidades(q - queimaDe(q, G))}). Exporte o livro para levar aos outros aparelhos.`)
        setQuantia(''); setReferencia('')
      }) }}>
        <label>Para<select value={para} onChange={e => setPara(e.target.value)} required disabled={ocupado}><option value="">escolha</option>{G.participantes.filter(p => p.chave !== minha).map(p => <option key={p.chave} value={p.chave}>{p.nome} · {p.chave.slice(0, 8)}…</option>)}</select></label>
        <label>Quantia <small>unidades de teste</small><Input value={quantia} onChange={e => setQuantia(e.target.value)} placeholder="Ex.: 20" inputMode="decimal" required disabled={ocupado} /></label>
        <label>Motivo<select value={motivo} onChange={e => setMotivo(e.target.value as Motivo)} disabled={ocupado}><option value="pagamento">pagamento</option><option value="certificado">pedido de certificado</option></select></label>
        {motivo === 'certificado' && <label className="cadeia-largo">Registro pedido <small>SHA-256, 64 dígitos</small><Input value={referencia} onChange={e => setReferencia(e.target.value)} maxLength={64} required disabled={ocupado} /></label>}
        {q !== null && q > 0 && <p className="cadeia-previa" aria-live="polite">Saem {emUnidades(q)} · queimam {emUnidades(queimaDe(q, G))} · chegam {emUnidades(q - queimaDe(q, G))}, presas até {dataDe(diaDe(hoje)! + G.travaDias)}. Livre agora: {emUnidades(minhaConta.livre)}.</p>}
        <Button type="submit" disabled={ocupado || !para || q === null}>{ocupado ? 'Assinando…' : 'Assinar e anexar ao livro'}</Button>
      </form>
    </section>}

    {erro && <p className="labs-result has-conflict" role="alert">{erro}</p>}
    {aviso && <p className="labs-result" role="status">{aviso}</p>}

    {estado && <section className="labs-surface">
      <h3>A rede vista deste aparelho</h3>
      <ol className="cadeia-elos">{estado.contas.map(c => {
        const l = estado.livros.find(x => x.chave === c.chave), conflito = moeda?.conflitos.some(x => x.chave === c.chave)
        return <li key={c.chave}><span>{c.nome}</span><span>{emUnidades(c.livre)} livres · {emUnidades(c.travado)} presas</span><code title={c.chave}>{c.chave.slice(0, 12)}…</code><code>{conflito ? 'GASTO DUPLO acusado' : l?.recusa ? `recusa no elo ${l.recusa.indice ?? '—'}: ${l.recusa.motivo}` : l ? `${l.validas} operação(ões) · confere` : 'livro não recebido'}</code></li>
      })}</ol>
      <small>Emitido {emUnidades(estado.emitido)} · queimado {emUnidades(estado.queimado)} · em circulação {emUnidades(estado.emCirculacao)} · {estado.conserva ? 'a conta fecha (emitido − queimado = soma dos saldos)' : 'A CONTA NÃO FECHA'}. Recompensas publicadas: {estado.recompensas.filter(r => r.valida).length}.</small>
    </section>}

    {painelReceber}
  </div>
}
