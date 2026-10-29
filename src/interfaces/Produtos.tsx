/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button } from './ui/button'
import { consultarCatalogoLocal } from './dados'
import { pesquisarPublicos, REGISTROS_PUBLICOS } from '../v3/catalogo'
import { Labs } from './Labs'
import { Integracoes } from './Integracoes'
import { ContaApp, useContaLocal } from './Conta'
import { salvarDadosConta } from '../local/conta'
import type { InterfaceProduto } from './config'
import { Icone } from './Janela'
import { MoedaCosmos } from './Moeda'
import { MoedaTeste } from './MoedaTeste'
import { BarraCosmos, NotaLicenca } from './Navegacao'
import { criarClienteOllama } from './ollama-cliente'
import { lerProposta } from '../motor/formalizacao'
import { COMANDOS, executar, lerPedido, resumoEmTexto, type Comando, type ResultadoIA } from './assistente'
import { CartaoIA, MenuDeComandos } from './ConversaIA'
import './produtos.css'
import './referencia.css'
import './experiencia.css'

type Conversa = { id: number; pergunta: string; resposta: string }
// Sem conta, a sessão vive no módulo: trocar de tela (Labs, Terminal) e voltar não apaga a conversa. Recarregar apaga.
const sessao: { historico: Conversa[]; fio: number[]; escuro: boolean; dono: string | undefined } = { historico: [], fio: [], escuro: false, dono: undefined }
const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// os resultados da IA desta sessão, pelo id da conversa: o cofre guarda o resumo em texto, e a tela mostra o cartão
const resultadosIA = new Map<number, ResultadoIA>()

function Turno({ conversa, novo, resultado, progresso }: { conversa: Conversa; novo: boolean; resultado?: ResultadoIA; progresso?: string }) {
  // a busca mostra as fontes do catálogo; os comandos de IA, não
  const busca = !resultado && progresso === undefined && (!conversa.pergunta.startsWith('/') || conversa.pergunta.startsWith('/buscar '))
  return <section className="iai-turno" data-id={conversa.id} data-novo={novo ? '' : undefined}>
    <div className="iai-question">{conversa.pergunta}</div>
    <div className="iai-answer"><span className="iai-answer-avatar" aria-hidden="true">C</span><div><small><strong>Cosmos</strong><span className="iai-message-context">{busca ? 'Catálogo local' : 'IA local · o Z3 decide'}</span></small>
      {progresso !== undefined ? <p className="iai-progresso" role="status">{progresso}</p> : resultado ? <CartaoIA resultado={resultado} /> : <p>{conversa.resposta}</p>}
      {busca && <Fontes pergunta={conversa.pergunta.replace(/^\/buscar /, '')} />}</div></div>
  </section>
}

// as fontes da resposta: cada registro público encontrado, com o hash e o caminho para virar rascunho no Labs
function Fontes({ pergunta }: { pergunta: string }) {
  const fontes = pesquisarPublicos(pergunta.trim().slice(0, 2000)).slice(0, 9)
  if (!fontes.length) return <a className="iai-source-card" href="#/cadeia"><span><Icone nome="file" /></span><span><strong>Catálogo local</strong><small>{REGISTROS_PUBLICOS.length} registros públicos</small></span><span aria-hidden="true">›</span></a>
  return <div className="iai-fontes" aria-label="Fontes encontradas no catálogo">
    {fontes.map(f => <div className="iai-fonte" key={f.id}>
      <span className="iai-fonte-id">{f.id}</span>
      <div className="iai-fonte-dados"><strong>{f.titulo}</strong><small>{f.dominio} · estado declarado: {f.estado}</small><code title={f.hash}>sha256:{f.hash.slice(0, 16)}…</code></div>
      <div className="iai-fonte-acoes"><a href={`#/lab?secao=rascunhos&fonte=${f.id}`}>Levar ao Labs</a><a href="#/cadeia">Ver na cadeia</a></div>
    </div>)}
    <p className="iai-fonte-limite">Hash e autoria não comprovam a verdade do conteúdo. No Labs, a verificação confere o hash e a assinatura do selo.</p>
  </div>
}

