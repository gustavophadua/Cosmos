"""Gera frases curtas para a validação e o treino da I-AI (formato avaliacao-frases-v1), público e reproduzível.

Uso:
  python -I -X utf8 -B scripts/gerar-frases.py validacao avaliacao/validacao-v1.jsonl
  python -I -X utf8 -B scripts/gerar-frases.py treino SAIDA.jsonl [ITENS_POR_CLASSE]
  python -I -X utf8 -B scripts/gerar-frases.py revisao SAIDA.jsonl [ITENS_POR_CLASSE] [LEVA]
  python -I -X utf8 -B scripts/gerar-frases.py treino2 SAIDA.jsonl [ITENS_POR_CLASSE]
  python -I -X utf8 -B scripts/gerar-frases.py revisao2 SAIDA.jsonl [ITENS_POR_CLASSE]
  python -I -X utf8 -B scripts/gerar-frases.py visao SAIDA.jsonl [ITENS_POR_CLASSE]

- validacao: 150 itens, 50 por classe, vocabulário de fantasia, só as formas de frase de base. É nele que se escolhem
  pedido, exemplos, votação e o checkpoint do treino; o conjunto fechado não serve para ajustar nada.
- treino: vocabulário próprio (espaço e campo), formas de frase variadas ("Cada", "Todos os…", "Existe um…",
  "somente se"…) e alguns padrões a mais (e, se e somente se, nem…nem). Por padrão, 1000 itens por classe.
- revisao: o mesmo vocabulário e as mesmas formas do treino, com semente própria e ids R-: o lote em que se olham os
  erros um por um (a revisão de erros, especificacao/formalizacao-v1.md §8). Nunca entra no treino (a exportação só
  aceita V- e T-). Por padrão, 167 itens por classe. LEVA (padrão 1) muda a semente: cada leva é um lote novo, para
  conferir uma correção do pedido em frases que não serviram para fazê-la.
- treino2 e revisao2 (29/10/2026): os mesmos padrões do treino e mais os moldes tirados dos erros nas frases G-
  (formalizacao-v1.md §8), em que o modelo entortava a premissa para a conclusão seguir: "só pode A quem é B" (e
  "alguém só pode A se for B"), "todo A que é B é C", "nenhum A que não é B é C", "ou… mas não os dois" e "faz
  parte dos / está entre os". Os moldes novos só entram nesses dois modos; os outros se refazem byte a byte como antes.
  O vocabulário das ações é de nave e de campo, de propósito longe das frases G-, que são teste.
- visao (30/10/2026): frases de visão de mundo, com ids W-, para o treino. Vocabulário abstrato ("parte do todo",
  "necessário ao todo", "dono da própria função", "x invalida a existência de y"), todos os moldes do treino2 e três
  famílias novas, com peso triplo: o genérico ("O humano é mortal" = todo humano é mortal), a relação negada entre
  grupos ("Nenhum A R um B") e a ligação que a fecha ("Quem é P não R nenhum B"), que é a forma do argumento do dono
  (formalizacao-v1.md §9), em versões que fecham (segue), que contradizem e que dão salto (independente). Por padrão,
  300 itens por classe.

Cada linha: {"padrao": nome, "formas": [índice da forma de cada frase], "item": {...}}. A semente é fixa (o nome do modo): rodar de novo dá o mesmo
arquivo, byte a byte. A classe de cada padrão é a esperada; a conferência pelo Z3 (testes/frases-geradas.test.ts) é a
que vale. Este gerador nunca lê o conjunto fechado; scripts/anti-vazamento.py confere, na
máquina do dono, que nenhuma palavra de conteúdo dele aparece aqui.
"""
import hashlib, json, os, random, sys

