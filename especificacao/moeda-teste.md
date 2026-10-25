# Moeda de teste — regras recomendadas (proposta para decisão)

Este documento reúne o que é recomendado para a moeda de teste do Cosmos, a partir do plano do estudo I-AI, do que a
rede local de teste já faz (`src/v4/localnet.ts`) e de fontes públicas sobre testnets e sobre a regulação no Brasil.
**Não é parecer jurídico.** As regras abaixo são uma proposta: quem decide é o dono do projeto, e nada aqui emite moeda.

## O que já existe

- Rede local simulada (`cosmos-localnet-simulada-v4`), só no `localhost`, com a unidade `UNIDADE-TESTE-SEM-VALOR`.
- Emissão só no gênese de uma simulação nova: 1.000.000 unidades por padrão (no máximo 1 bilhão), sem nova emissão
  depois; queima de 5% (500 pontos-base) nas operações; carteira de teste secp256k1 e livro-razão assinado.
- O plano do estudo: moeda de teste nos três notebooks antes de qualquer público, **sem venda, sem promessa de lucro,
  sem custódia, moedas presas por 30 dias**; emissão com um teto igual por pessoa, mais o pagamento de quem pede um
  certificado; no pior caso, k pessoas em conluio emitem k vezes o teto.

## Regras recomendadas

1. **Nome que não engana.** A unidade de teste não se chama COSM nem COSMOS: continua `UNIDADE-TESTE-SEM-VALOR` (na
   tela, "unidade de teste"). Toda tela que mostra saldo diz "sem valor".
2. **Sem valor e sem troca.** As unidades não se vendem, não se compram e não se trocam por dinheiro, por outra moeda
   ou por qualquer bem. Não representam participação, direito, dívida nem promessa. É o padrão das testnets públicas
   (Avalanche, Cardano, os faucets da Paxos e da First Digital), que dizem isso nos termos.
3. **Sem promessa de futuro.** Saldos de teste **não** viram moeda real, não dão direito a "airdrop" e não contam para
   nada depois. Isso tem de estar escrito antes do primeiro uso. É o ponto mais importante: no Parecer de Orientação
   40 da CVM, a expectativa de benefício econômico é um dos critérios de um contrato de investimento coletivo (valor
   mobiliário).
4. **Sem captação de público.** Só participantes convidados: primeiro os três notebooks (o próprio dono), depois um
   grupo pequeno e conhecido. Nada de oferta aberta; captar recursos junto ao público é outro critério do mesmo
   parecer.
5. **Sem custódia.** Cada pessoa tem a própria chave; o projeto não guarda saldo nem chave de ninguém. Custódia e
   intermediação de ativos virtuais são serviços que, desde as Resoluções BCB 519, 520 e 521 (em vigor desde 2 de
   fevereiro de 2026), exigem autorização do Banco Central.
6. **Emissão ligada ao que o Cosmos mede.** A mecânica a testar é a do estudo:
   - gênese pequeno e fixo (ou zero), sem nova emissão fora das regras;
   - unidades só por **registro aceito pelo verificador público** (certificado conferido de forma independente),
     nunca por registro fechado ou pendente;
   - um **teto igual por chave e por período** (proposta: 100 unidades por chave por semana), para limitar o conluio;
   - quem pede um certificado paga em unidades de teste; queima de 5% em cada pagamento;
   - unidades recebidas ficam **presas por 30 dias** antes de poder ser transferidas.
7. **Prazo e reinício.** A rede de teste tem versão e prazo (proposta: 90 dias) e pode ser zerada a qualquer momento;
   os participantes sabem disso antes.
8. **Tudo conferível.** Cada emissão, transferência e queima vai assinada no livro-razão, e o verificador público confere
   o total (gênese + emitido − queimado = soma dos saldos).
9. **Identidade em aberto.** "Uma pessoa, uma conta" ainda não está resolvido (Fase 6). Enquanto isso, o teto por chave só
   vale entre participantes conhecidos.
10. **Antes de qualquer moeda real**, um parecer jurídico (CVM, Banco Central e tributário). Emitir para o público com
    expectativa de valor, ou oferecer troca ou custódia, muda a natureza do projeto.

## O que falta o dono decidir

| Ponto | Proposta | Decisão |
| --- | --- | --- |
| Gênese | zero (tudo por registro aceito) ou 1.000 unidades de teste por participante | |
| Recompensa por registro aceito | 10 unidades | |
| Teto por chave | 100 unidades por semana | |
| Trava | 30 dias | |
| Queima | 5% por pagamento | |
| Prazo da rede de teste | 90 dias, depois zerada | |
| Participantes | os três notebooks; depois convidados nominais | |

## Fontes

- CVM, Parecer de Orientação 40 (11/10/2022), comentado por [Lefosse](https://lefosse.com/noticias/alerta/cvm-divulga-parecer-de-orientacao-sobre-o-mercado-de-valores-mobiliarios-e-criptoativos/), [Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/mercado-de-capitais-ij/orientacoes-da-cvm-para-o-mercado-de-criptoativos) e [Mattos Filho](https://www.mattosfilho.com.br/unico/cvm-parecer-criptoativos/).
- Banco Central, Resoluções 519, 520 e 521 (10/11/2025), comentadas por [Machado Meyer](https://www.machadomeyer.com.br/pt/inteligencia-juridica/publicacoes-ij/bancario-seguros-e-financeiro-ij/bcb-regulamenta-o-mercado-de-ativos-virtuais-no-brasil) e [Demarest](https://demarest.com.br/wp-content/uploads/2025/11/Demarest_BC_regulamenta_a_prestacao_de_servicos_de_ativos_virtuais.pdf); Lei 14.478/2022.
- Termos de testnets: [Avalanche](https://support.avax.network/en/articles/6639882-core-web-how-do-i-use-the-test-faucet), [Cardano](https://docs.cardano.org/cardano-testnet/tools/faucet), [Paxos](https://faucet.paxos.com/legal), [First Digital](https://www.firstdigitallabs.com/legal/fdusd-faucet-disclaimer).
