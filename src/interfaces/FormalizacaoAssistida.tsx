/** @jsxImportSource react */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { criarClienteGroq } from './groq-cliente'
import { criarClienteOllama } from './ollama-cliente'
import type { ModeloGroq } from '../integracoes/groq-contratos'
import type { Afirmacao } from '../motor/registro'
import { lerFormula, type Classe, type Item, type Termo } from '../motor/avaliacao'
import { lerDeVolta, lerProposta, mensagensDeFormalizacao, PROMPT_FORMALIZACAO, type Proposta } from '../motor/formalizacao'
import exemplosTexto from '../../avaliacao/exemplos-publicos-v1.jsonl?raw'

const EXEMPLOS = exemplosTexto.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Item)
const MEDICOES = 'cosmos-formalizacao-medicoes'
export interface Medicao { em: string; modelo: string; prompt: string; msModelo: number; tokens: number; msAteDecisao: number; decisao: 'aprovada' | 'corrigida' | 'recusada' | 'nao-lida' }
const lerMedicoes = (): Medicao[] => { try { return JSON.parse(localStorage.getItem(MEDICOES) ?? '[]') as Medicao[] } catch { return [] } }
const AFIRMACAO_DA_CLASSE: Record<string, Afirmacao> = { segue: 'segue', contradiz: 'contradiz', independente: 'nao-segue' }

export interface ParaRegistro { formula: string; premissas: string[]; afirmacao: Afirmacao; dominio: string }
interface ItemDoLote { texto: { premissas: string[]; conclusao: string }; estado: 'esperando' | 'propondo' | 'conferindo' | 'aceita' | 'descartada'; motivo?: string; proposta?: Proposta; classeZ3?: Classe | null }
const ROTULO: Record<ItemDoLote['estado'], string> = { esperando: 'na fila', propondo: 'o modelo está propondo…', conferindo: 'o Z3 está conferindo…', aceita: 'aceita', descartada: 'descartada' }
/** Um problema por bloco, blocos separados por linha em branco; a última linha de cada bloco é a conclusão. */
export function lerLote(texto: string): { premissas: string[]; conclusao: string }[] {
  return texto.split(/\n\s*\n/).map((b) => b.split('\n').map((l) => l.trim()).filter(Boolean)).filter((b) => b.length >= 2)
    .map((b) => ({ premissas: b.slice(0, -1).slice(0, 10).map((l) => l.slice(0, 500)), conclusao: b.at(-1)!.slice(0, 500) }))
}

function leitura(f: string, v: Termo[]): { texto: string; erro: boolean } {
  try { lerFormula(f, v); return { texto: lerDeVolta(f, v), erro: false } } catch (e) { return { texto: (e as Error).message, erro: true } }
}

/**
 * A formalização assistida (especificacao/formalizacao-v1.md): o modelo propõe, o Cosmos lê de volta em português sem
 * modelo, a pessoa corrige se preciso e aprova; a aprovação leva a proposta para o registro em Minha cadeia, onde a
 * verificação (Z3, cvc5, Carcara) decide. Só funciona pelo serviço local: de preferência com o Ollama (o modelo da nota
 * oficial, e o texto não sai do computador); senão com o Groq ligado (a chave fica no processo Node). Cada proposta e
 * cada decisão entram na medição de tempo, guardada só neste navegador.
 */