# símbolo, masculino, feminino, plural (masculino)
VALIDACAO = {
    'classes': [
        ('Mago', 'mago', 'maga', 'magos'), ('Elfo', 'elfo', 'elfa', 'elfos'), ('Anao', 'anão', 'anã', 'anões'),
        ('Gigante', 'gigante', 'gigante', 'gigantes'), ('Guerreiro', 'guerreiro', 'guerreira', 'guerreiros'),
        ('Feiticeiro', 'feiticeiro', 'feiticeira', 'feiticeiros'), ('Cavaleiro', 'cavaleiro', 'cavaleira', 'cavaleiros'),
        ('Pirata', 'pirata', 'pirata', 'piratas'), ('Viajante', 'viajante', 'viajante', 'viajantes'), ('Rei', 'rei', 'rainha', 'reis'),
        ('Principe', 'príncipe', 'princesa', 'príncipes'), ('Monge', 'monge', 'monja', 'monges'), ('Ladrao', 'ladrão', 'ladra', 'ladrões'),
        ('Bardo', 'bardo', 'barda', 'bardos'), ('Cacador', 'caçador', 'caçadora', 'caçadores'), ('Druida', 'druida', 'druida', 'druidas'),
    ],
    'adjetivos': [
        ('Sabio', 'sábio', 'sábia', 'sábios'), ('Corajoso', 'corajoso', 'corajosa', 'corajosos'), ('Astuto', 'astuto', 'astuta', 'astutos'),
        ('Calmo', 'calmo', 'calma', 'calmos'), ('Generoso', 'generoso', 'generosa', 'generosos'), ('Teimoso', 'teimoso', 'teimosa', 'teimosos'),
        ('Distraido', 'distraído', 'distraída', 'distraídos'), ('Honesto', 'honesto', 'honesta', 'honestos'),
        ('Ambicioso', 'ambicioso', 'ambiciosa', 'ambiciosos'), ('Cauteloso', 'cauteloso', 'cautelosa', 'cautelosos'),
        ('Imortal', 'imortal', 'imortal', 'imortais'), ('Invisivel', 'invisível', 'invisível', 'invisíveis'),
    ],
    'pessoas': [
        ('aurora', 'Aurora', 'f'), ('bento', 'Bento', 'm'), ('celia', 'Célia', 'f'), ('dario', 'Dario', 'm'), ('estela', 'Estela', 'f'),
        ('flavio', 'Flávio', 'm'), ('gloria', 'Glória', 'f'), ('heitor', 'Heitor', 'm'), ('ines', 'Inês', 'f'), ('jonas', 'Jonas', 'm'),
        ('kiara', 'Kiara', 'f'), ('leandro', 'Leandro', 'm'), ('mirela', 'Mirela', 'f'), ('nestor', 'Nestor', 'm'),
    ],
    'relacoes': [('Desafia', 'desafia'), ('Protege', 'protege'), ('Inveja', 'inveja'), ('Procura', 'procura')],
}
# visão de mundo: só nomes com forma masculina (os moldes dizem "Todo …", "Nenhum …"). Palavras raras de propósito: a primeira
# lista, de palavras comuns, colidiu com o conjunto fechado na conferência de scripts/anti-vazamento.py (que só dá contagens)
VISAO = {
    'classes': [
        ('Arauto', 'arauto', 'arauta', 'arautos'), ('Cronista', 'cronista', 'cronista', 'cronistas'), ('Pajem', 'pajem', 'pajem', 'pajens'),
        ('Alquimista', 'alquimista', 'alquimista', 'alquimistas'), ('Cartografo', 'cartógrafo', 'cartógrafa', 'cartógrafos'), ('Sineiro', 'sineiro', 'sineira', 'sineiros'),
        ('Barqueiro', 'barqueiro', 'barqueira', 'barqueiros'), ('Ourives', 'ourives', 'ourives', 'ourives'), ('Copista', 'copista', 'copista', 'copistas'),
        ('Faroleiro', 'faroleiro', 'faroleira', 'faroleiros'), ('Relojoeiro', 'relojoeiro', 'relojoeira', 'relojoeiros'), ('Boticario', 'boticário', 'boticária', 'boticários'),
        ('Acolito', 'acólito', 'acólita', 'acólitos'), ('Curandeiro', 'curandeiro', 'curandeira', 'curandeiros'), ('Zelador', 'zelador', 'zeladora', 'zeladores'),
        ('Almocreve', 'almocreve', 'almocreve', 'almocreves'),
    ],
    'adjetivos': [
        ('ParteDoTodo', 'parte do todo', 'parte do todo', 'parte do todo'), ('NecessarioAoTodo', 'necessário ao todo', 'necessária ao todo', 'necessários ao todo'),
        ('DonoDaPropriaFuncao', 'dono da própria função', 'dona da própria função', 'donos da própria função'),
        ('ResponsavelPelosAtos', 'responsável pelos próprios atos', 'responsável pelos próprios atos', 'responsáveis pelos próprios atos'),
        ('DignoDeRespeito', 'digno de respeito', 'digna de respeito', 'dignos de respeito'), ('Insubstituivel', 'insubstituível', 'insubstituível', 'insubstituíveis'),
        ('Transitorio', 'transitório', 'transitória', 'transitórios'), ('Singular', 'singular', 'singular', 'singulares'),
        ('Interdependente', 'interdependente', 'interdependente', 'interdependentes'), ('Perene', 'perene', 'perene', 'perenes'),
        ('Imperfeito', 'imperfeito', 'imperfeita', 'imperfeitos'), ('Sereno', 'sereno', 'serena', 'serenos'),
        ('ComSensoProprio', 'dono de um senso próprio da realidade', 'dona de um senso próprio da realidade', 'donos de um senso próprio da realidade'),
        ('GuardiaoDaMemoria', 'guardião da memória', 'guardiã da memória', 'guardiões da memória'),
    ],
    'pessoas': [
        ('anselmo', 'Anselmo', 'm'), ('berenice', 'Berenice', 'f'), ('caetano', 'Caetano', 'm'), ('dalva', 'Dalva', 'f'), ('evaristo', 'Evaristo', 'm'),
        ('filomena', 'Filomena', 'f'), ('genaro', 'Genaro', 'm'), ('hortencia', 'Hortência', 'f'), ('isidoro', 'Isidoro', 'm'), ('jandira', 'Jandira', 'f'),
        ('leopoldo', 'Leopoldo', 'm'), ('marieta', 'Marieta', 'f'), ('nicanor', 'Nicanor', 'm'), ('odete', 'Odete', 'f'), ('prudencio', 'Prudêncio', 'm'),
        ('rosalina', 'Rosalina', 'f'), ('saturnino', 'Saturnino', 'm'), ('teodora', 'Teodora', 'f'),
    ],
    'relacoes': [
        ('InvalidaExistenciaDe', 'invalida a existência de'), ('HonraPerspectivaDe', 'honra a perspectiva de'), ('Acolhe', 'acolhe'),
        ('Silencia', 'silencia'), ('Anula', 'anula'), ('Desmerece', 'desmerece'), ('Reconhece', 'reconhece'), ('Hostiliza', 'hostiliza'),
    ],
    'acoes': [
        ('PodeDecidirPeloTodo', 'decidir pelo todo'), ('PodeFalarPorTodos', 'falar por todos'), ('PodeAnularOutraVisao', 'anular outra visão'),
        ('PodeReescreverMemoria', 'reescrever a memória'), ('PodeGuardarArquivo', 'guardar o arquivo'), ('PodeAbencoarColheita', 'abençoar a colheita'),
        ('PodeAcenderFogueira', 'acender a fogueira'), ('PodeConvocarConselho', 'convocar o conselho'),
    ],
}
TREINO = {
    'classes': [
        ('Robo', 'robô', 'robô', 'robôs'), ('Astronauta', 'astronauta', 'astronauta', 'astronautas'), ('Piloto', 'piloto', 'pilota', 'pilotos'),
        ('Mecanico', 'mecânico', 'mecânica', 'mecânicos'), ('Inventor', 'inventor', 'inventora', 'inventores'),
        ('Explorador', 'explorador', 'exploradora', 'exploradores'), ('Navegador', 'navegador', 'navegadora', 'navegadores'),
        ('Capitao', 'capitão', 'capitã', 'capitães'), ('Cadete', 'cadete', 'cadete', 'cadetes'), ('Tecnico', 'técnico', 'técnica', 'técnicos'),
        ('Vigia', 'vigia', 'vigia', 'vigias'), ('Comandante', 'comandante', 'comandante', 'comandantes'),
        ('Mensageiro', 'mensageiro', 'mensageira', 'mensageiros'), ('Colono', 'colono', 'colona', 'colonos'),
        ('Androide', 'androide', 'androide', 'androides'), ('Alienigena', 'alienígena', 'alienígena', 'alienígenas'),
        ('Fazendeiro', 'fazendeiro', 'fazendeira', 'fazendeiros'), ('Vaqueiro', 'vaqueiro', 'vaqueira', 'vaqueiros'),
        ('Tropeiro', 'tropeiro', 'tropeira', 'tropeiros'), ('Moleiro', 'moleiro', 'moleira', 'moleiros'), ('Ferreiro', 'ferreiro', 'ferreira', 'ferreiros'),
        ('Tecelao', 'tecelão', 'tecelã', 'tecelões'), ('Oleiro', 'oleiro', 'oleira', 'oleiros'), ('Pastor', 'pastor', 'pastora', 'pastores'),
        ('Lenhador', 'lenhador', 'lenhadora', 'lenhadores'), ('Apicultor', 'apicultor', 'apicultora', 'apicultores'),
        ('Viticultor', 'viticultor', 'viticultora', 'viticultores'), ('Ceramista', 'ceramista', 'ceramista', 'ceramistas'),
    ],
    'adjetivos': [
        ('Curioso', 'curioso', 'curiosa', 'curiosos'), ('Rapido', 'rápido', 'rápida', 'rápidos'), ('Lento', 'lento', 'lenta', 'lentos'),
        ('Atento', 'atento', 'atenta', 'atentos'), ('Ousado', 'ousado', 'ousada', 'ousados'), ('Tranquilo', 'tranquilo', 'tranquila', 'tranquilos'),
        ('Metodico', 'metódico', 'metódica', 'metódicos'), ('Criativo', 'criativo', 'criativa', 'criativos'), ('Serio', 'sério', 'séria', 'sérios'),
        ('Modesto', 'modesto', 'modesta', 'modestos'), ('Robusto', 'robusto', 'robusta', 'robustos'), ('Antigo', 'antigo', 'antiga', 'antigos'),
        ('Novato', 'novato', 'novata', 'novatos'), ('Famoso', 'famoso', 'famosa', 'famosos'), ('Discreto', 'discreto', 'discreta', 'discretos'),
        ('Pontual', 'pontual', 'pontual', 'pontuais'), ('Confiavel', 'confiável', 'confiável', 'confiáveis'), ('Exigente', 'exigente', 'exigente', 'exigentes'),
        ('Otimista', 'otimista', 'otimista', 'otimistas'), ('Engenhoso', 'engenhoso', 'engenhosa', 'engenhosos'),
    ],
    'pessoas': [
        ('alice', 'Alice', 'f'), ('benito', 'Benito', 'm'), ('cecilia', 'Cecília', 'f'), ('diogo', 'Diogo', 'm'), ('eva', 'Eva', 'f'),
        ('felipe', 'Felipe', 'm'), ('helena', 'Helena', 'f'), ('igor', 'Igor', 'm'), ('julia', 'Júlia', 'f'), ('lucas', 'Lucas', 'm'),
        ('marta', 'Marta', 'f'), ('nuno', 'Nuno', 'm'), ('olivia', 'Olívia', 'f'), ('pedro', 'Pedro', 'm'), ('rita', 'Rita', 'f'),
        ('sergio', 'Sérgio', 'm'), ('telma', 'Telma', 'f'), ('vitor', 'Vítor', 'm'), ('yara', 'Yara', 'f'), ('wagner', 'Wagner', 'm'),
        ('zelia', 'Zélia', 'f'), ('arthur', 'Arthur', 'm'), ('bianca', 'Bianca', 'f'), ('enzo', 'Enzo', 'm'),
    ],
    'relacoes': [('Chama', 'chama'), ('Avisa', 'avisa'), ('Encontra', 'encontra'), ('Escuta', 'escuta'), ('Treina', 'treina'), ('Elogia', 'elogia'), ('Acompanha', 'acompanha')],
    # só treino2 e revisao2: "pode …"
    'acoes': [
        ('PodePilotar', 'pilotar a nave'), ('PodeAbrirEscotilha', 'abrir a escotilha'), ('PodeLigarReator', 'ligar o reator'),
        ('PodeSairBase', 'sair da base'), ('PodeUsarLaboratorio', 'usar o laboratório'), ('PodeConsertarRadio', 'consertar o rádio'),
        ('PodeSubirTorre', 'subir na torre'), ('PodeAcenderFarol', 'acender o farol'), ('PodeGuiarCaravana', 'guiar a caravana'),
        ('PodeAtravessarPonte', 'atravessar a ponte'), ('PodeTocarSino', 'tocar o sino'), ('PodeOrdenhar', 'ordenhar as vacas'),
        ('PodeAbrirCeleiro', 'abrir o celeiro'), ('PodeMoerTrigo', 'moer o trigo'), ('PodeTecerManta', 'tecer a manta'),
        ('PodeColherMel', 'colher o mel'), ('PodeLancarSonda', 'lançar a sonda'), ('PodeTrocarFiltro', 'trocar o filtro'),
    ],
}


