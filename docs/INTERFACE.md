# Interface do Nook

A revisão preserva o tema escuro, os tons quentes, as serifas e os fluxos privados. Não altera autenticação, policies RLS, buckets ou serviços remotos. Catálogo, administração, obra, preferências e progresso usam as tabelas existentes, sem exigir funções novas ou migrations adicionais. A configuração local e o comando de build original do Render são preservados.

## Organização dos estilos

`src/app/globals.css` importa base, biblioteca/leitor, acesso/administração, perfil/comunidade, navegação e catálogo.

- `styles/base.css`: única fonte de tokens globais, fontes, foco, movimento reduzido e elementos compartilhados.
- `styles/catalog.css`: catálogo, busca, filtros, cartões e histórico, com escopo próprio para os cartões do catálogo.
- `styles/library-reader.css`: obras, capítulos, modais, gerenciador e leitores. Os temas PDF usam tokens `--reader-*` separados dos globais.
- `styles/profile-community.css`: perfil e comunidade.
- `styles/navigation.css`: trilho, menu móvel e link para pular ao conteúdo.
- `styles/catalog-admin.css`: componentes administrativos e estilos legados de acesso; sem tokens globais ou layout de perfil.

`visual-refresh.css` foi absorvido pelas folhas responsáveis e removido. As regras legadas restantes foram preservadas onde uma reescrita exigiria homologação adicional. Não há nova folha de sobrescritas visuais.

## Escolher, ler e voltar

O início destaca a leitura incompleta mais recente entre os seis registros do histórico, com capa ou ícone, obra, capítulo, posição e continuação. Ela não se repete nos cartões secundários. Histórico concluído oferece “Ler novamente”. Não há recomendação ou métrica inventada.

O catálogo oferece busca, situação e ordenação por adição, título ou última leitura. Consultas às tabelas existentes respeitam RLS e os limites de resposta do PostgREST; a interface agrupa os resultados em páginas de 24 obras. A situação usa apenas arquivos acessíveis e progresso do próprio leitor: nenhuma posição salva = não iniciada; algum arquivo iniciado = em leitura; todos os arquivos concluídos = concluída. Obras sem arquivos permanecem não iniciadas.

Busca, situação, ordem, página e rolagem ficam em `sessionStorage`, separados por usuário e rota. O logout limpa esses contextos. Nenhum arquivo, capa assinada ou progresso é armazenado nesse contexto. Voltar pelo logotipo da obra leva à última categoria/lista visitada. Esse estado é da aba atual; não sincroniza entre dispositivos.

A página da obra e o índice compartilham a ordenação global de volumes/capítulos, com páginas de 100 arquivos. “Começar” consulta o primeiro arquivo da obra inteira; “Continuar” consulta o último progresso da conta, independentemente da página exibida. Capítulos são agrupados por volume, com situação e última leitura identificadas. Contagens vêm do conjunto inteiro, não somente da página.

## Leitores e preferências

O PDF mantém texto e páginas originais. Páginas sem texto extraível oferecem “Ver no PDF”; conteúdo muito curto também oferece a página original. Não há OCR nem reescrita do conteúdo. Trocar de modo mantém a página ativa. Canvases reagem à largura disponível, apresentam erro recuperável e liberam memória fora da janela ativa.

O CBZ oferece rolagem vertical e uma página por vez, com preferência por conta e controles persistentes neste segundo modo. Restauração e troca de disposição usam rolagem imediata para evitar animações concorrentes. A extração continua em worker, perto da viewport; URLs de imagens distantes são revogadas. Os limites de arquivo/páginas/pixels existentes foram preservados. Não há modo de páginas duplas, direção direita–esquerda ou zoom próprio do leitor.

Perfil e leitor compartilham valores normalizados: fonte inteira de 16–32 px; entrelinha 1,65/1,85/2,05; largura 700/760/820; temas escuro/sépia/claro. O salvamento lê as preferências atuais e combina apenas os campos editados, preservando campos desconhecidos. As gravações deste cliente são serializadas por conta; não há merge atômico entre dispositivos. O cache opcional do PDF tem chave por conta. Falhas de sincronização são visíveis e permitem nova tentativa.

Progresso volta a usar o upsert na tabela `reading_progress`, com proprietário, arquivo e `updated_at`, como no funcionamento anterior. As gravações deste cliente são serializadas por conta/arquivo; não há controle de versão entre dispositivos. Navegações internas aguardam o salvamento. Se falhar, oferecem nova tentativa ou saída explícita sem salvar aquela posição. Não há fila offline durável.

## Administração

Obras novas começam restritas. A área de compartilhamento mostra visibilidade e prévia da leitura; liberação exige nota de autorização e confirmação explícita. A prévia é aberta com acesso administrativo e não comprova, sozinha, as permissões de um convidado.

Obras, arquivos e capítulos são consultados em lotes pelas tabelas existentes; busca, contagens e páginas são calculadas no cliente. Seletores de obra/volume fazem busca e paginação próprias de 20 opções. A obra administrativa mostra arquivos em páginas de 100 e permite encontrar volumes vazios pelo seletor independente. Catálogos muito grandes podem exigir mais consultas do que a versão com RPCs.

As operações alteradas bloqueiam reentrância, tratam falhas e descartam respostas antigas das consultas. Ações em massa verificam os registros retornados antes de anunciar sucesso. Exclusão de obra coleta todas as referências de mídia em páginas de 250 antes de excluir os registros e limpa o Storage em lotes de 100; falha na coleta preserva a obra e falha na limpeza é informada. Upload simultâneo durante essa exclusão ainda precisa de coordenação transacional em uma melhoria futura.