export function FormalizacaoAssistida({ levar, levarVarios }: { levar: (r: ParaRegistro) => void; levarVarios: (rs: ParaRegistro[]) => void }) {
  const cliente = useMemo(() => { try { return criarClienteGroq(location.origin) } catch { return null } }, [])
  const local = useMemo(() => { try { return criarClienteOllama(location.origin) } catch { return null } }, [])
  // o Ollama vem primeiro: é o modelo medido no conjunto fechado e o texto fica no computador
  const [modelo, setModelo] = useState<{ provedor: 'ollama'; nome: string } | { provedor: 'groq'; nome: ModeloGroq } | null>(null), [estado, setEstado] = useState('conferindo')
  const [premissasTexto, setPremissasTexto] = useState(''), [conclusao, setConclusao] = useState('')
  const [proposta, setProposta] = useState<Proposta | null>(null), [editadas, setEditadas] = useState<{ premissas: string[]; conclusao: string } | null>(null)
  const [afirmacao, setAfirmacao] = useState<Afirmacao>('segue'), [dominio, setDominio] = useState('geral')
  const [erro, setErro] = useState(''), [ocupado, setOcupado] = useState(false), [medicoes, setMedicoes] = useState<Medicao[]>(lerMedicoes)
  const ultima = useRef<{ msModelo: number; tokens: number; chegou: number } | null>(null)
  const [modo, setModo] = useState<'uma' | 'automatico'>('uma'), [loteTexto, setLoteTexto] = useState(''), [itens, setItens] = useState<ItemDoLote[]>([]), [rodando, setRodando] = useState(false)

  useEffect(() => {
    if (!cliente || !local) { setEstado('sem-servico'); return }
    const groq = () => cliente.carregar().then((s) => { setModelo(s.configuracao?.habilitada ? { provedor: 'groq', nome: s.configuracao.modelo } : null); setEstado(s.estado) })
    void local.carregar().then((o) => { if (o.estado !== 'pronto') return groq(); setModelo({ provedor: 'ollama', nome: o.modelo }); setEstado('pronto') }, groq).catch(() => setEstado('sem-servico'))
  }, [cliente, local])

  const medir = (decisao: Medicao['decisao']) => {
    const u = ultima.current
    if (!u || !modelo) return
    const nova = [...medicoes, { em: new Date().toISOString(), modelo: `${modelo.provedor}:${modelo.nome}`, prompt: PROMPT_FORMALIZACAO, msModelo: u.msModelo, tokens: u.tokens, msAteDecisao: Date.now() - u.chegou, decisao }].slice(-500)
    try { localStorage.setItem(MEDICOES, JSON.stringify(nova)) } catch { /* a medição é conveniência deste navegador */ }
    setMedicoes(nova); ultima.current = null
  }

  const propor = async () => {
    if (!cliente || !local || !modelo || ocupado) return
    const premissas = premissasTexto.split('\n').map((l) => l.trim()).filter(Boolean)
    if (!premissas.length || !conclusao.trim()) { setErro('escreva pelo menos uma premissa e a conclusão'); return }
    setOcupado(true); setErro(''); setProposta(null); setEditadas(null)
    const inicio = Date.now()
    try {
      // no Groq, a ponte reserva bytes do pedido + max_tokens contra 8 mil tokens por minuto: 2048 cabe (o piloto gastou
      // até 837); no Ollama, o pedido se monta na ponte e o navegador manda só o texto
      const r = modelo.provedor === 'ollama' ? await local.formalizar({ premissas, conclusao: conclusao.trim() })
        : await cliente.perguntar({ model: modelo.nome, messages: mensagensDeFormalizacao({ premissas, conclusao: conclusao.trim() }, null, EXEMPLOS), max_tokens: 2048, temperature: 0 })
      ultima.current = { msModelo: Date.now() - inicio, tokens: r.prompt_tokens + r.completion_tokens, chegou: Date.now() }
      try {
        const p = lerProposta(r.conteudo, null)
        setProposta(p); setEditadas({ premissas: p.premissas, conclusao: p.conclusao }); setAfirmacao(AFIRMACAO_DA_CLASSE[p.classe ?? ''] ?? 'segue')
      } catch (e) { medir('nao-lida'); setErro(`a resposta do modelo não se lê: ${(e as Error).message}`) }
    } catch (e) { setErro(`o serviço local não respondeu (${(e as Error).message}); confira em Integrações`) }
    finally { setOcupado(false) }
  }

  /**
   * O modo automático (especificacao/formalizacao-v1.md §3c): o modelo propõe todas, uma de cada vez, e depois o Z3
   * confere cada uma no serviço local (o modelo sai da memória antes). Passa a proposta que se lê, tem uma fórmula
   * para cada premissa do texto e que o Z3 decide; a classe é a do Z3. O resto é descartado com o motivo. Nada vai
   * para a cadeia sem o botão de levar.
   */
  const rodarLote = async () => {
    if (!local || rodando || ocupado) return
    const textos = lerLote(loteTexto)
    if (!textos.length) { setErro('escreva pelo menos um problema: premissas, uma por linha, e a conclusão na última linha'); return }
    if (textos.length > 50) { setErro('no máximo 50 problemas por vez'); return }
    let lista: ItemDoLote[] = textos.map((texto) => ({ texto, estado: 'esperando' }))
    const mudar = (i: number, m: Partial<ItemDoLote>) => { lista = lista.map((x, j) => (j === i ? { ...x, ...m } : x)); setItens(lista) }
    setItens(lista); setRodando(true); setErro('')
    try {
      for (let i = 0; i < lista.length; i++) {
        mudar(i, { estado: 'propondo' })
        try {
          const r = await local.formalizar(lista[i].texto)
          try {
            const p = lerProposta(r.conteudo, null), n = lista[i].texto.premissas.length
            // o erro de fórmula mais comum na revisão: o modelo junta duas premissas ou deixa uma de fora
            mudar(i, p.premissas.length === n ? { estado: 'esperando', proposta: p } : { estado: 'descartada', proposta: p, motivo: `o texto tem ${n} premissa(s) e a proposta ${p.premissas.length}` })
          } catch (e) { mudar(i, { estado: 'descartada', motivo: `a resposta não se lê: ${(e as Error).message}` }) }
        } catch (e) { mudar(i, { estado: 'descartada', motivo: `o serviço local não respondeu (${(e as Error).message})` }) }
      }
      for (let i = 0; i < lista.length; i++) {
        const p = lista[i].proposta
        if (!p || lista[i].estado !== 'esperando') continue
        mudar(i, { estado: 'conferindo' })
        try {
          const c = await local.conferir(p)
          mudar(i, c.aceita ? { estado: 'aceita', classeZ3: c.classeZ3 } : { estado: 'descartada', classeZ3: c.classeZ3, motivo: c.motivo })
        } catch (e) { mudar(i, { estado: 'descartada', motivo: `o Z3 não respondeu (${(e as Error).message})` }) }
      }
    } finally { setRodando(false) }
  }
  const aceitas = itens.filter((x) => x.estado === 'aceita' && x.proposta && x.classeZ3)
  const descartadas = itens.filter((x) => x.estado === 'descartada').length

  const resumo = { aprovada: 0, corrigida: 0, recusada: 0, 'nao-lida': 0, ...Object.fromEntries(['aprovada', 'corrigida', 'recusada', 'nao-lida'].map((d) => [d, medicoes.filter((m) => m.decisao === d).length])) }
  const tempoMedio = medicoes.length ? Math.round(medicoes.reduce((s, m) => s + m.msAteDecisao, 0) / medicoes.length / 1000) : 0

  if (estado === 'sem-servico' || !modelo) return <div className="cadeia-pessoal">
    <div className="labs-result" role="note"><strong>A formalização assistida usa o serviço local, com o Ollama ou com o Groq.</strong>
      <p><strong>Com o Ollama (recomendado):</strong> o modelo roda neste computador e o texto não sai dele. Com o Ollama aberto e o modelo baixado (<code>ollama pull qwen3:4b</code>), rode no PowerShell, na pasta do Cosmos, <code>node scripts/integracoes-p0.mjs --ollama</code> e abra <code>http://127.0.0.1:4175/cosmos/</code>, em Labs → Formalizar.</p>
      <p><strong>Com o Groq:</strong> a chave fica só no processo local, nunca no navegador. Rode <code>node scripts/integracoes-p0.mjs --groq</code> (com a variável GROQ_API_KEY definida), abra <code>http://127.0.0.1:4175/cosmos/#/integracoes</code>, escolha o Groq, salve o modelo e teste a conexão. Depois volte aqui, em Labs → Formalizar, pelo mesmo endereço.</p>
      <p>{estado === 'conferindo' ? 'Conferindo o serviço…' : estado === 'sem-servico' ? 'O serviço local não está rodando neste endereço.' : 'Nem o Ollama está pronto (aberto e com o modelo) nem o Groq está configurado e habilitado em Integrações.'}</p></div>
  </div>

  const atual = editadas
  const leituras = atual && proposta ? { premissas: atual.premissas.map((f) => leitura(f, proposta.vocabulario)), conclusao: leitura(atual.conclusao, proposta.vocabulario) } : null
  const temErro = !!leituras && (leituras.conclusao.erro || leituras.premissas.some((l) => l.erro))
  const corrigida = !!proposta && !!atual && (atual.conclusao !== proposta.conclusao || atual.premissas.join('\n') !== proposta.premissas.join('\n'))

  return <div className="cadeia-pessoal formalizacao">
    {modelo.provedor === 'ollama'
      ? <div className="labs-result" role="note"><strong>O texto fica neste computador.</strong><p>As frases vão para o Ollama local ({modelo.nome}), o mesmo modelo da nota oficial. Na CPU, cada proposta leva cerca de um minuto.</p></div>
      : <div className="labs-result has-conflict" role="note"><strong>O texto sai deste computador.</strong><p>As frases vão para o Groq ({modelo.nome}). Não use para o Principia, dados pessoais nem itens do conjunto fechado de avaliação.</p></div>}

    {modelo.provedor === 'ollama' && <div className="cadeia-acoes" role="group" aria-label="Modo">
      <Button variant={modo === 'uma' ? 'default' : 'outline'} aria-pressed={modo === 'uma'} disabled={rodando} onClick={() => setModo('uma')}>Uma frase, com aprovação</Button>
      <Button variant={modo === 'automatico' ? 'default' : 'outline'} aria-pressed={modo === 'automatico'} disabled={ocupado} onClick={() => setModo('automatico')}>Automático, várias frases</Button>
    </div>}

    {modo === 'automatico' && modelo.provedor === 'ollama' && <section className="labs-surface formalizacao-lote">
      <h3>Automático</h3>
      <p>Um problema por bloco: as premissas, uma por linha, e a conclusão na última linha; uma linha em branco entre os blocos. O modelo propõe todas; depois o Z3 confere cada uma. Passa o que se lê, tem uma fórmula para cada premissa e o Z3 decide; a classe é a do Z3, não a que o modelo diz. O resto é descartado com o motivo. Símbolo que o modelo esqueceu de declarar entra com leitura provisória, marcada.</p>
      <form className="cadeia-form" onSubmit={(e) => { e.preventDefault(); void rodarLote() }}>
        <label className="cadeia-largo">Problemas <small>até 50</small><textarea value={loteTexto} onChange={(e) => setLoteTexto(e.target.value)} rows={10} maxLength={60000} disabled={rodando} placeholder={'Todo pássaro tem penas.\nTico não tem penas.\nTico não é pássaro.\n\nTodo médico é paciente.\nAna é médica.\nAna é paciente.'} /></label>
        <label>Domínio<Input value={dominio} onChange={(e) => setDominio(e.target.value)} maxLength={80} disabled={rodando} /></label>
        <Button type="submit" disabled={rodando}>{rodando ? `Rodando… ${itens.filter((x) => x.estado === 'aceita' || x.estado === 'descartada').length} de ${itens.length}` : 'Rodar automático'}</Button>
      </form>
      {itens.length > 0 && <>
        <p className="cadeia-previa" role="status">{aceitas.length} aceita(s), {descartadas} descartada(s){rodando ? ', rodando…' : ''}.</p>
        <ol className="cadeia-elos formalizacao-itens">{itens.map((x, i) => <li key={i} data-estado={x.estado}>
          <span>{i + 1}</span>
          <span>{ROTULO[x.estado]}{x.estado === 'aceita' && x.classeZ3 ? ` · ${x.classeZ3}` : ''}</span>
          <code>{x.texto.premissas.join(' / ')} ⟹ {x.texto.conclusao}</code>
          {x.proposta && <small>lê-se: {[...x.proposta.premissas.map((f) => leitura(f, x.proposta!.vocabulario).texto), leitura(x.proposta.conclusao, x.proposta.vocabulario).texto].join(' / ')}{x.proposta.completados ? ` · completados: ${x.proposta.completados.map((s) => `${s} (${x.proposta!.vocabulario.find((t) => t.simbolo === s)?.leitura})`).join(', ')}` : ''}</small>}
          {x.motivo && <small className="has-conflict">{x.motivo}</small>}
        </li>)}</ol>
        <div className="cadeia-acoes">
          <Button disabled={rodando || !aceitas.length} onClick={() => levarVarios(aceitas.map((x) => ({ formula: x.proposta!.conclusao, premissas: x.proposta!.premissas, afirmacao: AFIRMACAO_DA_CLASSE[x.classeZ3!] ?? 'segue', dominio: dominio.trim() || 'geral' })))}>Levar as {aceitas.length} aceitas para a cadeia</Button>
          <Button variant="outline" disabled={rodando} onClick={() => {
            const url = URL.createObjectURL(new Blob([JSON.stringify(itens, null, 2)], { type: 'application/json' })), a = document.createElement('a')
            a.href = url; a.download = `cosmos-formalizacao-automatico-${itens.length}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
          }}>Exportar o resultado</Button>
        </div>
      </>}
    </section>}

    {modo === 'uma' && <section className="labs-surface">
      <h3>Escreva em português</h3>
      <p>Frases curtas: premissas, uma por linha, e a conclusão. O modelo propõe a formalização em m2; você confere a leitura de volta e aprova. Quem decide se a conclusão segue é a verificação, não o modelo.</p>
      <form className="cadeia-form" onSubmit={(e) => { e.preventDefault(); void propor() }}>
        <label className="cadeia-largo">Premissas <small>uma por linha</small><textarea value={premissasTexto} onChange={(e) => setPremissasTexto(e.target.value)} rows={3} maxLength={2000} disabled={ocupado} placeholder={'Todo médico é paciente.\nAna é médica.'} /></label>
        <label className="cadeia-largo">Conclusão<Input value={conclusao} onChange={(e) => setConclusao(e.target.value)} maxLength={500} disabled={ocupado} placeholder="Ana é paciente." /></label>
        <Button type="submit" disabled={ocupado || rodando}>{ocupado ? 'O modelo está propondo…' : 'Propor formalização'}</Button>
      </form>
    </section>}

    {erro && <p className="labs-result has-conflict" role="alert">{erro}</p>}

    {modo === 'uma' && proposta && atual && leituras && <section className="labs-surface">
      <h3>Proposta do modelo</h3>
      <p>Confira a leitura de volta de cada fórmula: ela é feita pelo Cosmos, sem modelo. Se não diz o que o texto dizia, corrija a fórmula.</p>
      <ol className="cadeia-elos">{proposta.vocabulario.map((t, i) => <li key={t.simbolo} data-completado={proposta.completados?.includes(t.simbolo) || undefined}><span>{i + 1}</span><span>{t.simbolo} · {t.tipo}/{t.aridade}{proposta.completados?.includes(t.simbolo) ? ' · completado, leitura provisória' : ''}</span><code>{t.leitura}</code></li>)}</ol>
      <div className="cadeia-form">
        {atual.premissas.map((f, i) => <label key={i} className="cadeia-largo">Premissa {i + 1}<Input value={f} onChange={(e) => setEditadas({ ...atual, premissas: atual.premissas.map((x, j) => (j === i ? e.target.value : x)) })} /><small className={leituras.premissas[i].erro ? 'has-conflict' : ''}>{leituras.premissas[i].erro ? '' : 'lê-se: '}{leituras.premissas[i].texto}</small></label>)}
        <label className="cadeia-largo">Conclusão<Input value={atual.conclusao} onChange={(e) => setEditadas({ ...atual, conclusao: e.target.value })} /><small>{leituras.conclusao.erro ? '' : 'lê-se: '}{leituras.conclusao.texto}</small></label>
        <label>Afirmação para o registro<select value={afirmacao} onChange={(e) => setAfirmacao(e.target.value as Afirmacao)}><option value="segue">segue das premissas</option><option value="contradiz">contradiz as premissas</option><option value="nao-segue">não segue das premissas</option><option value="consistente">é consistente com as premissas</option></select></label>
        <label>Domínio<Input value={dominio} onChange={(e) => setDominio(e.target.value)} maxLength={80} /></label>
        <p className="cadeia-previa">O modelo classificou como: {proposta.classe ?? 'sem classe'}. Isso é só uma proposta: o registro afirma, e a verificação confere.</p>
        <div className="cadeia-acoes">
          <Button disabled={temErro} onClick={() => { medir(corrigida ? 'corrigida' : 'aprovada'); levar({ formula: atual.conclusao, premissas: atual.premissas, afirmacao, dominio: dominio.trim() || 'geral' }) }}>{corrigida ? 'Aprovar com a correção e levar ao registro' : 'Aprovar e levar ao registro'}</Button>
          <Button variant="outline" onClick={() => { medir('recusada'); setProposta(null); setEditadas(null) }}>Recusar</Button>
        </div>
      </div>
    </section>}

    <section className="labs-surface">
      <h3>Medição deste navegador</h3>
      <p>{medicoes.length} proposta(s): {resumo.aprovada} aprovada(s) como vieram, {resumo.corrigida} corrigida(s), {resumo.recusada} recusada(s), {resumo['nao-lida']} que não se leram. Tempo médio até a decisão: {tempoMedio} s. Pedido {PROMPT_FORMALIZACAO}.</p>
      <Button variant="outline" disabled={!medicoes.length} onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(medicoes, null, 2)], { type: 'application/json' })), a = document.createElement('a')
        a.href = url; a.download = `cosmos-formalizacao-medicoes-${medicoes.length}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
      }}>Exportar a medição</Button>
    </section>
  </div>
}
