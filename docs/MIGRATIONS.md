# Sequência de migrations PostgreSQL

As migrations versionadas e os arquivos SQL de bootstrap são a referência para o estado do banco. `supabase/schema.sql` é um baseline histórico pré-beta, não um snapshot atual. Os scripts são executados manualmente no SQL Editor; não os reaplique a um banco que já os recebeu. Faça backup e confira `supabase/verify-preservation.sql` antes de atualizar uma cópia.

## Projeto vazio

1. `supabase/schema.sql` cria o baseline histórico da biblioteca.
2. `supabase/migrations/002_library_structure.sql` adiciona séries, volumes e estrutura do catálogo.
3. `supabase/migrations/004_reader_productivity.sql` adiciona marcadores e produtividade do leitor. O repositório não contém migration 003.
4. `supabase/migrations/005_closed_beta.sql` instala acesso fechado, perfis, publicação, favoritos, comentários e policies do beta; também preserva e transforma dados anteriores.
5. Promova uma conta Auth de forma explícita seguindo [ADMIN-BOOTSTRAP.md](ADMIN-BOOTSTRAP.md).
6. `supabase/migrations/006_visible_series_comments.sql` corrige o acesso a comentários para seguir a visibilidade da obra.
7. `supabase/migrations/007_storage_visibility.sql` faz a leitura de mídia privada seguir a publicação da obra e mantém objetos sem referência indisponíveis aos leitores.

## Banco no estado anterior ao beta

Confirme que o banco já tem o baseline, a migration 002 e a 004. Faça backup; execute a 005 uma única vez, promova a conta administradora conforme o procedimento acima e aplique as migrations 006 e 007. A 005 transforma a chave e os dados de progresso, copia favoritos, cria perfis e substitui policies; não é uma migration segura para repetição. As correções 006 e 007 limitam comentários e mídia privada às obras visíveis.

## Alterações futuras

As migrations `002`, `004` e `005` são históricas e não devem ser reescritas depois de aplicadas. Adicione novos arquivos numerados e focados por responsabilidade (por exemplo, índices, storage policies ou moderação), com teste de upgrade em clone e de instalação vazia antes de aplicá-los remotamente. Nenhuma migration desta documentação foi executada em banco remoto.
