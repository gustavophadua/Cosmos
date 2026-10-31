# Ajustes de revisão antes de main — 31/10/2026

## Pontes

Por correção explícita do operador, revertida a preferência M5 por menos condições. `src/motor/ponte.ts` retorna ao desenho de 63d31ff: candidatas com antecedentes mais restritivos primeiro e seleção de até quatro com diversidade. Para o mesmo consequente, A∧B→C compromete menos que A→C. Isso não estabelece uma ordenação semântica total entre antecedentes incomparáveis.

Mantidos os novos testes de circularidade com Z3 real. A regressão de prioridade agora também confere a força relativa: A→C implica (A∧B)→C, mas a recíproca é independente. Recuperadas as expectativas originais de diversidade, sem o fallback que aceitava ausência de uma opção.

## Cartão e certificado

Removido o aviso repetido do corpo principal. A informação continua verdadeira e acessível dentro de **Fórmulas (m2) e verificação**, fechado por padrão. Não foi inventado certificado por resposta nem alterado o selo das fases. Regressão renderiza o componente real no servidor e verifica que o aviso só aparece em detalhes fechados.

## Diagnósticos

Mantidas as fases distintas de tradução indisponível, leitura ilegível, recusa explícita, base inconsistente e ausência de decisão Z3. Serviço ausente recebe orientação específica para abrir Cosmos/Ollama; falhas de leitura preservam o motivo do parser. Outras falhas de transporte mantêm seu diagnóstico textual em vez de serem todas convertidas para “o modelo ou serviço não respondeu”.

Não são incluídos stack ou corpo bruto de resposta do provedor. Marcadores reconhecidos de credenciais são ocultados no detalhe textual, com tamanho limitado. Isso não é um classificador universal de dados sensíveis; os adaptadores continuam responsáveis por não repassar segredos. Teste usa somente credencial fictícia e verifica sua ocultação. Nenhuma chamada a modelo/API real necessária nesta revisão.

## Validação e histórico

- Antes das correções: 6 falhas/21 aprovados em 3 arquivos, 5,66s.
- Após correções: 27/27 em 3 arquivos, 6,73s.
- Typecheck aprovado; regressão ampliada: 111/111 em 8 arquivos, 15,91s; termos LIMPO.
- M1 e demais medições históricas não repetidas. Os tempos de ponte da M9 descrevem a implementação anterior à presente revisão e não são novos benchmarks desta versão.
- Hashes históricos, prompts e fases não alterados. Build/suíte completa e 13/13 devem ser conferidos antes do push desta revisão.

Sem merge, deploy ou fechamento artificial da M12. A revisão segue na branch dedicada.
