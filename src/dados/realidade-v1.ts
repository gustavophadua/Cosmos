// A base de fatos físicos (especificacao/realidade-v1.md): o que a realidade registrada diz, em m2, com a fonte de cada
// fato. É pequena de propósito: só entra o que vale sem exceção na escala do dia a dia, escrito com as condições que o
// tornam verdadeiro ("aparelho eletrônico EM FUNCIONAMENTO", não "aparelho eletrônico"). O que a base não tem, o Cosmos
// diz que não verificou; não completa com o que parece provável. Os sinônimos ligam a fala da pessoa aos símbolos da
// base, sempre de forma visível ("entendi: 'esquentou' = 'gera calor'"), nunca por adivinhação do modelo.

import type { Termo } from '../motor/avaliacao'

export const REALIDADE = 'realidade-v1'

export interface TermoReal extends Termo {
  /** formas como a pessoa diz a mesma coisa, sem o sujeito ("esquentou", "fica quente"); comparadas sem acento */
  sinonimos: string[]
  /** o que a coisa É (celular, ser humano), não um estado ou acontecimento: não tem causa física a procurar */
  especie?: true
}
export interface Fato { id: string; enunciado: string; formula: string; fonte: { nome: string; url?: string } }

const p = (simbolo: string, leitura: string, sinonimos: string[], aridade = 1): TermoReal => ({ simbolo, tipo: 'predicado', aridade, leitura, sinonimos })
const especie = (simbolo: string, leitura: string, sinonimos: string[]): TermoReal => ({ ...p(simbolo, leitura, sinonimos), especie: true })

export const VOCABULARIO_REAL: TermoReal[] = [
  especie('Celular', 'x é um celular', ['celular', 'smartphone', 'telefone celular', 'telefone']),
  especie('Computador', 'x é um computador', ['computador', 'notebook', 'laptop', 'pc']),
  especie('AparelhoEletronico', 'x é um aparelho eletrônico', ['aparelho eletronico', 'eletronico']),
  p('Funcionando', 'x está em funcionamento (ligado, usando energia elétrica)', ['funcionando', 'ligado', 'em uso', 'carregando', 'em funcionamento', 'usando energia']),
  p('GeraCalor', 'x gera calor', ['gera calor', 'produz calor', 'libera calor', 'dissipa calor']),
  // "esquentou" é a temperatura subir; não é o mesmo que gerar calor (uma xícara no sol esquenta sem gerar calor)
  p('Esquenta', 'a temperatura de x sobe', ['esquenta', 'esquentou', 'esquentando', 'esquentar', 'aquece', 'aqueceu', 'aquecendo', 'fica quente', 'ficou quente', 'superaquece', 'superaqueceu', 'temperatura sobe', 'temperatura subiu']),
  p('RecebeEnergia', 'x recebe energia de fora (calor, luz ou trabalho)', ['recebe energia', 'recebe calor', 'absorve calor', 'absorve energia']),
  p('ExpostoAoSol', 'x está exposto ao sol', ['exposto ao sol', 'ficou no sol', 'no sol', 'pegou sol', 'pega sol', 'debaixo do sol']),
  especie('Humano', 'x é um ser humano', ['ser humano', 'humano', 'pessoa', 'homem', 'mulher', 'gente', 'individuo']),
  especie('Animal', 'x é um animal', ['animal', 'bicho']),
  especie('SerVivo', 'x é um ser vivo', ['ser vivo', 'organismo']),
  p('PodeMorrer', 'x pode morrer', ['pode morrer', 'morre', 'mortal', 'vai morrer']),
  p('PrecisaDeEnergia', 'x precisa de energia (alimento) para viver', ['precisa de energia', 'precisa comer', 'precisa de alimento', 'precisa se alimentar']),
  p('PrecisaDeAgua', 'x precisa de água para viver', ['precisa de agua', 'precisa beber agua', 'precisa beber']),
  p('VoaSemEquipamento', 'x voa sem equipamento', ['voa', 'voar', 'voou', 'voa sozinho', 'voa sem equipamento', 'consegue voar']),
  especie('Corpo', 'x é um corpo material (objeto físico)', ['corpo material', 'objeto', 'corpo', 'pedra']),
  p('TemMassa', 'x tem massa', ['tem massa', 'tem peso', 'pesa']),
  p('AtraidoPelaTerra', 'x é atraído pela gravidade da Terra', ['atraido pela gravidade', 'puxado pela gravidade', 'sofre gravidade']),
  p('MaisRapidoQueLuz', 'x se move mais rápido que a luz', ['mais rapido que a luz', 'supera a velocidade da luz']),
  especie('Combustao', 'x é uma combustão (fogo)', ['combustao', 'fogo', 'chama']),
  p('ConsomeComburente', 'x consome um comburente (em geral, o oxigênio do ar)', ['consome oxigenio', 'precisa de oxigenio', 'consome comburente', 'precisa de ar']),
  especie('Som', 'x é um som', ['som', 'barulho', 'ruido']),
  especie('Luz', 'x é luz', ['luz', 'luz do sol', 'raio de luz']),
  p('PrecisaDeMeio', 'x precisa de um meio material para se propagar', ['precisa de meio', 'precisa de ar para se propagar', 'precisa de um meio material', 'nao se propaga no vacuo']),
  p('MaisQuente', 'x está mais quente que y', ['mais quente que', 'mais quente do que'], 2),
  p('EmContato', 'x está em contato com y', ['em contato com', 'encostado em', 'tocando'], 2),
  p('CalorPassa', 'o calor passa de x para y', ['calor passa', 'esquenta o', 'aquece o', 'transfere calor'], 2),
]

