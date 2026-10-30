/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Button } from './ui/button'
import { Labs } from './Labs'
import { Integracoes } from './Integracoes'
import { ContaApp, useContaLocal } from './Conta'
import type { InterfaceProduto } from './config'
import { Icone } from './Janela'
import { MoedaCosmos } from './Moeda'
import { MoedaTeste } from './MoedaTeste'
import { BarraCosmos, NotaLicenca } from './Navegacao'
import { clienteIA, esquecerSessaoIA, ligarComSenha, obterSessaoIA, observarSessaoIA } from './sessao-ia'
import { abrirHistoricoIA, conversasDoIndice, gravarMensagemIA, lerMensagemIA, type EntradaIA, type MensagemIA } from './historico-ia'
import { lerProposta } from '../motor/formalizacao'
import type { Termo } from '../motor/avaliacao'
import { COMANDOS, executar, lerPedido, respostaAfirmacao, resumoEmTexto, type Comando, type ResultadoIA } from './assistente'
import { CartaoIA, MenuDeComandos } from './ConversaIA'
import './produtos.css'
import './referencia.css'
import './experiencia.css'

type Turno = { id: number; pergunta: string; resposta: string; resultado?: ResultadoIA }
const reduzMovimento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
// a conversa aberta e o tema continuam ao trocar de tela e voltar
const sessao: { fio: number | null; escuro: boolean; dono: string | undefined } = { fio: null, escuro: false, dono: undefined }
// as mensagens já lidas do histórico selado (e as desta sessão), pelo id
const cache = new Map<number, MensagemIA>()
// os fios do formato antigo (só ids, neste navegador): servem uma vez, para importar as conversas do cofre
const lerFiosAntigos = (dono: string): number[][] => { try { const v = JSON.parse(localStorage.getItem(`cosmos:conversa:fios:${dono.slice(0, 16)}`) ?? '[]'); return Array.isArray(v) ? v.filter((f): f is number[] => Array.isArray(f) && f.every(Number.isSafeInteger)) : [] } catch { return [] } }

function TurnoIA({ turno, novo, progresso, aoRefazer }: { turno: Turno; novo: boolean; progresso?: string; aoRefazer?: (r: ResultadoIA, v: Termo[]) => void }) {
  const { resultado } = turno
  return <section className="iai-turno" data-id={turno.id} data-novo={novo ? '' : undefined}>
    <div className="iai-question">{turno.pergunta}</div>
    <div className="iai-answer"><span className="iai-answer-avatar" aria-hidden="true">C</span><div><small><strong>Cosmos</strong></small>
      {progresso !== undefined ? <p className="iai-progresso" role="status">{progresso}</p> : resultado ? <CartaoIA resultado={resultado} aoRefazer={aoRefazer && ((v) => aoRefazer(resultado, v))} /> : turno.resposta ? <p>{turno.resposta}</p> : <p className="iai-progresso">Abrindo…</p>}</div></div>
  </section>
}

type EstadoIA = { estado: 'conectando' } | { estado: 'fora'; local: boolean } | { estado: 'ligada'; modelo: string; nuvem?: string; exigeSessao: boolean }
// a escolha do modelo grande na nuvem fica neste aparelho; começa desligada (o texto sai do computador quando liga)
const NUVEM_ESCOLHIDA = 'cosmos:conversa:nuvem'
const lerEscolhaNuvem = () => { try { return localStorage.getItem(NUVEM_ESCOLHIDA) === '1' } catch { return false } }
const ENDERECO_LOCAL = 'http://127.0.0.1:4175/cosmos/#/i-ai'
const useSessaoIA = () => useSyncExternalStore(observarSessaoIA, obterSessaoIA)

/** Sem conta aberta, a Conversa não abre: a IA e o histórico são da conta. */
function EntrarParaUsar() {
  return <section className="iai-welcome iai-portao">
    <span className="iai-portao-selo" aria-hidden="true"><Icone nome="shield" /></span>
    <h1>Entre na sua conta para usar a Conversa</h1>
    <p>A IA e o histórico ficam presos à sua conta: as conversas são cifradas com a sua senha, neste computador, e o modelo só atende a conta dona. Sem a conta aberta, ninguém usa a IA, nem outro programa do computador.</p>
    <a className="iai-portao-botao" href="#/conta">Entrar ou criar conta</a>
  </section>
}