class Frase:
    """Escolhe palavras sem repetir dentro do item e sorteia a forma da frase (sempre a de base na validação)."""

    def __init__(self, vocab, rnd, variar):
        self.rnd, self.vocab, self.variar = rnd, vocab, variar
        self.usados, self.formas = {}, []

    def classe(self):
        return self._tirar('classes', lambda c: {'simbolo': c[0], 'tipo': 'predicado', 'aridade': 1, 'leitura': f'x é {c[1]}' + (f' ({c[2]})' if c[2] != c[1] else ''), 'm': c[1], 'f': c[2], 'pl': c[3]})

    def adjetivo(self):
        return self._tirar('adjetivos', lambda a: {'simbolo': a[0], 'tipo': 'predicado', 'aridade': 1, 'leitura': f'x é {a[1]}', 'm': a[1], 'f': a[2], 'pl': a[3]})

    def predicado(self):
        return self.classe() if self.rnd.random() < 0.5 else self.adjetivo()

    def pessoa(self):
        return self._tirar('pessoas', lambda p: {'simbolo': p[0], 'tipo': 'constante', 'aridade': 0, 'leitura': p[1], 'nome': p[1], 'g': p[2]})

    def acao(self):
        return self._tirar('acoes', lambda a: {'simbolo': a[0], 'tipo': 'predicado', 'aridade': 1, 'leitura': f'x pode {a[1]}', 'verbo': a[1]})

    def relacao(self):
        return self._tirar('relacoes', lambda r: {'simbolo': r[0], 'tipo': 'predicado', 'aridade': 2, 'leitura': f'x {r[1]} y', 'verbo': r[1]})

    def forma(self, *frases):
        """Uma das formas equivalentes; a primeira é a de base."""
        i = self.rnd.randrange(len(frases)) if self.variar else 0
        self.formas.append(i)
        return frases[i]

    def _tirar(self, grupo, fazer):
        livres = [x for x in self.vocab[grupo] if x[0] not in self.usados]
        x = fazer(self.rnd.choice(livres))
        self.usados[x['simbolo']] = x
        return x

    def vocabulario(self):
        return [{k: t[k] for k in ('simbolo', 'tipo', 'aridade', 'leitura')} for t in self.usados.values()]


