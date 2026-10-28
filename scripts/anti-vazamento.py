"""Confere, na máquina do dono, que um lote público (validação ou treino) não vaza o conjunto fechado.

Uso:
  python -I -X utf8 -B scripts/anti-vazamento.py <conjunto.jsonl fechado> <lote.jsonl> [<lote.jsonl> ...]

Para cada lote, conta:
  - palavras de conteúdo em comum (todas as palavras das frases e das leituras, menos as palavras lógicas e de ligação);
  - símbolos do vocabulário em comum;
  - frases idênticas (premissa ou conclusão);
  - fórmulas do gabarito idênticas, com os mesmos símbolos.
O esqueleto lógico (o padrão de raciocínio) é o mesmo de propósito: os fenômenos são públicos. O vazamento seria a
mesma frase ou as mesmas palavras. Só imprime contagens, nunca os itens nem as palavras do conjunto fechado; o código
de saída é 1 se alguma contagem passa de zero. Rodar com -I para não carregar código da pasta dos arquivos.
"""
import json, re, sys

LIGACAO = set('''
todo toda todos todas cada qualquer algum alguma alguns algumas nenhum nenhuma ninguém alguém algo
é são ser seja for não nem se então ou e só somente apenas caso também que há existe um uma uns umas
o a os as de do da dos das pelo pela pelos pelas menos verdade falso x y
'''.split())


def lotes(arquivo):
    with open(arquivo, encoding='utf-8') as f:
        for linha in f:
            if linha.strip():
                o = json.loads(linha)
                yield o.get('item', o)


def palavras(texto):
    return {p for p in re.findall(r'[a-zà-ÿ]+', texto.lower()) if p not in LIGACAO}


def resumo(itens):
    pal, simb, frases, formulas = set(), set(), set(), set()
    for i in itens:
        textos = [*i['texto']['premissas'], i['texto']['conclusao']]
        frases.update(t.strip().lower() for t in textos)
        for t in textos + [v['leitura'] for v in i['vocabulario']]:
            pal |= palavras(t)
        simb.update(v['simbolo'] for v in i['vocabulario'])
        formulas.update(f.replace(' ', '') for f in [*i['gabarito']['premissas'], i['gabarito']['conclusao']])
    return pal, simb, frases, formulas


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit(__doc__)
    fechado = resumo(list(lotes(sys.argv[1])))
    falhou = False
    for arquivo in sys.argv[2:]:
        itens = list(lotes(arquivo))
        lote = resumo(itens)
        contagens = [len(a & b) for a, b in zip(fechado, lote)]
        falhou |= any(contagens)
        print(f'{arquivo}: {len(itens)} itens; em comum com o fechado: {contagens[0]} palavras de conteúdo, '
              f'{contagens[1]} símbolos, {contagens[2]} frases, {contagens[3]} fórmulas')
    print('VAZAMENTO: há coincidências; não use o lote' if falhou else 'sem coincidências')
    sys.exit(1 if falhou else 0)
