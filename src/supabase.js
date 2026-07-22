import { createClient } from "@supabase/supabase-js";

/* Credenciais vêm das variáveis de ambiente (.env.local no seu PC,
   Environment Variables no Vercel). Sem elas, o app roda offline
   usando apenas o localStorage. */
const URL = "https://peznylswpogypvnhbqlc.supabase.co";
const CHAVE = "sb_publishable_26Mutfbq-7lE7rKDDCjxwg_OYculaSp";

/* Identificador do roteiro. Todos os aparelhos que usarem o mesmo
   valor compartilham os mesmos dados. */
export const ID_VIAGEM = import.meta.env.VITE_ID_VIAGEM || "patagonia-2026";

export const configurado = Boolean(URL && CHAVE);

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

/* Grava o estado na nuvem. */
export async function salvarNuvem(dados) {
  if (!supabase) return null;
  const atualizado_em = new Date().toISOString();
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
          aoMudar({ dados: payload.new.dados, atualizadoEm: payload.new.atualizado_em });
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(canal);
}
