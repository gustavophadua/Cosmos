"""O relatório de uma medição a partir das notas item a item (testes/nota.test.ts).

Uso:
  python -I -X utf8 -B scripts/relatorio-nota.py NOTAS.jsonl [--comparar ANTES.jsonl]

Mostra, com o intervalo de 95% (Wilson), a nota completa (classe dita certa e fórmulas equivalentes), a classe que o
Z3 dá às fórmulas do modelo, as parciais, a nota por classe e por padrão, a matriz de confusão da classe dita e os
motivos de erro. Com --comparar, compara as duas medições item a item nos itens em comum (McNemar exato): uma
diferença só conta se o valor-p for menor que 0,05. Não mostra frase nenhuma, só ids, padrões e contagens.
"""
import json, math, sys
from collections import Counter, defaultdict

CLASSES = ('segue', 'contradiz', 'independente')


def ler(arquivo):
    with open(arquivo, encoding='utf-8') as f:
        notas = {}
        for linha in f:
            if linha.strip():
                n = json.loads(linha)
                notas[n['id']] = n  # a última nota de um id vale (fatia refeita)
        return notas


def wilson(k, n, z=1.96):
    if not n:
        return 0.0, 0.0
    p = k / n
    centro = (p + z * z / (2 * n)) / (1 + z * z / n)
    meia = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / (1 + z * z / n)
    return max(0.0, centro - meia), min(1.0, centro + meia)


def taxa(k, n):
    lo, hi = wilson(k, n)
    return f'{k}/{n} = {100 * k / n:.1f}% (95%: {100 * lo:.1f}–{100 * hi:.1f}%)' if n else '0/0'


def mcnemar(b, c):
    """Valor-p bilateral exato: b = só a nova acertou, c = só a antiga acertou."""
    n = b + c
    if not n:
        return 1.0
    k = min(b, c)
    return min(1.0, 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n)


def relatorio(notas):
    ns = list(notas.values())
    n = len(ns)
    conta = lambda f: sum(1 for x in ns if f(x))
    print(f'Itens: {n}')
    print(f'  Completa (classe dita certa + fórmulas fiéis): {taxa(conta(lambda x: x["completa"]), n)}')
    print(f'  Classe certa pelo Z3 a partir das fórmulas do modelo: {taxa(conta(lambda x: x.get("classe_z3") == x["classe_gabarito"]), n)}')
    print(f'  Fórmulas fiéis (premissas e conclusão): {taxa(conta(lambda x: x["premissasFieis"] and x["conclusaoFiel"]), n)}')
    print(f'  Classe dita certa: {taxa(conta(lambda x: x["classeCerta"]), n)}')
    print(f'  Lê em m2 com o vocabulário: {taxa(conta(lambda x: x["le"]), n)}')
    print('Por classe do gabarito (completas):')
    for c in CLASSES:
        xs = [x for x in ns if x['classe_gabarito'] == c]
        print(f'  {c}: {taxa(sum(1 for x in xs if x["completa"]), len(xs))}')
    print('Matriz de confusão da classe dita (linha = gabarito, coluna = modelo):')
    m = Counter((x['classe_gabarito'], x.get('classe_modelo')) for x in ns)
    print('  ' + ' ' * 13 + ''.join(f'{c or "sem classe":>13}' for c in (*CLASSES, None)))
    for g in CLASSES:
        print(f'  {g:<13}' + ''.join(f'{m[(g, c)]:>13}' for c in (*CLASSES, None)))
    por = defaultdict(list)
    for x in ns:
        por[x.get('padrao') or '?'].append(x['completa'])
    print('Por padrão (completas/itens), do pior para o melhor:')
    for p, xs in sorted(por.items(), key=lambda kv: (sum(kv[1]) / len(kv[1]), kv[0])):
        print(f'  {p}: {sum(xs)}/{len(xs)}')
    motivos = Counter(parte.strip() for x in ns if not x['completa'] for parte in (x.get('motivo') or 'sem motivo').split(';'))
    print('Motivos de erro:')
    for mot, k in motivos.most_common(12):
        print(f'  {k} × {mot[:110]}')


if __name__ == '__main__':
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    notas = ler(args[0])
    relatorio(notas)
    if '--comparar' in args:
        antes = ler(args[args.index('--comparar') + 1])
        comuns = sorted(set(notas) & set(antes))
        b = sum(1 for i in comuns if notas[i]['completa'] and not antes[i]['completa'])
        c = sum(1 for i in comuns if antes[i]['completa'] and not notas[i]['completa'])
        p = mcnemar(b, c)
        ka, kn = sum(antes[i]['completa'] for i in comuns), sum(notas[i]['completa'] for i in comuns)
        print(f'Comparação em {len(comuns)} itens em comum: antes {ka}, agora {kn} completas; '
              f'{b} só agora, {c} só antes; McNemar p = {p:.4f} → ' + ('diferença significativa' if p < 0.05 else 'diferença NÃO significativa'))
