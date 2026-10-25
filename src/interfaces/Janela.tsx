/** @jsxImportSource react */
export type NomeIcone = 'chat' | 'book' | 'tools' | 'settings' | 'file' | 'shield' | 'paperclip' | 'send' | 'grid' | 'flask' | 'chart' | 'user' | 'plug' | 'link'

export function Icone({ nome }: { nome: NomeIcone }) {
  const caminhos = {
    chat: 'M5 4h14v11H9l-4 4V4Zm4 4h6m-6 3h4',
    book: 'M4 4h6c1 0 2 1 2 2 0-1 1-2 2-2h6v15h-6c-1 0-2 1-2 1s-1-1-2-1H4V4Zm8 2v14',
    tools: 'm4 4 16 16m-4-16a5 5 0 0 0-5 7L4 18l2 2 7-7a5 5 0 0 0 7-5l-4 3-3-3 3-4Z',
    settings: 'm9 3 1 3h4l1-3 3 2-1 3 2 3 3 1-1 4-3 1-2 3-4-1-1-3-3-1-2-3 2-3-1-3 3-1 2-3Z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
    file: 'M6 3h8l4 4v14H6V3Zm8 0v5h4M9 12h6m-6 4h6',
    shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Zm-4 9 3 3 5-6',
    paperclip: 'm8 8 7-5c5-3 8 2 5 5L9 19c-5 5-11-1-7-5L13 3m-7 9 8-8',
    send: 'm4 4 17 8-17 8 4-8-4-8Zm4 8h13',
    grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
    flask: 'M9 3h6m-5 0v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3M7 15h10',
    chart: 'M4 20h16M7 16V9m0 0V6m0 3h0m5 9v-5m0 0V5m5 11v-3m0 0V8',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8c1-4 4-6 7-6s6 2 7 6',
    plug: 'M9 3v5m6-5v5M6 8h12v3a6 6 0 0 1-12 0V8Zm6 9v4',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  }
  return <svg className="cosmos-line-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={caminhos[nome]} /></svg>
}
