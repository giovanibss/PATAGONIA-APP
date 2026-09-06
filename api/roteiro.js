/* ══════════════════════════════════════════════════════════════
   /api/roteiro — sugestões de remanejo do roteiro da viagem.

   GET  → devolve a lista de modelos disponíveis, para o seletor.
   POST → recebe o roteiro e devolve sugestões.

   Arquivo AUTOSSUFICIENTE: não depende de nenhum outro arquivo em
   /api. Precisa de UMA variável de ambiente na Vercel:

     ANTHROPIC_API_KEY   sua chave do console.anthropic.com

   Opcional:
     ROTEIRO_MODELO      qual modelo vem pré-selecionado no app
                         (padrão: claude-sonnet-5)

   PORTARIA: o Kooka ainda não tem login, então não há sessão que
   distinga você de um estranho. Enquanto isso, a função só aceita
   chamada que veio do próprio site — confere o cabeçalho Origin
   contra o domínio dela mesma. O navegador manda esse cabeçalho
   sozinho; nada para configurar, e vale para qualquer domínio onde
   o app estiver. Não é segurança de verdade (quem sabe forjar
   cabeçalho passa), é o suficiente para robô de varredura não
   gastar o seu crédito da API. A tranca de verdade vem com o login.

   PRINCÍPIO DE PROJETO: o modelo NÃO edita o estado. Ele devolve
   uma lista de operações descritas em JSON, o app transforma cada
   uma num cartão, e nada entra no roteiro sem você tocar em
   "aplicar". Toda operação é conferida aqui antes de sair: se
   apontar para um dia ou atividade que não existe, é descartada.

   A chave da API vive só aqui, no servidor. O navegador nunca a vê.

   ESTILO DE MÓDULO: este arquivo é ESM (export default), e não
   CommonJS como as funções do Margem. O package.json do Kooka tem
   "type": "module" — coisa de projeto Vite —, e isso faz o Node
   tratar todo .js como módulo ES. Um module.exports aqui derruba a
   função em tempo de execução com "module is not defined in ES
   module scope". Se um dia você criar outra função nesta pasta,
   copie ESTE arquivo, não os do Margem.
   ══════════════════════════════════════════════════════════════ */

/* Os modelos que o seletor oferece. O app lê esta lista pelo GET, então
   para acrescentar um modelo novo basta mexer aqui — o front-end não
   tem nome de modelo escrito em lugar nenhum. */
/* Muda a cada versão deste arquivo e aparece no GET. Serve para você
   conferir, abrindo /api/roteiro no navegador, QUAL versão está no ar —
   sem depender de olhar o repositório ou os logs. */
const VERSAO = 'esm-1';

const MODELOS = [
  { id: 'claude-sonnet-5',            nome: 'Sonnet 5',   nota: 'equilibrado — o padrão' },
  { id: 'claude-opus-5',              nome: 'Opus 5',     nota: 'raciocínio mais fino, mais caro' },
  { id: 'claude-haiku-4-5-20251001',  nome: 'Haiku 4.5',  nota: 'o mais rápido e barato' },
];

const PADRAO = MODELOS.some(m => m.id === process.env.ROTEIRO_MODELO)
  ? process.env.ROTEIRO_MODELO
  : 'claude-sonnet-5';

const TIPOS_ICONE = ['carro', 'barco', 'trilha', 'comida', 'ponto'];

