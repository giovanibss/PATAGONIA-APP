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

/* DOIS MODOS, DOIS MODELOS — a divisão que o Margem já provou:
   • sugestões → Haiku, sempre. Devolver operações com ids exatos é
     trabalho mecânico, e ele faz rápido e barato. Modelos maiores
     gastam o orçamento raciocinando e entregam JSON pela metade.
   • análise   → Sonnet ou Opus, escolha sua. Prosa não tem chave para
     fechar nem parser para quebrar, então o raciocínio deles vira
     vantagem em vez de estorvo.
   Trocar o modelo das sugestões não é oferecido, de propósito.
   A lista da análise mora aqui e o app a lê pelo GET — não há nome de
   modelo escrito no front-end. */
/* Muda a cada versão deste arquivo e aparece no GET. Serve para você
   conferir, abrindo /api/roteiro no navegador, QUAL versão está no ar —
   sem depender de olhar o repositório ou os logs. */
const VERSAO = 'esm-5';

const MODELO_SUGESTOES = { id: 'claude-haiku-4-5-20251001', nome: 'Haiku 4.5' };

const MODELOS = [
  { id: 'claude-sonnet-5', nome: 'Sonnet 5', nota: 'equilibrado — o padrão' },
  { id: 'claude-opus-5',   nome: 'Opus 5',   nota: 'raciocínio mais fino, mais caro' },
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
- No máximo 4 sugestões. Menos é melhor. Se o roteiro estiver coerente com a hospedagem, devolva a lista vazia e diga isso no resumo.

FORMATO DA RESPOSTA — responda SOMENTE com um objeto JSON, sem cercas de código, sem nenhum texto antes ou depois:

{
  "resumo": "1 a 3 frases sobre o que mudou e o que você propôs. Português do Brasil, direto, sem saudação.",
  "sugestoes": [
    {
      "tipo": "mover",
      "titulo": "frase curta, até 60 caracteres",
      "porque": "no máximo 2 frases curtas explicando o motivo",
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
Escreva os textos de atividade no mesmo estilo dos que já estão lá: descritivos, sem emoji, com "· RESERVAR" no fim quando exigir reserva antecipada.

Seja econômico: nada de repetir o roteiro recebido, nada de listar o que você NÃO vai mudar, nada de comentário fora do JSON.`;


const SISTEMA_ANALISE = `Você é o consultor de viagem de um brasileiro que organiza uma viagem em família à Patagônia (Argentina e Chile), em dezembro, num app chamado Kooka Planner que ele mesmo mandou construir. Viajam dois adultos e uma criança pequena, de carro alugado, com travessia de fronteira entre os dois países.

Você recebe o roteiro completo — dias, bases, atividades — e as hospedagens ativas com os dias que cada hotel cobre. É a hospedagem que diz quantas noites há de fato em cada base.

REGRAS:
- Responda em prosa. Você não edita o roteiro e não devolve JSON: quem propõe alterações é o outro modo do app, e é o usuário quem aprova uma a uma.
- Não invente atrativo, horário de funcionamento nem preço. Se não tiver certeza de que um lugar existe e fica onde você acha que fica, diga que não sabe.
- Não fale de dinheiro: os custos são controlados em outra aba, por outro cálculo.
- Leve a sério o que a Patagônia impõe: distâncias grandes, estradas lentas, vento, clima que vira em uma hora, e uma criança pequena que não faz trilha longa nem dia de dezesseis horas.
- Se algo no roteiro for arriscado — conexão apertada, travessia de fronteira em cima da hora, passeio com restrição de idade, dia sem folga nenhuma — diga isso primeiro, mesmo que não tenham perguntado.

COMO ESCREVER:
- Direto ao ponto, sem saudação e sem títulos. Português do Brasil.
- Prosa corrida. Use lista só se a pergunta pedir vários itens paralelos.
- Normalmente de 3 a 8 frases. Só alongue se a pergunta realmente exigir.
- Quando houver ressalva importante, diga a ressalva.
- Se não souber, diga que não sabe.`;

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

/* Salva o que dá de uma resposta cortada no meio: corta no último objeto
   que fechou e fecha na mão os colchetes e chaves que ficaram abertos.
   Perde a última sugestão, que veio pela metade, e preserva as anteriores —
   melhor do que devolver erro e perder todas. */
function repararJSON(t) {
  const fim = t.lastIndexOf('}');
  if (fim < 0) return null;
  const corte = t.slice(0, fim + 1);
  const pilha = [];
  let texto = false, escape = false;
  for (const c of corte) {
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { texto = !texto; continue; }
    if (texto) continue;
    if (c === '{' || c === '[') pilha.push(c);
    else if (c === '}' || c === ']') pilha.pop();
  }
  let s = corte;
  while (pilha.length) s += pilha.pop() === '{' ? '}' : ']';
  try { return JSON.parse(s); } catch (e) { return null; }
}

/* O modelo às vezes embrulha o JSON em cerca de código, mesmo mandado
   não fazer. Tira a cerca e, se ainda assim não abrir, pega o maior
   trecho entre chaves. */
function lerJSON(texto) {
  let t = String(texto || '').trim();
  /* cerca de código em qualquer lugar do texto, não só nas pontas */
  const cerca = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cerca) t = cerca[1].trim();
  try { return JSON.parse(t); } catch (e) { /* segue */ }
  const i = t.indexOf('{'), f = t.lastIndexOf('}');
  if (i >= 0 && f > i) { try { return JSON.parse(t.slice(i, f + 1)); } catch (e) { /* segue */ } }
  if (i >= 0) return repararJSON(t.slice(i)); /* última tentativa: cortado */
  return null;
}

export default async function handler(req, res) {
  /* O seletor de modelos do app se abastece daqui. Não gasta API e não
     revela nada, então dispensa portaria. */
  if (req.method === 'GET')
    return res.status(200).json({ versao: VERSAO, sugestoes: MODELO_SUGESTOES, modelos: MODELOS, padrao: PADRAO });

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

  const analise = corpo.modo === 'analise';

  /* Só um modelo da lista entra. Nome vindo do navegador não vira
     parâmetro de chamada paga sem passar por aqui. E as sugestões nem
     aceitam escolha: são sempre do Haiku. */
  const modelo = analise
    ? (MODELOS.some(m => m.id === corpo.modelo) ? corpo.modelo : PADRAO)
    : MODELO_SUGESTOES.id;

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

  const texto_pedido = String(pedido || '').trim().slice(0, 2000);

  const pergunta =
    'Roteiro atual:\n\n' + JSON.stringify(dias, null, 1) +
    '\n\nHospedagem ativa (é ela que manda em quantas noites há em cada base):\n\n' +
    JSON.stringify(bases, null, 1) +
    '\n\n---\n\n' +
    (analise
      ? (texto_pedido
          ? 'Minha pergunta: ' + texto_pedido
          : 'Analise o roteiro e me diga o que merece atenção.')
      : (texto_pedido
          ? 'Pedido do usuário: ' + texto_pedido
          : 'Sem pedido específico. Confira se o roteiro continua coerente com a hospedagem e proponha o que fizer sentido.'));

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
        /* Teto largo na análise porque Sonnet e Opus raciocinam antes de
           escrever, e o raciocínio consome o mesmo orçamento. Só os tokens
           realmente escritos são cobrados, então sobra folga não custa. */
        max_tokens: analise ? 16000 : 8000,
        system: analise ? SISTEMA_ANALISE : SISTEMA,
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

    /* A análise vai embora aqui: é prosa, não passa por parser nenhum. */
    if (analise) {
      if (!texto) return res.status(502).json({ erro: 'O modelo respondeu vazio. Tente de novo.' });
      return res.status(200).json({
        texto, modelo,
        custo: j.usage ? { entrada: j.usage.input_tokens, saida: j.usage.output_tokens } : null
      });
    }

    const dados = lerJSON(texto);
    if (!dados) {
      /* Sem isso o erro é sempre o mesmo e não dá para saber o que houve. */
      /* Diz o que houve com números, não com adjetivos: quantos tokens o
         modelo produziu e quanto disso virou texto. Se produziu muito e
         escreveu pouco, o orçamento foi embora no raciocínio. */
      const saida = j.usage ? j.usage.output_tokens : 0;
      return res.status(502).json({
        erro: 'Não consegui ler a resposta do modelo ('
          + saida + ' tokens produzidos, ' + texto.length + ' caracteres de texto'
          + (j.stop_reason === 'max_tokens' ? ', cortada no limite' : ', motivo: ' + j.stop_reason)
          + '). Começo do que veio: ' + (texto.slice(0, 150) || '(nada)'),
        detalhe: texto.slice(0, 400)
      });
    }

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
export { VERSAO, MODELOS, conferir, lerJSON, repararJSON, veioDoSite };
