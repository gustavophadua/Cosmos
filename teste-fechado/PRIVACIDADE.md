# Aviso de privacidade do teste fechado do Cosmos

> **RASCUNHO para revisão.** Preparado para orientar o teste, à luz da LGPD (Lei 13.709/2018); não é parecer jurídico.
> Precisa ser revisado por um advogado e completado com os dados do controlador antes de usar com pessoas de fora.

**Controlador:** [nome do responsável ou da empresa] · **Contato para privacidade:** [canal]

## O que fica no seu computador (e só nele)

- **A conta:** um apelido e uma chave criada no aparelho. A senha nunca é guardada nem enviada; ela deriva a chave que
  cifra os dados.
- **O histórico da Conversa e os relatos de erro:** cifrados com a chave da sua conta, no armazenamento do navegador.
- **O texto que você escreve:** traduzido pelo modelo de IA que roda no seu computador (Ollama) e conferido pelo Z3,
  também no seu computador.

O Cosmos não tem coleta automática, telemetria, anúncios nem cookies de rastreamento. Nada é enviado ao responsável
pelo teste sem você exportar e mandar um arquivo.

## Quando algo sai do computador

- **Modelo grande na nuvem (opcional, começa desligado):** se você ligar, o texto do argumento é enviado ao serviço
  Groq (Groq, Inc., nos Estados Unidos) para ser traduzido, e a tela avisa. Vale a política de privacidade do Groq.
  A decisão (o Z3) continua no seu computador.
- **Relatos de erro exportados:** só se você baixar o arquivo e mandar. Ele contém a pergunta, a tradução, a classe e o
  seu comentário; não contém a sua senha, a sua chave nem o resto do histórico.
- **Instalação:** os downloads do Node.js, do Ollama, das peças do Cosmos e do modelo vêm dos sites desses projetos.

## Para que usamos o que você manda

Corrigir erros do Cosmos e, sem identificar você, treinar e medir o modelo próprio (base legal: o seu consentimento ao
mandar). Guardamos os relatos enquanto durar o desenvolvimento, e você pode pedir a exclusão a qualquer momento.

## Seus direitos

Pela LGPD, você pode pedir confirmação, acesso, correção, anonimização, portabilidade e exclusão dos dados que nos
mandou, e revogar o consentimento, pelo contato acima. Os dados que ficam só no seu computador estão sob o seu
controle: apagar a pasta do Cosmos e os dados do site no navegador apaga tudo.
