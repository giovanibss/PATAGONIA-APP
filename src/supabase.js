import { createClient } from "@supabase/supabase-js";

/* ══════════════════════════════════════════════════════════════════
   COLE AQUI AS SUAS CREDENCIAIS DO SUPABASE

   Estão no painel do Supabase em: Project Settings → API Keys
     • Project URL      → algo como https://abcdefgh.supabase.co
     • Publishable key  → o texto longo (também chamada "anon")

   Use a publishable/anon. NUNCA a service_role.

   ⚠ Se estes dois campos ficarem vazios, o app funciona normalmente
     mas só neste aparelho — sem sincronizar com o celular.
   ══════════════════════════════════════════════════════════════════ */

const URL_FIXA = "https://peznylswpogypvnhbqlc.supabase.co";
const CHAVE_FIXA = "sb_publishable_26Mutfbq-7lE7rKDDCjxwg_OYculaSp";

/* ══════════════════════════════════════════════════════════════════
   Daqui para baixo não precisa mexer.
   ══════════════════════════════════════════════════════════════════ */

/* Usa o que estiver preenchido acima; se estiver vazio, tenta as
   variáveis de ambiente (.env.local ou painel do Vercel). */
const limpar = (v) => (typeof v === "string" ? v.trim() : "");

const URL = limpar(URL_FIXA) || limpar(import.meta.env.VITE_SUPABASE_URL);
const CHAVE = limpar(CHAVE_FIXA) || limpar(import.meta.env.VITE_SUPABASE_KEY);

/* Identificador do roteiro. Todos os aparelhos que usarem o mesmo
   valor compartilham os mesmos dados. */
export const ID_VIAGEM =
  limpar(import.meta.env.VITE_ID_VIAGEM) || "patagonia-2026";

/* Só considera configurado se a URL tiver cara de URL do Supabase e a
   chave tiver tamanho plausível — evita "meio configurado" silencioso. */
export const configurado =
  /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(URL) && CHAVE.length > 20;

if (!configurado && (URL || CHAVE)) {
  console.warn(
    "[Kooka] Credenciais do Supabase incompletas ou mal formadas — " +
      "o app vai salvar apenas neste navegador. Confira src/supabase.js"
  );
}

export const supabase = configurado ? createClient(URL, CHAVE) : null;

/* Lê o estado salvo na nuvem. Retorna null se não houver nada ainda. */
export async function carregarNuvem() {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("viagens")
    .select("dados, atualizado_em")
    .eq("id", ID_VIAGEM)
    .maybeSingle();

  if (error) throw error;
  return data ? { dados: data.dados, atualizadoEm: data.atualizado_em } : null;
}

/* Grava o estado na nuvem. Recebe a data da edição para que o carimbo
   local e o da nuvem sejam idênticos — é o que permite comparar depois. */
export async function salvarNuvem(dados, editadoEm) {
  if (!supabase) return null;
  const atualizado_em = new Date(editadoEm || Date.now()).toISOString();
  const { error } = await supabase
    .from("viagens")
    .upsert({ id: ID_VIAGEM, dados, atualizado_em }, { onConflict: "id" });

  if (error) throw error;
  return atualizado_em;
}

/* Escuta mudanças feitas em outros aparelhos, em tempo real. */
export function ouvirNuvem(aoMudar) {
  if (!supabase) return () => {};
  const canal = supabase
    .channel(`viagem-${ID_VIAGEM}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "viagens", filter: `id=eq.${ID_VIAGEM}` },
      (payload) => {
        if (payload.new?.dados) {
          aoMudar({
            dados: payload.new.dados,
            atualizadoEm: payload.new.atualizado_em,
          });
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(canal);
}
