# Implementação das quatro etapas — 9/10/2026

Trabalho anterior da árvore foi preservado. As migrações 002–013 não foram editadas
nesta implementação. Não houve push, deploy, publicação automática ou alteração remota.

## Conta

A 014 cria perfil/leitor permanente sem convite e completa lacunas legadas sem
sobrescrever dados/papéis. Admins e suspensões permanecem; RLS/Storage/publicação
não foram relaxados. Frontend centraliza a regra de acesso. Nomes SQL antigos
continuam compatíveis. Confirmação/reenvio, recuperação e definição de senha têm
rotas públicas e erros/expiração. Mensagens evitam revelar existência de contas.
Demo e fixtures aceitam cadastro sem convite; demo não envia e-mail/valida senha.

## Fidelidade e continuidade

Extração conserva `1984`, links narrativos, créditos/ISBN, diálogo e corpo do texto;
remove só contadores explícitos no rodapé físico. Mantém hífen convencional e
acesso ao original. Trocas de modo guardam página/fração e a volta imediata
reaproveita o caractere. Ao deslocar o PDF, a conversão usa aproximação por fração:
colunas/imagens/ordem de extração podem impedir equivalência exata.

`page_offset`/`text_offset` agora são remotos em progresso e marcadores (015),
opcionais para registros antigos. Marcadores de texto sem os novos campos
continuam usando a linha original; essa compatibilidade foi testada no Next real.
Timestamp offline, conflito entre aparelhos e
conclusão seguem as regras existentes. Regressões usam tolerância de 48 px para
troca/reload e âncora a 32 px do topo após tipografia. Não há OCR nem pré-download offline.

## Navegação e catálogo

Sumário carrega ao abrir o painel; destinos inválidos não bloqueiam os demais.
Busca aguarda 300 ms, extrai uma página por vez e fornece progresso, até 200
resultados, anterior/próximo e leitura do trecho. Trocar consulta/fechar invalida
trabalho pendente. Limites do sumário: 500 itens/10 níveis. Sem texto/outline,
fallback explica a limitação. Hook/painel separam isso do componente PDF principal.

A 016 retorna 24 resumos por request com filtros, favoritos, estado, ordenação e
contagem sob RLS. Recebe até 512 posições locais pendentes da própria conta,
respeitando timestamp mais novo. Abrir obra e administração continuam usando
consultas anteriores e não fazem parte da redução da página inicial.

## Medidas

`npm run bench:catalog` gera `artifacts/catalog-benchmark.json`. Mesmo banco
PGlite/PostgreSQL/papel de leitor, primeiro carregamento sem cache, 1.001 obras e
mais de dez mil capítulos. Compara consultas anteriores em lotes de 500 com uma
RPC de 24 itens. JSON sem compressão; tempo local de SQL serial/serialização,
mediana de três após aquecimento. Não mede HTTP, tempo visual ou produção; a nova
função ainda agrega metadados no banco. Rodada com Node 24.18.0, PGlite 0.5.8,
1.001 obras e 10.003 capítulos:

| Medida                            |       Antes |    Depois |
| --------------------------------- | ----------: | --------: |
| Consultas para catálogo           |          26 |         1 |
| JSON transferível, bytes          |   2.706.331 |    10.051 |
| Registros/resumos retornados      |      11.005 |        24 |
| SQL local + serialização, mediana | 3.925,33 ms | 549,05 ms |

Redução de payload de 99,63% neste cenário. A consulta nova ainda precisa ser
medida no Supabase real, inclusive latência de filtros/paginação. Estes tempos
não são promessa de desempenho em produção.

## Validação e limites

Cobertura histórica de beta roda antes da 014, seguida da nova autorização.
Inclui admins/legados/suspensos, invasão entre contas, obra restrita, Storage privado,
âncoras, conflitos offline, SQL de catálogo, uploads e integridade de backup.
Navegador verifica Auth simulado, PDF.js/CBZ reais, outline, busca, cancelamento,
limite de resultados, scan, foco, temas e responsividade. Capturas são regeneráveis
em `artifacts/browser` e `artifacts/next-browser`.

Checks aprovados nesta sessão: `npm test`, `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run test:browser`, `npm run test:next-browser` e
`npm run bench:catalog` e `npm run test:demo-local`. Regressões adicionais de acesso e retomada sem cache local
também passaram. Next validou 12 larguras de 320 a 1920 px, troca rápida Texto/PDF,
tipografia/reload dentro da tolerância, outline/busca com PDF.js real, scan sem texto,
zoom CSS de 200%, Escape/foco e descarte de recursos em cinco ciclos PDF/CBZ.
Fixture de interface verificou contraste de pelo menos 4,5:1 nos controles/inputs
e título do painel nos temas claro/sépia/escuro. Demo interativa passou cadastro sem
convite/negação de admin, leitura, progresso, marcadores e upload TUS; login/reload
também passaram em localhost/127.0.0.1 com preflights CORS reais e tráfego local.
Prévia do painel: `artifacts/next-browser/pdf-navigation-390.png` e
`artifacts/next-browser/pdf-navigation-1440.png`.

Auth/e-mail/Storage reais, dois aparelhos, restauração operacional e deploy são
pendências externas. `npm audit --omit=dev` repetido ao final retornou zero achados.
A auditoria completa anterior encontrou achados altos na cadeia de ferramentas
`braces`. Não foi aplicado `npm audit fix --force`,
que propunha downgrade incompatível. Atualizar o conjunto ESLint é trabalho separado.

Para retomar, leia este relatório/STATUS/MIGRATIONS, confira diff e siga o roteiro
de homologação. Não reaplique baseline em banco existente.