const SISTEMA = `Você é o assistente de roteiro de um app chamado Kooka Planner, que um brasileiro mandou construir para organizar uma viagem em família à Patagônia (Argentina e Chile), em dezembro. Viajam dois adultos e uma criança pequena, de carro alugado, com travessia de fronteira entre os dois países.

O QUE VOCÊ RECEBE:
- O roteiro inteiro: cada dia tem id, número, data, título, base (a cidade onde se dorme), uma nota e uma lista de atividades. Cada atividade tem id, hora, texto e um tipo de ícone.
- As hospedagens: cada base tem hotéis, e cada hotel ATIVO carrega os ids dos dias que cobre. É daí que sai quantas noites você realmente dorme em cada lugar.
- Um pedido em texto livre do usuário, quando houver.

O QUE VOCÊ FAZ:
Compara o que o roteiro assume com o que a hospedagem diz de fato, e propõe o remanejo. Se o usuário trocou o hotel de uma base por outro em outra cidade, os passeios daqueles dias podem ter ficado longe demais, ou sobrou um dia sem nada, ou faltou dia para o que estava planejado. É isso que você resolve.

REGRAS ABSOLUTAS:
- Você NÃO edita nada. Devolve operações, e o usuário aprova uma a uma.
- Use SOMENTE ids que aparecem nos dados recebidos. Nunca invente um id de dia ou de atividade.
- Não mexa em dinheiro. Os custos são controlados em outra aba, por outro cálculo. Não sugira valores, não estime preços, não crie despesas.
- Respeite as âncoras: dia de voo, dia de travessia de fronteira, devolução do carro e reserva já confirmada não se movem. Se algo assim precisar mudar, diga no resumo em vez de virar operação.
- Distâncias na Patagônia são grandes e as estradas são lentas. Não empilhe num mesmo dia passeios que ficam a horas de carro um do outro, e não proponha bate-volta que não caiba na luz do dia.
- Há uma criança pequena junto. Nada de trilha longa, travessia de geleira com restrição de idade, ou dia que comece antes das 6h e termine depois das 22h.
- Não invente atrativo que não existe. Se não tiver certeza de que um lugar existe e fica onde você acha que fica, não sugira.
- No máximo 6 sugestões. Menos é melhor. Se o roteiro estiver coerente com a hospedagem, devolva a lista vazia e diga isso no resumo.

FORMATO DA RESPOSTA — responda SOMENTE com um objeto JSON, sem cercas de código, sem nenhum texto antes ou depois:

{
  "resumo": "1 a 3 frases sobre o que mudou e o que você propôs. Português do Brasil, direto, sem saudação.",
  "sugestoes": [
    {
      "tipo": "mover",
      "titulo": "frase curta, até 60 caracteres",
      "porque": "1 a 2 frases explicando o motivo",
      "atividadeId": "id existente",
      "deDiaId": "id existente",
      "paraDiaId": "id existente",
      "hora": "HH:MM"
    },
    {
      "tipo": "criar",
      "titulo": "...",
      "porque": "...",
      "diaId": "id existente",
      "hora": "HH:MM",
      "texto": "texto da atividade, como apareceria no roteiro",
      "icone": "carro | barco | trilha | comida | ponto"
    },
    {
      "tipo": "remover",
      "titulo": "...", "porque": "...",
      "atividadeId": "id existente", "deDiaId": "id existente"
    },
    {
      "tipo": "editar_atividade",
      "titulo": "...", "porque": "...",
      "atividadeId": "id existente", "deDiaId": "id existente",
      "hora": "HH:MM",
      "texto": "novo texto"
    },
    {
      "tipo": "editar_dia",
      "titulo": "...", "porque": "...",
      "diaId": "id existente",
      "campo": "titulo | base | nota",
      "valor": "novo conteúdo"
    }
  ]
}

Em "mover", "hora" é opcional — mande só se o horário precisar mudar no dia de destino.
Em "editar_atividade", mande "hora", "texto", ou os dois.
Escreva os textos de atividade no mesmo estilo dos que já estão lá: descritivos, sem emoji, com "· RESERVAR" no fim quando exigir reserva antecipada.`;

/* ── Portaria ─────────────────────────────────────────────────
   Passa quem veio do mesmo domínio da função. O Origin é mandado pelo
   navegador em toda requisição POST e não pode ser alterado por
   JavaScript de outro site — é justamente para isso que ele existe.
   Sem Origin, tenta o Referer; sem os dois, recusa. */
function veioDoSite(req) {
  const host = String(req.headers.host || '').toLowerCase();
  if (!host) return false;
  const bruto = req.headers.origin || req.headers.referer || '';
  if (!bruto) return false;
  try {
    return new URL(bruto).host.toLowerCase() === host;
  } catch (e) {
    return false;
  }
}

/* ── Limitador ────────────────────────────────────────────────
   Vale por instância da função, que a Vercel recicla o tempo todo —
   então não é cota, é freio. Serve para um laço acidental no front-end
   não torrar crédito antes de eu perceber o erro. */