def maiuscula(s): return s[0].upper() + s[1:]


def montar(f):
    """As frases de cada forma lógica, com as variantes equivalentes que o treino sorteia."""
    def todo(a, b): return f.forma(f'Todo {a["m"]} é {b["m"]}.', f'Cada {a["m"]} é {b["m"]}.', f'Qualquer {a["m"]} é {b["m"]}.', f'Todos os {a["pl"]} são {b["pl"]}.', f'Se alguém é {a["m"]}, então é {b["m"]}.'), f'∀x ({a["simbolo"]}(x) ⟹ {b["simbolo"]}(x))'
    def nenhum(a, b): return f.forma(f'Nenhum {a["m"]} é {b["m"]}.', f'Não existe {a["m"]} que seja {b["m"]}.', f'Não há {a["m"]} que seja {b["m"]}.'), f'∀x ({a["simbolo"]}(x) ⟹ ¬{b["simbolo"]}(x))'
    def algum(a, b): return f.forma(f'Algum {a["m"]} é {b["m"]}.', f'Existe um {a["m"]} que é {b["m"]}.', f'Há pelo menos um {a["m"]} que é {b["m"]}.', f'Alguns {a["pl"]} são {b["pl"]}.'), f'∃x ({a["simbolo"]}(x) ∧ {b["simbolo"]}(x))'
    def algum_nao(a, b): return f.forma(f'Algum {a["m"]} não é {b["m"]}.', f'Existe um {a["m"]} que não é {b["m"]}.', f'Alguns {a["pl"]} não são {b["pl"]}.'), f'∃x ({a["simbolo"]}(x) ∧ ¬{b["simbolo"]}(x))'
    def nem_todo(a, b): return f.forma(f'Nem todo {a["m"]} é {b["m"]}.', f'Não é verdade que todo {a["m"]} é {b["m"]}.', f'Nem todos os {a["pl"]} são {b["pl"]}.'), f'¬∀x ({a["simbolo"]}(x) ⟹ {b["simbolo"]}(x))'
    def eh(c, p): return f'{c["nome"]} é {p[c["g"]]}.', f'{p["simbolo"]}({c["simbolo"]})'
    def nao_eh(c, p): return f.forma(f'{c["nome"]} não é {p[c["g"]]}.', f'Não é verdade que {c["nome"]} é {p[c["g"]]}.'), f'¬{p["simbolo"]}({c["simbolo"]})'
    def nao_verdade_nao(c, p): return f.forma(f'Não é verdade que {c["nome"]} não é {p[c["g"]]}.', f'É falso que {c["nome"]} não é {p[c["g"]]}.'), f'¬¬{p["simbolo"]}({c["simbolo"]})'
    def ou(c, p, q): return f.forma(f'{c["nome"]} é {p[c["g"]]} ou {q[c["g"]]}.', f'{c["nome"]} é {p[c["g"]]} ou é {q[c["g"]]}.'), f'{p["simbolo"]}({c["simbolo"]}) ∨ {q["simbolo"]}({c["simbolo"]})'
    def e(c, p, q): return f.forma(f'{c["nome"]} é {p[c["g"]]} e {q[c["g"]]}.', f'{c["nome"]} é {p[c["g"]]} e também {q[c["g"]]}.'), f'{p["simbolo"]}({c["simbolo"]}) ∧ {q["simbolo"]}({c["simbolo"]})'
    def nem_nem(c, p, q): return f.forma(f'{c["nome"]} não é {p[c["g"]]} nem {q[c["g"]]}.', f'{c["nome"]} não é {p[c["g"]]} e não é {q[c["g"]]}.'), f'¬{p["simbolo"]}({c["simbolo"]}) ∧ ¬{q["simbolo"]}({c["simbolo"]})'
    def se(c, p, d, q): return f.forma(f'Se {c["nome"]} é {p[c["g"]]}, então {d["nome"]} é {q[d["g"]]}.', f'Se {c["nome"]} é {p[c["g"]]}, {d["nome"]} é {q[d["g"]]}.', f'Caso {c["nome"]} seja {p[c["g"]]}, {d["nome"]} é {q[d["g"]]}.'), f'{p["simbolo"]}({c["simbolo"]}) ⟹ {q["simbolo"]}({d["simbolo"]})'
    def so_se(c, p, q): return f.forma(f'{c["nome"]} é {p[c["g"]]} só se é {q[c["g"]]}.', f'{c["nome"]} é {p[c["g"]]} somente se é {q[c["g"]]}.', f'{c["nome"]} é {p[c["g"]]} apenas se é {q[c["g"]]}.'), f'{p["simbolo"]}({c["simbolo"]}) ⟹ {q["simbolo"]}({c["simbolo"]})'
    def sse(c, p, q): return f.forma(f'{c["nome"]} é {p[c["g"]]} se e somente se é {q[c["g"]]}.', f'{c["nome"]} é {p[c["g"]]} se e só se é {q[c["g"]]}.'), f'{p["simbolo"]}({c["simbolo"]}) ⟺ {q["simbolo"]}({c["simbolo"]})'
    def rel(c, r, d): return f'{c["nome"]} {r["verbo"]} {d["nome"]}.', f'{r["simbolo"]}({c["simbolo"]}, {d["simbolo"]})'
    def todo_rel_algum(a, r, b): return f.forma(f'Todo {a["m"]} {r["verbo"]} algum {b["m"]}.', f'Cada {a["m"]} {r["verbo"]} pelo menos um {b["m"]}.'), f'∀x ({a["simbolo"]}(x) ⟹ ∃y ({b["simbolo"]}(y) ∧ {r["simbolo"]}(x, y)))'
    def algum_todos(a, r, b): return f.forma(f'Há um {b["m"]} que todo {a["m"]} {r["verbo"]}.', f'Existe um {b["m"]} que todo {a["m"]} {r["verbo"]}.'), f'∃y ({b["simbolo"]}(y) ∧ ∀x ({a["simbolo"]}(x) ⟹ {r["simbolo"]}(x, y)))'

    # os moldes dos erros nas frases G- (só treino2 e revisao2)
    def so_pode(a, b): return f.forma(f'Só pode {a["verbo"]} quem é {b["m"]}.', f'Alguém só pode {a["verbo"]} se for {b["m"]}.', f'Somente quem é {b["m"]} pode {a["verbo"]}.',
                                      f'Só se pode {a["verbo"]} sendo {b["m"]}.', f'Aqui, alguém só pode {a["verbo"]} se cumprir este requisito: ser {b["m"]}.'), f'∀x ({a["simbolo"]}(x) ⟹ {b["simbolo"]}(x))'
    def pode(c, a): return f'{c["nome"]} pode {a["verbo"]}.', f'{a["simbolo"]}({c["simbolo"]})'
    def nao_pode(c, a): return f.forma(f'{c["nome"]} não pode {a["verbo"]}.', f'Não é verdade que {c["nome"]} pode {a["verbo"]}.'), f'¬{a["simbolo"]}({c["simbolo"]})'
    def todo_que(a, b, c): return f.forma(f'Todo {a["m"]} que é {b["m"]} é {c["m"]}.', f'Cada {a["m"]} que é {b["m"]} é {c["m"]}.', f'Todos os {a["pl"]} que são {b["pl"]} são {c["pl"]}.'), f'∀x (({a["simbolo"]}(x) ∧ {b["simbolo"]}(x)) ⟹ {c["simbolo"]}(x))'
    def nenhum_sem(a, b, c): return f.forma(f'Nenhum {a["m"]} que não é {b["m"]} é {c["m"]}.', f'Não existe {a["m"]} que não seja {b["m"]} e seja {c["m"]}.'), f'∀x (({a["simbolo"]}(x) ∧ ¬{b["simbolo"]}(x)) ⟹ ¬{c["simbolo"]}(x))'
    def ou_so_um(c, p, q): return f.forma(f'{c["nome"]} é {p[c["g"]]} ou {q[c["g"]]}, mas não os dois.', f'Ou {c["nome"]} é {p[c["g"]]} ou é {q[c["g"]]}, mas não as duas coisas.'), f'({p["simbolo"]}({c["simbolo"]}) ∨ {q["simbolo"]}({c["simbolo"]})) ∧ ¬({p["simbolo"]}({c["simbolo"]}) ∧ {q["simbolo"]}({c["simbolo"]}))'
    def grupo(a, b): return f.forma(f'Todos os {a["pl"]} são {b["pl"]}.', f'Todos os {a["pl"]} estão entre os {b["pl"]}.'), f'∀x ({a["simbolo"]}(x) ⟹ {b["simbolo"]}(x))'
    def no_grupo(c, a): return f.forma(f'{c["nome"]} faz parte dos {a["pl"]}.', f'{c["nome"]} está entre os {a["pl"]}.'), f'{a["simbolo"]}({c["simbolo"]})'

    # só no modo visao: o genérico, a relação negada entre grupos e a ligação que a fecha
    def generico(a, b): return f.forma(f'O {a["m"]} é {b["m"]}.', f'Os {a["pl"]} são {b["pl"]}.'), f'∀x ({a["simbolo"]}(x) ⟹ {b["simbolo"]}(x))'
    def nenhum_rel(a, r, b): return f.forma(f'Nenhum {a["m"]} {r["verbo"]} um {b["m"]}.', f'Nenhum {a["m"]} {r["verbo"]} algum {b["m"]}.'), f'∀x ∀y (({a["simbolo"]}(x) ∧ {b["simbolo"]}(y)) ⟹ ¬{r["simbolo"]}(x, y))'
    def quem_rel(p, r, b): return f.forma(f'Quem é {p["m"]} não {r["verbo"]} nenhum {b["m"]}.', f'Ninguém que seja {p["m"]} {r["verbo"]} um {b["m"]}.'), f'∀x ∀y (({p["simbolo"]}(x) ∧ {b["simbolo"]}(y)) ⟹ ¬{r["simbolo"]}(x, y))'
    def nao_rel(c, r, d): return f'{c["nome"]} não {r["verbo"]} {d["nome"]}.', f'¬{r["simbolo"]}({c["simbolo"]}, {d["simbolo"]})'

    C, P, X, R, A = f.classe, f.predicado, f.pessoa, f.relacao, f.acao
    V2, VI = 'v2', 'visao'
    # (classe esperada, nome, só no treino? (V2: só treino2 e revisao2), montar)
    return [
        ('segue', 'generico-barbara', VI, lambda: (lambda a, b, c: ([generico(a, b), todo(b, c)], generico(a, c)))(C(), C(), P())),
        ('segue', 'generico-instancia', VI, lambda: (lambda a, b, c: ([generico(a, b), eh(c, a)], eh(c, b)))(C(), P(), X())),
        ('segue', 'ponte-rel', VI, lambda: (lambda a, p, r, b: ([todo(a, p), quem_rel(p, r, b)], nenhum_rel(a, r, b)))(C(), P(), R(), C())),
        ('segue', 'rel-instancia', VI, lambda: (lambda a, r, b, x, y: ([nenhum_rel(a, r, b), eh(x, a), eh(y, b)], nao_rel(x, r, y)))(C(), R(), C(), X(), X())),
        ('contradiz', 'generico-negado', VI, lambda: (lambda a, b, c: ([generico(a, b), eh(c, a)], nao_eh(c, b)))(C(), P(), X())),
        ('contradiz', 'rel-instancia-negada', VI, lambda: (lambda a, r, b, x, y: ([nenhum_rel(a, r, b), eh(x, a), eh(y, b)], rel(x, r, y)))(C(), R(), C(), X(), X())),
        ('contradiz', 'ponte-rel-negada', VI, lambda: (lambda a, p, r, b, x, y: ([todo(a, p), quem_rel(p, r, b), eh(x, a), eh(y, b)], rel(x, r, y)))(C(), P(), R(), C(), X(), X())),
        ('independente', 'generico-volta', VI, lambda: (lambda a, b: ([todo(a, b)], generico(b, a)))(C(), C())),
        ('independente', 'sem-ponte-rel', VI, lambda: (lambda a, p, r, b, q: ([todo(a, p), todo(b, q)], nenhum_rel(a, r, b)))(C(), P(), R(), C(), P())),
        ('independente', 'ponte-rel-volta', VI, lambda: (lambda a, p, r, b: ([quem_rel(p, r, b), todo(p, a)], nenhum_rel(a, r, b)))(C(), C(), R(), C())),
        ('segue', 'so-pode', V2, lambda: (lambda a, b, c: ([so_pode(a, b), pode(c, a)], eh(c, b)))(A(), P(), X())),
        ('segue', 'so-pode-tollens', V2, lambda: (lambda a, b, c: ([so_pode(a, b), nao_eh(c, b)], nao_pode(c, a)))(A(), P(), X())),
        ('segue', 'todo-que', V2, lambda: (lambda a, b, c, x: ([todo_que(a, b, c), eh(x, a), eh(x, b)], eh(x, c)))(C(), P(), P(), X())),
        ('segue', 'nenhum-sem', V2, lambda: (lambda a, b, c, x: ([nenhum_sem(a, b, c), eh(x, a), eh(x, c)], eh(x, b)))(C(), P(), P(), X())),
        ('segue', 'ou-so-um', V2, lambda: (lambda c, p, q: ([ou_so_um(c, p, q), eh(c, p)], nao_eh(c, q)))(X(), P(), P())),
        ('segue', 'grupo-ponens', V2, lambda: (lambda a, b, c: ([grupo(a, b), no_grupo(c, a)], no_grupo(c, b)))(C(), C(), X())),
        ('contradiz', 'so-pode-negado', V2, lambda: (lambda a, b, c: ([so_pode(a, b), pode(c, a)], nao_eh(c, b)))(A(), P(), X())),
        ('contradiz', 'ou-so-um-negado', V2, lambda: (lambda c, p, q: ([ou_so_um(c, p, q), nao_eh(c, p)], nao_eh(c, q)))(X(), P(), P())),
        ('contradiz', 'todo-que-negado', V2, lambda: (lambda a, b, c, x: ([todo_que(a, b, c), eh(x, a), eh(x, b)], nao_eh(x, c)))(C(), P(), P(), X())),
        ('independente', 'so-pode-volta', V2, lambda: (lambda a, b, c: ([so_pode(a, b), eh(c, b)], pode(c, a)))(A(), P(), X())),
        ('independente', 'so-pode-volta-negada', V2, lambda: (lambda a, b, c: ([so_pode(a, b), nao_pode(c, a)], nao_eh(c, b)))(A(), P(), X())),
        ('independente', 'todo-que-sem-restricao', V2, lambda: (lambda a, b, c, x: ([todo_que(a, b, c), eh(x, a)], eh(x, c)))(C(), P(), P(), X())),
        ('independente', 'grupo-volta', V2, lambda: (lambda a, b, c: ([grupo(a, b), no_grupo(c, b)], no_grupo(c, a)))(C(), C(), X())),
        ('segue', 'barbara', False, lambda: (lambda a, b, c: ([todo(a, b), todo(b, c)], todo(a, c)))(C(), C(), P())),
        ('segue', 'modus-ponens', False, lambda: (lambda a, b, c: ([todo(a, b), eh(c, a)], eh(c, b)))(C(), P(), X())),
        ('segue', 'modus-tollens', False, lambda: (lambda a, b, c: ([todo(a, b), nao_eh(c, b)], nao_eh(c, a)))(C(), P(), X())),
        ('segue', 'celarent', False, lambda: (lambda a, b, c: ([nenhum(a, b), todo(c, a)], nenhum(c, b)))(C(), P(), C())),
        ('segue', 'silogismo-disjuntivo', False, lambda: (lambda c, a, b: ([ou(c, a, b), nao_eh(c, a)], eh(c, b)))(X(), P(), P())),
        ('segue', 'conversao-algum', False, lambda: (lambda a, b: ([algum(a, b)], algum(b, a)))(C(), C())),
        ('segue', 'algum-nao-nem-todo', False, lambda: (lambda a, b: ([algum_nao(a, b)], nem_todo(a, b)))(C(), P())),
        ('segue', 'dupla-negacao', False, lambda: (lambda c, a: ([nao_verdade_nao(c, a)], eh(c, a)))(X(), P())),
        ('segue', 'escopo-forte', False, lambda: (lambda a, r, b: ([algum_todos(a, r, b)], todo_rel_algum(a, r, b)))(C(), R(), C())),
        ('segue', 'contrapositiva', False, lambda: (lambda c, a, d, b: ([se(c, a, d, b), nao_eh(d, b)], nao_eh(c, a)))(X(), P(), X(), P())),
        ('segue', 'so-se', False, lambda: (lambda c, a, b: ([so_se(c, a, b), eh(c, a)], eh(c, b)))(X(), P(), P())),
        ('segue', 'instancia-existe', False, lambda: (lambda a, b, c: ([todo(a, b), eh(c, a)], algum(a, b)))(C(), P(), X())),
        ('segue', 'conversao-nenhum', False, lambda: (lambda a, b: ([nenhum(a, b)], nenhum(b, a)))(C(), C())),
        ('segue', 'e-simplifica', True, lambda: (lambda c, a, b: ([e(c, a, b)], eh(c, b)))(X(), P(), P())),
        ('segue', 'sse-volta', True, lambda: (lambda c, a, b: ([sse(c, a, b), eh(c, b)], eh(c, a)))(X(), P(), P())),
        ('segue', 'nem-nem', True, lambda: (lambda c, a, b: ([nem_nem(c, a, b)], nao_eh(c, a)))(X(), P(), P())),
        ('contradiz', 'todo-instancia-negada', False, lambda: (lambda a, b, c: ([todo(a, b), eh(c, a)], nao_eh(c, b)))(C(), P(), X())),
        ('contradiz', 'nenhum-instancia', False, lambda: (lambda a, b, c: ([nenhum(a, b), eh(c, a)], eh(c, b)))(C(), P(), X())),
        ('contradiz', 'todo-nem-todo', False, lambda: (lambda a, b: ([todo(a, b)], nem_todo(a, b)))(C(), P())),
        ('contradiz', 'algum-nenhum', False, lambda: (lambda a, b: ([algum(a, b)], nenhum(a, b)))(C(), P())),
        ('contradiz', 'disjuntivo-negado', False, lambda: (lambda c, a, b: ([ou(c, a, b), nao_eh(c, a)], nao_eh(c, b)))(X(), P(), P())),
        ('contradiz', 'cadeia-negada', False, lambda: (lambda a, b, c, d: ([todo(a, b), todo(b, c), eh(d, a)], nao_eh(d, c)))(C(), C(), P(), X())),
        ('contradiz', 'condicional-negado', False, lambda: (lambda c, a, d, b: ([se(c, a, d, b), eh(c, a)], nao_eh(d, b)))(X(), P(), X(), P())),
        ('contradiz', 'algum-nao-todo', False, lambda: (lambda a, b: ([algum_nao(a, b)], todo(a, b)))(C(), P())),
        ('contradiz', 'nenhum-algum', False, lambda: (lambda a, b: ([nenhum(a, b)], algum(a, b)))(C(), P())),
        ('contradiz', 'e-negado', True, lambda: (lambda c, a, b: ([e(c, a, b)], nao_eh(c, a)))(X(), P(), P())),
        ('contradiz', 'sse-negado', True, lambda: (lambda c, a, b: ([sse(c, a, b), eh(c, a)], nao_eh(c, b)))(X(), P(), P())),
        ('independente', 'afirmar-consequente', False, lambda: (lambda a, b, c: ([todo(a, b), eh(c, b)], eh(c, a)))(C(), P(), X())),
        ('independente', 'negar-antecedente', False, lambda: (lambda a, b, c: ([todo(a, b), nao_eh(c, a)], nao_eh(c, b)))(C(), P(), X())),
        ('independente', 'conversao-ilicita', False, lambda: (lambda a, b: ([todo(a, b)], todo(b, a)))(C(), C())),
        ('independente', 'import-existencial', False, lambda: (lambda a, b: ([todo(a, b)], algum(a, b)))(C(), P())),
        ('independente', 'escopo-fraco', False, lambda: (lambda a, r, b: ([todo_rel_algum(a, r, b)], algum_todos(a, r, b)))(C(), R(), C())),
        ('independente', 'relacao-nao-transitiva', False, lambda: (lambda c, r, d, e_: ([rel(c, r, d), rel(d, r, e_)], rel(c, r, e_)))(X(), R(), X(), X())),
        ('independente', 'algum-todo', False, lambda: (lambda a, b: ([algum(a, b)], todo(a, b)))(C(), P())),
        ('independente', 'termo-medio-nao-distribuido', False, lambda: (lambda a, b, c: ([todo(a, b), todo(c, b)], todo(a, c)))(C(), P(), C())),
        ('independente', 'so-se-invertido', False, lambda: (lambda c, a, b: ([so_se(c, a, b), eh(c, b)], eh(c, a)))(X(), P(), P())),
        ('independente', 'ou-inclusivo', False, lambda: (lambda c, a, b: ([ou(c, a, b), eh(c, a)], nao_eh(c, b)))(X(), P(), P())),
        ('independente', 'dois-algum', False, lambda: (lambda a, b, c: ([algum(a, b), algum(b, c)], algum(a, c)))(C(), C(), P())),
        ('independente', 'ou-nao-simplifica', True, lambda: (lambda c, a, b: ([ou(c, a, b)], eh(c, a)))(X(), P(), P())),
        ('independente', 'se-nao-volta', True, lambda: (lambda c, a, d, b: ([se(c, a, d, b), eh(d, b)], eh(c, a)))(X(), P(), X(), P())),
    ]