function IAI() {
  const conta = useContaLocal(), dono = conta.perfil?.perfil.pubkey
  const [historicoTemporario, setHistoricoTemporario] = useState<Conversa[]>(sessao.historico), [salvando, setSalvando] = useState(false), [erro, setErro] = useState('')
  const historico = conta.dados?.conversas ?? historicoTemporario
  // o fio: as conversas à vista, em ordem; vazio mostra o guia
  const [fio, setFio] = useState<number[]>(sessao.fio), [novo, setNovo] = useState<number | null>(null)
  const [dark, setDark] = useState(sessao.escuro), [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  // a IA: o serviço local com o Ollama (no site público não há); o comando escolhido no "+" ou com "/"
  const [ia, setIa] = useState<{ cliente: ReturnType<typeof criarClienteOllama>; modelo: string } | null>(null)
  const [comando, setComando] = useState<Comando | null>(null), [menu, setMenu] = useState(false)
  const [andamento, setAndamento] = useState<{ id: number; pergunta: string; progresso: string } | null>(null), [, atualizar] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null), rolagem = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let cliente: ReturnType<typeof criarClienteOllama>
    try { cliente = criarClienteOllama(location.origin) } catch { return }
    void cliente.carregar().then((o) => { if (o.estado === 'pronto') setIa({ cliente, modelo: o.modelo }) }, () => undefined)
  }, [])
  useEffect(() => {
    // outra conta (ou sair dela) começa uma conversa limpa
    if (sessao.dono === dono) return
    sessao.dono = dono; resultadosIA.clear(); setFio([]); setQuery(''); setHistoricoTemporario([]); setErro('')
  }, [dono])
  useEffect(() => { sessao.historico = historicoTemporario; sessao.fio = fio; sessao.escuro = dark }, [historicoTemporario, fio, dark])
  const novaConversa = () => { setFio([]); setNovo(null); setQuery(''); setComando(null); setSidebar(false); input.current?.focus() }
  useEffect(() => {
    const atalho = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      if (e.key.toLowerCase() === 'k') { e.preventDefault(); novaConversa() }
      if (e.key === '/') { e.preventDefault(); input.current?.focus() }
    }
    window.addEventListener('keydown', atalho)
    return () => window.removeEventListener('keydown', atalho)
  }, [])
  // a caixa de texto cresce com o texto até 160 px; depois rola por dentro
  useLayoutEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'; el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [query])
  // a pergunta nova sobe para o topo da área de leitura; só a área rola, nunca a página
  useEffect(() => {
    const area = rolagem.current, alvo = novo === null ? null : area?.querySelector<HTMLElement>(`[data-id="${novo}"]`)
    if (!area) return
    if (!alvo) { area.scrollTo({ top: fio.length ? area.scrollHeight : 0 }); return }
    const topo = alvo.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - 16
    area.scrollTo({ top: topo, behavior: reduzMovimento() ? 'auto' : 'smooth' })
  }, [novo, fio])
  const turnos = fio.map(id => historico.find(h => h.id === id) ?? (andamento?.id === id ? { id, pergunta: andamento.pergunta, resposta: '' } : undefined)).filter((c): c is Conversa => !!c)
  // "/coma" no começo do texto abre o menu filtrado; escolher tira o "/…" do texto e põe o comando ao lado
  const barra = /^\/(\p{L}*)$/u.exec(query.split(/\s/)[0] ?? '') && !query.includes(' ') ? query.slice(1) : null
  const escolher = (c: Comando) => { setComando(c); setMenu(false); setQuery(q => q.replace(/^\/\p{L}*\s*/u, '')); input.current?.focus() }
  const guardar = async (conversa: Conversa) => {
    if (conta.perfil) await salvarDadosConta(d => ({ ...d, conversas: [conversa, ...d.conversas].slice(0, 50) }))
    else setHistoricoTemporario(h => [conversa, ...h])
  }
  const enviar = async (texto = query) => {
    if (!texto.trim() || salvando) return
    const pedido = lerPedido(texto.normalize('NFC'), comando), id = historico.reduce((m, h) => Math.max(m, h.id), andamento?.id ?? 0) + 1
    if (!pedido.texto) { setComando(pedido.comando); setQuery(''); return }
    const pergunta = `${pedido.automatico ? '' : `/${pedido.comando} `}${pedido.texto}`.slice(0, 2000)
    setSalvando(true); setErro(''); setQuery(''); setComando(null); setMenu(false)
    try {
      if (pedido.comando === 'buscar' || !ia) {
        const resposta = pedido.comando === 'buscar' ? consultarCatalogoLocal(pedido.texto) : 'A IA roda no Cosmos instalado no seu computador (Instalar-Cosmos.cmd, no repositório), com o modelo local e o Z3: o texto não sai do aparelho. Neste endereço ela não está ligada. Aqui funciona o /buscar, nos registros públicos.'
        await guardar({ id, pergunta, resposta: resposta.normalize('NFC') })
        setFio(f => [...f, id]); setNovo(id)
        return
      }
      setAndamento({ id, pergunta, progresso: 'Começando…' }); setFio(f => [...f, id]); setNovo(id)
      let resposta: string
      try {
        const r = await executar(ia.cliente, pedido.comando, pedido.texto, (c) => lerProposta(c, null), (progresso) => setAndamento(a => a && { ...a, progresso }))
        resultadosIA.set(id, r); resposta = resumoEmTexto(r)
      } catch (e) {
        const m = (e as Error).message
        resposta = m === 'limite' ? 'O modelo está ocupado com outra tarefa. Tente de novo em instantes.' : m === 'sem-servico' || m === 'indisponivel' ? 'O serviço local não respondeu. Confira se o Cosmos e o Ollama estão abertos.' : m
      }
      await guardar({ id, pergunta, resposta: resposta.normalize('NFC') })
      atualizar(n => n + 1)
    } catch { setErro('Não foi possível guardar a conversa. Confira a conta e o espaço do cofre (até 50 conversas).') }
    finally { setAndamento(null); setSalvando(false) }
  }
  const lerArquivo = (f: File | undefined) => {
    if (!f) return
    if (f.size > 80_000) { setErro('O arquivo é grande demais: até 20 mil caracteres de texto. De um PDF ou Word, copie e cole o texto.'); return }
    void f.text().then((t) => { setQuery(t.slice(0, 20_000)); setComando('revisar'); input.current?.focus() })
  }
  const exemplo = (c: Comando) => { setComando(c); setQuery(COMANDOS.find(x => x.nome === c)!.exemplo); input.current?.focus() }
  const descricao = comando && COMANDOS.find(c => c.nome === comando)
  return <div className={`product-root iai-app reference-app ${dark ? 'iai-dark' : ''}`}>
    <BarraCosmos atual="i-ai" />
    <div className="iai-body">
      <aside className={`iai-sidebar ${sidebar ? 'is-open' : ''}`}>
        <Button className="iai-new" onClick={novaConversa}><span>＋</span> Nova conversa</Button>
        <nav className="iai-primary-nav" aria-label="Navegação da conversa">
          <button className="active" onClick={() => { setSidebar(false); input.current?.focus() }}><Icone nome="chat" />Conversas</button>
          <a href="#/lab?secao=cadeia"><Icone nome="link" />Minha cadeia</a>
          <a href="#/lab"><Icone nome="tools" />Avançado</a>
          <a href="#/integracoes"><Icone nome="settings" />Configurações</a>
        </nav>
        <div className="iai-history"><p>{historico.length ? 'Histórico' : 'Comece por aqui'}</p>{historico.map(h => <button key={h.id} className={fio.includes(h.id) ? 'active' : ''} onClick={() => { setFio([h.id]); setNovo(h.id); setSidebar(false) }}>{h.pergunta}</button>)}
          {!historico.length && COMANDOS.map(c => <button key={c.nome} onClick={() => { exemplo(c.nome); setSidebar(false) }}>/{c.nome} · {c.titulo}</button>)}
        </div>
        <div className="iai-sidebar-footer"><button onClick={() => setDark(!dark)} aria-label="Alternar tema Cosmos">{dark ? 'Tema claro' : 'Tema escuro'}</button><p className="iai-history-note">{conta.perfil ? 'Conversas guardadas no cofre, cifradas no aparelho' : 'Sem conta: a conversa some ao recarregar. Entre para guardar no cofre.'}</p></div>
      </aside>
      <main className="iai-main"><header className="iai-mobile-header"><button className="iai-mobile-menu" aria-label="Abrir histórico" aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}>☰</button><span>Conversa</span><button aria-label="Nova conversa" onClick={novaConversa}>＋</button></header>
        <div className="iai-content has-conversation" ref={rolagem}><article className="iai-conversation" aria-label={turnos.length ? 'Conversa com o Cosmos' : 'Guia da Conversa'} aria-live="polite">
          {turnos.length ? turnos.map(c => <Turno key={c.id} conversa={c} novo={c.id === novo} resultado={resultadosIA.get(c.id)} progresso={andamento?.id === c.id ? andamento.progresso : undefined} />)
            : <section className="iai-turno"><div className="iai-answer"><span className="iai-answer-avatar" aria-hidden="true">C</span><div><small><strong>Cosmos</strong><span className="iai-message-context">{ia ? `IA local · ${ia.modelo}` : 'Guia'}</span></small>
              <p>Escreva um argumento ou cole um plano. O Cosmos traduz para lógica e o Z3 diz o que decorre dos fatos (provado) e o que é salto. O que se avalia é o argumento, não a pessoa. Toque em <b>+</b> ou digite <b>/</b> para escolher o que fazer:</p>
              <div className="iai-guia-comandos">{COMANDOS.map(c => <button key={c.nome} onClick={() => exemplo(c.nome)} disabled={c.ia && !ia}><strong>/{c.nome}</strong> · {c.titulo}<small>{c.descricao}</small></button>)}</div>
              {!ia && <p className="iai-fonte-limite">Neste endereço a IA não está ligada: ela roda no Cosmos instalado no seu computador (Instalar-Cosmos.cmd), e o texto não sai dele. Aqui funciona o /buscar.</p>}
            </div></div></section>}
        </article></div>
        <div className="iai-composer-area">
          {(menu || barra !== null) && <MenuDeComandos filtro={barra ?? ''} ia={!!ia} aoEscolher={escolher} />}
          <form className="iai-composer" onSubmit={e => { e.preventDefault(); void enviar() }}>
            <textarea ref={input} rows={1} aria-label="Escreva para o Cosmos" placeholder={descricao ? descricao.descricao : 'Escreva um argumento, cole um plano ou digite / para os comandos'} value={query} maxLength={20_000} enterKeyHint="send" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setMenu(false); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (barra !== null) { const c = COMANDOS.find(x => x.nome.startsWith(barra.toLowerCase())); if (c && (!c.ia || ia)) escolher(c.nome); return } void enviar() } }} />
            <div className="iai-composer-barra">
              <button type="button" className="iai-mais" aria-label="Comandos" aria-expanded={menu} onClick={() => setMenu(m => !m)}>+</button>
              <label className="iai-anexo" title="Abrir um arquivo de texto (.txt ou .md) para revisar"><Icone nome="paperclip" /><input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={!ia || salvando} onChange={e => { lerArquivo(e.target.files?.[0]); e.target.value = '' }} /></label>
              {comando && <span className="iai-chip">/{comando}<button type="button" aria-label="Tirar o comando" onClick={() => setComando(null)}>×</button></span>}
              <span className="iai-espaco" />
              <Button size="icon" aria-label="Enviar" disabled={!query.trim() || salvando} type="submit"><Icone nome="send" /></Button>
            </div>
          </form>
          <p>{ia ? `IA local (${ia.modelo}) neste computador · o Z3 decide · o texto não sai daqui` : 'IA não ligada neste endereço · /buscar funciona'}</p><NotaLicenca />{erro && <p role="alert">{erro}</p>}</div>
      </main>
    </div>
  </div>
}

