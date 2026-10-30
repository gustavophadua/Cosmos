# Cosmos: como instalar e usar (teste fechado)

**O que é.** O Cosmos lê um raciocínio escrito em português, desenha o argumento (os fatos, a ligação que falta e a
conclusão) e diz, com prova de computador, se a conclusão decorre do que foi dito. Quem decide é um verificador lógico
(o Z3), não a IA. Esta é uma versão de teste: pode errar, e o seu relato de erro é o que mais ajuda.

**O que precisa.** Windows 10 ou 11, 8 GB de memória (16 GB é melhor), cerca de 4 GB livres e internet só na instalação.

## Instalar (uma vez, uns 10 minutos)

1. Copie a pasta `Cosmos` para o computador (por exemplo, na Área de Trabalho).
2. Dê dois cliques em **`Instalar-Cosmos.cmd`**. Ele confere e, se faltar, instala o Node.js e o Ollama (o Windows
   pode pedir confirmação), as peças do Cosmos e o modelo de IA (cerca de 2,5 GB).
3. No fim aparece o atalho **Cosmos** na Área de Trabalho.

Para só conferir, sem instalar nada: `powershell -ExecutionPolicy Bypass -File scripts\instalar-windows.ps1 -Conferir`.

## Usar

1. Abra o atalho **Cosmos**. Uma janela preta liga o serviço (deixe aberta) e o navegador abre a Conversa.
2. Na primeira vez, crie a sua conta: um apelido e uma senha de 12 caracteres ou mais. **Guarde a senha**: ela cifra
   o seu histórico e não há como recuperá-la. A IA fica presa à sua conta.
3. Escreva um raciocínio, por exemplo: *"Toda pessoa é necessária ao todo. Nenhuma pessoa é dona da sua função. Logo,
   nenhuma pessoa invalida a existência de outra."* O Cosmos responde com o mapa do argumento.
4. Confira o **"entendi:"** embaixo de cada frase. Se um termo foi lido errado, use **Corrigir os termos**.
5. Achou um erro? Clique em **Isso está errado** e diga o que foi. Para nos mandar, use **exportar** na lateral e
   envie o arquivo `cosmos-relatos-de-erro.json` pelo canal combinado.

## Bom saber

- Sem internet, tudo roda no seu computador: o texto não sai dele. Cada pergunta leva de 30 segundos a 3 minutos,
  conforme o computador.
- A opção **modelo grande na nuvem** (quando disponível) responde em segundos e lê melhor frases abstratas, mas aí o
  texto do argumento vai para um serviço externo (Groq). Ela começa desligada.
- A conta bloqueia sozinha depois de 10 minutos parada; é só entrar de novo.
- Se a IA disser que está ligada a outra conta, avise: o serviço aceita uma conta dona por computador.
