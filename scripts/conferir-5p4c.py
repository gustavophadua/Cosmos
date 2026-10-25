#!/usr/bin/env python3
"""Confere a prova pública 5p4c (software-public-v1/) com um ou mais Carcaras, e tenta enganá-los de propósito.

Uso: python3 scripts/conferir-5p4c.py NOME=CAMINHO_DO_CARCARA [NOME=CAMINHO ...]

1. Os três arquivos incluídos (SMT2, WGSL, prova Alethe) têm o tamanho e o SHA-256 de hashes.json e dos valores
   fixados aqui (passagem de 25/10/2026, Apêndice C): mudar um arquivo exige mudar este verificador.
2. Cada Carcara confere a prova contra o problema: tem de dar "valid".
3. Cada Carcara recebe quatro estragos e tem de dar "invalid" em todos: um pivô de resolução trocado, uma suposição
   que não está no problema, a prova cortada no fim e o problema sem a última cláusula.

O que isto mostra: a prova Alethe da instância (5 pombos, 4 casas: 20 variáveis, 75 cláusulas) é uma refutação válida
do problema. O que não mostra: a saída da GPU (4 MiB) não está no pacote, só o tamanho e o hash; esta conferência não
atesta hardware, execução em GPU nem o caminho da GPU até a prova. Só usa a biblioteca padrão.
"""
import hashlib, json, os, re, subprocess, sys, tempfile

RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'software-public-v1')
FIXADOS = {
    'smt2/5p4c-20v-75c.smt2': (3423, 'bdb80f5683e3276ebb22b1154fce30d389c94e139ad6b27c110e578905ee851a'),
    'wgsl/5p4c.wgsl': (756, '31a3c66e68dcbf6401a55fd0f2736d0aadcd1f00f3b5a8d997f8d12dacb53e22'),
    'prova/5p4c.alethe': (29073, '235013e58aa06eece569b5c1395995ae78f1dfb3a52443a6a9f6f0cc2d757adf'),
}
SAIDA_GPU = (4194304, 'd92ccfe9ce8e5614ffa10a93bd8b52502489aa005a987713622bc61d4864cfec')


def sha(b):
    return hashlib.sha256(b).hexdigest()


def carcara(binario, pasta, prova, problema):
    r = subprocess.run([binario, '--no-color', 'check', prova, problema], cwd=pasta, capture_output=True, text=True, timeout=120)
    return r.returncode, (r.stdout or '').strip(), ' '.join((r.stderr or '').split())[:300]


def main():
    binarios = dict(a.split('=', 1) for a in sys.argv[1:])
    if not binarios:
        sys.exit('informe pelo menos um Carcara: NOME=CAMINHO')
    falhas, linhas = [], []

    hashes = json.load(open(os.path.join(RAIZ, 'hashes.json'), encoding='utf-8'))
    declarados = {i['arquivo']: (i['bytes'], i['sha256']) for i in hashes['incluidos']}
    bytes_ = {}
    for arquivo, (tamanho, digest) in FIXADOS.items():
        b = open(os.path.join(RAIZ, arquivo), 'rb').read()
        bytes_[arquivo] = b
        if (len(b), sha(b)) != (tamanho, digest):
            falhas.append(f'{arquivo}: {len(b)} bytes, {sha(b)}; o fixado é {tamanho} bytes, {digest}')
        if declarados.get(arquivo) != (tamanho, digest):
            falhas.append(f'{arquivo}: hashes.json diverge do valor fixado')
    gpu = [r for r in hashes['referenciasSemArquivo'] if r['id'] == 'saidaGpu']
    if not gpu or (gpu[0]['bytes'], gpu[0]['sha256']) != SAIDA_GPU:
        falhas.append('a referência da saída da GPU em hashes.json diverge da fixada')
    linhas.append(f"| Arquivos (SMT2, WGSL, Alethe) | {'3 de 3 com tamanho e SHA-256 fixados' if not falhas else 'DIVERGEM'} |")

    prova = bytes_['prova/5p4c.alethe'].decode('utf-8')
    problema = bytes_['smt2/5p4c-20v-75c.smt2'].decode('utf-8')
    pivo = re.sub(r'(\(step r0 [^\n]+:args \([^ ]+ )true(\)\))', r'\1false\2', prova, count=1)
    premissa = prova.replace('(assume a0 (or p0h0 p0h1 p0h2 p0h3))', '(assume a0 false)', 1)
    asserts = [m.start() for m in re.finditer(r'^\(assert ', problema, re.M)]
    sem_clausula = problema[:asserts[-1]] + problema[problema.index('\n', asserts[-1]) + 1:]
    estragos = [('pivô trocado', pivo, problema), ('suposição fora do problema', premissa, problema),
                ('prova cortada', prova[:-2], problema), ('problema sem a última cláusula', prova, sem_clausula)]
    for nome, p, q in estragos:
        if (p, q) == (prova, problema):
            falhas.append(f'o estrago "{nome}" não foi montado')

    with tempfile.TemporaryDirectory() as pasta:
        def gravar(nome, texto):
            with open(os.path.join(pasta, nome), 'w', encoding='utf-8', newline='\n') as f:
                f.write(texto)
            return nome
        gravar('prova.alethe', prova); gravar('problema.smt2', problema)
        for rotulo, binario in binarios.items():
            versao = subprocess.run([binario, '--version'], capture_output=True, text=True).stdout.strip()
            codigo, saida, erro = carcara(binario, pasta, 'prova.alethe', 'problema.smt2')
            if (codigo, saida) != (0, 'valid'):
                falhas.append(f'{rotulo}: a prova deu {saida!r} (código {codigo}): {erro}')
            recusados = 0
            for i, (nome, p, q) in enumerate(estragos):
                c, s, e = carcara(binario, pasta, gravar(f'e{i}.alethe', p), gravar(f'e{i}.smt2', q))
                if c != 0 and s == 'invalid':
                    recusados += 1
                else:
                    falhas.append(f'{rotulo}: o estrago "{nome}" deu {s!r} (código {c})')
            executavel = sha(open(binario, 'rb').read())
            linhas.append(f'| Carcara {rotulo} ({versao}; executável `{executavel[:16]}…`) | prova: {saida} · estragos recusados: {recusados} de {len(estragos)} |')

    texto = '\n'.join(['## Verificador público · prova 5p4c (software-public-v1)', '', '| Conferência | Resultado |', '| --- | --- |', *linhas,
                       f'| Saída da GPU | não distribuída: só {SAIDA_GPU[0]} bytes e o SHA-256 `{SAIDA_GPU[1][:16]}…` |', '',
                       'A prova Alethe é uma refutação válida da instância 5 pombos / 4 casas. Esta conferência não atesta hardware, '
                       'execução em GPU nem o caminho da GPU até a prova.', '', *[f'- FALHA: {f}' for f in falhas], ''])
    print(texto)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8').write(texto + '\n')
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