const wiki = (pagina: string) => `https://pt.wikipedia.org/wiki/${pagina}`
export const FATOS: Fato[] = [
  { id: 'R01', enunciado: 'Todo celular é um aparelho eletrônico.', formula: '∀x (Celular(x) ⟹ AparelhoEletronico(x))', fonte: { nome: 'definição' } },
  { id: 'R02', enunciado: 'Todo computador é um aparelho eletrônico.', formula: '∀x (Computador(x) ⟹ AparelhoEletronico(x))', fonte: { nome: 'definição' } },
  { id: 'R03', enunciado: 'Todo aparelho eletrônico em funcionamento gera calor: a corrente nos seus componentes dissipa energia (efeito Joule).', formula: '∀x (AparelhoEletronico(x) ∧ Funcionando(x) ⟹ GeraCalor(x))', fonte: { nome: 'Lei de Joule (efeito Joule)', url: wiki('Lei_de_Joule') } },
  { id: 'R04', enunciado: 'Se a temperatura de algo sobe, ele gerou calor ou recebeu energia de fora (conservação da energia).', formula: '∀x (Esquenta(x) ⟹ GeraCalor(x) ∨ RecebeEnergia(x))', fonte: { nome: 'Primeira lei da termodinâmica', url: wiki('Primeira_lei_da_termodinâmica') } },
  { id: 'R21', enunciado: 'O que está exposto ao sol recebe energia (radiação solar).', formula: '∀x (ExpostoAoSol(x) ⟹ RecebeEnergia(x))', fonte: { nome: 'Radiação solar', url: wiki('Radiação_solar') } },
  { id: 'R05', enunciado: 'Todo ser humano é um animal.', formula: '∀x (Humano(x) ⟹ Animal(x))', fonte: { nome: 'Humano (reino Animalia, ordem Primatas)', url: wiki('Humano') } },
  { id: 'R06', enunciado: 'Todo animal é um ser vivo.', formula: '∀x (Animal(x) ⟹ SerVivo(x))', fonte: { nome: 'Animalia', url: wiki('Animalia') } },
  { id: 'R07', enunciado: 'Todo ser vivo pode morrer.', formula: '∀x (SerVivo(x) ⟹ PodeMorrer(x))', fonte: { nome: 'Morte', url: wiki('Morte') } },
  { id: 'R08', enunciado: 'Todo ser vivo precisa de energia para viver (metabolismo).', formula: '∀x (SerVivo(x) ⟹ PrecisaDeEnergia(x))', fonte: { nome: 'Metabolismo', url: wiki('Metabolismo') } },
  { id: 'R09', enunciado: 'Todo ser humano precisa de água para viver.', formula: '∀x (Humano(x) ⟹ PrecisaDeAgua(x))', fonte: { nome: 'Desidratação (a falta de água interrompe os processos metabólicos)', url: wiki('Desidratação') } },
  { id: 'R10', enunciado: 'Nenhum ser humano voa sem equipamento.', formula: '∀x (Humano(x) ⟹ ¬VoaSemEquipamento(x))', fonte: { nome: 'Voo (só aves, insetos e morcegos voam com o próprio corpo)', url: wiki('Voo') } },
  { id: 'R11', enunciado: 'Todo animal é um corpo material.', formula: '∀x (Animal(x) ⟹ Corpo(x))', fonte: { nome: 'definição' } },
  { id: 'R12', enunciado: 'Todo corpo material tem massa.', formula: '∀x (Corpo(x) ⟹ TemMassa(x))', fonte: { nome: 'Massa', url: wiki('Massa') } },
  { id: 'R13', enunciado: 'Todo corpo com massa é atraído pela gravidade da Terra.', formula: '∀x (TemMassa(x) ⟹ AtraidoPelaTerra(x))', fonte: { nome: 'Lei da gravitação universal', url: wiki('Lei_da_gravitação_universal') } },
  { id: 'R14', enunciado: 'Nenhum corpo com massa se move mais rápido que a luz.', formula: '∀x (TemMassa(x) ⟹ ¬MaisRapidoQueLuz(x))', fonte: { nome: 'Velocidade da luz', url: wiki('Velocidade_da_luz') } },
  { id: 'R15', enunciado: 'Toda combustão consome um comburente.', formula: '∀x (Combustao(x) ⟹ ConsomeComburente(x))', fonte: { nome: 'Combustão', url: wiki('Combustão') } },
  { id: 'R16', enunciado: 'Todo som precisa de um meio material para se propagar.', formula: '∀x (Som(x) ⟹ PrecisaDeMeio(x))', fonte: { nome: 'Som', url: wiki('Som') } },
  { id: 'R17', enunciado: 'A luz não precisa de meio material para se propagar.', formula: '∀x (Luz(x) ⟹ ¬PrecisaDeMeio(x))', fonte: { nome: 'Radiação eletromagnética (propaga-se no vácuo)', url: wiki('Radiação_eletromagnética') } },
  { id: 'R18', enunciado: 'Entre dois corpos em contato, o calor passa do mais quente para o mais frio.', formula: '∀x ∀y (MaisQuente(x, y) ∧ EmContato(x, y) ⟹ CalorPassa(x, y))', fonte: { nome: 'Segunda lei da termodinâmica', url: wiki('Segunda_lei_da_termodinâmica') } },
  { id: 'R19', enunciado: 'O calor não passa, ao mesmo tempo, nos dois sentidos entre dois corpos.', formula: '∀x ∀y (CalorPassa(x, y) ⟹ ¬CalorPassa(y, x))', fonte: { nome: 'Segunda lei da termodinâmica', url: wiki('Segunda_lei_da_termodinâmica') } },
  { id: 'R20', enunciado: 'Nenhum corpo é mais quente que ele mesmo.', formula: '∀x (¬MaisQuente(x, x))', fonte: { nome: 'definição' } },
  // as regras sozinhas valem num mundo vazio, e aí "todo humano voa" não contradiria nada: a existência também é fato
  { id: 'R22', enunciado: 'Existem seres humanos.', formula: '∃x (Humano(x))', fonte: { nome: 'observação direta' } },
  { id: 'R23', enunciado: 'Existem celulares.', formula: '∃x (Celular(x))', fonte: { nome: 'observação direta' } },
  { id: 'R24', enunciado: 'Existem sons.', formula: '∃x (Som(x))', fonte: { nome: 'observação direta' } },
  { id: 'R25', enunciado: 'Existe luz.', formula: '∃x (Luz(x))', fonte: { nome: 'observação direta' } },
  { id: 'R26', enunciado: 'Existe fogo (combustão).', formula: '∃x (Combustao(x))', fonte: { nome: 'observação direta' } },
]