def gerar(modo, por_classe, leva=1):
    vocab, variar, prefixo = (VALIDACAO, False, 'V') if modo == 'validacao' else (VISAO, True, 'W') if modo == 'visao' else (TREINO, True, 'R' if modo.startswith('revisao') else 'T')
    v2, visao = modo in ('treino2', 'revisao2', 'visao'), modo == 'visao'
    # semente fixa pelo nome do modo (e da leva, a partir da segunda): o arquivo se refaz igual, e qualquer um confere
    rnd = random.Random(int.from_bytes(hashlib.sha256(f'cosmos-frases-{modo}{f"-leva{leva}" if leva > 1 else ""}-v1'.encode()).digest(), 'big'))
    linhas, vistos = [], set()
    for classe in ('segue', 'contradiz', 'independente'):
        nomes = [nome for c, nome, so_treino, _ in montar(Frase(vocab, rnd, variar)) if c == classe and (visao if so_treino == 'visao' else v2 if so_treino == 'v2' else (variar or not so_treino))]
        if visao:  # as famílias novas com peso triplo
            nomes += [nome for c, nome, so_treino, _ in montar(Frase(vocab, rnd, variar)) if c == classe and so_treino == 'visao'] * 2
        feitos, tentativas = 0, 0
        while feitos < por_classe:
            tentativas += 1
            if tentativas > por_classe * 50:
                sys.exit(f'{classe}: só {feitos} itens distintos de {por_classe}; aumente o vocabulário')
            f = Frase(vocab, rnd, variar)
            nome = nomes[feitos % len(nomes)]
            _, _, _, fazer = next(x for x in montar(f) if x[1] == nome)
            premissas, conclusao = fazer()
            texto = {'premissas': [p[0] for p in premissas], 'conclusao': conclusao[0]}
            chave = json.dumps(texto, ensure_ascii=False)
            if chave in vistos:  # frase repetida: sorteia de novo
                continue
            vistos.add(chave)
            feitos += 1
            item = {'id': '', 'texto': texto, 'vocabulario': f.vocabulario(),
                    'gabarito': {'premissas': [p[1] for p in premissas], 'conclusao': conclusao[1], 'classe': classe}}
            linhas.append({'padrao': nome, 'formas': f.formas, 'item': item})
    rnd.shuffle(linhas)
    largura = 3 if len(linhas) < 1000 else 5
    for i, l in enumerate(linhas):  # ids na ordem final, para a ordem não denunciar a classe
        l['item']['id'] = f'{prefixo}-{i + 1:0{largura}d}'
    return linhas


if __name__ == '__main__':
    modo, saida = sys.argv[1], sys.argv[2]
    if modo not in ('validacao', 'treino', 'revisao', 'treino2', 'revisao2', 'visao'):
        sys.exit('modo: validacao, treino, revisao, treino2, revisao2 ou visao')
    por_classe = 50 if modo == 'validacao' else int(sys.argv[3]) if len(sys.argv) > 3 else 167 if modo.startswith('revisao') else 300 if modo == 'visao' else 1000
    leva = int(sys.argv[4]) if len(sys.argv) > 4 and modo == 'revisao' else 1
    linhas = gerar(modo, por_classe, leva)
    corpo = ''.join(json.dumps(l, ensure_ascii=False) + '\n' for l in linhas).encode('utf-8')
    with open(saida, 'wb') as arq:
        arq.write(corpo)
    print(len(linhas), 'itens em', saida, 'sha256', hashlib.sha256(corpo).hexdigest())