const janela = [];
function rapidoDemais() {
  const agora = Date.now();
  while (janela.length && agora - janela[0] > 60000) janela.shift();
  if (janela.length >= 6) return true;
  janela.push(agora);
  return false;
}

/* ── Conferência das operações ────────────────────────────────
   O modelo é bom em propor e ruim em não errar id. Uma sugestão que
   aponta para um dia inexistente viraria um cartão que, ao ser
   aplicado, não faz nada — pior que não aparecer. Então tudo passa
   por aqui antes de voltar ao navegador. */
function conferir(sugestoes, roteiro) {
  const dias = new Map();
  const ativs = new Map(); /* id da atividade → id do dia */
  (roteiro || []).forEach(d => {
    if (!d || !d.id) return;
    dias.set(d.id, d);
    (d.atividades || []).forEach(a => { if (a && a.id) ativs.set(a.id, d.id); });
  });

  const hora = h => (/^\d{1,2}:\d{2}$/.test(String(h || '')) ? String(h).padStart(5, '0') : null);
  const txt = (s, max) => String(s == null ? '' : s).trim().slice(0, max);

  const out = [];
  const descartadas = [];

  (Array.isArray(sugestoes) ? sugestoes : []).slice(0, 12).forEach((s, i) => {
    if (!s || typeof s !== 'object') return;
    const base = {
      id: 's' + (i + 1),
      tipo: s.tipo,
      titulo: txt(s.titulo, 90) || 'Sugestão',
      porque: txt(s.porque, 400)
    };
    const fora = motivo => { descartadas.push({ tipo: s.tipo, motivo }); };

    if (s.tipo === 'mover') {
      if (!ativs.has(s.atividadeId)) return fora('atividade inexistente');
      if (!dias.has(s.paraDiaId)) return fora('dia de destino inexistente');
      const de = ativs.get(s.atividadeId);
      if (de === s.paraDiaId) return fora('origem e destino são o mesmo dia');
      out.push({ ...base, atividadeId: s.atividadeId, deDiaId: de, paraDiaId: s.paraDiaId, hora: hora(s.hora) });

    } else if (s.tipo === 'criar') {
      if (!dias.has(s.diaId)) return fora('dia inexistente');
      const texto = txt(s.texto, 220);
      if (!texto) return fora('sem texto');
      out.push({
        ...base, diaId: s.diaId, texto,
        hora: hora(s.hora) || '12:00',
        icone: TIPOS_ICONE.includes(s.icone) ? s.icone : null
      });

    } else if (s.tipo === 'remover') {
      if (!ativs.has(s.atividadeId)) return fora('atividade inexistente');
      out.push({ ...base, atividadeId: s.atividadeId, deDiaId: ativs.get(s.atividadeId) });

    } else if (s.tipo === 'editar_atividade') {
      if (!ativs.has(s.atividadeId)) return fora('atividade inexistente');
      const texto = txt(s.texto, 220);
      const h = hora(s.hora);
      if (!texto && !h) return fora('nada para editar');
      out.push({ ...base, atividadeId: s.atividadeId, deDiaId: ativs.get(s.atividadeId), texto: texto || null, hora: h });

    } else if (s.tipo === 'editar_dia') {
      if (!dias.has(s.diaId)) return fora('dia inexistente');
      if (!['titulo', 'base', 'nota'].includes(s.campo)) return fora('campo inválido');
      const valor = txt(s.valor, 220);
      if (!valor) return fora('sem valor');
      out.push({ ...base, diaId: s.diaId, campo: s.campo, valor });

    } else {
      fora('tipo desconhecido');
    }
  });

  return { sugestoes: out.slice(0, 8), descartadas };
}

/* O modelo às vezes embrulha o JSON em cerca de código, mesmo mandado
   não fazer. Tira a cerca e, se ainda assim não abrir, pega o maior
   trecho entre chaves. */
function lerJSON(texto) {
  let t = String(texto || '').trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(t); } catch (e) { /* segue */ }
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i >= 0 && f > i) { try { return JSON.parse(t.slice(i, f + 1)); } catch (e) { /* segue */ } }
  return null;
}