Capas são validadas antes de criar a obra; upload individual verifica duplicidade por nome na obra antes de enviar. O lote preserva sua validação, resultado por arquivo, detecção de nomes repetidos e retomada dos itens com erro. Detecção por nome não identifica conteúdo idêntico com nomes diferentes nem resolve sozinha envios simultâneos em dispositivos diferentes.

## Acessibilidade e acabamento

Capas ausentes ou quebradas têm fallback visível e nome acessível no link. O histórico móvel usa rolagem horizontal com cartões legíveis. Campos, foco, títulos longos, mensagens, modais e alvos de toque seguem os componentes existentes. Há link para pular ao conteúdo, Escape com restauração de foco, estados indisponíveis e respeito a `prefers-reduced-motion`. Temas PDF usam foco próprio inclusive em sépia/claro.

## Validação local

```sh
npm test
npm run lint
npm run typecheck
npm run build
npm run test:browser
npm run test:next-browser
```

`test:browser` compila os componentes reais e o CSS global com as ferramentas existentes. Somente seu bundle troca o módulo Supabase por dados em memória. Usa servidor próprio em loopback, Chromium, arquivos originais e bloqueio de requisições externas. Cobre acesso/cadastro, catálogo/lista/categorias, obra, perfil, administração/obra administrativa/gerenciador, controles PDF e CBZ em 1440/768/390/320 px; também capas, teclado, filtros, retorno/contexto/página inexistente, preferências, paginação, criação restrita, seleção preservada após atualização recusada, modos CBZ, conflito/nova tentativa e movimento reduzido. Capturas: `artifacts/browser`.

`test:next-browser` compila a aplicação real em `.next-ui` e inicia seu próprio Next local. Passa as duas variáveis públicas como valores fictícios de loopback, sem alterar `.env.local`. Playwright intercepta o SDK; nenhum Supabase é contactado. Cobre rotas/hidratação, 11 larguras de 320–1920 px, navegação obra → leitor → biblioteca, início global após paginação, PDF.js texto/canvas/fallback/redimensionamento, marcadores/restauração simulados, falha de progresso e CBZ real. Capturas: `artifacts/next-browser`. O PDF de teste é gerado por `tests/ui/original-pdf.mjs`, sem conteúdo de terceiros.

`npm test` mantém os testes históricos de schema em PostgreSQL em memória (PGlite), sem acesso a Supabase. Os testes de compatibilidade usam somente respostas fictícias das tabelas existentes e rejeitam chamadas a RPCs novas. Verificam mais de mil capítulos, paginação, início global, isolamento das consultas pessoais, preferências e recuperação das gravações. Não executam atualizações de schema ou operações em serviços remotos.

## Demonstração interativa local

Execute `npm run demo:local` e abra `http://127.0.0.1:3100/__demo`. As portas 3100, 3102 e 54321 precisam estar livres. O processo compila o Next em `.next-ui`, inicia somente servidores em loopback e usa o schema histórico até a 012 exclusivamente em memória. Nenhuma configuração `.env` é editada; as duas variáveis públicas são substituídas explicitamente por valores fictícios locais no processo filho.

A página oferece entrada com um clique como administração ou leitor, 30 obras fictícias, PDF/CBZ originais locais e uma obra com 105 capítulos. O adaptador HTTP simula somente as operações Auth/REST/Storage/TUS usadas pelo aplicativo, sem configurar a aplicação publicada. As senhas fictícias não são verificadas nem armazenadas; não use credenciais reais. Uploads têm limite de 20 MB e ficam na memória, assim como todas as alterações. Encerrar e iniciar o processo recria os dados.

O proxy aplica CSP com destinos locais. A porta interna 3102 é apenas o Next; use o endereço 3100. A ferramenta existe somente em `tests`, sem alterações na autenticação do aplicativo publicado. E-mail, validação/troca real de senha, revogação de URLs e garantias do TUS remoto continuam dependendo de homologação em Supabase isolado.

O endereço `localhost:3100` redireciona para `127.0.0.1:3100` antes de carregar a aplicação, mantendo sessão e CORS na mesma origem. O portal também aceita barra final e parâmetros na URL. Use os botões do portal para entrar sem digitar credenciais, ou as contas fictícias indicadas nele no formulário de acesso.

A API local permite explicitamente os cabeçalhos `x-supabase-api-version` (autenticação), `accept-profile`, `content-profile` e `x-retry-count` (PostgREST), mantendo apenas a origem local autorizada. Os testes desta demonstração observam as requisições sem interceptá-las: a interceptação do Playwright pode suprimir o preflight CORS e esconder falhas que ocorrem no navegador do usuário.

Com a demonstração rodando, `npm run test:demo-local` verifica o formulário de acesso de administração e leitor por ambos os endereços, persistência da sessão ao recarregar, catálogo, paginação, ação global da obra, PDF/CBZ, marcador/progresso, perfil, criação restrita, upload local pelo cliente TUS e ocultação da obra restrita para outra conta. O teste modifica dados temporários; reinicie a demonstração para restaurar o acervo inicial.

## Próximas prioridades

1. Verificar os fluxos com as tabelas existentes em ambiente de teste autorizado, sem alterar o banco para usar esta interface.
2. Verificar Safari/iOS, Firefox, teclado/leitor de tela e zoom 200–400% com arquivos autorizados variados, incluindo PDFs digitalizados e manhwas muito longos.
3. Medir consultas/contagens com acervo grande e rede lenta; avaliar índices conforme os planos reais e melhorar o fluxo de limpeza de mídia após falhas administrativas.
4. Avaliar salvamento offline durável, controles de zoom/direção/páginas duplas e retomada entre aparelhos após a base autenticada ser homologada.
