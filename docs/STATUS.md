# Estado do Nook — 9/10/2026

Atualização de publicação: o Supabase remoto recebeu as migrações e correções
de segurança; Render recebeu as variáveis do projeto. O estado atual e as
pendências estão em [PUBLICACAO](PUBLICACAO.md). O restante deste arquivo
registra a validação local anterior à publicação.

Quatro etapas implementadas localmente: cadastro aberto/acesso permanente;
extração conservadora/âncoras remotas; sumário e busca no PDF; catálogo paginado no
servidor e controles móveis. Migrações 014–016 preparadas e testadas em PostgreSQL local.

Admins, suspensões, publicação explícita, RLS e Storage privado permanecem.
Nenhum deploy ou SQL remoto foi executado. A aplicação remota existente só muda
quando a revisão e as migrações forem aplicadas.

Testes unitários/SQL, lint, TypeScript, build, navegador de componentes e aplicação
Next passaram. Demonstração local validou cadastro sem convite, leitor/admin,
leitura, upload e CORS reais no localhost. Catálogo medido com 1.001 obras e 10.003
capítulos: 26 consultas/2.706.331 bytes antes, uma consulta/10.051 bytes depois.
Os tempos locais e limites da medição estão no relatório.

[Relatório](LANCAMENTO-NOOK.md): evidências, medidas e limites.
[MIGRATIONS](MIGRATIONS.md): instalação/upgrade, Auth e administrador.
[TESTE-LOCAL-RENDER](TESTE-LOCAL-RENDER.md): experimentar/publicar.
[E2E](E2E.md): homologação isolada.

Pendências externas: e-mails/redirects reais, Supabase/Storage reais, retomada entre
aparelhos, restauração operacional e publicação na origem escolhida.

## Renovação visual — implementada localmente

Interface em preto e azul, com tokens semânticos para superfícies, controles,
ações, foco e mensagens. Navegação consolidada; cartões, filtros, formulários,
perfil, administração, gerenciamento e leitores renovados. Perfil em duas colunas
quando há espaço, recuperação de senha com campos padronizados, categorias
acessíveis pela página Sobre e páginas próprias de erro/404. Corrigido o
transbordamento do histórico completo no celular. CSS antigo sem consumidores
foi removido; regras de navegação e painéis voltaram aos arquivos responsáveis.

Temas claro/sépia, imagens originais, PDF/CBZ, posição de leitura e permissões
preservados. Dependências, migrações, camada de dados e hooks não foram alterados.

Validação desta renovação: `npm test`, `npm run lint`, `npm run typecheck`,
`npm run build`, `npm run test:browser`, `npm run test:next-browser` e
`npm run test:demo-local` aprovados. Páginas/estados revisados entre 320 e 1920 px,
incluindo paisagem, controles principais com alvo de 44 px, teclado, movimento
reduzido e contraste dos controles do painel nos três temas. Além do zoom CSS
existente, Chromium validou zoom nativo de 200% a 320 CSS px, com navegação do PDF,
resultados, ação de leitura e fechamento acessíveis. Next real verificou 13
larguras, PDF.js/CBZ, retomada, sumário/busca, 404 e descarte de recursos.

Capturas regeneráveis: `artifacts/browser` e `artifacts/next-browser`; o conteúdo
nelas é de teste. A demo foi validada em uma cópia temporária com portas
alternativas, preservando a sessão que já estava aberta. Nenhum deploy ou
serviço remoto foi alterado; as pendências externas acima continuam aplicáveis.
