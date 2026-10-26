# Roteiro — a moeda de teste nos três notebooks (cosmos-teste-1)

A rede de teste fica pronta quando os três computadores do teste da Fase 3 trocam unidades de teste por arquivo e
cada um acusa gasto acima do saldo, gasto duplo e alteração. As regras estão em `especificacao/moeda-teste.md`; a
simulação de cada uma, num aparelho só, em `testes/moeda-teste.test.ts` (M01–M10).

**Unidade de teste, sem valor.** Não se vende, não se compra, não se troca e não vira moeda real.

## Preparação (em cada notebook: A, B e C)

1. Abrir o PowerShell, entrar na pasta e trazer a versão nova: `cd Cosmos`, depois `git pull`.
2. Rodar `npm.cmd ci` e depois `npm.cmd run dev`.
3. No **mesmo navegador do teste da Fase 3** (é onde está a chave), abrir
   `http://localhost:5173/Cosmos/#/lab` e clicar em **Moeda de teste**.

Tem de aparecer "VOCÊ · A" (ou B, ou C) e "100,00 livres". No A, também "10,00 presas" até 2026-11-25: a recompensa
pelo registro que o verificador público abriu.

## Os testes

| Teste | Onde | O que fazer | O que tem de acontecer |
| --- | --- | --- | --- |
| M01 · Gênese | A, B e C | Abrir Moeda de teste | 100,00 livres; a rede mostra os três; "a conta fecha" |
| M02 · Transferência | A | Transferir 20 para B; exportar o livro (`A-livro-1.json`) | A: 80,00 livres; "chegam 19,00, presas até …" |
| M02 · Receber | B e C | Receber `A-livro-1.json` | "aceito · 1 operação(ões)"; B com 19,00 presas; queimado 1,00 |
| M03 · Trava | B | Transferir 110 para C | Recusa: "saldo livre insuficiente: há 100,00": os 19 recebidos estão presos |
| M05 · Alteração | B | Receber uma cópia de `A-livro-1.json` com `2000` trocado por `9000` no Bloco de Notas | "recusado (C8, elo 0)" |
| M04 · Gasto duplo | A (segundo navegador) | No navegador onde a chave de A foi restaurada (o Edge), abrir Moeda de teste, transferir 90 para C e exportar (`A-livro-edge.json`) | — |
| M04 · Acusação | B e C | Receber `A-livro-edge.json` | "GASTO DUPLO: a mesma chave assinou duas histórias diferentes"; a rede marca A |
| M06 · Publicação | este computador | Trazer `A-livro-1.json` e, se houver, os livros de B e C | Publicados em `redes/cosmos-teste-1/livros/`, o verificador público refaz a conta e ela fecha |

Para cada teste, anotar o computador e a mensagem que apareceu. Fotos da tela bastam.

## O que este roteiro não cobre

- **A trava vencendo.** Os 30 dias não passam durante o teste; a liberação no 30º dia está nos cenários M02 e M03.
- **Recompensa nova.** Uma recompensa entra quando um registro novo é publicado em `cadeias/` e aberto pelo verificador
  público.
- **Identidade.** Uma chave não prova quem é a pessoa por trás dela (Fase 6).
