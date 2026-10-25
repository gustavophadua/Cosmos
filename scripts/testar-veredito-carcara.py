#!/usr/bin/env python3
"""Testa a leitura do veredito do Carcara em especificacao/provas-t1/conferir.py com Carcaras falsos (CP02, CP03).

Uso: python3 scripts/testar-veredito-carcara.py

Cada falso escreve uma saída e termina com um código; a leitura tem de dar o veredito esperado. "valid" só vale sozinho
e com código 0; uma segunda linha com veredito, uma saída vazia ou um "valid" com código diferente de 0 dão "erro".
Só usa a biblioteca padrão. Sai com código 1 se algum caso divergir.
"""
import os, sys, tempfile

ESPEC = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'especificacao', 'provas-t1')
sys.path.insert(0, ESPEC)
import conferir  # noqa: E402

CASOS = [
    ('valid sozinho, código 0', 'valid', 0, 'valid'),
    ('invalid, código 1', 'invalid', 1, 'invalid'),
    ('holey, código 0', 'holey', 0, 'holey'),
    ('valid seguido de invalid', 'valid\ninvalid', 0, 'erro'),
    ('valid com código 1', 'valid', 1, 'erro'),
    ('valid e o processo morto (137)', 'valid', 137, 'erro'),
    ('saída vazia', '', 0, 'erro'),
    ('invalid não é lido como valid', 'invalid', 0, 'invalid'),
]


def falso(pasta, nome, saida, codigo):
    py = os.path.join(pasta, nome + '.py')
    with open(py, 'w', encoding='utf-8') as f:
        f.write(f'import sys\nsys.stdout.write({saida!r} + ("\\n" if {saida!r} else ""))\nsys.exit({codigo})\n')
    if os.name == 'nt':
        exe = os.path.join(pasta, nome + '.cmd')
        with open(exe, 'w', encoding='ascii') as f:
            f.write(f'@"{sys.executable}" -I -B "{py}"\r\n@exit /b %errorlevel%\r\n')
    else:
        exe = os.path.join(pasta, nome)
        with open(exe, 'w', encoding='utf-8') as f:
            f.write(f'#!/bin/sh\nexec "{sys.executable}" -I -B "{py}"\n')
        os.chmod(exe, 0o755)
    return exe


def main():
    falhas = []
    with tempfile.TemporaryDirectory() as pasta:
        prova = os.path.join(pasta, 'p.alethe'); problema = os.path.join(pasta, 'p.smt2')
        open(prova, 'w').close(); open(problema, 'w').close()
        for i, (nome, saida, codigo, esperado) in enumerate(CASOS):
            obtido = conferir.carcara(falso(pasta, f'c{i}', saida, codigo), prova, problema, conferir.REGRAS_CONFIADAS)[0]
            print(f'{"ok " if obtido == esperado else "ERRO"} {nome}: esperado {esperado}, obtido {obtido}')
            if obtido != esperado:
                falhas.append(nome)
    sys.exit(1 if falhas else 0)


if __name__ == '__main__':
    main()
