/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { anexar, criarChave, deduzirFichas, montarRegistroFechado, MOTIVOS_CADEIA, receber, restaurarChave, SENHA_MINIMA, type DadosRegistro, type Recebimento } from './cadeiaLocal'
import { gravarEstado, lerEstado, type EstadoCadeiaLocal } from './armazemCadeia'
import { conferirCadeia, deHex, type ConferenciaDaCadeia } from '../motor/cadeiaPessoal'
import { AFIRMACOES, ESTADOS, sha256, TIPOS, type Afirmacao } from '../motor/registro'
import { somenteHostLocal } from '../v4/localnet'

function baixar(nome: string, texto: string) {
  const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' })), a = document.createElement('a')
  a.href = url; a.download = nome; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
const lerArquivo = (f: File) => f.size > 5 * 1024 * 1024 ? Promise.reject(new Error('arquivo maior que 5 MB')) : f.text()
const NOMES_AFIRMACAO: Record<Afirmacao, string> = { segue: 'segue das premissas', contradiz: 'contradiz as premissas', 'nao-segue': 'não segue das premissas', consistente: 'é consistente com as premissas' }
const RELACOES: Record<string, string> = {
  nova: 'Cadeia nova para este aparelho: guardada como a versão conhecida desta chave.',
  igual: 'Igual à versão que este aparelho já tinha.',
  extensao: 'Extensão da versão conhecida: a antiga é o começo da nova. Trocada pela nova.',
  encurtada: 'ALTERAÇÃO: a versão recebida é mais curta do que a conhecida. Some o que a chave já tinha publicado. A versão conhecida foi mantida.',
  bifurcada: 'ALTERAÇÃO: a mesma chave assinou duas histórias diferentes. As duas versões ficam guardadas como prova.',
  'outra-chave': 'Cadeia de outra chave.',
}

/**
 * Fase 3: a cadeia pessoal num aparelho. Criar a chave e assinar só pelo localhost (como a conta local); conferir
 * uma cadeia recebida funciona em qualquer lugar, porque não usa chave nenhuma.
 */
export function CadeiaPessoal({ inicial }: { inicial?: { formula: string; dominio: string } | null }) {
  const local = somenteHostLocal(location.hostname)
  const [estado, setEstado] = useState<EstadoCadeiaLocal | null>(null)
  const [conferencia, setConferencia] = useState<ConferenciaDaCadeia | null>(null)
  const [autor, setAutor] = useState('')
  const [erro, setErro] = useState(''), [aviso, setAviso] = useState(''), [ocupado, setOcupado] = useState(false)
  const [recebido, setRecebido] = useState<(Recebimento & { nome: string }) | null>(null)
  const senha = useRef<HTMLInputElement>(null), confirmar = useRef<HTMLInputElement>(null), senhaRestaurar = useRef<HTMLInputElement>(null)
  const [dados, setDados] = useState<DadosRegistro>({ afirmacao: 'consistente', formula: inicial?.formula ?? '', premissas: [], teoriaNome: 'Minha teoria v1', tipo: 'hipótese', dominio: inicial?.dominio || 'geral', estado: 'proposta' })
  const [premissasTexto, setPremissasTexto] = useState('')

  useEffect(() => { void lerEstado().then(setEstado).catch(() => setErro('Este navegador não deixa guardar a cadeia (IndexedDB indisponível).')) }, [])
  useEffect(() => {
    if (!estado?.cadeia) { setConferencia(null); return }
    void conferirCadeia(estado.cadeia).then(setConferencia)
  }, [estado?.cadeia])
  useEffect(() => { if (estado?.chave) void sha256(deHex(estado.chave.publica)).then(setAutor) }, [estado?.chave])

  const salvar = async (novo: EstadoCadeiaLocal) => { await gravarEstado(novo); setEstado(novo) }
  const executar = async (acao: () => Promise<void>) => {
    if (ocupado) return
    setOcupado(true); setErro(''); setAviso('')
    try { await acao() } catch (e) { setErro(e instanceof Error ? e.message : 'operação recusada') } finally { setOcupado(false) }
  }
  const premissas = premissasTexto.split('\n').map(l => l.trim()).filter(Boolean)
  const previa = useMemo(() => dados.formula.trim() ? deduzirFichas([dados.formula, ...premissas]) : null, [dados.formula, premissasTexto])
  const mudar = (campo: Partial<DadosRegistro>) => setDados(d => {
    const n = { ...d, ...campo }
    // "segue" vai com teorema, e teorema só com "segue"
    if (campo.afirmacao) n.tipo = campo.afirmacao === 'segue' ? 'teorema' : d.tipo === 'teorema' ? 'hipótese' : d.tipo
    return n
  })

  if (!estado) return <section className="labs-surface cadeia-pessoal"><p>{erro || 'Abrindo a cadeia guardada neste navegador…'}</p></section>

  const receberArquivo = (f: File | undefined) => f && executar(async () => {
    const texto = await lerArquivo(f)
    const r = await receber(texto, estado.conhecidas)
    setRecebido({ ...r, nome: f.name })
    if (r.conferencia.veredito !== 'aceita' || !r.chave) return
    const agora = new Date().toISOString()
    const versao = { chave: r.chave, resumos: r.conferencia.resumos, recebidaEm: agora, texto }
    if (r.relacao === 'nova' || r.relacao === 'extensao') await salvar({ ...estado, conhecidas: [...estado.conhecidas.filter(v => v.chave !== r.chave), versao] })
    if (r.relacao === 'bifurcada') await salvar({ ...estado, conflitos: [...estado.conflitos, { chave: r.chave, elo: r.elo ?? 0, texto, recebidaEm: agora }] })
  })

  const painelReceber = <section className="labs-surface cadeia-receber">
    <h3>Conferir uma cadeia recebida</h3>
    <p>Abra o arquivo de cadeia que veio de outro aparelho. A conferência refaz cada elo (C1–C8) e compara com a versão que este aparelho já tinha da mesma chave. Não usa chave nenhuma.</p>
    <label className="cadeia-arquivo"><span>Escolher arquivo .json</span><input type="file" accept="application/json,.json" disabled={ocupado} onChange={e => { receberArquivo(e.target.files?.[0]); e.target.value = '' }} /></label>
    {recebido && <div className="cadeia-recebido" data-veredito={recebido.conferencia.veredito} data-relacao={recebido.relacao ?? ''} role="status">
      <strong>{recebido.nome}: {recebido.conferencia.veredito === 'aceita' ? `aceita · ${recebido.conferencia.resumos.length} elo(s)` : `recusada (${recebido.conferencia.motivo}${recebido.conferencia.elo !== null ? `, elo ${recebido.conferencia.elo}` : ''})`}</strong>
      <p>{recebido.conferencia.veredito === 'aceita' ? RELACOES[recebido.relacao ?? ''] + (recebido.relacao === 'bifurcada' ? ` Primeiro elo diferente: ${recebido.elo}.` : '') : `${MOTIVOS_CADEIA[recebido.conferencia.motivo ?? ''] ?? ''}. ${recebido.conferencia.detalhe}`}</p>
    </div>}
    {estado.conhecidas.length > 0 && <details><summary>Versões conhecidas neste aparelho ({estado.conhecidas.length}){estado.conflitos.length ? ` · ${estado.conflitos.length} conflito(s) guardado(s)` : ''}</summary><ul>{estado.conhecidas.map(v => <li key={v.chave}><code>{v.chave.slice(0, 16)}…</code> · {v.resumos.length} elo(s) · recebida em {v.recebidaEm.slice(0, 16).replace('T', ' ')}</li>)}</ul></details>}
  </section>

  if (!local) return <div className="cadeia-pessoal">
    <div className="labs-result" role="note"><strong>Criar a chave e assinar só pelo localhost.</strong><p>Como a conta local, a chave da cadeia não fica num site publicado, onde outro código do mesmo endereço poderia usá-la. Rode o Cosmos no seu computador (npm run dev) para criar e assinar. Aqui você confere cadeias recebidas.</p></div>
    {painelReceber}
  </div>

  if (!estado.chave) return <div className="cadeia-pessoal">
    <section className="labs-surface">
      <h3>Criar a sua chave</h3>
      <p>Uma chave Ed25519 para este aparelho. A chave privada fica no navegador sem poder ser exportada; a única cópia legível é um arquivo cifrado com a sua senha, que você baixa agora. Sem o arquivo e a senha, perder o aparelho é perder a cadeia: não há recuperação.</p>
      <form className="cadeia-form" onSubmit={e => { e.preventDefault(); void executar(async () => {
        const s = senha.current?.value ?? '', c = confirmar.current?.value ?? ''
        if (s !== c) throw new Error('as senhas não são iguais')
        const { chave, copia } = await criarChave(s)
        baixar(`cosmos-chave-${chave.publica.slice(0, 8)}.json`, JSON.stringify(copia, null, 2))
        await salvar({ ...estado, chave })
        setAviso('Chave criada. A cópia cifrada foi baixada: guarde o arquivo e a senha em lugares diferentes.')
      }).finally(() => { if (senha.current) senha.current.value = ''; if (confirmar.current) confirmar.current.value = '' }) }}>
        <label>Senha da cópia <small>pelo menos {SENHA_MINIMA} caracteres</small><Input ref={senha} type="password" autoComplete="new-password" minLength={SENHA_MINIMA} required disabled={ocupado} /></label>
        <label>Confirmar a senha<Input ref={confirmar} type="password" autoComplete="new-password" minLength={SENHA_MINIMA} required disabled={ocupado} /></label>
        <Button type="submit" disabled={ocupado}>{ocupado ? 'Criando…' : 'Criar chave e baixar a cópia'}</Button>
      </form>
    </section>
    <section className="labs-surface">
      <h3>Já tenho uma cópia</h3>
      <form className="cadeia-form" onSubmit={e => { e.preventDefault(); const f = (e.currentTarget.elements.namedItem('copia') as HTMLInputElement).files?.[0]; void executar(async () => {
        if (!f) throw new Error('escolha o arquivo da cópia')
        const chave = await restaurarChave(await lerArquivo(f), senhaRestaurar.current?.value ?? '')
        await salvar({ ...estado, chave, cadeia: estado.cadeia?.chave === chave.publica ? estado.cadeia : null })
        setAviso('Chave restaurada neste aparelho. Para continuar a mesma cadeia, abra também o arquivo da cadeia em "Conferir uma cadeia recebida" e depois em "Continuar esta cadeia".')
      }).finally(() => { if (senhaRestaurar.current) senhaRestaurar.current.value = '' }) }}>
        <label>Arquivo da cópia<input name="copia" type="file" accept="application/json,.json" disabled={ocupado} /></label>
        <label>Senha<Input ref={senhaRestaurar} type="password" autoComplete="current-password" required disabled={ocupado} /></label>
        <Button type="submit" variant="outline" disabled={ocupado}>Restaurar a chave</Button>
      </form>
    </section>
    {erro && <p className="labs-result has-conflict" role="alert">{erro}</p>}
    {aviso && <p className="labs-result" role="status">{aviso}</p>}
    {painelReceber}
  </div>

  const chave = estado.chave
  const conhecidaDaMinha = estado.conhecidas.find(v => v.chave === chave.publica)
  return <div className="cadeia-pessoal">
    <section className="labs-surface cadeia-resumo">
      <div><p className="labs-eyebrow">SUA CHAVE</p><code title={chave.publica}>{chave.publica.slice(0, 24)}…</code><small>autor (SHA-256 da chave): <code>{autor.slice(0, 16)}…</code></small></div>
      <div><p className="labs-eyebrow">SUA CADEIA</p>{estado.cadeia ? <><strong>{estado.cadeia.elos.length} registro(s)</strong><small>{conferencia ? conferencia.veredito === 'aceita' ? `confere (C1–C8) · resumo ${conferencia.cabeca?.slice(0, 16)}…` : `NÃO confere: ${conferencia.motivo}` : 'conferindo…'}</small></> : <small>vazia: o primeiro registro começa a cadeia</small>}</div>
      <div className="cadeia-acoes">
        <Button variant="outline" disabled={!estado.cadeia} onClick={() => estado.cadeia && baixar(`cosmos-cadeia-${chave.publica.slice(0, 8)}-${estado.cadeia.elos.length}.json`, JSON.stringify(estado.cadeia))}>Exportar a cadeia</Button>
        <Button variant="outline" disabled={!estado.revelacoes.length} title="Contém as fórmulas em claro: guarde em particular até revelar" onClick={() => baixar(`cosmos-revelacoes-${chave.publica.slice(0, 8)}.json`, JSON.stringify(estado.revelacoes, null, 2))}>Exportar as revelações</Button>
        {!estado.cadeia && conhecidaDaMinha && <Button variant="outline" onClick={() => void executar(async () => { await salvar({ ...estado, cadeia: JSON.parse(conhecidaDaMinha.texto) }); setAviso('Continuando a cadeia recebida desta chave.') })}>Continuar esta cadeia</Button>}
      </div>
    </section>

    <section className="labs-surface">
      <h3>Novo registro na cadeia</h3>
      <p>O registro vai <strong>fechado</strong> (registro-v1): a cadeia guarda a afirmação, o tipo, o domínio, o hash da teoria e o compromisso da fórmula, assinados pela sua chave. A fórmula e as premissas ficam neste aparelho, nas revelações, para abrir o registro depois, junto com o certificado. O compromisso prova que a fórmula já existia, sem mostrá-la.</p>
      <form className="cadeia-form cadeia-registro" onSubmit={e => { e.preventDefault(); void executar(async () => {
        const { registroTexto, revelacao } = await montarRegistroFechado({ ...dados, premissas }, chave.publica)
        const { cadeia, conferencia: c } = await anexar(estado.cadeia, chave, registroTexto)
        await salvar({ ...estado, cadeia, revelacoes: [...estado.revelacoes, { indice: cadeia.elos.length - 1, revelacao }] })
        setAviso(`Registro ${cadeia.elos.length - 1} assinado e anexado. A cadeia confere (resumo ${c.cabeca?.slice(0, 16)}…). Exporte a cadeia para levar a outro aparelho.`)
        setDados(d => ({ ...d, formula: '' })); setPremissasTexto('')
      }) }}>
        <label className="cadeia-largo">Fórmula (m2)<Input value={dados.formula} onChange={e => mudar({ formula: e.target.value })} placeholder="Ex.: ∀x (Ave(x) ⟹ Voa(x))" maxLength={2000} required disabled={ocupado} /></label>
        <label className="cadeia-largo">Premissas <small>uma por linha, opcional</small><textarea value={premissasTexto} onChange={e => setPremissasTexto(e.target.value)} rows={3} maxLength={6000} disabled={ocupado} placeholder="Ex.: Ave(piu)" /></label>
        <label>A fórmula…<select value={dados.afirmacao} onChange={e => mudar({ afirmacao: e.target.value as Afirmacao })} disabled={ocupado}>{AFIRMACOES.map(a => <option key={a} value={a}>{NOMES_AFIRMACAO[a]}</option>)}</select></label>
        <label>Tipo<select value={dados.tipo} onChange={e => mudar({ tipo: e.target.value as DadosRegistro['tipo'] })} disabled={ocupado || dados.afirmacao === 'segue'}>{TIPOS.filter(t => (t === 'teorema') === (dados.afirmacao === 'segue')).map(t => <option key={t}>{t}</option>)}</select></label>
        <label>Teoria<Input value={dados.teoriaNome} onChange={e => mudar({ teoriaNome: e.target.value })} maxLength={80} required disabled={ocupado} /></label>
        <label>Domínio<Input value={dados.dominio} onChange={e => mudar({ dominio: e.target.value })} maxLength={80} required disabled={ocupado} /></label>
        <label>Estado declarado<select value={dados.estado} onChange={e => mudar({ estado: e.target.value as DadosRegistro['estado'] })} disabled={ocupado}>{ESTADOS.map(t => <option key={t}>{t}</option>)}</select></label>
        {previa && <p className={`cadeia-previa ${previa.erro ? 'has-conflict' : ''}`} aria-live="polite">{previa.erro ? `A m2 não lê: ${previa.erro}` : `Fichas deduzidas: ${previa.fichas.map(f => `${f.simbolo} (${f.tipo}${f.aridade ? `/${f.aridade}` : ''}${f.numerico ? ', número' : ''})`).join(' · ') || 'nenhuma'}`}</p>}
        <Button type="submit" disabled={ocupado || !dados.formula.trim() || !!previa?.erro}>{ocupado ? 'Assinando…' : 'Assinar e anexar à cadeia'}</Button>
      </form>
    </section>

    {erro && <p className="labs-result has-conflict" role="alert">{erro}</p>}
    {aviso && <p className="labs-result" role="status">{aviso}</p>}

    {estado.cadeia && <section className="labs-surface">
      <h3>Elos</h3>
      <ol className="cadeia-elos">{estado.cadeia.elos.map((e, i) => { const r = JSON.parse(e.registroTexto) as { afirmacao: string; tipo: string; dominio: string; compromisso: { hash: string } }; return <li key={i}><span>#{i}</span><span>{r.tipo} · {r.afirmacao} · {r.dominio}</span><code title={r.compromisso.hash}>compromisso {r.compromisso.hash.slice(0, 12)}…</code><code title={conferencia?.resumos[i]}>resumo {conferencia?.resumos[i]?.slice(0, 12) ?? '…'}…</code></li> })}</ol>
      <small>Cada elo guarda o resumo do anterior e vai assinado pela sua chave: mudar, tirar ou pôr um registro no meio faz a conferência acusar.</small>
    </section>}

    {painelReceber}
  </div>
}
