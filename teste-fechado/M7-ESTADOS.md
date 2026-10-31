# M7 - estados da Conversa

Conferência de 31/10/2026. As capturas foram feitas com fixtures públicas, transporte/solver falsos e componentes reais, em servidor separado http://127.0.0.1:5180 com HMR desativado. Não houve modelo real, chave, conta, senha ou acesso ao cofre. A fixture não comprova que um argumento recebeu aquela classe no solver; comprova a apresentação do estado fornecido. Não foi reproduzida navegação de uma conta autenticada. O servidor e a aba temporários foram encerrados após a conferência.

| Caso | Origem do texto | Captura |
|---|---|---|
| Texto sem argumento | assistente.ts:186; executar recusa entrada não separável | sem-argumento.png |
| Modelo indisponível | assistente.ts:194; falha de transporte não recebe classe | modelo-fora.png |
| Resposta ilegível | assistente.ts:198; erro de leitura não chama conferidor | ilegivel.png |
| Provedor recusou | assistente.ts:193; código fechado vindo de recusa explícita | recusa.png |
| Z3 sem decisão/prazo | assistente.ts:228-231; ConversaIA.tsx:150 | z3.png |
| Premissas incompatíveis | assistente.ts:228-230; ConversaIA.tsx:150 | incompativel.png |
| Classe lógica | assistente.ts:222; ConversaIA.tsx:152 | segue.png, contradiz.png, independente.png |
| Certificado | ConversaIA.tsx:156; indisponível para esta resposta | aviso visível em segue.png e demais cartões |

As linhas são do fechamento da missão e podem mudar em commits futuros. A ausência de “logo” não é por si só um erro: o separador aceita outros marcadores e formatos. O caso de entrada desta conferência é uma frase isolada que não se separa em premissas/conclusão.

## Recusa e segurança do transporte

O adaptador reconhece apenas message.refusal não vazio ou finish_reason content_filter no retorno estruturado do provedor. Não tenta inferir recusa de segurança lendo texto livre. HTTP 401/403 não é esse estado. A ponte repassa somente o código provedor-recusou em HTTP 422; o cliente formalizar reconhece esse código e a UI usa mensagem própria. O detalhe livre da recusa não é repassado. O teste ponta a ponta usa transporte falso, não Groq real.

## Certificado

O fluxo atual da Conversa não recebe prova independente por resposta. A interface declara essa ausência; não foi inventado um caso verde de certificado. O resultado lógico do solver continua separado dessa garantia. Uma integração futura precisará de contrato, artefato e conferência próprios.

## Evidências locais

Capturas e snapshots de acessibilidade estão na entrega local entrega-gpt/m7-capturas/ (nove PNGs e folha de contato), fora do repositório. Harness temporário tmp/m7-ui/ usa executar e CartaoIA reais; é identificado na própria página como fixture. Casos inspecionados visualmente, sem tela de erro de compilação ou sobreposição que impeça leitura.
