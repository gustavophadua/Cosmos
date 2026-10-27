# Roteiro — a moeda de teste nos três notebooks (cosmos-teste-1)

A rede de teste fica pronta quando os três computadores do teste da Fase 3 trocam unidades de teste por arquivo e
cada um acusa gasto acima do saldo, gasto duplo e alteração. As regras estão em `especificacao/moeda-teste.md`; a
simulação de cada uma, num aparelho só, em `testes/moeda-teste.test.ts` (M01–M10).

**Unidade de teste, sem valor.** Não se vende, não se compra, não se troca e não vira moeda real.

## Preparação (em cada notebook: A, B e C)

1. Conferir a data do relógio: os três no mesmo dia. Quem recebe recusa operação com data no futuro.
2. No PowerShell: `cd Cosmos`, `git pull`, `npm.cmd ci` e `npm.cmd run dev`.
3. No **mesmo navegador do teste da Fase 3** (é onde está a chave), abrir
   `http://localhost:5173/Cosmos/#/lab` e clicar em **Moeda de teste**. A porta tem de ser a 5173: noutra porta o
   navegador não acha a chave.

Tem de aparecer "VOCÊ · A" (ou B, ou C) e "100,00 livres". No A, também "10,00 presas: 10,00 em 2026-11-25": a
recompensa pelo registro que o verificador público abriu.

O livro exportado se chama `cosmos-livro-<começo da chave>-<operações>.json`: A `c39ce485`, B `d84233c1`, C `36fe5abf`.

## Os testes

As quantias de "chegam" e as datas de "presas até" abaixo são para um teste feito em 27/10/2026 (hoje + 30 dias).

| Teste | Onde | O que fazer | O que tem de acontecer |
| --- | --- | --- | --- |
| M01 · Gênese | A, B e C | Abrir Moeda de teste | 100,00 livres; a rede mostra os três; "a conta fecha" |
| M02 · Transferência | A | Transferir 20 para B; exportar (`cosmos-livro-c39ce485-1.json`) | A: 80,00 livres; "chegam 19,00, presas até 2026-11-26" |
| M02 · Receber | B e C | Receber o livro de A | "aceito · 1 operação(ões) · A"; B com 19,00 presas; queimado 1,00 |
| M03 · Trava | B | Transferir 110 para C | Recusa: "saldo livre insuficiente … há 100,00": os 19 recebidos estão presos; nada é anexado |
| M07 · Roda | B, depois C | B transfere 30 para C e exporta; C recebe, transfere 10 para A e exporta | B: 70,00 livres; C: 90,00 livres e 28,50 presas |
| M08 · Mesma conta | A, B e C | Cada um recebe os livros que faltam | Os três mostram a mesma rede: A 80,00 + 19,50 presas, B 70,00 + 19,00, C 90,00 + 28,50; emitido 310,00, queimado 3,00, em circulação 307,00, "a conta fecha" |
| M09 · Pedido duplicado | B | Receber de novo o livro de A | "Igual à versão que este aparelho já tinha" |
| M05 · Alteração | B | Receber uma cópia do livro de A com `quantia\":2000` trocado por `quantia\":9000` no Bloco de Notas | "recusado (C8, elo 0)"; a rede não muda |
| M04 · Gasto duplo | A (segundo navegador) | No navegador onde a chave de A foi restaurada (o Edge), transferir 90 para C e exportar (`A-livro-edge.json`) | — |
| M04 · Acusação | B e C | Receber `A-livro-edge.json` | "GASTO DUPLO: a mesma chave assinou duas histórias diferentes"; a rede marca A e continua com a primeira história |
| M06 · Publicação | este computador | Trazer os três livros e `A-livro-edge.json` | Publicados em `redes/cosmos-teste-1/livros/`, o verificador público refaz a conta e ela fecha |

Para cada teste, anotar o computador e a mensagem que apareceu. Fotos da tela bastam.

## O que este roteiro não cobre

- **A trava vencendo.** Os 30 dias não passam durante o teste; a liberação no 30º dia está nos cenários M02 e M03.
- **Recompensa nova.** Uma recompensa entra quando um registro novo é publicado em `cadeias/` e aberto pelo verificador
  público.
- **Identidade.** Uma chave não prova quem é a pessoa por trás dela (Fase 6).
