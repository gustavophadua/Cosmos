# M11 — Cosmos + 120b na metade de teste: dependência externa

Em 31/10/2026, a verificação booleana de presença de `GROQ_API_KEY` no ambiente deste processo retornou **falta**. Nenhum valor de credencial foi lido, exibido ou gravado; não se procurou chave em arquivo, perfil, cofre ou outra sessão.

**Medição não executada.** Não há novo número Cosmos+120b/100, não houve chamada pública e não se extrapolou a antiga amostra parcial. A falta da variável não é falha do Groq nem resultado do modelo.

Quando o operador disponibilizar a variável ao processo autorizado, manter cego-v2, metade limpa e configuração congelada; uma fatia de 25 itens por dia, saída distinta `tmp/frases-gpt/cosmos120-teste/respostas/fatia-NN`. Conferir resultados existentes antes de iniciar. Em HTTP429 interromper, sem troca de conta/chave/provedor para contornar cota; retomar em outro dia. Descarregar o modelo local antes da nota Z3, um processo por fatia curta, sem paralelo. Não registrar chave em log, Git, browser ou VITE_*. A medição não foi substituída por mock.

A retomada depende da configuração do operador. Não foi solicitado envio de chave pelo chat nem aceita cobrança automática. Os testes de adaptador que acompanham esta entrega são regressões com transporte falso, não uma medição 120b real.
