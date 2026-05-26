# Dividados Pesquisa - Modelo futuro para Supabase

Este arquivo documenta uma proposta de estrutura para migrar o Dividados Pesquisa do Google Sheets/Google Apps Script para Supabase.

O sistema atual deve continuar chamando apenas as funcoes de `api-client.js`. No futuro, a troca para Supabase deve acontecer dentro desse arquivo, sem reescrever formulario, dashboard, relatorio ou relatorio de campo.

## pesquisas

Guarda cada pesquisa/projeto criado.

Campos sugeridos:

- `id`: identificador unico da pesquisa.
- `titulo`: nome da pesquisa.
- `cidade`: cidade principal da pesquisa.
- `descricao`: descricao interna.
- `status`: ativa, pausada ou encerrada.
- `data_inicio`: inicio da coleta.
- `data_fim`: fim previsto ou realizado.
- `created_at`: data de criacao.
- `updated_at`: data da ultima alteracao.

## perguntas

Guarda as perguntas dinamicas da pesquisa.

Campos sugeridos:

- `id`: identificador interno.
- `pesquisa_id`: referencia para `pesquisas`.
- `codigo`: exemplo P1, P2, P13.
- `grupo`: agrupamento usado no dashboard e relatorio.
- `contexto`: texto exibido uma vez antes de perguntas relacionadas.
- `pergunta`: texto da pergunta.
- `tipo`: Fechada, SemiFechada, Escala ou AbertaTexto.
- `ativa`: indica se aparece no formulario.
- `ordem`: ordem de exibicao.
- `created_at`.
- `updated_at`.

## alternativas

Guarda as alternativas de cada pergunta, evitando colunas fixas A, B, C, D etc.

Campos sugeridos:

- `id`: identificador unico da alternativa.
- `pergunta_id`: referencia para `perguntas`.
- `letra`: A, B, C, D, E, F, G, H, I ou J.
- `texto`: texto da alternativa.
- `peso`: peso numerico para perguntas do tipo Escala.
- `eh_outra`: verdadeiro quando a alternativa for Outra/Outro.
- `eh_nto`: verdadeiro quando for N.T.O.
- `ordem`: ordem da alternativa.

## respostas

Guarda o cabecalho de cada entrevista.

Campos sugeridos:

- `id`: identificador interno.
- `unique_id`: ID unico gerado no aparelho para evitar duplicidade.
- `pesquisa_id`: referencia para `pesquisas`.
- `data_hora_inicio`: horario em que a entrevista foi iniciada.
- `data_hora_envio`: horario em que foi enviada/sincronizada.
- `pesquisador_id`: referencia para `pesquisadores`, quando houver cadastro.
- `pesquisador_nome`: nome informado no formulario.
- `cidade`: cidade normalizada.
- `regiao`: regiao/bairro normalizado.
- `endereco`: endereco informado.
- `numero`: numero do endereco informado.
- `sexo`: sexo do entrevistado.
- `faixa_etaria`: faixa etaria usada na cota.
- `latitude`: latitude, quando capturada.
- `longitude`: longitude, quando capturada.
- `status_gps`: Capturado, Negado pelo usuario ou Indisponivel.
- `origem`: Online ou Offline.
- `status_sincronizacao`: Sincronizado, Pendente ou outro status operacional.
- `created_at`.

## respostas_detalhadas

Guarda uma linha para cada resposta de cada pergunta.

Campos sugeridos:

- `id`: identificador unico.
- `resposta_id`: referencia para `respostas`.
- `pergunta_id`: referencia para `perguntas`.
- `codigo_pergunta`: copia do codigo da pergunta, util para consultas.
- `tipo_pergunta`: Fechada, SemiFechada, Escala ou AbertaTexto.
- `alternativa`: letra marcada, quando existir.
- `alternativa_texto`: texto da alternativa marcada.
- `resposta_texto`: texto aberto ou complemento da opcao Outra.
- `peso`: peso usado em perguntas Escala.
- `created_at`.

## cotas

Controla as cotas por perfil.

Campos sugeridos:

- `id`: identificador unico.
- `pesquisa_id`: referencia para `pesquisas`.
- `sexo`: sexo da cota.
- `faixa_etaria`: faixa etaria da cota.
- `meta`: quantidade desejada.
- `realizado`: quantidade realizada.
- `restante`: quantidade restante.
- `status`: Aberta ou Fechada.
- `updated_at`.

## pesquisadores

Cadastro e acompanhamento dos entrevistadores.

Campos sugeridos:

- `id`: identificador unico.
- `nome`: nome padronizado do pesquisador.
- `nome_normalizado`: nome sem acentos e em minusculas para evitar duplicidade.
- `cidade`: cidade de atuacao.
- `meta`: meta individual de entrevistas.
- `realizado`: total realizado.
- `status`: Ativo ou Inativo.
- `created_at`.
- `updated_at`.

## regioes

Cadastro territorial padronizado usado pelo formulario.

Campos sugeridos:

- `id`: identificador unico.
- `pesquisa_id`: referencia para `pesquisas`.
- `cidade`: cidade padronizada.
- `regiao`: regiao/bairro padronizado.
- `ativa`: indica se aparece no formulario.
- `ordem`: ordem de exibicao dentro da cidade.
- `created_at`.
- `updated_at`.

## usuarios

Base futura para login e permissoes.

Campos sugeridos:

- `id`: identificador unico do usuario.
- `nome`: nome completo.
- `email`: e-mail de acesso.
- `perfil`: administrador, gestor, pesquisador ou visualizador.
- `pesquisador_id`: referencia opcional para `pesquisadores`.
- `status`: Ativo ou Inativo.
- `created_at`.
- `updated_at`.

## Observacoes de migracao

- O frontend deve continuar usando somente `api-client.js`.
- As funcoes publicas devem permanecer: `getDashboardData`, `getQuestions`, `getQuotas`, `getResearchers`, `getRegions`, `checkQuota` e `submitResponse`.
- O Apps Script atual pode ser substituido por chamadas Supabase dentro de `api-client.js`.
- A estrutura `respostas` + `respostas_detalhadas` facilita dashboards, cruzamentos e relatorios sem depender de colunas fixas.
