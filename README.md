# Nook — LightNovel Reader Privado

Leitor privado de PDFs feito com Next.js, Tailwind CSS, Supabase Auth, Storage e Postgres. Os PDFs são enviados por upload retomável; o leitor salva página, linha e rolagem na nuvem. Nenhum PDF de exemplo acompanha o projeto.

## Configuração local

1. Crie um projeto no [Supabase](https://supabase.com/dashboard).
2. Em **Authentication > Users**, crie sua conta com e-mail e senha. Em **Authentication > Providers > Email**, desative **Allow new users to sign up** para impedir cadastro público.
3. Copie o **User UID** da conta. Abra [supabase/schema.sql](supabase/schema.sql), substitua `00000000-0000-0000-0000-000000000000` pelo UID e execute o arquivo no **SQL Editor**. O script cria tabelas, políticas RLS e o bucket privado `novels`.
4. Em **Project Settings > API**, copie a **Project URL** e a **anon/publishable key** para `.env.local`:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=SUA_CHAVE_PUBLICAVEL
   ```

5. Execute `npm ci` e `npm run dev`. Abra <http://localhost:3000> e entre com sua conta.

**Nunca coloque a service role key no `.env.local` ou no Render.** A chave publicável é segura no frontend porque as políticas RLS controlam o acesso. A função `is_private_owner()` no SQL libera somente o UID escolhido. Se ela continuar com o UUID zerado, uploads e leituras serão bloqueados.

O Supabase pode impor um limite de tamanho de arquivo no projeto. Ajuste-o em **Storage > Settings** se seus PDFs forem maiores. O envio usa TUS em blocos de 6 MB e pode retomar uma transferência interrompida.

## Deploy no Render

1. Publique esta pasta em um repositório privado no GitHub. `.env.local` está no `.gitignore`.
2. No Render, escolha **New > Blueprint** e conecte o repositório. O arquivo [render.yaml](render.yaml) configura build e servidor Node.
3. Informe `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` nas variáveis solicitadas pelo Render. As variáveis `NEXT_PUBLIC_` são incorporadas no build, então um novo deploy é necessário se mudarem.
4. Abra a URL gerada e faça login. Nenhuma variável de segredo de servidor é necessária.

## Leitor

- **Texto:** extrai texto do PDF e o adapta à largura da tela; controle de tamanho de fonte.
- **Página:** mostra a página original, útil para PDFs com imagens, gráficos ou formatação complexa.
- PDFs digitalizados sem texto selecionável exibem automaticamente a página original. O app não faz OCR.
- A posição é salva após a rolagem e ao trocar de página ou sair da aba. Ao reabrir, a leitura volta à posição gravada.

## Verificação

`npm run typecheck`, `npm run lint` e `npm run build` validam o projeto localmente. A integração real requer a configuração do seu projeto Supabase e um PDF seu.