export default async function handler(req, res) {
  /* O seletor de modelos do app se abastece daqui. Não gasta API e não
     revela nada, então dispensa portaria. */
  if (req.method === 'GET')
    return res.status(200).json({ versao: VERSAO, modelos: MODELOS, padrao: PADRAO });

  if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST.' });

  if (!process.env.ANTHROPIC_API_KEY)
    return res.status(500).json({
      erro: 'Falta configurar ANTHROPIC_API_KEY na Vercel. ' +
            'Adicione em Settings → Environment Variables e faça Redeploy.'
    });

  if (!veioDoSite(req))
    return res.status(403).json({ erro: 'Chamada recusada: só aceito pedidos vindos do próprio site.' });

  if (rapidoDemais())
    return res.status(429).json({ erro: 'Muitas consultas seguidas. Espere um minuto.' });

  const corpo = req.body || {};
  const { roteiro, hospedagens, pedido } = corpo;
  if (!Array.isArray(roteiro) || !roteiro.length)
    return res.status(400).json({ erro: 'Falta o roteiro.' });

  /* Só um modelo da lista entra. Nome vindo do navegador não vira
     parâmetro de chamada paga sem passar por aqui. */
  const modelo = MODELOS.some(m => m.id === corpo.modelo) ? corpo.modelo : PADRAO;

  /* Só o que o modelo precisa ler. Custos, localizadores e links ficam
     de fora: não entram na decisão e encareceriam a chamada. */
  const dias = roteiro.slice(0, 40).map(d => ({
    id: d.id, n: d.n, data: d.data, titulo: d.titulo, base: d.base, nota: d.nota,
    atividades: (d.atividades || []).slice(0, 20).map(a => ({
      id: a.id, hora: a.hora, texto: a.texto, icone: a.tipo
    }))
  }));

  const bases = (Array.isArray(hospedagens) ? hospedagens : []).map(b => ({
    base: b.nome,
    hoteis: (b.slots || [])
      .filter(s => s.ativo && (s.hotel || (s.diasIds || []).length))
      .map(s => ({ hotel: s.hotel || '(sem nome)', diasIds: s.diasIds || [] }))
  })).filter(b => b.hoteis.length);

  const pergunta =
    'Roteiro atual:\n\n' + JSON.stringify(dias, null, 1) +
    '\n\nHospedagem ativa (é ela que manda em quantas noites há em cada base):\n\n' +
    JSON.stringify(bases, null, 1) +
    '\n\n---\n\n' +
    (String(pedido || '').trim()
      ? 'Pedido do usuário: ' + String(pedido).trim().slice(0, 1500)
      : 'Sem pedido específico. Confira se o roteiro continua coerente com a hospedagem e proponha o que fizer sentido.');

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: 3000,
        system: SISTEMA,
        messages: [{ role: 'user', content: pergunta }]
      })
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      let dica = '';
      if (r.status === 401) dica = ' — a chave da API parece inválida. Confira ANTHROPIC_API_KEY na Vercel.';
      if (r.status === 429) dica = ' — muitas chamadas seguidas. Espere um pouco.';
      if (/credit balance|insufficient/i.test(t)) dica = ' — o crédito da API acabou. Recarregue no console.anthropic.com.';
      if (r.status === 404 || /model/i.test(t)) dica = ' — o modelo ' + modelo + ' não está disponível para a sua conta. Escolha outro no seletor.';
      return res.status(502).json({ erro: `A API respondeu ${r.status}${dica}`, detalhe: t.slice(0, 200) });
    }

    const j = await r.json();
    const texto = (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    const dados = lerJSON(texto);
    if (!dados) return res.status(502).json({ erro: 'O modelo não devolveu um JSON legível. Tente de novo.', detalhe: texto.slice(0, 200) });

    const { sugestoes, descartadas } = conferir(dados.sugestoes, roteiro);
    if (descartadas.length) console.log('[kooka/roteiro] descartadas', JSON.stringify(descartadas));

    return res.status(200).json({
      resumo: String(dados.resumo || '').trim().slice(0, 600),
      sugestoes,
      modelo,
      custo: j.usage ? { entrada: j.usage.input_tokens, saida: j.usage.output_tokens } : null
    });
  } catch (e) {
    return res.status(500).json({ erro: String(e.message || e) });
  }
}

/* Exportados para teste; a Vercel só usa o export default acima. */
export { VERSAO, MODELOS, conferir, lerJSON, veioDoSite };
