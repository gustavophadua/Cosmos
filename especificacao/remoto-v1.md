# Remoto v1: o Cosmos pelo telefone, com login

Versão `remoto-v1`, 02/11/2026. Código: `src/integracoes/remoto-node.ts`, `scripts/cosmos-remoto.mjs`,
`src/interfaces/modo-remoto.ts`. Testes: `testes/remoto.test.ts` e o teste da reserva em `testes/integracoes-ollama.test.ts`.

## 1. O que muda

Até aqui, a Conversa só abria no próprio computador (`127.0.0.1`), presa à conta cifrada do aparelho. Agora há dois
modos:

| | Modo local (como antes) | Modo remoto (novo) |
|---|---|---|
| Como abre | `Abrir-Cosmos-IA.cmd` | `Abrir-Cosmos-Remoto.cmd` |
| De onde | só deste computador | do telefone, de qualquer lugar, pelo túnel |
| Quem entra | a conta cifrada do aparelho (seed, assinatura) | login com a senha da dona |
| Tradução | Ollama local; Groq se a pessoa ligar | Groq primeiro, Ollama local de reserva |
| Onde o Z3 decide | neste computador | neste computador |
| Histórico | cifrado na conta do aparelho | cifrado neste computador, com a chave da senha |
| Conta, carteira e moeda de teste | sim | não: continuam só no modo local |

O computador continua sendo o servidor: o telefone só mostra a tela e manda o texto.

## 2. Decisões do dono (02/11/2026)

- Servidor: o próprio computador, atrás de um túnel da Cloudflare (sem abrir porta no roteador).
- Login: uma conta só, a da dona. Não há cadastro pela rede.
- Tradução: Groq (gpt-oss-120b) primeiro; quando falha, o Ollama do computador.

## 3. Como funciona

```
telefone ──https──▶ Cloudflare ──túnel──▶ porta remota (127.0.0.1:4180) ──segredo──▶ ponte interna ──▶ Ollama / Groq / Z3
```

1. **Porta remota** (`remoto-node.ts`): o único ponto que o túnel alcança. Confere o Host, faz o login e guarda as
   sessões.
2. **Ponte interna**: a mesma ponte do modo local, sem mudança. Escuta numa porta qualquer de `127.0.0.1` e só atende
   quem traz um segredo de 32 bytes criado a cada vez que o programa abre. Outro programa do computador não chega à
   IA sem ele.
3. **A página**: a mesma do modo local. A porta remota põe nela a marca `<meta name="cosmos-remoto">`, e a Conversa
   troca a conta do aparelho pelo login.

## 4. Segurança

| Ameaça | Defesa |
|---|---|
| Adivinhar a senha | scrypt (N = 2^15); 5 erros em 15 minutos bloqueiam o login |
| Senha vazada pela rede | só por https (túnel); a senha nunca é guardada, só o resumo scrypt |
| Roubo da sessão | cookie `__Host-` com Secure, HttpOnly e SameSite=Strict; 12 horas parada ou 7 dias no total; só na memória |
| Outro site agindo em nome da dona | SameSite=Strict e, em todo pedido que muda algo, a origem exata |
| A página dentro de outra | `X-Frame-Options: DENY` e `frame-ancestors 'none'` |
| Cabeçalho forjado chegando à ponte | só uma lista fixa de cabeçalhos passa; cookie, Forwarded e os da Cloudflare ficam na porta |
| Outro programa do computador usando a IA | a ponte interna exige o segredo do processo |
| Ler o histórico no disco | AES-256-GCM, com a chave tirada da senha no login; o nome do arquivo entra como dado associado |
| Chave do histórico esquecida na memória | ela sai da memória quando não há mais sessão viva |

A chave da Groq fica só no processo do computador (variável `GROQ_API_KEY`), nunca no telefone.

## 5. Como usar

1. Instalar o túnel, uma vez: `winget install --id Cloudflare.cloudflared`.
2. Abrir `Abrir-Cosmos-Remoto.cmd`. Na primeira vez, ele pede a senha da dona (12 a 256 caracteres), digitada no
   terminal sem aparecer.
3. O terminal mostra o endereço, por exemplo `https://palavras-aleatorias.trycloudflare.com/cosmos/`. Abra no telefone
   e entre com a senha.

4. Para ter o Cosmos na tela inicial do telefone, toque em **Baixar o app**, na barra do topo:
   - no Android, o botão instala direto quando o navegador oferece; senão, mostra o caminho pelo menu ⋮;
   - no iPhone, mostra o caminho: Safari → Compartilhar → Adicionar à Tela de Início.

   O app instalado abre direto na Conversa. A porta remota serve o manifest e os ícones sem login, porque o telefone
   os busca sem o cookie; eles não contêm nada da dona.

No computador, o mesmo botão baixa o pacote do Cosmos para Windows, o `.zip` do repositório com o
`Instalar-Cosmos.cmd`.

Para trocar a senha: `node scripts/cosmos-remoto.mjs --definir-senha`. A senha nova gera outra chave, e o histórico
remoto antigo deixa de se ler.

## 6. Limites

- **O computador precisa estar ligado,** com o programa aberto. Sem isso, o telefone não tem a quem perguntar.
- **O endereço do túnel rápido muda cada vez que o programa abre.** Um endereço fixo pede um túnel nomeado da
  Cloudflare, com um domínio próprio (`--host=cosmos.seu-dominio.com`).
- **A Cloudflare corta uma resposta que demora mais de 100 segundos.** A Groq responde em segundos. Já o Ollama na CPU,
  quando entra de reserva, pode passar disso, e então o telefone recebe um erro. A solução é a tradução virar tarefa
  de fundo, como o revisor; isso ainda não foi feito.
- **No modo remoto, o texto do argumento sai para a Groq,** como no modo local com a nuvem ligada. Quem quer que nada
  saia do computador usa o modo local.
- **As sessões ficam só na memória:** quando o programa fecha, é preciso entrar de novo.

## 7. Verificado em 02/11/2026

- `testes/remoto.test.ts` (6 testes): Host, login, origem, cookie, bloqueio, repasse de cabeçalhos, segredo da ponte
  interna e o histórico cifrado e preso ao nome do arquivo.
- `testes/integracoes-ollama.test.ts`: a Groq sem cota passa a vez ao Ollama; a recusa do provedor não passa.
- De ponta a ponta, no navegador em tamanho de telefone (375 × 812), com `--sem-tunel` e uma senha de teste:
  1. o login abre;
  2. "Toda pessoa é parte do todo. Logo, toda pessoa está limitada no que vê" foi traduzida pela Groq em cerca de 10
     segundos, com a camada da realidade (premissa fato R05, R11 e R31; conclusão fato R27 a R30);
  3. o histórico volta depois de recarregar a página;
  4. "Sair" derruba a sessão.
- O túnel da Cloudflare ainda **não** foi testado: o `cloudflared` não estava instalado neste computador.
