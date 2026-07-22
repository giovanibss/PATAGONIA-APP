# Configurar a sincronização entre aparelhos

Sem esta configuração o app funciona normalmente, mas salva só no navegador
em que você está. Com ela, as edições aparecem em qualquer aparelho.

Leva uns 15 minutos e é gratuito.

---

## 1. Criar o projeto no Supabase

1. Acesse **supabase.com** e crie uma conta (dá para entrar com o GitHub).
2. Clique em **New project**.
3. Escolha um nome (ex.: `patagonia`), defina uma senha para o banco e
   selecione a região **South America (São Paulo)** — a mais próxima.
4. Aguarde uns 2 minutos enquanto o projeto é criado.

## 2. Criar a tabela

No menu lateral, abra **SQL Editor**, cole o bloco abaixo e clique em **Run**:

```sql
create table viagens (
  id text primary key,
  dados jsonb not null,
  atualizado_em timestamptz default now()
);

alter table viagens enable row level security;

create policy "acesso liberado" on viagens
  for all using (true) with check (true);

alter publication supabase_realtime add table viagens;
```

O que isso faz: cria a tabela, libera o acesso (sem login) e ativa a
atualização em tempo real entre aparelhos.

## 3. Pegar as credenciais

No menu lateral vá em **Project Settings → API Keys** e copie:

- **Project URL** — algo como `https://abcdefgh.supabase.co`
- **Publishable key** (também chamada de `anon`) — um texto longo

> A outra chave, `service_role`, **não** deve ser usada aqui. Ela dá acesso
> administrativo e ficaria exposta no navegador.

## 4. Configurar no Vercel

No painel do seu projeto: **Settings → Environment Variables**.

Adicione três variáveis:

| Nome | Valor |
| --- | --- |
| `VITE_SUPABASE_URL` | a Project URL do passo 3 |
| `VITE_SUPABASE_KEY` | a publishable key do passo 3 |
| `VITE_ID_VIAGEM` | `patagonia-2026` |

Depois vá em **Deployments**, abra o mais recente e clique em
**Redeploy**. As variáveis só entram no build seguinte.

## 5. Conferir

Abra o app. No canto superior direito deve aparecer **Sincronizado**, em verde.

Teste de verdade: edite algo no computador, aguarde uns 2 segundos e abra
no celular. A alteração precisa estar lá.

---

## Rodar localmente

Crie um arquivo `.env.local` na raiz (o `.env.example` serve de modelo):

```
VITE_SUPABASE_URL=https://abcdefgh.supabase.co
VITE_SUPABASE_KEY=sua_publishable_key
VITE_ID_VIAGEM=patagonia-2026
```

Esse arquivo está no `.gitignore` e não vai para o GitHub.

---

## Como funciona

O app guarda os dados em dois lugares:

- **No navegador** (`localStorage`) — cache imediato. O app abre na hora e
  continua funcionando sem internet.
- **No Supabase** — a fonte compartilhada entre os aparelhos.

Ao abrir, ele mostra o cache local e busca a nuvem em seguida. Ao editar,
grava local na hora e envia à nuvem 1,2 segundo depois — esse atraso evita
uma gravação a cada tecla digitada.

O indicador no topo mostra o estado: **Sincronizado**, **Salvando**,
**Sem conexão** ou **Só neste aparelho** (quando não configurado).

## Pontos a saber

**Sem senha.** Quem tiver o link do Vercel pode ver e editar. Para um
roteiro de família isso costuma bastar, mas não guarde nada sensível ali.
Se quiser algo menos óbvio, troque `VITE_ID_VIAGEM` por um valor difícil
de adivinhar, como `patagonia-7f3a9c`.

**Edição simultânea.** Se duas pessoas editarem ao mesmo tempo, vale a
última gravação. Para uso familiar raramente é um problema.

**Sem internet.** As edições ficam salvas localmente e sobem quando a
conexão voltar — desde que você não feche a aba antes disso. Na estrada,
vale abrir o app com sinal ao menos uma vez por dia.

**Plano gratuito.** Projetos sem uso por 7 dias são pausados. Basta entrar
no painel do Supabase e reativar. Durante a viagem, com uso diário, isso
não deve ocorrer.
