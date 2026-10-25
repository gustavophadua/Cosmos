/** @jsxImportSource react */
import type { InterfaceProduto } from './config'
import { useContaLocal } from './Conta'
import { Icone, type NomeIcone } from './Janela'
import { MoedaCosmos } from './Moeda'

export type Destino = InterfaceProduto | 'integracoes'
const PRINCIPAIS: [string, string, NomeIcone][] = [['indice', 'Índice', 'grid'], ['i-ai', 'Conversa', 'chat'], ['lab', 'Labs', 'flask'], ['terminal', 'Terminal', 'chart']]
export const LICENCAS_URL = 'https://github.com/gustavophadua/Cosmos/blob/main/LICENCAS.md'

/**
 * A barra do Cosmos, igual em todas as telas: a marca volta ao hub e os destinos ficam sempre à vista. No celular,
 * os destinos principais descem para uma barra de abas fixa no rodapé, ao alcance do polegar.
 */
export function BarraCosmos({ atual }: { atual: Destino }) {
  const conta = useContaLocal()
  return <header className="cosmos-bar">
    <a className="cosmos-bar-marca" href="#/hub" aria-label="Cosmos, ir para o hub"><MoedaCosmos tamanho={24} inclinar /><span>Cosmos</span></a>
    <nav className="cosmos-bar-destinos" aria-label="Destinos do Cosmos">
      {PRINCIPAIS.map(([rota, nome, icone]) => <a key={rota} href={`#/${rota}`} aria-current={rota === atual ? 'page' : undefined}><Icone nome={icone} /><span>{nome}</span></a>)}
    </nav>
    <div className="cosmos-bar-extra">
      <a href="#/integracoes" aria-current={atual === 'integracoes' ? 'page' : undefined} aria-label="Integrações" title="Integrações"><Icone nome="plug" /><span>Integrações</span></a>
      <a className="cosmos-bar-conta" href="#/conta" aria-current={atual === 'conta' ? 'page' : undefined} aria-label={conta.perfil ? 'Conta local desbloqueada' : 'Entrar na conta local'}>
        {conta.perfil ? <b aria-hidden="true">{conta.perfil.perfil.apelido.slice(0, 1).toUpperCase()}</b> : <Icone nome="user" />}<span>{conta.perfil ? conta.perfil.perfil.apelido : 'Entrar'}</span>
      </a>
    </div>
  </header>
}

/** A nota de licença, curta, para o pé de cada tela. */
export function NotaLicenca() {
  return <p className="cosmos-licenca">Software livre · <a href={LICENCAS_URL} target="_blank" rel="noopener">AGPL-3.0+ / CC BY 4.0</a> · dados de demonstração</p>
}