/** O serviço da IA reiniciou ou a sessão caiu: a senha religa (ela só assina o desafio; não sai do aparelho). */
function LigarComSenha() {
  const [senha, setSenha] = useState(''), [ocupado, setOcupado] = useState(false), [erro, setErro] = useState('')
  return <form className="iai-ligar" onSubmit={e => { e.preventDefault(); setOcupado(true); setErro(''); void ligarComSenha(senha).catch((x) => setErro((x as Error).message)).finally(() => { setOcupado(false); setSenha('') }) }}>
    <span>A IA precisa ser ligada à sua conta. Digite a senha:</span>
    <input type="password" autoComplete="current-password" aria-label="Senha da conta" value={senha} onChange={e => setSenha(e.target.value)} disabled={ocupado} />
    <Button type="submit" disabled={!senha || ocupado}>{ocupado ? 'Ligando…' : 'Ligar a IA'}</Button>
    {erro && <small role="alert">{erro}</small>}
  </form>
}

function IAI() {
  const conta = useContaLocal(), dono = conta.perfil?.perfil.pubkey
  const sessaoIA = useSessaoIA()
  const [indice, setIndice] = useState<EntradaIA[] | null>(null), indiceAtual = useRef<EntradaIA[]>([])
  const [fio, setFio] = useState<number | null>(sessao.fio), [novo, setNovo] = useState<number | null>(null)
  const [salvando, setSalvando] = useState(false), [erro, setErro] = useState('')
  const [dark, setDark] = useState(sessao.escuro), [query, setQuery] = useState('')
  const [sidebar, setSidebar] = useState(false)
  // a IA: o serviço local com o Ollama; enquanto não responde, tenta de novo a cada 8 s (o serviço pode estar subindo)
  const [ia, setIa] = useState<EstadoIA>({ estado: 'conectando' })
  const [comando, setComando] = useState<Comando | null>(null), [menu, setMenu] = useState(false)
  const [usarNuvem, setUsarNuvem] = useState(lerEscolhaNuvem)
  const escolherNuvem = (sim: boolean) => { setUsarNuvem(sim); try { localStorage.setItem(NUVEM_ESCOLHIDA, sim ? '1' : '0') } catch { /* fica só nesta página */ } }
  const [andamento, setAndamento] = useState<{ id: number; pergunta: string; progresso: string } | null>(null), [, atualizar] = useState(0)
  const input = useRef<HTMLTextAreaElement>(null), rolagem = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const cliente = clienteIA()
    if (!cliente) { setIa({ estado: 'fora', local: false }); return }
    let parado = false, timer: ReturnType<typeof setTimeout> | undefined
    const tentar = () => void cliente.carregar().then((o) => {
      if (parado) return
      if (o.estado === 'pronto') setIa({ estado: 'ligada', modelo: o.modelo, exigeSessao: o.sessao === 'exigida', ...(o.nuvem ? { nuvem: o.nuvem } : {}) })
      else { setIa({ estado: 'fora', local: true }); timer = setTimeout(tentar, 8000) }
    }, () => { if (!parado) { setIa({ estado: 'fora', local: true }); timer = setTimeout(tentar, 8000) } })
    tentar()
    return () => { parado = true; clearTimeout(timer) }
  }, [])
  // a conta (ou a troca dela) abre o histórico selado dela; sem conta, nada fica na memória
  useEffect(() => {
    if (sessao.dono !== dono) { sessao.dono = dono; sessao.fio = null; cache.clear(); setFio(null); setQuery(''); setErro('') }
    if (!dono) { setIndice(null); indiceAtual.current = []; return }
    let vivo = true
    void abrirHistoricoIA(conta.dados?.conversas ?? [], lerFiosAntigos(dono)).then((i) => { if (vivo) { indiceAtual.current = i; setIndice(i) } }, (e) => { if (vivo) setErro(`Não foi possível abrir o histórico: ${(e as Error).message}`) })
    return () => { vivo = false }
  }, [dono])
  useEffect(() => { sessao.fio = fio; sessao.escuro = dark }, [fio, dark])
  // as mensagens da conversa aberta que ainda não foram lidas do histórico
  useEffect(() => {
    if (!indice || fio === null) return
    const faltam = indice.filter(e => e.fio === fio && !cache.has(e.id))
    if (!faltam.length) return
    let vivo = true
    void Promise.all(faltam.map(e => lerMensagemIA(e.id).then(m => { if (m) cache.set(m.id, m) }))).then(() => { if (vivo) atualizar(n => n + 1) }, () => undefined)
    return () => { vivo = false }
  }, [indice, fio])
  const novaConversa = () => { setFio(null); setNovo(null); setQuery(''); setComando(null); setSidebar(false); input.current?.focus() }
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
    if (!alvo) { area.scrollTo({ top: fio !== null ? area.scrollHeight : 0 }); return }
    const topo = alvo.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - 16
    area.scrollTo({ top: topo, behavior: reduzMovimento() ? 'auto' : 'smooth' })
  }, [novo, fio])
  const turnos: Turno[] = fio === null ? [] : [
    ...(indice ?? []).filter(e => e.fio === fio).sort((a, b) => a.id - b.id).map(e => cache.get(e.id) ?? { id: e.id, pergunta: e.titulo, resposta: '' }),
    ...(andamento && !(indice ?? []).some(e => e.id === andamento.id) ? [{ id: andamento.id, pergunta: andamento.pergunta, resposta: '' }] : []),
  ]
  const conversas = conversasDoIndice(indice ?? [])
  // "/coma" no começo do texto abre o menu filtrado; escolher tira o "/…" do texto e põe o comando ao lado
  const barra = /^\/\p{L}*$/u.test(query) ? query.slice(1) : null
  const escolher = (c: Comando) => { setComando(c); setMenu(false); setQuery(q => q.replace(/^\/\p{L}*\s*/u, '')); input.current?.focus() }
  const guardar = async (m: MensagemIA) => {
    cache.set(m.id, m)
    indiceAtual.current = await gravarMensagemIA(m, indiceAtual.current)
    setIndice(indiceAtual.current)
  }
  const sessaoPronta = ia.estado === 'ligada' && (!ia.exigeSessao || sessaoIA.estado === 'ligada')
  const enviar = async (texto = query, vocabulario?: Termo[]) => {
    if (!texto.trim() || salvando || !dono) return
    const pedido = lerPedido(texto.normalize('NFC'), comando)
    const id = Math.max(0, ...indiceAtual.current.map(e => e.id), andamento?.id ?? 0) + 1, fioDaMensagem = fio ?? id
    if (!pedido.texto) { if (pedido.comando !== 'afirmacao') setComando(pedido.comando); setQuery(''); return }
    const pergunta = `${pedido.automatico ? '' : `/${pedido.comando} `}${pedido.texto}`.slice(0, 2000)
    const em = new Date().toISOString()
    setSalvando(true); setErro(''); setQuery(''); setComando(null); setMenu(false); setFio(fioDaMensagem); setNovo(id)
    try {
      if (pedido.comando === 'afirmacao' || !sessaoPronta) {
        const resposta = pedido.comando === 'afirmacao' ? respostaAfirmacao(pedido.texto)
          : ia.estado === 'conectando' ? 'A IA ainda está conectando. Tente de novo em alguns segundos.'
          : ia.estado === 'fora' && ia.local ? 'O serviço local não respondeu. Abra o Ollama e o atalho "Cosmos" (ou rode Abrir-Cosmos-IA.cmd); esta página tenta de novo sozinha a cada poucos segundos.'
          : ia.estado === 'fora' ? `Neste endereço a IA não roda: ela fica no seu computador, com o modelo local e o Z3, e o texto não sai dele. Instale com o Instalar-Cosmos.cmd e abra ${ENDERECO_LOCAL}.`
          : 'A IA ainda não está ligada à sua conta. Use o campo de senha abaixo da caixa de texto e mande de novo.'
        await guardar({ id, fio: fioDaMensagem, pergunta, resposta: resposta.normalize('NFC'), em })
        return
      }
      setAndamento({ id, pergunta, progresso: 'Começando…' })
      let resposta: string, resultado: ResultadoIA | undefined
      try {
        resultado = await executar(clienteIA()!, pedido.comando, pedido.texto, (c) => lerProposta(c, vocabulario ?? null), (progresso) => setAndamento(a => a && { ...a, progresso }), undefined, { vocabulario, nuvem: usarNuvem && ia.estado === 'ligada' && !!ia.nuvem })
        resposta = resumoEmTexto(resultado)
      } catch (e) {
        const m = (e as Error).message
        if (m === 'sessao-expirada') esquecerSessaoIA()
        resposta = m === 'sessao-expirada' ? 'A sessão da IA caiu (o serviço reiniciou ou ficou parado). Digite a senha abaixo para ligar de novo e mande outra vez.'
          : m === 'limite' ? 'O modelo está ocupado com outra tarefa. Tente de novo em instantes.' : m === 'sem-servico' || m === 'indisponivel' ? 'O serviço local não respondeu. Confira se o Cosmos e o Ollama estão abertos.' : m
      }
      await guardar({ id, fio: fioDaMensagem, pergunta, resposta: resposta.normalize('NFC'), ...(resultado ? { resultado } : {}), em })
    } catch (e) { setErro(`Não foi possível guardar a conversa: ${(e as Error).message}`) }
    finally { setAndamento(null); setSalvando(false) }
  }
  // "Refazer com estes termos": a mesma verificação, com o vocabulário que a pessoa corrigiu, como mensagem nova
  const refazer = (r: ResultadoIA, vocabulario: Termo[]) => {
    if (r.tipo !== 'argumento' || salvando) return
    void enviar(`/verificar ${[...r.texto.premissas, r.texto.conclusao].join('\n')}`, vocabulario)
  }
  const lerArquivo = (f: File | undefined) => {
    if (!f) return
    if (f.size > 80_000) { setErro('O arquivo é grande demais: até 20 mil caracteres de texto. De um PDF ou Word, copie e cole o texto.'); return }
    void f.text().then((t) => { setQuery(t.slice(0, 20_000)); setComando('revisar'); input.current?.focus() })
  }
  const exemplo = (c: Comando) => { setComando(c); setQuery(COMANDOS.find(x => x.nome === c)!.exemplo); input.current?.focus() }
  const descricao = comando && COMANDOS.find(c => c.nome === comando)
  if (!dono) return <div className={`product-root iai-app reference-app iai-v2 iai-mapa ${dark ? 'iai-dark' : ''}`}>
    <BarraCosmos atual="i-ai" />
    <div className="iai-body iai-body-portao"><main className="iai-main"><div className="iai-content"><EntrarParaUsar /></div></main></div>
  </div>
  return <div className={`product-root iai-app reference-app iai-v2 iai-mapa ${dark ? 'iai-dark' : ''}`}>
    <BarraCosmos atual="i-ai" />
    <div className="iai-body">
      <aside className={`iai-sidebar ${sidebar ? 'is-open' : ''}`}>
        <Button className="iai-new" onClick={novaConversa}><span>＋</span> Nova conversa</Button>
        <div className="iai-history"><p>{indice === null ? 'Abrindo o histórico…' : conversas.length ? 'Conversas' : 'Nenhuma conversa ainda'}</p>
          {conversas.map(c => <button key={c.fio} className={fio === c.fio ? 'active' : ''} onClick={() => { setFio(c.fio); setNovo(null); setSidebar(false) }}>{c.titulo}</button>)}
        </div>
        <div className="iai-sidebar-footer"><p className="iai-history-note"><Icone nome="shield" /> Cifradas com a sua senha, neste computador. Só a sua conta usa a IA.</p><button onClick={() => setDark(!dark)} aria-label="Alternar tema">{dark ? 'Tema claro' : 'Tema escuro'}</button></div>
      </aside>
      <main className="iai-main"><header className="iai-mobile-header"><button className="iai-mobile-menu" aria-label="Abrir conversas" aria-expanded={sidebar} onClick={() => setSidebar(!sidebar)}>☰</button><span>Conversa</span><button aria-label="Nova conversa" onClick={novaConversa}>＋</button></header>
        <div className={`iai-content ${turnos.length ? 'has-conversation' : ''}`} ref={rolagem}>
          {turnos.length ? <article className="iai-conversation" aria-label="Conversa com o Cosmos" aria-live="polite">
            {turnos.map(t => <TurnoIA key={t.id} turno={t} novo={t.id === novo} progresso={andamento?.id === t.id ? andamento.progresso : undefined} aoRefazer={sessaoPronta ? refazer : undefined} />)}
          </article> : <section className="iai-welcome">
            <h1>O que você quer verificar?</h1>
            <p>Escreva um raciocínio ou cole um plano. O Cosmos desenha o argumento, separa os fatos da visão e o Z3 diz o que decorre e o que é salto.</p>
            <div className="iai-suggestions">{COMANDOS.map(c => <button key={c.nome} onClick={() => exemplo(c.nome)}><span aria-hidden="true">/</span><strong>{c.titulo}</strong><small>{c.descricao}</small></button>)}</div>
          </section>}
        </div>
        <div className="iai-composer-area">
          {(menu || barra !== null) && <MenuDeComandos filtro={barra ?? ''} ia={sessaoPronta} aoEscolher={escolher} />}
          <form className="iai-composer" onSubmit={e => { e.preventDefault(); void enviar() }}>
            <textarea ref={input} rows={1} aria-label="Escreva para o Cosmos" autoComplete="off" placeholder={descricao ? descricao.descricao : 'Escreva um raciocínio ou cole um plano (/ para os comandos)'} value={query} maxLength={20_000} enterKeyHint="send" onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') setMenu(false); if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (barra !== null) { const c = COMANDOS.find(x => x.nome.startsWith(barra.toLowerCase())); if (c) escolher(c.nome); return } void enviar() } }} />
            <div className="iai-composer-barra">
              <button type="button" className="iai-mais" aria-label="Comandos" aria-expanded={menu} onClick={() => setMenu(m => !m)}>+</button>
              <label className="iai-anexo" title="Abrir um arquivo de texto (.txt ou .md) para revisar"><Icone nome="paperclip" /><input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={salvando} onChange={e => { lerArquivo(e.target.files?.[0]); e.target.value = '' }} /></label>
              {comando && <span className="iai-chip">/{comando}<button type="button" aria-label="Tirar o comando" onClick={() => setComando(null)}>×</button></span>}
              <span className="iai-espaco" />
              <Button size="icon" aria-label="Enviar" disabled={!query.trim() || salvando} type="submit"><Icone nome="send" /></Button>
            </div>
          </form>
          {ia.estado === 'ligada' && ia.exigeSessao && sessaoIA.estado !== 'ligada' && (sessaoIA.estado === 'ligando' ? <p className="iai-estado">Ligando a IA à sua conta…</p>
            : sessaoIA.estado === 'outra-conta' ? <p className="iai-estado" role="alert">Este Cosmos está ligado a outra conta. Para trocar de dona, abra o serviço com --novo-dono.</p>
            : <LigarComSenha />)}
          {ia.estado === 'ligada' && ia.nuvem && <label className="iai-nuvem"><input type="checkbox" checked={usarNuvem} onChange={e => escolherNuvem(e.target.checked)} />
            <span>Traduzir com o modelo grande na nuvem ({ia.nuvem}, no Groq): o texto do argumento sai deste computador.<span className="iai-nuvem-detalhe"> Lê melhor frases abstratas; o Z3 decide aqui do mesmo jeito.</span></span></label>}
          <p className="iai-estado" data-estado={sessaoPronta ? 'ligada' : ia.estado}>{ia.estado === 'ligada' ? (usarNuvem && ia.nuvem ? `Tradução na nuvem (${ia.nuvem}) · o Z3 decide neste computador` : `IA local (${ia.modelo})${sessaoPronta ? ' ligada à sua conta' : ''} · o Z3 decide · o texto não sai deste computador`)
            : ia.estado === 'conectando' ? 'Conectando à IA local…'
            : ia.local ? 'IA local desligada: abra o Ollama e o atalho "Cosmos". Tentando de novo…'
            : <>A IA roda no Cosmos instalado no seu computador: <a href={ENDERECO_LOCAL}>abrir o Cosmos local</a></>}</p>
          {erro && <p role="alert">{erro}</p>}</div>
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