/**
 * O Terminal: a rede de teste cosmos-teste-1 de verdade (saldos, transferências assinadas, livros recebidos e a conta
 * da rede), sem preço nem mercado inventados. A moeda Cosmos está em fase de lançamento e ainda não existe; as regras da
 * rede de teste (especificacao/moeda-teste.md) pedem que a tela diga que as unidades de teste não viram moeda real.
 */
function TerminalComercial() {
  return <div className="product-root labs-app reference-app terminal-rede"><BarraCosmos atual="terminal" />
    <main className="labs-main">
      <header className="labs-topbar"><div>Cosmos <span>/</span> Avançado <span>/</span> <strong>Terminal</strong></div><span className="labs-local"><i /> Rede de teste cosmos-teste-1</span></header>
      <section className="labs-page-heading"><div><p className="labs-eyebrow">TERMINAL · REDE DE TESTE</p><h1>Terminal</h1><p>Saldos, transferências assinadas e livros da rede de teste cosmos-teste-1, conferidos neste aparelho. Nada aqui é simulado.</p></div><MoedaCosmos tamanho={56} /></section>
      <div className="labs-result has-conflict" role="note"><strong>A moeda Cosmos está em fase de lançamento.</strong><p>Ela ainda não existe: não tem preço, não está à venda e não se compra nem se troca em lugar nenhum. O que funciona aqui é a rede de teste cosmos-teste-1, com unidades de teste sem valor, só entre os participantes convidados. As unidades de teste não viram moeda Cosmos e não dão direito a nada no futuro.</p></div>
      <MoedaTeste />
      <NotaLicenca />
    </main>
  </div>
}

export function ProdutosApp({ rota }: { rota: InterfaceProduto | 'integracoes' }) {
  useEffect(() => { const anterior = document.title; window.scrollTo(0, 0); document.title = rota === 'integracoes' ? 'Cosmos — Integrações' : rota === 'conta' ? 'Cosmos — Conta local' : rota === 'i-ai' ? 'Cosmos — Conversa' : rota === 'lab' ? 'Cosmos — Labs' : 'Cosmos — Terminal'; return () => { document.title = anterior } }, [rota])
  return rota === 'integracoes' ? <Integracoes navigation={null} /> : rota === 'conta' ? <ContaApp navigation={null} /> : rota === 'i-ai' ? <IAI /> : rota === 'lab' ? <Labs navigation={null} /> : <TerminalComercial />
}
