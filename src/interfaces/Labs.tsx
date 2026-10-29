/** @jsxImportSource react */
import { useEffect, useState, type ReactNode } from 'react'
import { Icone } from './Janela'
import { BarraCosmos, LICENCAS_URL } from './Navegacao'
import { CadeiaPessoal } from './CadeiaPessoal'
import { FormalizacaoAssistida, type ParaRegistro } from './FormalizacaoAssistida'
import { tomarParaCadeia } from './ConversaIA'
import type { Afirmacao } from '../motor/registro'
import './labs.css'

type Aba = 'cadeia' | 'formalizar'
const SECOES: { id: Aba; nome: string; descricao: string; icone: 'link' | 'chat' }[] = [
  { id: 'cadeia', nome: 'Minha cadeia', icone: 'link', descricao: 'Os resultados que você registrou, assinados pela sua chave e presos um ao outro, para levar a outros aparelhos e conferir.' },
  { id: 'formalizar', nome: 'Formalizar em lote', icone: 'chat', descricao: 'Muitos argumentos de uma vez: o modelo traduz cada um, o Z3 decide, e os aceitos vão juntos para a cadeia.' },
]

/**
 * O Avançado: o que fica fora da Conversa e funciona. Minha cadeia (a chave e os registros assinados), a formalização em
 * lote e o Terminal (a rede de teste). A Conversa é o lugar de verificar, revisar, desmistificar e contrariar.
 */
export function Labs({ navigation }: { navigation: ReactNode }) {
  const [aba, setAba] = useState<Aba>(() => new URLSearchParams(location.hash.split('?')[1]).get('secao') === 'formalizar' ? 'formalizar' : 'cadeia')
  // o registro que veio da Conversa ("Registrar na minha cadeia"), tomado uma vez
  const [paraCadeia, setParaCadeia] = useState<{ formula: string; dominio: string; premissas?: string[]; afirmacao?: Afirmacao } | null>(tomarParaCadeia)
  const [loteParaCadeia, setLoteParaCadeia] = useState<ParaRegistro[] | null>(null)
  useEffect(() => { window.scrollTo(0, 0) }, [aba])
  const secao = SECOES.find(s => s.id === aba)!
  return <div className="product-root labs-app reference-app" data-section={aba}><BarraCosmos atual="lab" />
    <aside className="labs-sidebar">
      <p className="labs-nav-label">AVANÇADO</p>
      <nav className="labs-sections" aria-label="Seções do Avançado">
        {SECOES.map(s => <button key={s.id} aria-current={aba === s.id ? 'page' : undefined} onClick={() => setAba(s.id)}><Icone nome={s.icone} />{s.nome}</button>)}
        <a href="#/terminal"><Icone nome="chart" />Terminal</a>
      </nav>
      <div className="labs-sidebar-bottom">{navigation}<p>Tudo fica neste aparelho. Nada é publicado sem você mandar.</p></div>
    </aside>
    <main className="labs-main">
      <section className="labs-page-heading"><div><p className="labs-eyebrow">AVANÇADO</p><h1>{secao.nome}</h1><p>{secao.descricao}</p></div></section>
      {aba === 'cadeia' && <CadeiaPessoal key={`${paraCadeia?.formula ?? ''}|${paraCadeia?.premissas?.join('|') ?? ''}|${loteParaCadeia?.length ?? 0}`} inicial={paraCadeia} lote={loteParaCadeia} aoAssinarLote={() => setLoteParaCadeia(null)} />}
      {aba === 'formalizar' && <FormalizacaoAssistida levar={r => { setParaCadeia(r); setAba('cadeia') }} levarVarios={rs => { setLoteParaCadeia(rs); setAba('cadeia') }} />}
      <footer className="labs-footer"><span>Cosmos · Avançado</span><span>Software livre · <a href={LICENCAS_URL} target="_blank" rel="noopener">AGPL-3.0+ / CC BY 4.0</a></span></footer>
    </main>
  </div>
}
