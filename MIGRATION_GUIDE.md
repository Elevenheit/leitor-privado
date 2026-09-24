# Migração da estrutura da biblioteca

Esta migração adiciona obras e volumes sem apagar nem mover linhas de `books`, `reading_progress` ou objetos do bucket privado `novels`. As colunas novas dos PDFs são opcionais, portanto o leitor continua aceitando registros antigos com `series_id` e `volume_id` nulos.

## Antes de começar

1. Faça um backup pelo painel Supabase (Database > Backups) ou exporte as tabelas `books` e `reading_progress`.
2. Confira que `public.is_private_owner()` e as policies atuais de `books`, `reading_progress` e `storage.objects` estão funcionando. Não altere o UUID privado.
3. Não execute comandos em produção sem antes conferir o backup. A migração não apaga dados, mas policies ou permissões preexistentes incompatíveis podem interromper as gravações.

## SQL a executar e ordem

Para o projeto existente, execute **uma única vez** o arquivo completo `supabase/migrations/002_library_structure.sql` no Supabase Dashboard > SQL Editor. O arquivo abre uma transação e:

1. Cria `public.series` e `public.volumes`.
2. Adiciona colunas opcionais de obra, volume e capítulo a `public.books`.
3. Cria índices e policies RLS privadas.
4. Recria apenas as policies de insert/update de `books`, mantendo as restrições anteriores e conferindo que relações pertençam ao mesmo proprietário.
5. Cria o bucket privado `covers` e policies limitadas ao diretório do proprietário.

Não execute também `supabase/schema.sql` em um projeto existente: esse arquivo é a referência completa para instalações novas e contém a configuração inicial do proprietário privado. Em instalação nova, execute `schema.sql` uma vez; a migration não é necessária.

## Conferir o resultado

No SQL Editor, execute:

```sql
select table_name from information_schema.tables
where table_schema = 'public' and table_name in ('series', 'volumes', 'books', 'reading_progress')
order by table_name;

select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'books'
  and column_name in ('series_id','volume_id','chapter_number','chapter_title','sort_order','content_type')
order by ordinal_position;

select tablename, rowsecurity from pg_tables
where schemaname = 'public' and tablename in ('series','volumes','books','reading_progress');

select id, name, public, allowed_mime_types from storage.buckets
where id in ('novels','covers') order by id;
```

O esperado são quatro tabelas com RLS ativada e buckets `novels` e `covers` com `public = false`. A contagem/IDs de `books` e `reading_progress` devem continuar iguais aos do backup.

## Reversão

Se a aplicação nova apresentar problema, reverta o deploy/código para a versão anterior. As colunas e tabelas extras são compatíveis com a versão antiga; deixá-las no banco preserva a organização feita depois.

Se for necessário remover a estrutura nova, primeiro volte o código antigo e faça backup novamente. O SQL opcional abaixo remove apenas a estrutura adicionada. Ele mantém PDFs e progresso, mas remove os metadados e a organização nova. Não remova o bucket `covers` enquanto houver capas que queira conservar.

```sql
begin;
drop policy if exists "Owner reads covers" on storage.objects;
drop policy if exists "Owner uploads covers" on storage.objects;
drop policy if exists "Owner updates covers" on storage.objects;
drop policy if exists "Owner deletes covers" on storage.objects;
drop policy if exists "Owner manages volumes" on public.volumes;
drop policy if exists "Owner manages series" on public.series;
drop policy if exists "Owner inserts books" on public.books;
drop policy if exists "Owner updates books" on public.books;
-- Recria as políticas originais da instalação anterior.
create policy "Owner inserts books" on public.books for insert to authenticated
  with check (public.is_private_owner() and owner_id = (select auth.uid()) and file_path like owner_id::text || '/%.pdf');
create policy "Owner updates books" on public.books for update to authenticated
  using (public.is_private_owner() and owner_id = (select auth.uid()))
  with check (public.is_private_owner() and owner_id = (select auth.uid()));
alter table public.books drop column if exists series_id;
alter table public.books drop column if exists volume_id;
alter table public.books drop column if exists chapter_number;
alter table public.books drop column if exists chapter_title;
alter table public.books drop column if exists sort_order;
alter table public.books drop column if exists content_type;
drop table if exists public.volumes;
drop table if exists public.series;
commit;
```

Storage não é alterado pelo fluxo de upload dos PDFs. Para apagar o bucket de capas manualmente, primeiro remova seus arquivos no painel Storage; o Supabase não permite remover um bucket que ainda contenha objetos. O bucket original `novels` e seus objetos devem permanecer.
