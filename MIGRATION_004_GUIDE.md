# Migração 004: favoritos e marcadores

Esta migração é necessária para usar os novos botões de favoritos e marcadores. Não é executada pelo aplicativo nem por este repositório.

1. Faça um backup do banco no painel do Supabase e confirme que ele pode ser restaurado. Exporte `series` e `reading_bookmarks` antes de alterações posteriores.
2. Confira que a migração `002_library_structure.sql` já foi aplicada. No SQL Editor do projeto correto, revise e execute o conteúdo integral de `supabase/migrations/004_reader_productivity.sql`. O arquivo usa uma transação, não move PDFs e não altera o bucket privado.
3. Valide no Table Editor que `series.is_favorite` existe com padrão `false`, `reading_bookmarks` tem RLS habilitada e as quatro políticas de proprietário foram criadas. Com uma sessão do proprietário, marque uma obra e crie/edite/exclua um marcador; confirme que outra sessão não consegue ler esses dados.
4. Para voltar à versão anterior do aplicativo, faça rollback do código primeiro. A coluna e a tabela podem permanecer sem afetar o leitor anterior, preservando os dados. Se for indispensável remover o esquema, exporte os marcadores antes e só então, numa janela de manutenção, remova `reading_bookmarks` e `series.is_favorite` manualmente. Restaurar o backup é a opção para reverter dados.

Não execute a migração em produção sem revisar o backup e o projeto selecionado.
