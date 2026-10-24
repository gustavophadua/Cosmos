# Cadeias — formato cadeia-v1

A cadeia pessoal é a Fase 3 do plano: a sequência dos registros de uma pessoa
(`registros-v1.md`), cada um preso ao anterior pelo resumo e assinado pela chave
dela. Quem recebe uma cadeia por arquivo confere tudo sem confiar em quem
mandou, e acusa qualquer alteração:

- um registro mudado, tirado ou posto no meio;
- uma assinatura que não é da chave;
- uma versão nova que reescreve ou corta o que a antiga já tinha.

A cadeia diz que cada registro é daquela chave e não mudou. Ela não diz que o
registro é válido: isso é a conferência do registro, pela seção 7 de
`registros-v1.md`.

## 1. A chave e a assinatura

A chave é Ed25519, da RFC 8032, na forma pura: sem pré-hash e sem contexto. A
chave pública são 32 bytes, escritos em 64 dígitos hexadecimais minúsculos; a
assinatura são 64 bytes, em 128 dígitos. O autor de um registro (seção 2 de
`registros-v1.md`) é o SHA-256 dos 32 bytes da chave pública.

**A conferência da assinatura** é esta, e não a de uma biblioteca qualquer. As
bibliotecas discordam nos casos de borda, e uma das mais usadas (a do OpenSSL)
aceita uma assinatura forjada para qualquer mensagem quando a chave é o ponto
neutro. Uma assinatura (R, S) de uma mensagem M pela chave A vale quando:

1. A se lê como ponto da curva: y < p, a raiz de x existe, e x = 0 não vem com
   o bit de sinal 1 (seção 5.1.3 da RFC 8032);
2. A tem ordem L: [L]A é o neutro e A não é o neutro. Isso recusa o ponto
   neutro e todo ponto com parte de ordem pequena. Uma chave feita pela RFC 8032
   sempre passa;
3. S, os últimos 32 bytes lidos como inteiro em little-endian, é menor que L;
4. com k = SHA-512(R ‖ A ‖ M) lido em little-endian e reduzido módulo L, a
   escrita de [S]B − [k]A (seção 5.1.2 da RFC 8032) é igual aos 32 bytes de R.

Aqui p = 2²⁵⁵ − 19, L = 2²⁵² + 27742317777372353535851937790883648493, e B é o
ponto base da RFC 8032. A comparação pela escrita recusa também um R escrito
fora da forma canônica.

## 2. O elo

Cada registro entra na cadeia num elo:

| Campo | Conteúdo |
| --- | --- |
| `indice` | a posição do elo, a partir de 0 |
| `anterior` | o resumo do elo anterior; no elo 0, 64 zeros |
| `registroTexto` | o registro (registro-v1), como texto JSON |
| `assinatura` | a assinatura do texto do elo, em 128 dígitos hexadecimais minúsculos |

**O texto do elo** é o que a chave assina. São cinco linhas, cada uma terminada
em `\n` (LF), em UTF-8:

```
cadeia-v1
chave <a chave pública, 64 dígitos>
indice <o índice, em decimal, sem zeros à esquerda>
anterior <o campo anterior>
registro <o SHA-256 dos bytes UTF-8 de registroTexto, 64 dígitos>
```

**O resumo do elo** é o SHA-256 do texto do elo, em hexadecimal minúsculo. O
resumo da cadeia é o do último elo: é ele que um carimbo de tempo vai prender
(seção 8).

O registro vai como texto, e não como objeto, para não haver duas escritas do
mesmo registro: o hash é dos bytes que estão no arquivo. O texto é lido pelo
leitor estrito de JSON da seção 2 de `registros-v1.md`, que recusa chave
repetida.

## 3. O arquivo da cadeia

A cadeia vai num arquivo JSON com estes campos, e só estes, sem chave repetida
em objeto nenhum e com os números inteiros escritos sem ponto e sem expoente,
como na seção 2 de `registros-v1.md`:

| Campo | Conteúdo |
| --- | --- |
| `formato` | `"cadeia-v1"` |
| `chave` | a chave pública, em 64 dígitos hexadecimais minúsculos |
| `elos` | a lista dos elos, em ordem, com pelo menos um |
| `arquivos` | opcional: `{caminho: conteúdo}`, os arquivos dos certificados dos registros, como texto |

Um elo tem só os quatro campos da seção 2. Em `arquivos`, cada caminho é um dos
que os registros citam, na forma da seção 5 de `registros-v1.md`, e o conteúdo
é o texto do arquivo. Os arquivos não são assinados: o SHA-256 de cada um está
no registro, que é assinado.

## 4. A conferência e os motivos de recusa

A conferência dá **aceita**, com o número de elos e o resumo da cadeia, ou
**recusada**, com o código e, quando o defeito está num elo, o índice dele.

Ela para no primeiro passo que falha, nesta ordem:

1. o arquivo: a leitura e a forma (C1), o formato (C2);
2. a chave (C3);
3. cada elo, do primeiro ao último: o índice (C4), o anterior (C5), o registro
   (C6), o autor (C7) e a assinatura (C8).

| Código | Recusa quando |
| --- | --- |
| C1 | O JSON não se lê, ou tem chave repetida; falta ou sobra um campo; um campo está mal escrito (hexadecimal com maiúscula ou tamanho errado, índice que não é inteiro); `elos` está vazio |
| C2 | O formato não é `cadeia-v1` |
| C3 | A chave não se lê como ponto, ou não tem ordem L (passos 1 e 2 da seção 1) |
| C4 | O índice do elo não é a posição dele |
| C5 | O anterior não é o resumo do elo anterior (no elo 0, não são 64 zeros) |
| C6 | `registroTexto` não se lê pelo leitor estrito, não é um objeto, ou não tem `autor` como texto |
| C7 | O autor do registro não é o SHA-256 da chave da cadeia |
| C8 | A assinatura não vale para o texto do elo (passos 3 e 4 da seção 1) |

## 5. Versões da mesma cadeia

Quem já tem uma cadeia aceita e recebe outra, também aceita, com a mesma chave,
compara as duas pelos resumos dos elos:

| Relação | Quando | O que fazer |
| --- | --- | --- |
| igual | os mesmos resumos, na mesma quantidade | nada |
| extensão | a antiga é o começo da nova | trocar pela nova |
| encurtada | a nova é o começo da antiga, com menos elos | acusar: some o que a pessoa já tinha publicado |
| bifurcada | há um índice em que os resumos diferem | acusar: a chave assinou duas histórias diferentes |

Numa bifurcação, os dois elos do mesmo índice, assinados pela mesma chave, são a
prova: guardam-se as duas versões. Com chaves diferentes, não são versões da
mesma cadeia.

## 6. A guarda da chave

Não é parte do formato, e outra implementação pode guardar a chave como quiser.
O Caderno guarda a chave privada no navegador, como chave do WebCrypto que o
código da página não consegue exportar. Na criação, a pessoa salva uma cópia de
segurança num arquivo cifrado com uma senha, para recuperar a identidade se
perder o aparelho.

## 7. Exemplos normativos

`cadeia-v1/exemplos.json` tem cadeias válidas e inválidas, cada uma com
`esperado` (`{"veredito": "aceita"}` ou `{"veredito": "recusada", "motivo":
código, "elo": índice}`), e pares de versões com a relação esperada. Cada
inválida tem um defeito só. Quando o defeito está na escrita do JSON, a cadeia
vem em `cadeiaTexto`, como texto. As chaves dos exemplos são as dos testes 1, 2
e 3 da RFC 8032 (seção 7.1), que não são de ninguém.

## 8. Limites da v1

1. Não há carimbo de tempo. O resumo da cadeia será carimbado no Bitcoin pelo
   OpenTimestamps numa versão seguinte.
2. Sem um carimbo, um corte no fim só é visto por quem já tinha a versão
   antiga.
3. Não há troca nem revogação de chave: perder a chave sem a cópia é perder a
   cadeia.
4. Uma chave, uma cadeia. A identidade da pessoa por trás da chave é da Fase 6.
5. A cadeia não confere os registros: a conferência de cada um é a de
   `registros-v1.md`.
