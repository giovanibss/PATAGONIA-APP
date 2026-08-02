/* Aplica atualizações do app sem depender de o usuário limpar cache.

   O service worker instala a versão nova em segundo plano, mas só assume o
   controle no carregamento seguinte — que num app instalado pode demorar
   dias. Aqui detectamos a troca e recarregamos na hora. */

export function registrarAtualizacoes({ aoAtualizar } = {}) {
  if (!("serviceWorker" in navigator)) return () => {};

  let recarregando = false;

  /* Quando o service worker novo assume, recarrega uma única vez */
  const aoTrocar = () => {
    if (recarregando) return;
    recarregando = true;
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", aoTrocar);

  const verificar = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) return;
      await reg.update();

      /* Se já existe uma versão esperando, manda assumir agora */
      if (reg.waiting) {
        aoAtualizar?.();
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    } catch (e) {
      /* sem rede ou navegador sem suporte: tenta na próxima */
    }
  };

  /* Procura atualização ao abrir, ao voltar para o app e a cada 30 min */
  verificar();
  const aoVoltar = () => { if (!document.hidden) verificar(); };
  document.addEventListener("visibilitychange", aoVoltar);
  window.addEventListener("online", verificar);
  const t = setInterval(verificar, 30 * 60 * 1000);

  return () => {
    navigator.serviceWorker.removeEventListener("controllerchange", aoTrocar);
    document.removeEventListener("visibilitychange", aoVoltar);
    window.removeEventListener("online", verificar);
    clearInterval(t);
  };
}
