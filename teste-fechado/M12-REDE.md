# M12 — Teste de rede local: pendente de sessão isolada autorizada

## Estado em 31/10/2026

**Não executado como teste completo de aceitação.** Não há captura Get-NetTCPConnection dos processos Node+navegador durante três perguntas da Conversa autenticada; não se declara ausência de tráfego externo.

A entrada `scripts/integracoes-p0.mjs --ollama` configura `privado/ia-dono.json`. As regras desta rodada proíbem acessar privados/cofre e não se criou conta para contornar essa fronteira. Também não se atribuem ao Cosmos todas as conexões de um navegador já aberto pelo usuário: abas, extensões e tráfego de fundo exigem isolamento e identificação dos processos.

Fixtures anteriores da UI, mocks HTTP e a verificação do código não substituem este ensaio. Um harness dos componentes reais, sem conta e com transporte dedicado, pode produzir evidência restrita, mas não validaria a sessão autenticada e a ponte de produção. Não foi desabilitada autenticação para fazer o teste passar.

## Procedimento de retomada sem capturar conteúdo privado

1. Operador inicia manualmente uma sessão local autorizada, com nuvem desligada, sem informar senha/chave ao executor. Usar perfil de navegador dedicado e sem outras abas/extensões. Registrar PIDs exatos do servidor e árvore do navegador criado para o ensaio; nunca selecionar todos os processos Node/Chrome/Edge do computador.
2. Perguntar três argumentos públicos fixos, um por vez, sem arquivos privados. Registrar início/fim e a configuração local. Modelo e Z3 não devem ocupar memória simultaneamente.
3. Amostrar `Get-NetTCPConnection -OwningProcess <PIDs-do-ensaio>` durante as perguntas. Guardar só hora, PID, estado e endereços/portas locais/remotos; nada de headers, URL de autenticação, corpo ou conteúdo de outras abas. Eventos curtos entre amostras podem escapar: documentar intervalo e limite de cobertura.
4. Diferenciar conexões estabelecidas, listeners sem destino (`0.0.0.0`/`::`) e TIME_WAIT sem PID atribuível. Destino externo em processo do ensaio é achado a investigar, não algo a descartar silenciosamente como telemetria.
5. Critério pedido: somente loopback para conexões do fluxo local. Se aparecer outro destino, registrar endereço/porta e parar o ensaio; não registrar conteúdo nem encerrar processo alheio. Não fazer alteração de firewall, proxy, DNS ou política do usuário para mascarar resultado.

Continua pendente a prova empírica no navegador autenticado. A restrição não indica vazamento encontrado; indica ausência da medição exigida.
