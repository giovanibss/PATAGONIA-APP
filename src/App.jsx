import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Wallet, ListChecks, CalendarDays, MapPin, Clock,
  Check, Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  BedDouble, Pencil, RotateCcw, Ship, Utensils, Car, Footprints,
  Cloud, CloudOff, RefreshCw, ChevronDown, PieChart, CalendarClock, Ticket, ExternalLink,
} from "lucide-react";
import { configurado, carregarNuvem, salvarNuvem, ouvirNuvem, ID_VIAGEM } from "./supabase";

/* ─────────────────────────  DADOS INICIAIS  ───────────────────────── */

const ORCAMENTO_ALVO = 4700;

const ALERTAS_INICIAIS = [
  { id: "a1", texto: "Autorização de fronteira do carro (permiso para salir del país + seguro chileno, US$ 100–180)", critico: true, feito: false },
  { id: "a2", texto: "Alfândega Chile — descartar frutas, queijos, mel e carnes antes do dia 6", critico: true, feito: false },
  { id: "a3", texto: "Ingresso Torres del Paine — comprar online (Pases Parques/CONAF)", critico: false, feito: false },
  { id: "a4", texto: "Reservar Todo Glaciares (dia 10)", critico: false, feito: false },
  { id: "a5", texto: "Reservar Estância patagônica (dia 11)", critico: false, feito: false },
  { id: "a6", texto: "Reservar Safari Náutico (dia 2)", critico: false, feito: false },
  { id: "a7", texto: "Confirmar as 2 noites seguidas em Puerto Natales (dias 8 e 9)", critico: false, feito: false },
];

/* ─────────────────────────  FINANCEIRO  ───────────────────────── */

/* IOF sobre compras internacionais no cartão. Fixado em 3,5% desde 2025.
   Editável porque alguns bancos oferecem isenção ou cashback. */
const IOF_PADRAO = 3.5;

const STATUS = {
  pago:      { rot: "Quitado",           curto: "Quitado",  cor: "emerald", desc: "Já saiu da conta: espécie, débito ou fatura paga" },
  faturar:   { rot: "Cai na fatura",     curto: "Fatura",   cor: "amber",   desc: "Reservado, ainda vai vencer no cartão" },
  chegada:   { rot: "A pagar na chegada",curto: "Chegada",  cor: "sky",     desc: "Reservado, paga no local" },
  aberto:    { rot: "Não reservado",     curto: "Aberto",   cor: "slate",   desc: "Ainda sem reserva" },
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

/* Rótulo curto de um mês de fatura no formato "AAAA-MM" */
const rotuloFatura = (mes) => {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return "sem mês";
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}/${a.slice(2)}`;
};

/* Lista de meses para o seletor: do mês atual até 14 à frente */
function mesesDisponiveis() {
  const hoje = new Date();
  const out = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(hoje.getFullYear(), hoje.getMonth() + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* Soma n meses a "AAAA-MM" */
function somaMes(mes, n) {
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) return mes;
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(a, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* Distribui o valor de um lançamento nas parcelas, resolvendo o arredondamento
   na última para a soma bater exatamente com o total. */
function parcelasDe(l) {
  const n = Math.max(1, Math.round(Number(l?.parcelas) || 1));
  const total = Number(l?.valor) || 0;
  if (n === 1) return [{ mes: l?.mesFatura || null, valor: total, i: 1, n: 1 }];
  const base = Math.floor((total / n) * 100) / 100;
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
    out.push({ mes: somaMes(l?.mesFatura, i), valor: v, i: i + 1, n });
  }
  return out;
}

const PAGAMENTOS = {
  credito: { rot: "Crédito", iof: true },
  especie: { rot: "Espécie", iof: false },
  debito:  { rot: "Débito/Global", iof: true },
};

const CORES = {
  emerald: { txt: "text-emerald-300", bg: "bg-emerald-500/10", bd: "border-emerald-400/30", solid: "bg-emerald-400" },
  amber:   { txt: "text-orange-300", bg: "bg-orange-500/10", bd: "border-orange-400/30", solid: "bg-orange-400" },
  sky:     { txt: "text-violet-300",     bg: "bg-violet-500/10",     bd: "border-violet-400/30",     solid: "bg-violet-400" },
  slate:   { txt: "text-zinc-300/50", bg: "bg-zinc-300/5", bd: "border-zinc-300/15", solid: "bg-zinc-300/40" },
};

/* Lançamento padrão. Todo custo — de dia ou de hotel — vira um destes. */
const lanc = (valor = 0) => ({
  status: "aberto", pagamento: "credito", moeda: "USD", iofIsento: false, valor,
  parcelas: 1, mesFatura: null,
});

/* IOF incide sobre o valor convertido em reais, mas como o painel trabalha
   em dólar, o percentual é equivalente em qualquer moeda. */
function iofDe(l, aliquota) {
  if (!l) return 0;
  const meio = PAGAMENTOS[l.pagamento];
  if (!meio?.iof || l.iofIsento) return 0;
  return (Number(l.valor) || 0) * ((Number(aliquota) || 0) / 100);
}

/* Valor cheio do lançamento, já com IOF, convertido para US$ */
function lancEmUSD(l, cambio, aliquota) {
  if (!l) return 0;
  const taxa = Number(cambio?.[l.moeda]);
  const bruto = (Number(l.valor) || 0) + iofDe(l, aliquota);
  return bruto * (Number.isFinite(taxa) ? taxa : 0);
}

/* Cotações de referência: quanto vale 1 unidade da moeda em US$.
   Editáveis no app — confira o câmbio do dia antes de confiar nos números. */
const CAMBIO_PADRAO = { USD: 1, BRL: 0.185, ARS: 0.00068, CLP: 0.00110 };

const MOEDAS = {
  USD: { rot: "US$", nome: "Dólar" },
  BRL: { rot: "R$", nome: "Real" },
  ARS: { rot: "AR$", nome: "Peso argentino" },
  CLP: { rot: "CLP$", nome: "Peso chileno" },
};

/* modo "diaria": total = diaria x noites + taxas | modo "fechado": total = valorFechado */
/* Cada hotel é uma reserva independente: tem seus próprios dias, valores e
   status. Vários podem estar ativos na mesma base. */
const novoHotel = (id) => ({
  id, hotel: "", ativo: false, diasIds: [], localizador: "", link: "",
  modo: "diaria", moeda: "USD", diaria: 0, noites: 0, taxas: 0, fechado: 0,
  lanc: { status: "aberto", pagamento: "credito", iofIsento: false, parcelas: 1, mesFatura: null },
});

const HOSPEDAGENS_INICIAIS = [
  { id: "h1", nome: "El Calafate", noites: "Dias 1–2, 9–11", slots: [novoHotel("h1-s1")] },
  { id: "h2", nome: "El Chaltén", noites: "Dias 3–5", slots: [novoHotel("h2-s1")] },
  { id: "h3", nome: "Torres del Paine", noites: "Dias 6–7", slots: [novoHotel("h3-s1")] },
  { id: "h4", nome: "Puerto Natales", noites: "Dias 8–9", slots: [novoHotel("h4-s1")] },
];

const ic = { carro: Car, barco: Ship, trilha: Footprints, comida: Utensils, ponto: MapPin };

const ROTEIRO_INICIAL = [
  { id: "d1", n: 1, data: "06/12", titulo: "Chegada a El Calafate e Laguna Nimez", base: "El Calafate", nota: "Voo chega às 16:00 (FTE)", custo: 220, atividades: [
    { id: "d1a1", hora: "16:00", texto: "Chegada ao aeroporto (FTE), retirada do carro e check-in", tipo: "carro" },
    { id: "d1a2", hora: "17:30", texto: "Reserva Natural Laguna Nimez (~1h30, a 15 min do centro)", tipo: "trilha" },
    { id: "d1a3", hora: "19:15", texto: "Sorvete artesanal na Ovejitas de la Patagonia", tipo: "comida" },
    { id: "d1a4", hora: "20:30", texto: "Jantar no Isabel Cocina al Disco", tipo: "comida" },
  ]},
  { id: "d2", n: 2, data: "07/12", titulo: "Perito Moreno — passarelas e Safari Náutico", base: "El Calafate", nota: "~1h15 de carro cada trecho", custo: 440, atividades: [
    { id: "d2a1", hora: "08:30", texto: "Compras de lanches no supermercado La Anónima", tipo: "comida" },
    { id: "d2a2", hora: "09:30", texto: "Estrada cênica Ruta 11 até o Parque Nacional Los Glaciares", tipo: "carro" },
    { id: "d2a3", hora: "10:30", texto: "Passarelas do Perito Moreno — circuitos amarelo e azul, com piquenique", tipo: "trilha" },
    { id: "d2a4", hora: "14:30", texto: "Barco Safari Náutico junto à parede de gelo · RESERVAR", tipo: "barco" },
    { id: "d2a5", hora: "20:30", texto: "Jantar no La Tablita (cordeiro patagônico)", tipo: "comida" },
  ]},
  { id: "d3", n: 3, data: "08/12", titulo: "Ruta 40/23, Parador La Leona e El Chaltén", base: "El Chaltén", nota: "~3h de estrada no total", custo: 295, atividades: [
    { id: "d3a1", hora: "09:00", texto: "Saída de El Calafate rumo a El Chaltén", tipo: "carro" },
    { id: "d3a2", hora: "10:30", texto: "Parada histórica no Parador La Leona — café com torta artesanal", tipo: "comida" },
    { id: "d3a3", hora: "12:30", texto: "Chegada e almoço no Pura Vida Resto Bar", tipo: "comida" },
    { id: "d3a4", hora: "14:30", texto: "Mirador de los Cóndores + Mirador de las Águilas (~1h30–2h, vista do Lago Viedma)", tipo: "trilha" },
    { id: "d3a5", hora: "20:00", texto: "Jantar no La Tapera", tipo: "comida" },
  ]},
  { id: "d4", n: 4, data: "09/12", titulo: "Trilha Laguna Capri (Monte Fitz Roy)", base: "El Chaltén", nota: "Plano B: Mirador del Fitz Roy fica a 40–50 min do início", custo: 265, atividades: [
    { id: "d4a1", hora: "08:30", texto: "Café da manhã no Mathilda", tipo: "comida" },
    { id: "d4a2", hora: "09:30", texto: "Trilha até a Laguna Capri, com piquenique de frente para o Fitz Roy (~5h30–6h)", tipo: "trilha" },
    { id: "d4a3", hora: "16:00", texto: "Chocolate quente ou cerveja artesanal na Cervecería La Zorra", tipo: "comida" },
    { id: "d4a4", hora: "20:00", texto: "Jantar na Maffia Trattoria", tipo: "comida" },
  ]},
  { id: "d5", n: 5, data: "10/12", titulo: "Lago del Desierto e Glaciar Vespignani", base: "El Chaltén", nota: "~1h de carro cada trecho", custo: 355, atividades: [
    { id: "d5a1", hora: "09:00", texto: "37 km cênicos pela Ruta 23 Norte até Punta Sur (Lago del Desierto)", tipo: "carro" },
    { id: "d5a2", hora: "10:30", texto: "Navegação e trilha na Geleira Grande Vespignani · RESERVAR", tipo: "barco" },
    { id: "d5a3", hora: "14:30", texto: "Parada na cachoeira Chorrillo del Salto no retorno", tipo: "ponto" },
    { id: "d5a4", hora: "20:00", texto: "Jantar no Ahonikenk Chaltén", tipo: "comida" },
  ]},
  { id: "d6", n: 6, data: "11/12", titulo: "Travessia de fronteira e Torres del Paine", base: "Torres del Paine", nota: "~6h30 com fronteira · conferir autorização do carro", custo: 265, atividades: [
    { id: "d6a1", hora: "08:00", texto: "Saída rumo à fronteira (Paso Río Don Guillermo) — descartar alimentos frescos", tipo: "carro" },
    { id: "d6a2", hora: "11:30", texto: "Imigração e alfândega", tipo: "ponto" },
    { id: "d6a3", hora: "13:30", texto: "Almoço rápido na rota", tipo: "comida" },
    { id: "d6a4", hora: "15:00", texto: "Cascada Paine e estrada de Laguna Amarga — guanacos, ñandus e condores", tipo: "ponto" },
    { id: "d6a5", hora: "16:30", texto: "Check-in no hotel dentro do parque", tipo: "ponto" },
  ]},
  { id: "d7", n: 7, data: "12/12", titulo: "Imersão total em Torres del Paine", base: "Torres del Paine", nota: "2ª noite dentro do parque", custo: 220, atividades: [
    { id: "d7a1", hora: "08:30", texto: "Café da manhã com vista para as montanhas", tipo: "comida" },
    { id: "d7a2", hora: "09:30", texto: "Salto Grande, Mirador Cuernos e Mirador Cóndor (~40–50 min de subida)", tipo: "trilha" },
    { id: "d7a3", hora: "13:30", texto: "Almoço panorâmico no restaurante envidraçado do Hotel Lago Grey", tipo: "comida" },
    { id: "d7a4", hora: "15:30", texto: "Praia de areia preta do Lago Grey, entre os icebergs azuis", tipo: "trilha" },
  ]},
  { id: "d8", n: 8, data: "13/12", titulo: "Cueva del Milodón e Puerto Natales", base: "Puerto Natales", nota: "1ª noite em Natales", custo: 345, atividades: [
    { id: "d8a1", hora: "08:30", texto: "Check-out do parque e deslocamento cênico rumo ao sul", tipo: "carro" },
    { id: "d8a2", hora: "09:30", texto: "Cueva del Milodón — cavernas e réplica da preguiça-gigante", tipo: "ponto" },
    { id: "d8a3", hora: "12:30", texto: "Chegada e check-in em Puerto Natales", tipo: "ponto" },
    { id: "d8a4", hora: "13:00", texto: "Almoço e café da tarde na Patagonia Dulce", tipo: "comida" },
    { id: "d8a5", hora: "14:30", texto: "Costanera Pedro Montt — cisnes-de-pescoço-preto e artesanato", tipo: "ponto" },
    { id: "d8a6", hora: "20:00", texto: "Jantar no Santolla (centolla) ou Afrigonia", tipo: "comida" },
  ]},
  { id: "d9", n: 9, data: "14/12", titulo: "Manhã em Natales e retorno a El Calafate", base: "El Calafate", nota: "~4h30 com fronteira", custo: 320, atividades: [
    { id: "d9a1", hora: "09:00", texto: "Mirador Cerro Dorotea (~1h30) ou Museo Histórico Municipal + Costanera", tipo: "trilha" },
    { id: "d9a2", hora: "11:30", texto: "Check-out e almoço na cidade — uma última centolla", tipo: "comida" },
    { id: "d9a3", hora: "13:00", texto: "Saída rumo à fronteira — conferir autorização e alimentos", tipo: "carro" },
    { id: "d9a4", hora: "17:30", texto: "Chegada a El Calafate e check-in", tipo: "ponto" },
    { id: "d9a5", hora: "20:30", texto: "Jantar no Casimiro Biguá", tipo: "comida" },
  ]},
  { id: "d10", n: 10, data: "15/12", titulo: "Navegação Todo Glaciares (Upsala e Spegazzini)", base: "El Calafate", nota: "Dia mais caro do roteiro", custo: 695, atividades: [
    { id: "d10a1", hora: "07:15", texto: "Deslocamento de 45 km até Puerto Bandera", tipo: "carro" },
    { id: "d10a2", hora: "08:30", texto: "Barco Todo Glaciares — paredes de 135 m do Spegazzini, almoço no refúgio · RESERVAR", tipo: "barco" },
    { id: "d10a3", hora: "17:30", texto: "Retorno a El Calafate", tipo: "carro" },
    { id: "d10a4", hora: "20:30", texto: "Jantar no La Zaina Cocina Patagónica", tipo: "comida" },
  ]},
  { id: "d11", n: 11, data: "16/12", titulo: "Centro de El Calafate e estância patagônica", base: "El Calafate", nota: "Glaciarium + Bar de Gelo soma ~US$ 45", custo: 385, atividades: [
    { id: "d11a1", hora: "10:00", texto: "Manhã livre na avenida principal, chocolates e café no Pietro's Café", tipo: "comida" },
    { id: "d11a2", hora: "11:30", texto: "Glaciarium + Bar de Gelo — transporte gratuito do centro", tipo: "ponto" },
    { id: "d11a3", hora: "15:30", texto: "Estância El Galpón ou 25 de Mayo — cães pastores, tosa, cordeiro no fogo · RESERVAR", tipo: "ponto" },
  ]},
  { id: "d12", n: 12, data: "17/12", titulo: "Despedida da Patagônia", base: "Retorno", nota: "Voo às 11:00", custo: 40, atividades: [
    { id: "d12a1", hora: "08:30", texto: "Café da manhã e check-out", tipo: "comida" },
    { id: "d12a2", hora: "09:00", texto: "Devolução do carro no aeroporto FTE", tipo: "carro" },
    { id: "d12a3", hora: "11:00", texto: "Voo de retorno", tipo: "ponto" },
  ]},
];

const ESTADO_INICIAL = {
  roteiro: ROTEIRO_INICIAL,
  alertas: ALERTAS_INICIAIS,
  orcamento: ORCAMENTO_ALVO,
  hospedagens: HOSPEDAGENS_INICIAIS,
  cambio: CAMBIO_PADRAO,
  iof: IOF_PADRAO,
  custos: null, // preenchido na migração
};

/* Converte dados salvos em formatos antigos. Roda a cada carga — é idempotente. */
function migrar(bruto) {
  const e = { ...ESTADO_INICIAL, ...(bruto || {}) };

  /* formato v1: custo numérico solto por dia */
  e.roteiro = (e.roteiro || []).map((d) => {
    if (d.lanc || typeof d.custo !== "number") return d;
    return { ...d, lanc: { ...lanc(d.custo) } };
  });

  /* formato v3: fichas de custo independentes. Se ainda não existem,
     converte o lançamento de cada dia numa ficha atrelada àquele dia. */
  if (!Array.isArray(e.custos)) {
    e.custos = [];
    (e.roteiro || []).forEach((d) => {
      const l = d.lanc;
      if (l && (Number(l.valor) || 0) > 0) {
        e.custos.push({
          id: `c-${d.id}`,
          nome: "Custos do dia",
          diaId: d.id,
          valor: Number(l.valor) || 0,
          moeda: l.moeda || "USD",
          status: STATUS[l.status] ? l.status : "aberto",
          pagamento: PAGAMENTOS[l.pagamento] ? l.pagamento : "credito",
          iofIsento: Boolean(l.iofIsento),
          parcelas: 1, mesFatura: null,
        });
      }
    });
  }
  e.custos = (e.custos || []).map((c) => ({
    parcelas: 1, mesFatura: null, localizador: "", link: "", ...c,
    parcelas: Math.max(1, Math.round(Number(c.parcelas) || 1)),
  }));

  /* o lanc do dia deixa de existir para não contar em dobro */
  e.roteiro = (e.roteiro || []).map(({ lanc: _l, custo: _c, ...d }) => d);

  /* Hospedagem v4: cada hotel é reserva independente, com ativo/dias próprios.
     Antes: um "escolhido" por base e diasIds na base. */
  e.hospedagens = (e.hospedagens || []).map((b) => {
    const diasDaBase = Array.isArray(b.diasIds) ? b.diasIds : [];
    const slots = (b.slots || []).map((s) => {
      const migrado = {
        localizador: "", link: "",
        ...s,
        lanc: { status: "aberto", pagamento: "credito", iofIsento: false, parcelas: 1, mesFatura: null, ...(s.lanc || {}) },
      };
      if (typeof s.ativo !== "boolean") {
        /* o antigo escolhido vira o único hotel ativo, e herda os dias da base */
        migrado.ativo = b.escolhido === s.id;
        migrado.diasIds = migrado.ativo ? diasDaBase : [];
      } else {
        migrado.diasIds = Array.isArray(s.diasIds) ? s.diasIds : [];
      }
      return migrado;
    });
    const { escolhido: _e, diasIds: _d, ...resto } = b;
    return { ...resto, slots: slots.length ? slots : [novoHotel(`${b.id}-s1`)] };
  });

  e.cambio = { ...CAMBIO_PADRAO, ...(e.cambio || {}) };
  if (typeof e.iof !== "number") e.iof = IOF_PADRAO;
  return e;
}
const CHAVE = "patagonia-dez-2026";

/* Fundos cênicos em rotação. Troque por fotos suas colocando os arquivos
   em public/fundos/ e usando caminhos como "/fundos/fitzroy.jpg". */
const FUNDOS = [
  "https://images.unsplash.com/photo-1520769945061-0a448c463865?auto=format&fit=crop&w=2400&q=80",
  "https://images.unsplash.com/photo-1476610182048-b716b8518aae?auto=format&fit=crop&w=2400&q=80",
  "https://images.unsplash.com/photo-1478827387698-1527781a4887?auto=format&fit=crop&w=2400&q=80",
];

const INTERVALO_FUNDO = 12000;

/* ─────────────────────────  CONVERSÃO  ───────────────────────── */

/* Total do slot na moeda original */
function totalLocal(slot) {
  const n = (v) => Number(v) || 0;
  return slot.modo === "fechado"
    ? n(slot.fechado)
    : n(slot.diaria) * n(slot.noites) + n(slot.taxas);
}

const fmt = (v, casas = 0) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/* Valores em dólar: mostra centavos quando o número é pequeno,
   para lançamentos em pesos não aparecerem como "US$ 0". */
const fmtUSD = (v) => fmt(v, Math.abs(v) > 0 && Math.abs(v) < 100 ? 2 : 0);

/* Interpreta números como um brasileiro digita:
   "45.000" → 45000 · "45.000,50" → 45000.5 · "1.234.567" → 1234567
   "45,5" → 45.5 · "45.5" → 45.5 · "0.00068" → 0.00068 */
function parseNum(texto) {
  let s = String(texto).trim().replace(/\s/g, "");
  const temVirgula = s.includes(",");
  const temPonto = s.includes(".");

  if (temVirgula && temPonto) {
    /* o separador que aparece por último é o decimal */
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (temVirgula) {
    const partes = s.split(",");
    s = partes.length > 2 ? partes.join("") : s.replace(",", ".");
  } else if (temPonto) {
    const partes = s.split(".");
    if (partes.length > 2) {
      s = partes.join(""); /* "1.234.567" */
    } else if (partes[1]?.length === 3 && partes[0].length >= 1 && partes[0] !== "0") {
      s = partes.join(""); /* "45.000" no padrão brasileiro é milhar */
    }
    /* "45.5", "0.00068" etc. permanecem decimais */
  }
  return parseFloat(s) || 0;
}

/* ─────────────────────────  CAMPO EDITÁVEL  ───────────────────────── */

function Editavel({ valor, onChange, className = "", numero = false, prefixo = "", multiline = false, exibir = null }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(String(valor));
  const ref = useRef(null);

  useEffect(() => { setRascunho(String(valor)); }, [valor]);
  useEffect(() => { if (editando && ref.current) { ref.current.focus(); ref.current.select?.(); } }, [editando]);

  const salvar = () => {
    setEditando(false);
    onChange(numero ? parseNum(rascunho) : rascunho);
  };

  if (editando) {
    const Tag = multiline ? "textarea" : "input";
    return (
      <Tag
        ref={ref}
        value={rascunho}
        rows={multiline ? 2 : undefined}
        onChange={(e) => setRascunho(e.target.value)}
        onBlur={salvar}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !multiline) salvar();
          if (e.key === "Escape") { setRascunho(String(valor)); setEditando(false); }
        }}
        className={`${className} w-full bg-[#fbebd9]/15 border border-fuchsia-300/60 rounded-md px-2 py-1 outline-none resize-none text-[#fbebd9] placeholder-[#fbebd9]/40`}
      />
    );
  }

  return (
    <span
      onClick={() => setEditando(true)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditando(true); } }}
      className={`${className} group/ed inline-flex items-start gap-1.5 cursor-text rounded-md px-1 -mx-1 transition-colors hover:bg-[#fbebd9]/10 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70`}
      title="Clique para editar"
    >
      {prefixo}{exibir !== null ? exibir : valor}
      <Pencil size={11} className="mt-1 shrink-0 opacity-0 group-hover/ed:opacity-60 transition-opacity" />
    </span>
  );
}

/* ─────────────────────────  CONTROLE DE PAGAMENTO  ───────────────────────── */

function Pagamento({ l, aliquota, onChange, compacto = false }) {
  const dado = l || lanc();
  const meio = PAGAMENTOS[dado.pagamento] || PAGAMENTOS.credito;
  const temIOF = meio.iof && !dado.iofIsento;
  const iof = iofDe(dado, aliquota);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {Object.entries(STATUS).map(([k, st]) => {
          const on = dado.status === k;
          const c = CORES[st.cor];
          return (
            <button
              key={k}
              onClick={() => onChange("status", k)}
              title={st.desc}
              aria-pressed={on}
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
                on ? `${c.bg} ${c.bd} ${c.txt}` : "bg-[#fbebd9]/5 border-[#fbebd9]/10 text-[#fbebd9]/55 hover:bg-[#fbebd9]/10"
              }`}
            >
              {compacto ? st.curto : st.rot}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {Object.entries(PAGAMENTOS).map(([k, p]) => (
          <button
            key={k}
            onClick={() => onChange("pagamento", k)}
            aria-pressed={dado.pagamento === k}
            className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
              dado.pagamento === k ? "bg-[#fbebd9]/20 text-[#fbebd9]" : "bg-[#fbebd9]/5 text-[#fbebd9]/55 hover:bg-[#fbebd9]/10"
            }`}
          >
            {p.rot}
          </button>
        ))}

        {meio.iof && (
          <button
            onClick={() => onChange("iofIsento", !dado.iofIsento)}
            aria-pressed={!dado.iofIsento}
            title={dado.iofIsento ? "IOF isento neste item" : `IOF de ${aliquota}% aplicado`}
            className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
              temIOF ? "bg-rose-500/15 text-rose-300" : "bg-[#fbebd9]/5 text-[#fbebd9]/50 line-through"
            }`}
          >
            IOF
          </button>
        )}
      </div>

      {dado.status === "faturar" && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[10px] text-[#fbebd9]/55 uppercase tracking-wider">Fatura</span>
          <select
            value={dado.mesFatura || ""}
            onChange={(e) => onChange("mesFatura", e.target.value || null)}
            aria-label="Mês da fatura"
            className="text-[10px] font-bold py-1 px-1.5 rounded-md bg-[#fbebd9]/10 text-[#fbebd9]/80 border-0 outline-none cursor-pointer focus:ring-2 focus:ring-fuchsia-300/70 [&>option]:bg-zinc-800"
          >
            <option value="">definir mês</option>
            {mesesDisponiveis().map((m) => (
              <option key={m} value={m}>{rotuloFatura(m)}</option>
            ))}
          </select>

          <span className="text-[10px] text-[#fbebd9]/55 uppercase tracking-wider ml-1">Parcelas</span>
          <select
            value={dado.parcelas || 1}
            onChange={(e) => onChange("parcelas", Number(e.target.value))}
            aria-label="Número de parcelas"
            className="text-[10px] font-bold py-1 px-1.5 rounded-md bg-[#fbebd9]/10 text-[#fbebd9]/80 border-0 outline-none cursor-pointer focus:ring-2 focus:ring-fuchsia-300/70 [&>option]:bg-zinc-800"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>{n}×</option>
            ))}
          </select>

          {(dado.parcelas || 1) > 1 && dado.mesFatura && (
            <span className="text-[10px] text-orange-300/80 tabular-nums">
              {MOEDAS[dado.moeda]?.rot} {fmt(parcelasDe(dado)[0].valor, 2)}/mês até {rotuloFatura(somaMes(dado.mesFatura, (dado.parcelas || 1) - 1))}
            </span>
          )}
          {!dado.mesFatura && (
            <span className="text-[10px] text-orange-300/70">defina o mês para entrar no cronograma</span>
          )}
        </div>
      )}

      {temIOF && iof > 0 && (
        <div className="text-[11px] text-rose-300/80 tabular-nums">
          + {MOEDAS[dado.moeda]?.rot || ""} {fmt(iof, 2)} de IOF ({aliquota}%)
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  ESTRELAS CADENTES  ───────────────────────── */

/* Riscos rápidos no céu do hero. Vivem só na faixa superior, onde a imagem
   é escura o bastante para o traço aparecer, e somem ao descer rumo ao sol.
   O canvas é remedido continuamente: no celular o layout se acomoda depois
   da montagem e a barra de endereço muda a altura durante a rolagem. */
function EstrelasCadentes({ ativo = true }) {
  const ref = useRef(null);

  useEffect(() => {
    if (!ativo) return;

    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    let raf = null;
    let estrelas = [];
    let L = 0, A = 0, dpr = 0;
    let proxima = 500 + Math.random() * 700;
    let ultimo = performance.now();
    let conta = 0;

    /* Ajusta o buffer ao tamanho real. Se ainda não há layout, devolve false
       e o loop tenta de novo no quadro seguinte. */
    const medir = () => {
      const pai = cv.parentElement;
      const l = cv.clientWidth || (pai && pai.clientWidth) || window.innerWidth || 0;
      const a = cv.clientHeight || (pai && pai.clientHeight) || window.innerHeight || 0;
      if (!l || !a) return false;
      const d = Math.min(window.devicePixelRatio || 1, 2);
      if (l !== L || a !== A || d !== dpr) {
        L = l; A = a; dpr = d;
        cv.width = Math.max(1, Math.round(l * d));
        cv.height = Math.max(1, Math.round(a * d));
        ctx.setTransform(d, 0, 0, d, 0, 0);
      }
      return true;
    };

    const nova = () => {
      const paraDireita = Math.random() > 0.35;
      const incl = 0.30 + Math.random() * 0.22;
      /* velocidade e cauda proporcionais à largura: em tela estreita o risco
         precisa ser mais curto e mais lento para dar tempo de ser visto */
      const k = Math.max(0.34, Math.min(1, L / 1200));
      return {
        x: paraDireita ? -L * 0.12 + Math.random() * L * 0.45 : L * 0.55 + Math.random() * L * 0.55,
        y: A * (0.04 + Math.random() * 0.19),
        dx: Math.cos(incl) * (paraDireita ? 1 : -1),
        dy: Math.sin(incl),
        vel: (700 + Math.random() * 540) * k,
        cauda: (95 + Math.random() * 135) * k,
        esp: 1.0 + Math.random() * 1.1,
        t: 0,
        dur: 0.75 + Math.random() * 0.5,
      };
    };

    const quadro = (agora) => {
      raf = requestAnimationFrame(quadro);
      const dt = Math.min((agora - ultimo) / 1000, 0.05);
      ultimo = agora;
      if (document.hidden) return;

      /* remede a cada ~20 quadros, e sempre enquanto não houver tamanho */
      if (!L || !A || conta++ % 20 === 0) {
        if (!medir()) return;
      }

      ctx.clearRect(0, 0, L, A);

      proxima -= dt * 1000;
      if (proxima <= 0 && estrelas.length < 3) {
        estrelas.push(nova());
        proxima = 1700 + Math.random() * 3300;
        if (Math.random() < 0.14) proxima = 260; /* de vez em quando, duas seguidas */
      }

      estrelas = estrelas.filter((e) => {
        e.t += dt;
        e.x += e.dx * e.vel * dt;
        e.y += e.dy * e.vel * dt;
        if (e.t > e.dur) return false;

        const p = e.t / e.dur;
        const env = Math.min(1, p / 0.18) * Math.min(1, (1 - p) / 0.42);
        /* some ao descer para a parte clara do céu */
        const alt = Math.max(0, Math.min(1, 1 - (e.y / A - 0.28) / 0.20));
        const a = env * alt;
        if (a <= 0.01) return e.y < A && e.x > -L * 0.4 && e.x < L * 1.4;

        const tx = e.x - e.dx * e.cauda;
        const ty = e.y - e.dy * e.cauda;
        const g = ctx.createLinearGradient(e.x, e.y, tx, ty);
        g.addColorStop(0, `rgba(255,248,238,${0.95 * a})`);
        g.addColorStop(0.35, `rgba(255,190,225,${0.42 * a})`);
        g.addColorStop(1, "rgba(255,190,225,0)");

        ctx.strokeStyle = g;
        ctx.lineWidth = e.esp;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        const gr = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.esp * 3.2);
        gr.addColorStop(0, `rgba(255,250,242,${0.85 * a})`);
        gr.addColorStop(1, "rgba(255,250,242,0)");
        ctx.fillStyle = gr;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.esp * 3.2, 0, Math.PI * 2);
        ctx.fill();

        return true;
      });
    };

    medir();
    raf = requestAnimationFrame(quadro);

    /* ResizeObserver pega mudanças de layout que o evento resize não cobre */
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => medir());
      ro.observe(cv);
    }
    const aoMudar = () => medir();
    window.addEventListener("resize", aoMudar, { passive: true });
    window.addEventListener("orientationchange", aoMudar, { passive: true });

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener("resize", aoMudar);
      window.removeEventListener("orientationchange", aoMudar);
      if (L && A) ctx.clearRect(0, 0, L, A);
    };
  }, [ativo]);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 w-full h-full pointer-events-none"
    />
  );
}

/* ─────────────────────────  LOCALIZADOR  ───────────────────────── */

/* Código da reserva e link do voucher. É o que se mostra na portaria do
   parque ou no balcão do hotel — vale mais que o valor naquele momento. */
/* Mostra o domínio em vez da URL inteira: "booking.com" cabe na caixa e
   diz mais que "https://ww…". Se não for uma URL, corta no 10º caractere. */
function resumoLink(u) {
  const t = (u || "").trim();
  if (!t) return "";
  try {
    const h = new URL(t).hostname.replace(/^www\./i, "");
    return h.length > 20 ? h.slice(0, 19) + "…" : h;
  } catch (e) {
    return t.length <= 13 ? t : t.slice(0, 10) + "…";
  }
}

function Localizador({ codigo, link, onChange }) {
  const bruto = typeof link === "string" ? link.trim() : "";
  const temLink = /^https?:\/\//i.test(bruto);

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 min-w-0">
      <Ticket size={13} className="shrink-0 text-[#fbebd9]/45" />

      <span className="text-sm font-mono tracking-wide min-w-0 max-w-[60%] truncate">
        <Editavel
          valor={codigo || "localizador"}
          onChange={(v) => onChange("localizador", v === "localizador" ? "" : v)}
          className={codigo ? "" : "text-[#fbebd9]/45 italic font-sans text-xs"}
        />
      </span>

      {temLink && (
        <a
          href={bruto}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-fuchsia-300 hover:text-fuchsia-200 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 rounded px-1"
        >
          <ExternalLink size={11} /> voucher
        </a>
      )}

      {/* editável, mas exibido curto para não estourar a caixa */}
      <span className="text-[11px] text-[#fbebd9]/45 min-w-0 max-w-full truncate">
        <Editavel
          valor={link || "+ link"}
          exibir={temLink ? resumoLink(bruto) : link ? resumoLink(link) : "+ link"}
          onChange={(v) => onChange("link", v === "+ link" ? "" : v)}
          className="italic"
        />
      </span>
    </div>
  );
}

/* ─────────────────────────  APP  ───────────────────────── */

export default function App() {
  const [estado, setEstado] = useState(() => migrar(ESTADO_INICIAL));
  /* Espelho do estado para uso em callbacks (ex.: evento "online"), que de
     outro modo capturariam uma versão antiga. */
  const estadoRef = useRef(estado);
  estadoRef.current = estado;
  const [carregado, setCarregado] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [aba, setAba] = useState(() => {
    /* atalhos do ícone abrem direto numa aba: /?aba=financeiro */
    try {
      const q = new URLSearchParams(window.location.search).get("aba");
      return ["roteiro", "custos", "financeiro", "hotel", "checklist"].includes(q) ? q : "roteiro";
    } catch (e) { return "roteiro"; }
  });
  const [fundo, setFundo] = useState(0);
  const [sinc, setSinc] = useState(configurado ? "carregando" : "local");
  const [erroSinc, setErroSinc] = useState("");
  const [abrirFin, setAbrirFin] = useState(true);
  const [abrirCambio, setAbrirCambio] = useState(false);
  const [buscandoCambio, setBuscandoCambio] = useState(false);
  const [baseAberta, setBaseAberta] = useState({});


  /* Progresso da rolagem no trecho do hero (0 = topo, 1 = hero dissolvido).
     Alimenta o crossfade entre o hero e os wallpapers. */
  const [rolagem, setRolagem] = useState(0);
  useEffect(() => {
    let raf = null;
    const medir = () => {
      raf = null;
      const alcance = window.innerHeight * 0.75; /* dissolve ao longo de 75% da tela */
      setRolagem(Math.min(1, Math.max(0, window.scrollY / alcance)));
    };
    const aoRolar = () => { if (raf === null) raf = requestAnimationFrame(medir); };
    window.addEventListener("scroll", aoRolar, { passive: true });
    window.addEventListener("resize", aoRolar, { passive: true });
    medir();
    return () => {
      window.removeEventListener("scroll", aoRolar);
      window.removeEventListener("resize", aoRolar);
      if (raf !== null) cancelAnimationFrame(raf);
    };
  }, []);

  /* Busca cotações na open.er-api.com (gratuita, sem chave, atualiza 1x/dia).
     A resposta traz "quantos X valem 1 dólar"; o app guarda o inverso. */
  const buscarCambio = async (forcar = false) => {
    const idade = Date.now() - (estado.cambioAtualizadoEm || 0);
    if (!forcar && idade < 12 * 60 * 60 * 1000) return; /* já atualizado hoje */
    setBuscandoCambio(true);
    try {
      const r = await fetch("https://open.er-api.com/v6/latest/USD");
      const j = await r.json();
      if (j?.result !== "success" || !j.rates) throw new Error("resposta inválida");
      const novo = { USD: 1 };
      ["BRL", "ARS", "CLP"].forEach((m) => {
        const taxa = Number(j.rates[m]);
        if (taxa > 0) novo[m] = 1 / taxa;
      });
      setEstado((s) => ({
        ...s,
        cambio: { ...s.cambio, ...novo },
        cambioAtualizadoEm: Date.now(),
      }));
    } catch (e) {
      /* sem rede ou API fora: mantém os valores atuais, editáveis à mão */
    } finally {
      setBuscandoCambio(false);
    }
  };

  /* Atualiza sozinho, no máximo 1x a cada 12h — mas só depois que a carga
     da nuvem resolver, senão o estado remoto sobrescreve as cotações novas */
  const cambioJaBuscado = useRef(false);
  useEffect(() => {
    if (!carregado || sinc === "carregando" || cambioJaBuscado.current) return;
    cambioJaBuscado.current = true;
    buscarCambio(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carregado, sinc]);

  /* Evita que a gravação dispare por mudanças vindas da própria nuvem */
  const ignorarProximo = useRef(false);
  const primeiroSalvamento = useRef(true);
  /* Data da última edição feita neste aparelho, e se falta enviar algo */
  const editadoEm = useRef(0);
  const pendente = useRef(false);
  const ultimoEstado = useRef(null);

  const gravarLocal = (dados, quando) => {
    try {
      window.localStorage.setItem(CHAVE, JSON.stringify({ dados, editadoEm: quando }));
    } catch (e) { /* sem espaço ou modo privado: segue só em memória */ }
  };

  /* Envia ao Supabase o que estiver pendente. Se falhar (sem sinal), a marca
     de pendente permanece e o envio é refeito quando a conexão voltar. */
  const enviarPendente = async () => {
    if (!configurado || !pendente.current) return;
    const dados = ultimoEstado.current || estadoRef.current;
    const quando = editadoEm.current || Date.now();
    try {
      setSinc("salvando");
      await salvarNuvem(dados, quando);
      pendente.current = false;
      setSinc("ok");
      setErroSinc("");
    } catch (e) {
      setErroSinc(e.message || "sem conexão");
      setSinc("erro");
    }
  };

  useEffect(() => {
    const t = setInterval(() => setFundo((i) => (i + 1) % FUNDOS.length), INTERVALO_FUNDO);
    return () => clearInterval(t);
  }, []);

  /* O zoom do hero é o único efeito que respeita "reduzir movimento":
     parallax é o que de fato incomoda quem tem sensibilidade vestibular. */
  const [movimentoOk, setMovimentoOk] = useState(true);
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ao = (e) => setMovimentoOk(!e.matches);
    setMovimentoOk(!mq.matches);
    mq.addEventListener ? mq.addEventListener("change", ao) : mq.addListener(ao);
    return () => {
      mq.removeEventListener ? mq.removeEventListener("change", ao) : mq.removeListener(ao);
    };
  }, []);

  /* 1. Cache local primeiro — app abre instantâneo, funciona sem sinal.
        O envelope guarda a data da última edição feita neste aparelho. */
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE);
      if (bruto) {
        const j = JSON.parse(bruto);
        const temEnvelope = j && typeof j === "object" && j.dados;
        setEstado(migrar(temEnvelope ? j.dados : j));
        editadoEm.current = temEnvelope ? Number(j.editadoEm) || 0 : 0;
      }
    } catch (e) { /* começa do zero */ }
    setCarregado(true);
  }, []);

  /* 2. Busca a nuvem e resolve o conflito pela data.
        Sem isso, o que você editou sem internet seria apagado ao reconectar. */
  useEffect(() => {
    if (!carregado || !configurado) return;
    let vivo = true;

    (async () => {
      try {
        const remoto = await carregarNuvem();
        if (!vivo) return;
        const tsRemoto = remoto ? Date.parse(remoto.atualizadoEm) || 0 : 0;

        if (!remoto || !remoto.dados) {
          /* nuvem vazia: manda o que temos */
          if (editadoEm.current > 0) pendente.current = true;
        } else if (editadoEm.current > tsRemoto) {
          /* edições locais são mais recentes — sobem, não descem */
          pendente.current = true;
        } else if (tsRemoto > editadoEm.current) {
          /* nuvem mais nova: adota */
          ignorarProximo.current = true;
          setEstado(migrar(remoto.dados));
          editadoEm.current = tsRemoto;
          gravarLocal(remoto.dados, tsRemoto);
        }
        setSinc("ok");
        if (pendente.current) enviarPendente();
      } catch (e) {
        if (!vivo) return;
        setErroSinc(e.message || "falha ao conectar");
        setSinc("erro");
      }
    })();

    return () => { vivo = false; };
  }, [carregado]);

  /* 3. Alterações de outros aparelhos — só entram se forem mais recentes */
  useEffect(() => {
    if (!carregado || !configurado) return;
    return ouvirNuvem(({ dados, atualizadoEm }) => {
      const ts = Date.parse(atualizadoEm) || 0;
      if (ts <= editadoEm.current) return; /* eco ou versão velha: ignora */
      ignorarProximo.current = true;
      setEstado(migrar(dados));
      editadoEm.current = ts;
      gravarLocal(dados, ts);
    });
  }, [carregado]);

  /* 4. Grava: local na hora, nuvem com atraso para não spammar */
  useEffect(() => {
    if (!carregado) return;

    if (ignorarProximo.current) { ignorarProximo.current = false; return; }
    if (primeiroSalvamento.current) {
      primeiroSalvamento.current = false;
      gravarLocal(estado, editadoEm.current);
      return;
    }

    /* edição genuína deste aparelho */
    editadoEm.current = Date.now();
    gravarLocal(estado, editadoEm.current);
    ultimoEstado.current = estado;

    if (!configurado) return;

    pendente.current = true;
    setSinc("salvando");
    const t = setTimeout(() => enviarPendente(), 1200);
    return () => clearTimeout(t);
  }, [estado, carregado]);

  /* 5. Reenvia o que ficou pendente assim que a conexão voltar */
  useEffect(() => {
    if (!configurado) return;
    const aoVoltar = () => { if (pendente.current) enviarPendente(); };
    window.addEventListener("online", aoVoltar);
    return () => window.removeEventListener("online", aoVoltar);
  }, []);

  /* Junta todos os custos — fichas e hospedagens — numa lista só */
  const lancamentos = useMemo(() => {
    const out = [];
    (estado.custos || []).forEach((c) => {
      const d = (estado.roteiro || []).find((x) => x.id === c.diaId);
      out.push({
        chave: `custo-${c.id}`,
        rotulo: `${d ? `Dia ${d.n}` : "Sem dia"} · ${c.nome}`,
        l: c, origem: "custo", ref: c,
      });
    });
    (estado.hospedagens || []).forEach((b) => {
      (b.slots || []).filter((s) => s.ativo).forEach((slot) => {
        const l = { ...(slot.lanc || {}), moeda: slot.moeda, valor: totalLocal(slot) };
        out.push({
          chave: `hosp-${slot.id}`,
          rotulo: `${b.nome} · ${slot.hotel || "hotel"}`,
          l, origem: "hospedagem", ref: b,
        });
      });
    });
    return out;
  }, [estado.custos, estado.roteiro, estado.hospedagens]);

  /* Total em US$ de cada dia, somando as fichas atreladas a ele */
  const custoPorDia = useMemo(() => {
    const m = {};
    (estado.custos || []).forEach((c) => {
      if (!c.diaId) return;
      m[c.diaId] = (m[c.diaId] || 0) + lancEmUSD(c, estado.cambio, estado.iof);
    });
    return m;
  }, [estado.custos, estado.cambio, estado.iof]);

  /* Hotéis de cada dia, para exibir no roteiro. Um dia pode ter mais de um
     (ex.: troca de hotel na mesma cidade). */
  const hotelPorDia = useMemo(() => {
    const m = {};
    (estado.hospedagens || []).forEach((b) => {
      (b.slots || []).forEach((s) => {
        if (!s.ativo || !s.hotel) return;
        (s.diasIds || []).forEach((dId) => {
          m[dId] = m[dId] ? [...m[dId], s.hotel] : [s.hotel];
        });
      });
    });
    return m;
  }, [estado.hospedagens]);

  /* Localizadores de cada dia: fichas + hotéis. É o que se mostra no balcão. */
  const codigosPorDia = useMemo(() => {
    const m = {};
    const por = (dId, nome, codigo, link) => {
      if (!dId || !codigo) return;
      (m[dId] = m[dId] || []).push({ nome, codigo, link });
    };
    (estado.custos || []).forEach((c) => por(c.diaId, c.nome, c.localizador, c.link));
    (estado.hospedagens || []).forEach((b) =>
      (b.slots || []).forEach((sl) => {
        if (!sl.ativo) return;
        (sl.diasIds || []).forEach((dId) => por(dId, sl.hotel || b.nome, sl.localizador, sl.link));
      })
    );
    return m;
  }, [estado.custos, estado.hospedagens]);

  const fin = useMemo(() => {
    const z = { pago: 0, faturar: 0, chegada: 0, aberto: 0, iof: 0, total: 0 };
    lancamentos.forEach(({ l }) => {
      const usd = lancEmUSD(l, estado.cambio, estado.iof);
      const taxa = Number(estado.cambio?.[l.moeda]) || 0;
      const st = STATUS[l.status] ? l.status : "aberto";
      z[st] += usd;
      z.iof += iofDe(l, estado.iof) * taxa;
      z.total += usd;
    });
    z.pendente = z.faturar + z.chegada + z.aberto;
    return z;
  }, [lancamentos, estado.cambio, estado.iof]);

  /* Cronograma das faturas: agrupa por mês o que ainda vai vencer no cartão,
     já quebrado em parcelas. */
  const faturas = useMemo(() => {
    const porMes = {};
    let semMes = 0;
    lancamentos.forEach(({ l, rotulo }) => {
      if (l.status !== "faturar") return;
      const taxa = Number(estado.cambio?.[l.moeda]) || 0;
      const comIOF = (Number(l.valor) || 0) + iofDe(l, estado.iof);
      const fator = (Number(l.valor) || 0) > 0 ? comIOF / (Number(l.valor) || 1) : 1;
      parcelasDe(l).forEach((p) => {
        const usd = p.valor * fator * taxa;
        if (!p.mes) { semMes += usd; return; }
        if (!porMes[p.mes]) porMes[p.mes] = { mes: p.mes, total: 0, itens: [] };
        porMes[p.mes].total += usd;
        porMes[p.mes].itens.push({ rotulo, usd, parcela: p.n > 1 ? `${p.i}/${p.n}` : null });
      });
    });
    return { lista: Object.values(porMes).sort((a, b) => a.mes.localeCompare(b.mes)), semMes };
  }, [lancamentos, estado.cambio, estado.iof]);

  const totalRoteiro = useMemo(
    () => (estado.custos || []).reduce((s, c) => s + lancEmUSD(c, estado.cambio, estado.iof), 0),
    [estado.custos, estado.cambio, estado.iof]
  );

  const totalHosp = useMemo(
    () => (estado.hospedagens || []).reduce((s, b) =>
      s + (b.slots || []).filter((x) => x.ativo).reduce((t, slot) =>
        t + lancEmUSD({ ...(slot.lanc || {}), moeda: slot.moeda, valor: totalLocal(slot) }, estado.cambio, estado.iof), 0), 0),
    [estado.hospedagens, estado.cambio, estado.iof]
  );

  const total = fin.total;
  const pct = Math.min(100, (total / (estado.orcamento || 1)) * 100);
  const pctPago = Math.min(100, (fin.pago / (estado.orcamento || 1)) * 100);
  const restante = estado.orcamento - total;
  const feitos = estado.alertas.filter((a) => a.feito).length;
  const dia = estado.roteiro[ativo];

  const atualizarDia = (id, campo, valor) =>
    setEstado((s) => ({ ...s, roteiro: s.roteiro.map((d) => (d.id === id ? { ...d, [campo]: valor } : d)) }));

  const atualizarAtiv = (diaId, ativId, campo, valor) =>
    setEstado((s) => ({ ...s, roteiro: s.roteiro.map((d) => d.id !== diaId ? d
      : { ...d, atividades: d.atividades.map((a) => (a.id === ativId ? { ...a, [campo]: valor } : a)) }) }));

  const removerAtiv = (diaId, ativId) =>
    setEstado((s) => ({ ...s, roteiro: s.roteiro.map((d) => d.id !== diaId ? d
      : { ...d, atividades: d.atividades.filter((a) => a.id !== ativId) }) }));

  const adicionarAtiv = (diaId) =>
    setEstado((s) => ({ ...s, roteiro: s.roteiro.map((d) => d.id !== diaId ? d
      : { ...d, atividades: [...d.atividades, { id: `${diaId}-${Date.now()}`, hora: "00:00", texto: "Nova atividade", tipo: "ponto" }] }) }));

  const alternarAlerta = (id) =>
    setEstado((s) => ({ ...s, alertas: s.alertas.map((a) => (a.id === id ? { ...a, feito: !a.feito } : a)) }));

  const atualizarAlerta = (id, campo, valor) =>
    setEstado((s) => ({ ...s, alertas: s.alertas.map((a) => (a.id === id ? { ...a, [campo]: valor } : a)) }));

  const removerAlerta = (id) =>
    setEstado((s) => ({ ...s, alertas: s.alertas.filter((a) => a.id !== id) }));

  const adicionarAlerta = () =>
    setEstado((s) => ({ ...s, alertas: [...s.alertas, { id: `al-${Date.now()}`, texto: "Nova pendência", critico: false, feito: false }] }));

  const atualizarSlot = (baseId, slotId, campo, valor) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => b.id !== baseId ? b
      : { ...b, slots: b.slots.map((sl) => (sl.id === slotId ? { ...sl, [campo]: valor } : sl)) }) }));

  const escolherSlot = (baseId, slotId) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => b.id !== baseId ? b
      : { ...b, slots: b.slots.map((sl) => (sl.id === slotId ? { ...sl, ativo: !sl.ativo } : sl)) }) }));

  const adicionarSlot = (baseId) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => b.id !== baseId ? b
      : { ...b, slots: [...b.slots, novoHotel(`${baseId}-s${Date.now()}`)] }) }));

  const removerSlot = (baseId, slotId) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => b.id !== baseId ? b
      : { ...b, slots: b.slots.filter((sl) => sl.id !== slotId) }) }));

  const adicionarBase = () =>
    setEstado((s) => {
      const id = `h-${Date.now()}`;
      return { ...s, hospedagens: [...s.hospedagens, { id, nome: "Nova localidade", noites: "", slots: [novoHotel(`${id}-s1`)] }] };
    });

  const removerBase = (baseId) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.filter((b) => b.id !== baseId) }));

  const atualizarBase = (baseId, campo, valor) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => (b.id === baseId ? { ...b, [campo]: valor } : b)) }));

  const atualizarCambio = (moeda, valor) =>
    setEstado((s) => ({ ...s, cambio: { ...s.cambio, [moeda]: valor } }));

  const atualizarCusto = (id, campo, valor) =>
    setEstado((s) => ({ ...s, custos: s.custos.map((c) => (c.id === id ? { ...c, [campo]: valor } : c)) }));

  const removerCusto = (id) =>
    setEstado((s) => ({ ...s, custos: s.custos.filter((c) => c.id !== id) }));

  const adicionarCusto = (diaId = null) =>
    setEstado((s) => ({ ...s, custos: [...(s.custos || []), {
      id: `c-${Date.now()}`, nome: "Novo custo", diaId: diaId || s.roteiro[0]?.id || null,
      valor: 0, moeda: "USD", status: "aberto", pagamento: "credito", iofIsento: false, parcelas: 1, mesFatura: null,
      localizador: "", link: "",
    }] }));

  const alternarDiaSlot = (baseId, slotId, diaId) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => b.id !== baseId ? b
      : { ...b, slots: b.slots.map((sl) => sl.id !== slotId ? sl
          : { ...sl, diasIds: (sl.diasIds || []).includes(diaId)
              ? sl.diasIds.filter((x) => x !== diaId)
              : [...(sl.diasIds || []), diaId] }) }) }));

  const atualizarLancSlot = (baseId, slotId, campo, valor) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => b.id !== baseId ? b
      : { ...b, slots: b.slots.map((sl) => sl.id !== slotId ? sl
          : { ...sl, lanc: { ...(sl.lanc || {}), [campo]: valor } }) }) }));

  const restaurar = () => {
    if (window.confirm("Restaurar tudo ao estado original? Roteiro, custos, hospedagens e checklist serão zerados.")) setEstado(migrar(ESTADO_INICIAL));
  };

  const vidro = "backdrop-blur-2xl bg-[#150f1e]/70 border border-[#fbebd9]/12 shadow-[0_8px_40px_rgba(0,0,0,0.55)]";

  return (
    <div className="relative min-h-screen w-full font-sans text-[#fbebd9]">
      {/* Camada 1 — wallpapers, sempre atrás; revelados conforme o hero dissolve */}
      {FUNDOS.map((url, i) => (
        <div
          key={url}
          aria-hidden="true"
          className="fixed inset-0 bg-cover bg-center transition-opacity duration-[2500ms] ease-in-out"
          style={{ backgroundImage: `url('${url}')`, opacity: i === fundo ? 0.3 : 0 }}
        />
      ))}
      <div className="fixed inset-0 bg-gradient-to-b from-[#0d0b14]/75 via-[#140d1c]/82 to-[#0a0710]/92" />

      {/* Camada 2 — hero em tela cheia, dissolve ao rolar */}
      <div
        aria-hidden="true"
        className="fixed inset-0 pointer-events-none"
        style={{ opacity: 1 - rolagem }}
      >
        <img
          src="/hero.jpg"
          alt=""
          className="absolute inset-0 w-full h-full object-cover object-center"
          style={movimentoOk ? { transform: `scale(${1 + rolagem * 0.08})`, transformOrigin: "50% 40%" } : undefined}
        />
        <EstrelasCadentes ativo={rolagem < 0.85} />
        {/* escurece a base do hero para o conteúdo nascer legível */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0d0b14]/25 via-[#0d0b14]/45 to-[#0d0b14]" />
      </div>

      {/* Camada 3 — conteúdo, rola por cima de tudo */}
      <div className="relative z-10">
        {/* Espaço da primeira tela: só o hero aparece aqui */}
        <div className="h-[78vh] min-h-[420px] flex items-end">
          <div
            className="w-full max-w-5xl mx-auto px-4 sm:px-6 pb-10"
            style={{ opacity: Math.max(0, 1 - rolagem * 1.5), transform: `translateY(${rolagem * -20}px)` }}
          >
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <div className="font-titulo text-xs sm:text-sm font-medium uppercase tracking-[0.42em] text-pink-300/85 mb-1.5">
                  Kooka Planner
                </div>
                <h1 className="font-titulo text-6xl sm:text-8xl font-bold tracking-wide leading-none drop-shadow-[0_4px_24px_rgba(0,0,0,0.8)]">
                  Patagônia
                </h1>
                <p className="mt-3 text-sm text-[#fbebd9]/60">
                  06 – 17 de dezembro · Argentina e Chile
                </p>
              </div>
              <div
                title={
                  sinc === "erro" ? `Erro: ${erroSinc}`
                  : sinc === "local" ? "Sincronização não configurada — salvo apenas neste navegador"
                  : "Sincronizado entre seus aparelhos"
                }
                className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 backdrop-blur-md ${
                  sinc === "ok" ? "text-emerald-300 border-emerald-400/40 bg-emerald-500/15"
                  : sinc === "erro" ? "text-rose-300 border-rose-400/40 bg-rose-500/15"
                  : sinc === "local" ? "text-[#fbebd9]/50 border-[#fbebd9]/15 bg-[#fbebd9]/10"
                  : "text-fuchsia-300 border-fuchsia-400/40 bg-fuchsia-500/15"
                }`}
              >
                {sinc === "ok" && <><Cloud size={12} /> Sincronizado</>}
                {sinc === "salvando" && <><RefreshCw size={12} className="animate-spin" /> Salvando</>}
                {sinc === "carregando" && <><RefreshCw size={12} className="animate-spin" /> Carregando</>}
                {sinc === "erro" && <><CloudOff size={12} /> Sem conexão</>}
                {sinc === "local" && <><CloudOff size={12} /> Só neste aparelho</>}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 sm:px-6 pb-8 sm:pb-12">



        {/* Abas — grudam no topo ao rolar, em qualquer tamanho de tela.
            Sempre visíveis: navegação principal não pode depender de rolagem. */}
        <nav className={`${vidro} barra-abas sticky z-40 rounded-2xl p-1.5 mb-6 flex gap-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.45)]`}>
          {[
            { id: "roteiro", rot: "Roteiro", Icone: CalendarDays },
            { id: "custos", rot: "Lançamentos", Icone: Wallet },
            { id: "financeiro", rot: "Financeiro", Icone: PieChart },
            { id: "hotel", rot: "Hospedagem", Icone: BedDouble },
            { id: "checklist", rot: "Checklist", Icone: ListChecks },
          ].map(({ id, rot, Icone }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg font-titulo text-sm font-medium uppercase tracking-wider transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
                aba === id ? "bg-[#fbebd9] text-[#0d0b14] shadow-lg" : "text-[#fbebd9]/65 hover:bg-[#fbebd9]/10"
              }`}
            >
              <Icone size={15} /> <span className="hidden sm:inline">{rot}</span>
            </button>
          ))}
        </nav>

        {/* ROTEIRO */}
        {aba === "roteiro" && (
          <div>
            <div className="flex gap-2 overflow-x-auto pb-3 mb-4 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {estado.roteiro.map((d, i) => (
                <button
                  key={d.id}
                  onClick={() => setAtivo(i)}
                  className={`shrink-0 w-16 py-2.5 rounded-xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
                    i === ativo
                      ? "bg-[#fbebd9] text-[#0d0b14] border-[#fbebd9] -translate-y-1 shadow-xl"
                      : "bg-[#fbebd9]/[0.07] border-[#fbebd9]/15 text-[#fbebd9]/70 hover:bg-[#fbebd9]/15 hover:-translate-y-0.5"
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-widest opacity-60">Dia</div>
                  <div className="font-titulo text-2xl font-bold leading-none">{d.n}</div>
                  <div className="text-[9px] opacity-60 mt-0.5">{d.data}</div>
                </button>
              ))}
            </div>

            <article className={`${vidro} rounded-2xl p-6`}>
              <div className="flex items-start justify-between gap-4 mb-1">
                <div className="flex items-center gap-2 text-fuchsia-300 text-[11px] font-bold uppercase tracking-[0.2em]">
                  <MapPin size={13} /> <Editavel valor={dia.base} onChange={(v) => atualizarDia(dia.id, "base", v)} />
                </div>
                <button
                  onClick={() => setAba("custos")}
                  title="Editar na aba Custos"
                  className="text-right shrink-0 rounded-lg px-2 py-1 -mr-2 hover:bg-[#fbebd9]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                >
                  <div className="text-[10px] uppercase tracking-widest text-[#fbebd9]/55">Custo do dia</div>
                  <div className="text-xl font-bold text-pink-300 tabular-nums">
                    US$ {fmtUSD(custoPorDia[dia.id] || 0)}
                  </div>
                  <div className="text-[10px] text-[#fbebd9]/55">editar em Custos →</div>
                </button>
              </div>

              {hotelPorDia[dia.id]?.length > 0 && (
                <div className="flex items-start gap-2 mb-3 text-sm text-[#fbebd9]/70">
                  <BedDouble size={14} className="text-fuchsia-300/70 shrink-0 mt-0.5" />
                  <span className="min-w-0">{hotelPorDia[dia.id].join(" · ")}</span>
                </div>
              )}

              {codigosPorDia[dia.id]?.length > 0 && (
                <div className="mb-4 rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/[0.07] p-3">
                  <div className="font-titulo text-[11px] uppercase tracking-[0.2em] text-fuchsia-300/85 mb-2">
                    Localizadores do dia
                  </div>
                  <ul className="space-y-1.5">
                    {codigosPorDia[dia.id].map((r, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm">
                        <Ticket size={12} className="shrink-0 text-[#fbebd9]/45" />
                        <span className="min-w-0 truncate text-[#fbebd9]/70">{r.nome}</span>
                        <span className="font-mono tracking-wide text-[#fbebd9] ml-auto shrink-0">{r.codigo}</span>
                        {/^https?:\/\//i.test((r.link || "").trim()) && (
                          <a
                            href={r.link.trim()}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Voucher de ${r.nome}`}
                            className="shrink-0 text-fuchsia-300 hover:text-fuchsia-200 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 rounded"
                          >
                            <ExternalLink size={12} />
                          </a>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <h2 className="font-titulo text-3xl font-medium tracking-wide mb-1 leading-snug">
                <Editavel valor={dia.titulo} multiline onChange={(v) => atualizarDia(dia.id, "titulo", v)} />
              </h2>
              <p className="text-sm text-[#fbebd9]/50 mb-6">
                <Editavel valor={dia.nota} onChange={(v) => atualizarDia(dia.id, "nota", v)} />
              </p>

              <ul className="space-y-2.5">
                {dia.atividades.map((a) => {
                  const Icone = ic[a.tipo] || MapPin;
                  return (
                    <li
                      key={a.id}
                      className="group flex gap-4 items-start rounded-xl border border-[#fbebd9]/10 bg-[#fbebd9]/[0.05] p-4 transition-all duration-300 hover:bg-[#fbebd9]/[0.12] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
                    >
                      <div className="shrink-0 flex flex-col items-center gap-1.5 w-[4.5rem]">
                        <div className="flex items-center gap-1 text-fuchsia-200 w-full justify-center">
                          <Clock size={11} className="opacity-50 shrink-0" />
                          <Editavel
                            valor={a.hora}
                            className="text-sm font-bold tabular-nums min-w-0 [&>svg]:hidden"
                            onChange={(v) => atualizarAtiv(dia.id, a.id, "hora", v)}
                          />
                        </div>
                        <Icone size={15} className="text-[#fbebd9]/55" />
                      </div>
                      <p className="flex-1 text-[15px] leading-relaxed text-[#fbebd9]/85 pt-0.5">
                        <Editavel valor={a.texto} multiline onChange={(v) => atualizarAtiv(dia.id, a.id, "texto", v)} />
                      </p>
                      <button
                        onClick={() => removerAtiv(dia.id, a.id)}
                        aria-label="Remover atividade"
                        className="shrink-0 p-1.5 rounded-lg text-[#fbebd9]/45 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-300 hover:bg-rose-500/15 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300/70"
                      >
                        <Trash2 size={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="flex items-center justify-between mt-5">
                <button
                  onClick={() => adicionarAtiv(dia.id)}
                  className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200 px-3 py-2 rounded-lg hover:bg-[#fbebd9]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                >
                  <Plus size={15} /> Adicionar atividade
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setAtivo((i) => Math.max(0, i - 1))}
                    disabled={ativo === 0}
                    aria-label="Dia anterior"
                    className="p-2.5 rounded-lg bg-[#fbebd9]/10 hover:bg-[#fbebd9]/20 disabled:opacity-25 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setAtivo((i) => Math.min(estado.roteiro.length - 1, i + 1))}
                    disabled={ativo === estado.roteiro.length - 1}
                    aria-label="Próximo dia"
                    className="p-2.5 rounded-lg bg-[#fbebd9]/10 hover:bg-[#fbebd9]/20 disabled:opacity-25 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* FINANCEIRO */}
        {aba === "financeiro" && (
          <div className="space-y-3">
            {/* Panorama */}
            <div className={`${vidro} rounded-2xl p-5 grid grid-cols-2 sm:grid-cols-4 gap-4`}>
              {[
                { rot: "Quitado", val: `US$ ${fmt(fin.pago)}`, cor: "text-emerald-300" },
                { rot: "A pagar", val: `US$ ${fmt(fin.pendente)}`, cor: "text-orange-300" },
                { rot: "Total", val: `US$ ${fmt(total)}` },
                { rot: restante >= 0 ? "Folga" : "Acima do teto", val: `US$ ${fmt(Math.abs(restante))}`, cor: restante >= 0 ? "text-emerald-300" : "text-rose-300" },
              ].map((k, i) => (
                <div key={i}>
                  <div className="font-titulo text-[11px] uppercase tracking-[0.2em] text-[#fbebd9]/60 mb-1">{k.rot}</div>
                  <div className={`text-lg font-bold ${k.cor || ""}`}>{k.val}</div>
                </div>
              ))}
              <div className="col-span-2 sm:col-span-4">
                <div className="h-2 rounded-full bg-[#fbebd9]/10 overflow-hidden flex">
                  <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${pctPago}%` }} />
                  <div
                    className={`h-full transition-all duration-700 ${restante >= 0 ? "bg-orange-400/70" : "bg-rose-500"}`}
                    style={{ width: `${Math.max(0, pct - pctPago)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5 text-[10px] text-[#fbebd9]/50">
                  <span>Orçamento <Editavel valor={estado.orcamento} numero prefixo="US$ " onChange={(v) => setEstado((s) => ({ ...s, orcamento: v }))} /></span>
                  {fin.iof > 0 && <span className="text-rose-300/70">IOF embutido: US$ {fmt(fin.iof)}</span>}
                </div>
              </div>
            </div>

            {/* Resumo por status (retrátil) */}
            <div className={`${vidro} rounded-2xl p-6`}>
              <button
                onClick={() => setAbrirFin((v) => !v)}
                aria-expanded={abrirFin}
                className="w-full flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 rounded-lg"
              >
                <h2 className="font-titulo text-2xl font-medium tracking-wide">Situação financeira</h2>
                <div className="flex items-center gap-3 shrink-0">
                  {!abrirFin && (
                    <span className="text-sm tabular-nums">
                      <span className="text-emerald-300 font-bold">US$ {fmt(fin.pago)}</span>
                      <span className="text-[#fbebd9]/50 mx-1">·</span>
                      <span className="text-orange-300 font-bold">US$ {fmt(fin.pendente)}</span>
                    </span>
                  )}
                  <ChevronDown size={18} className={`text-[#fbebd9]/50 transition-transform duration-300 ${abrirFin ? "rotate-180" : ""}`} />
                </div>
              </button>

              {abrirFin && (
                <div className="mt-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
                {Object.entries(STATUS).map(([k, st]) => {
                  const c = CORES[st.cor];
                  const v = fin[k] || 0;
                  const n = lancamentos.filter((x) => x.l.status === k).length;
                  return (
                    <div key={k} className={`rounded-xl border p-3.5 ${c.bg} ${c.bd}`}>
                      <div className={`text-[10px] uppercase tracking-widest mb-1 ${c.txt}`}>{st.rot}</div>
                      <div className="text-xl font-bold tabular-nums">US$ {fmt(v)}</div>
                      <div className="text-[10px] text-[#fbebd9]/50 mt-0.5">{n} {n === 1 ? "item" : "itens"}</div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-4 border-t border-[#fbebd9]/15">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-emerald-300 font-semibold">Gasto alocado pago</span>
                  <span className="tabular-nums font-bold text-emerald-300">US$ {fmt(fin.pago)}</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-orange-300 font-semibold">Gasto alocado pendente</span>
                  <span className="tabular-nums font-bold text-orange-300">US$ {fmt(fin.pendente)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-[#fbebd9]/55 pl-3">
                  <span>· na fatura antes da viagem</span>
                  <span className="tabular-nums">US$ {fmt(fin.faturar)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-[#fbebd9]/55 pl-3">
                  <span>· a pagar na chegada</span>
                  <span className="tabular-nums">US$ {fmt(fin.chegada)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-[#fbebd9]/55 pl-3">
                  <span>· ainda sem reserva</span>
                  <span className="tabular-nums">US$ {fmt(fin.aberto)}</span>
                </div>
                {fin.iof > 0 && (
                  <div className="flex items-baseline justify-between text-xs text-rose-300/80 pt-2 border-t border-[#fbebd9]/10">
                    <span>IOF incluído nos valores acima</span>
                    <span className="tabular-nums">US$ {fmt(fin.iof)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-3 border-t border-[#fbebd9]/15">
                  <span className="text-sm uppercase tracking-widest text-[#fbebd9]/50">Total</span>
                  <span className="text-3xl font-black tabular-nums">US$ {fmt(total)}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-[#fbebd9]/10 flex items-center justify-between gap-3">
                <div className="text-xs text-[#fbebd9]/55">
                  Alíquota do IOF{" "}
                  <span className="font-bold text-[#fbebd9]/80">
                    <Editavel valor={estado.iof} numero onChange={(v) => setEstado((s) => ({ ...s, iof: v }))} />%
                  </span>
                </div>
                <div className="text-xs text-[#fbebd9]/50 text-right">
                  Passeios US$ {fmt(totalRoteiro)} · Hospedagem US$ {fmt(totalHosp)}
                </div>
              </div>
                </div>
              )}
            </div>

            {/* Câmbio (retrátil) */}
            <div className={`${vidro} rounded-2xl p-6`}>
              <button
                onClick={() => setAbrirCambio((v) => !v)}
                aria-expanded={abrirCambio}
                className="w-full flex items-center justify-between gap-3 focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 rounded-lg"
              >
                <h2 className="font-titulo text-2xl font-medium tracking-wide">Câmbio</h2>
                <div className="flex items-center gap-3 shrink-0">
                  {!abrirCambio && (
                    <span className="text-xs text-[#fbebd9]/55 tabular-nums hidden sm:inline">
                      R$ {fmt(1 / (estado.cambio.BRL || 1), 2)}/US$
                    </span>
                  )}
                  <ChevronDown size={18} className={`text-[#fbebd9]/50 transition-transform duration-300 ${abrirCambio ? "rotate-180" : ""}`} />
                </div>
              </button>

              {abrirCambio && (
                <div className="mt-4">
                  <div className="flex items-center justify-between gap-3 mb-4">
                    <p className="text-xs text-[#fbebd9]/55 leading-relaxed">
                      Quanto vale 1 unidade da moeda em dólar. Atualiza sozinho uma vez por dia; dá para ajustar à mão se estiver sem internet.
                    </p>
                    <button
                      onClick={() => buscarCambio(true)}
                      disabled={buscandoCambio}
                      className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-fuchsia-300 hover:text-fuchsia-200 px-2.5 py-1.5 rounded-lg hover:bg-[#fbebd9]/10 disabled:opacity-40 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                    >
                      <RefreshCw size={13} className={buscandoCambio ? "animate-spin" : ""} />
                      Atualizar agora
                    </button>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(MOEDAS).map(([cod, m]) => (
                      <div key={cod} className="rounded-xl bg-[#fbebd9]/[0.05] border border-[#fbebd9]/10 p-3">
                        <div className="text-[10px] uppercase tracking-widest text-fuchsia-300/70 mb-1">{cod} · {m.nome}</div>
                        {cod === "USD" ? (
                          <div className="text-sm font-semibold text-[#fbebd9]/50">1,00 (base)</div>
                        ) : (
                          <>
                            <div className="text-sm font-semibold tabular-nums">
                              <Editavel valor={estado.cambio[cod]} numero onChange={(v) => atualizarCambio(cod, v)} />
                            </div>
                            <div className="text-[10px] text-[#fbebd9]/50 mt-0.5 tabular-nums">
                              {fmt(1 / (estado.cambio[cod] || 1), 2)} por US$ 1
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 flex items-baseline justify-between gap-3 text-[11px] text-[#fbebd9]/55">
                    <span>
                      {estado.cambioAtualizadoEm
                        ? `Atualizado em ${new Date(estado.cambioAtualizadoEm).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                        : "Ainda não atualizado automaticamente"}
                    </span>
                    <a
                      href="https://www.exchangerate-api.com"
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-[#fbebd9]/60 transition-colors shrink-0"
                    >
                      Rates by Exchange Rate API
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Cronograma das faturas */}
            <div className={`${vidro} rounded-2xl p-6`}>
              <div className="flex items-center gap-2 mb-1">
                <CalendarClock size={16} className="text-orange-300 shrink-0" />
                <h2 className="font-titulo text-2xl font-medium tracking-wide">Cronograma das faturas</h2>
              </div>
              <p className="text-sm text-[#fbebd9]/50 mb-5">
                O que ainda vai vencer no cartão, mês a mês. Parcelamentos já aparecem divididos.
              </p>

              {faturas.lista.length === 0 && faturas.semMes === 0 && (
                <p className="text-sm text-[#fbebd9]/50 italic py-4 text-center">
                  Nada marcado como “cai na fatura” ainda.
                </p>
              )}

              <ul className="space-y-2">
                {faturas.lista.map((f) => (
                  <li key={f.mes} className="rounded-xl border border-[#fbebd9]/10 bg-[#fbebd9]/[0.04] overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[#fbebd9]/10">
                      <span className="text-sm font-bold uppercase tracking-wider text-orange-300">
                        {rotuloFatura(f.mes)}
                      </span>
                      <span className="text-base font-bold tabular-nums">US$ {fmtUSD(f.total)}</span>
                    </div>
                    <ul className="divide-y divide-[#fbebd9]/[0.06]">
                      {f.itens.map((it, i) => (
                        <li key={i} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                          <span className="min-w-0 truncate text-[#fbebd9]/80">
                            {it.rotulo}
                            {it.parcela && (
                              <span className="ml-2 text-[10px] font-bold text-orange-300/80">{it.parcela}</span>
                            )}
                          </span>
                          <span className="shrink-0 tabular-nums text-[#fbebd9]/70">US$ {fmtUSD(it.usd)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>

              {faturas.semMes > 0 && (
                <div className="mt-3 flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-orange-400/30 bg-orange-500/10">
                  <span className="text-sm text-orange-300">
                    Sem mês definido — defina em Lançamentos para entrar no cronograma
                  </span>
                  <span className="text-sm font-bold tabular-nums text-orange-300">US$ {fmtUSD(faturas.semMes)}</span>
                </div>
              )}

              {faturas.lista.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[#fbebd9]/10 flex items-baseline justify-between">
                  <span className="text-sm uppercase tracking-widest text-[#fbebd9]/50">Total nas faturas</span>
                  <span className="text-xl font-bold tabular-nums text-orange-300">
                    US$ {fmtUSD(faturas.lista.reduce((t, f) => t + f.total, 0) + faturas.semMes)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* LANÇAMENTOS */}
        {aba === "custos" && (
          <div className="space-y-3">
            {/* Fichas de custo */}
            <div className={`${vidro} rounded-2xl p-6`}>
              <h3 className="font-titulo text-lg font-medium tracking-wide mb-1">Fichas de custo</h3>
              <p className="text-sm text-[#fbebd9]/50 mb-5">
                Cada gasto é uma ficha atrelada a um dia. Os totais por dia aparecem no Roteiro.
              </p>

              {(estado.custos || []).length === 0 && (
                <p className="text-sm text-[#fbebd9]/50 italic py-4 text-center">
                  Nenhuma ficha ainda. Use o botão de um dos dias abaixo para começar.
                </p>
              )}

              <div className="space-y-5">
                {[...estado.roteiro, null].map((d) => {
                  const fichas = (estado.custos || []).filter((c) => (d ? c.diaId === d.id : !c.diaId || !estado.roteiro.some((x) => x.id === c.diaId)));
                  if (!d && fichas.length === 0) return null; /* "Sem dia" só aparece se tiver ficha */
                  const subtotal = fichas.reduce((s, c) => s + lancEmUSD(c, estado.cambio, estado.iof), 0);
                  return (
                    <section key={d ? d.id : "sem-dia"}>
                      <div className="flex items-center gap-3 mb-2">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="text-sm font-black shrink-0">
                            {d ? `Dia ${d.n}` : "Sem dia"}
                          </span>
                          {d && <span className="text-[11px] text-[#fbebd9]/55 shrink-0">{d.data}</span>}
                          {d && <span className="text-[11px] text-[#fbebd9]/55 truncate hidden sm:inline">· {d.titulo}</span>}
                        </div>
                        <div className="flex-1 border-t border-[#fbebd9]/10" />
                        {subtotal > 0 && (
                          <span className="text-xs font-bold text-pink-300 tabular-nums shrink-0">
                            US$ {fmtUSD(subtotal)}
                          </span>
                        )}
                        {d && (
                          <button
                            onClick={() => adicionarCusto(d.id)}
                            aria-label={`Nova ficha no dia ${d.n}`}
                            title="Nova ficha neste dia"
                            className="shrink-0 p-1.5 rounded-lg text-fuchsia-300/70 hover:text-fuchsia-200 hover:bg-[#fbebd9]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                          >
                            <Plus size={15} />
                          </button>
                        )}
                      </div>

                      {fichas.length === 0 ? (
                        <p className="text-xs text-[#fbebd9]/45 italic pl-1">Sem lançamentos.</p>
                      ) : (
                        <ul className="space-y-2.5">
                          {fichas.map((c) => {
                            const st = STATUS[c.status] || STATUS.aberto;
                            const cor = CORES[st.cor];
                            const usd = lancEmUSD(c, estado.cambio, estado.iof);
                            return (
                              <li key={c.id} className={`group rounded-xl border p-4 ${cor.bg} ${cor.bd}`}>
                                <div className="flex items-start gap-3 mb-3">
                                  <span className={`shrink-0 w-1.5 h-9 rounded-full mt-0.5 ${cor.solid}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[15px] font-semibold">
                                      <Editavel valor={c.nome} onChange={(v) => atualizarCusto(c.id, "nome", v)} />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1.5">
                                      <select
                                        value={c.diaId || ""}
                                        onChange={(e) => atualizarCusto(c.id, "diaId", e.target.value || null)}
                                        aria-label="Dia da viagem"
                                        className="text-[11px] font-semibold py-1 px-1.5 rounded-md bg-[#fbebd9]/10 text-[#fbebd9]/80 border-0 outline-none cursor-pointer focus:ring-2 focus:ring-fuchsia-300/70 [&>option]:bg-zinc-800"
                                      >
                                        <option value="">Sem dia</option>
                                        {estado.roteiro.map((x) => (
                                          <option key={x.id} value={x.id}>Dia {x.n} · {x.data}</option>
                                        ))}
                                      </select>
                                      <select
                                        value={c.moeda}
                                        onChange={(e) => atualizarCusto(c.id, "moeda", e.target.value)}
                                        aria-label="Moeda"
                                        className="text-[11px] font-bold py-1 px-1.5 rounded-md bg-[#fbebd9]/10 text-[#fbebd9]/80 border-0 outline-none cursor-pointer focus:ring-2 focus:ring-fuchsia-300/70 [&>option]:bg-zinc-800"
                                      >
                                        {Object.keys(MOEDAS).map((m) => <option key={m} value={m}>{m}</option>)}
                                      </select>
                                      <span className="text-sm font-semibold tabular-nums">
                                        <Editavel valor={c.valor} numero onChange={(v) => atualizarCusto(c.id, "valor", v)} />
                                      </span>
                                    </div>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <div className="text-base font-bold text-pink-300 tabular-nums">US$ {fmtUSD(usd)}</div>
                                    <button
                                      onClick={() => removerCusto(c.id)}
                                      aria-label="Excluir ficha"
                                      className="mt-1 p-1.5 rounded-lg text-[#fbebd9]/45 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-300 hover:bg-rose-500/15 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300/70"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                </div>
                                <Pagamento
                                  l={c}
                                  aliquota={estado.iof}
                                  compacto
                                  onChange={(campo, v) => atualizarCusto(c.id, campo, v)}
                                />
                                <div className="mt-2.5 pt-2.5 border-t border-[#fbebd9]/10">
                                  <Localizador
                                    codigo={c.localizador}
                                    link={c.link}
                                    onChange={(campo, v) => atualizarCusto(c.id, campo, v)}
                                  />
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>
                  );
                })}
              </div>
            </div>

            {/* Hospedagens no consolidado */}
            <div className={`${vidro} rounded-2xl p-6`}>
              <h3 className="font-titulo text-lg font-medium tracking-wide mb-1">Hospedagem no total</h3>
              <p className="text-sm text-[#fbebd9]/50 mb-4">
                As reservas ativas entram no consolidado. Edite os valores na aba Hospedagem.
              </p>
              <ul className="space-y-1.5">
                {lancamentos.filter((x) => x.origem === "hospedagem").map((x) => {
                  const st = STATUS[x.l.status] || STATUS.aberto;
                  const c = CORES[st.cor];
                  return (
                    <li key={x.chave}>
                      <button
                        onClick={() => setAba("hotel")}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-[#fbebd9]/10 hover:border-[#fbebd9]/25 hover:bg-[#fbebd9]/[0.06] transition-all text-left focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                      >
                        <span className={`shrink-0 w-1.5 h-8 rounded-full ${c.solid}`} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate text-[#fbebd9]/85">{x.rotulo}</span>
                          <span className={`text-[10px] uppercase tracking-wider ${c.txt}`}>
                            {st.curto} · {PAGAMENTOS[x.l.pagamento]?.rot || "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-[#fbebd9]/90">
                          US$ {fmtUSD(lancEmUSD(x.l, estado.cambio, estado.iof))}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-[#fbebd9]/55 leading-relaxed">
                Não inclui passagens aéreas. A hospedagem soma apenas as reservas ativas.
              </p>
              <button onClick={restaurar} className="mt-4 flex items-center gap-2 text-xs text-[#fbebd9]/55 hover:text-[#fbebd9]/80 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 rounded px-1">
                <RotateCcw size={12} /> Restaurar tudo ao original
              </button>
            </div>
          </div>
        )}

        {/* CHECKLIST */}
        {aba === "checklist" && (
          <div className={`${vidro} rounded-2xl p-6`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="font-titulo text-2xl font-medium tracking-wide">Antes de viajar</h2>
              <span className="text-sm text-[#fbebd9]/55 tabular-nums shrink-0">{feitos}/{estado.alertas.length}</span>
            </div>
            <p className="text-sm text-[#fbebd9]/50 mb-6">
              Clique no texto para editar. O sino marca as pendências críticas.
            </p>

            {estado.alertas.length === 0 && (
              <p className="text-sm text-[#fbebd9]/50 italic py-6 text-center">
                Nenhuma pendência. Use o botão abaixo para adicionar.
              </p>
            )}

            <ul className="space-y-2">
              {estado.alertas.map((a) => (
                <li
                  key={a.id}
                  className={`group flex items-start gap-3 p-4 rounded-xl border transition-all duration-300 ${
                    a.feito
                      ? "bg-emerald-500/10 border-emerald-400/30"
                      : a.critico
                      ? "bg-orange-500/10 border-orange-400/30"
                      : "bg-[#fbebd9]/[0.05] border-[#fbebd9]/15 hover:bg-[#fbebd9]/[0.09]"
                  }`}
                >
                  <button
                    onClick={() => alternarAlerta(a.id)}
                    aria-pressed={a.feito}
                    aria-label={a.feito ? "Desmarcar" : "Marcar como concluída"}
                    className={`shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
                      a.feito ? "bg-emerald-400 border-emerald-400" : "border-[#fbebd9]/35 hover:border-[#fbebd9]/70"
                    }`}
                  >
                    {a.feito && <Check size={13} className="text-[#0d0b14]" strokeWidth={3.5} />}
                  </button>

                  <div className={`flex-1 text-[15px] leading-relaxed ${a.feito ? "line-through text-[#fbebd9]/55" : "text-[#fbebd9]/85"}`}>
                    <Editavel valor={a.texto} multiline onChange={(v) => atualizarAlerta(a.id, "texto", v)} />
                  </div>

                  <button
                    onClick={() => atualizarAlerta(a.id, "critico", !a.critico)}
                    aria-pressed={a.critico}
                    aria-label={a.critico ? "Remover marcação de crítica" : "Marcar como crítica"}
                    title={a.critico ? "Crítica" : "Marcar como crítica"}
                    className={`shrink-0 p-1.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-orange-300/70 ${
                      a.critico
                        ? "text-orange-300 hover:bg-orange-500/15"
                        : "text-[#fbebd9]/45 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-orange-300 hover:bg-orange-500/15"
                    }`}
                  >
                    <AlertTriangle size={15} />
                  </button>

                  <button
                    onClick={() => removerAlerta(a.id)}
                    aria-label="Excluir pendência"
                    className="shrink-0 p-1.5 rounded-lg text-[#fbebd9]/45 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-300 hover:bg-rose-500/15 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300/70"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={adicionarAlerta}
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200 px-3 py-2 rounded-lg hover:bg-[#fbebd9]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
            >
              <Plus size={15} /> Adicionar pendência
            </button>
          </div>
        )}

        {/* HOSPEDAGEM */}
        {aba === "hotel" && (
          <div className="space-y-3">
            <div className={`${vidro} rounded-2xl p-5`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-titulo text-2xl font-medium tracking-wide mb-1">Hospedagem</h2>
                  <p className="text-sm text-[#fbebd9]/50">
                    Cada hotel é uma reserva própria, com suas noites e seu pagamento. Ative os que estão confirmados.
                  </p>
                </div>
                <button
                  onClick={adicionarBase}
                  className="shrink-0 flex items-center gap-1.5 text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200 px-2.5 py-1.5 rounded-lg hover:bg-[#fbebd9]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                >
                  <Plus size={14} /> Localidade
                </button>
              </div>
            </div>

            {estado.hospedagens.map((b) => {
              const ativos = (b.slots || []).filter((s) => s.ativo);
              const totalBase = ativos.reduce((t, sl) =>
                t + lancEmUSD({ ...(sl.lanc || {}), moeda: sl.moeda, valor: totalLocal(sl) }, estado.cambio, estado.iof), 0);
              const aberta = baseAberta[b.id] !== false;
              return (
                <div key={b.id} className={`${vidro} rounded-2xl p-5`}>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setBaseAberta((m) => ({ ...m, [b.id]: !aberta }))}
                      aria-expanded={aberta}
                      aria-label={aberta ? "Recolher" : "Expandir"}
                      className="shrink-0 p-1 rounded-lg hover:bg-[#fbebd9]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                    >
                      <ChevronDown size={18} className={`text-[#fbebd9]/50 transition-transform duration-300 ${aberta ? "rotate-180" : ""}`} />
                    </button>
                    <h3 className="font-titulo text-xl font-medium tracking-wide flex-1 min-w-0">
                      <Editavel valor={b.nome} onChange={(v) => atualizarBase(b.id, "nome", v)} />
                    </h3>
                    <div className="text-right shrink-0">
                      {totalBase > 0 && (
                        <div className="text-sm font-bold text-pink-300 tabular-nums">US$ {fmtUSD(totalBase)}</div>
                      )}
                      <div className="text-[10px] uppercase tracking-widest text-[#fbebd9]/50">
                        {ativos.length ? `${ativos.length} ${ativos.length === 1 ? "reserva" : "reservas"}` : "sem reserva"}
                      </div>
                    </div>
                    <button
                      onClick={() => { if (window.confirm(`Excluir a localidade "${b.nome}" e todos os seus hotéis?`)) removerBase(b.id); }}
                      aria-label="Excluir localidade"
                      className="shrink-0 p-1.5 rounded-lg text-[#fbebd9]/45 hover:text-rose-300 hover:bg-rose-500/15 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300/70"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>

                  {aberta && (
                    <div className="mt-4 space-y-3">
                      {(b.slots || []).map((sl) => {
                        const on = sl.ativo;
                        const local = totalLocal(sl);
                        const usd = lancEmUSD({ ...(sl.lanc || {}), moeda: sl.moeda, valor: local }, estado.cambio, estado.iof);
                        return (
                          <div
                            key={sl.id}
                            className={`group rounded-xl border p-4 transition-all duration-300 ${
                              on ? "bg-emerald-500/10 border-emerald-400/40" : "bg-[#fbebd9]/[0.05] border-[#fbebd9]/10"
                            }`}
                          >
                            <div className="flex items-start gap-3 mb-3">
                              <button
                                onClick={() => escolherSlot(b.id, sl.id)}
                                aria-pressed={on}
                                aria-label={on ? "Desativar reserva" : "Ativar reserva"}
                                title={on ? "Reserva ativa — soma no total" : "Ative para somar no total"}
                                className={`shrink-0 w-5 h-5 mt-1 rounded-md border-2 flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
                                  on ? "bg-emerald-400 border-emerald-400" : "border-[#fbebd9]/35 hover:border-[#fbebd9]/70"
                                }`}
                              >
                                {on && <Check size={13} className="text-[#0d0b14]" strokeWidth={3.5} />}
                              </button>

                              <div className="flex-1 min-w-0">
                                <div className="text-[15px] font-semibold">
                                  <Editavel
                                    valor={sl.hotel || "Nome do hotel"}
                                    onChange={(v) => atualizarSlot(b.id, sl.id, "hotel", v)}
                                    className={sl.hotel ? "" : "text-[#fbebd9]/50 italic"}
                                  />
                                </div>
                                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                  {["diaria", "fechado"].map((m) => (
                                    <button
                                      key={m}
                                      onClick={() => atualizarSlot(b.id, sl.id, "modo", m)}
                                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
                                        sl.modo === m ? "bg-[#fbebd9] text-[#0d0b14]" : "bg-[#fbebd9]/10 text-[#fbebd9]/50 hover:bg-[#fbebd9]/20"
                                      }`}
                                    >
                                      {m === "diaria" ? "Diária" : "Fechado"}
                                    </button>
                                  ))}
                                  <select
                                    value={sl.moeda}
                                    onChange={(e) => atualizarSlot(b.id, sl.id, "moeda", e.target.value)}
                                    aria-label="Moeda"
                                    className="text-[10px] font-bold uppercase py-1 px-1.5 rounded-md bg-[#fbebd9]/10 text-[#fbebd9]/80 border-0 outline-none cursor-pointer focus:ring-2 focus:ring-fuchsia-300/70 [&>option]:bg-zinc-800"
                                  >
                                    {Object.keys(MOEDAS).map((m) => <option key={m} value={m}>{m}</option>)}
                                  </select>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-base font-bold text-pink-300 tabular-nums">US$ {fmtUSD(usd)}</div>
                                <div className="text-[10px] text-[#fbebd9]/50 tabular-nums">{MOEDAS[sl.moeda].rot} {fmt(local)}</div>
                                <button
                                  onClick={() => removerSlot(b.id, sl.id)}
                                  aria-label="Excluir hotel"
                                  className="mt-1 p-1.5 rounded-lg text-[#fbebd9]/45 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-300 hover:bg-rose-500/15 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300/70"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </div>

                            <div className="grid sm:grid-cols-2 gap-3 mb-3">
                              <div className="space-y-1.5 text-sm">
                                {sl.modo === "diaria" ? (
                                  [["Diária", "diaria"], ["Noites", "noites"], ["Taxas", "taxas"]].map(([rot, campo]) => (
                                    <div key={campo} className="flex items-center justify-between gap-2">
                                      <span className="text-[#fbebd9]/55 text-xs">{rot}</span>
                                      <span className="tabular-nums font-semibold text-right">
                                        <Editavel valor={sl[campo]} numero onChange={(v) => atualizarSlot(b.id, sl.id, campo, v)} />
                                      </span>
                                    </div>
                                  ))
                                ) : (
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[#fbebd9]/55 text-xs">Valor total</span>
                                    <span className="tabular-nums font-semibold text-right">
                                      <Editavel valor={sl.fechado} numero onChange={(v) => atualizarSlot(b.id, sl.id, "fechado", v)} />
                                    </span>
                                  </div>
                                )}
                              </div>

                              <div>
                                <div className="text-[10px] uppercase tracking-widest text-[#fbebd9]/55 mb-1.5">
                                  Noites desta reserva
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  {estado.roteiro.map((d) => {
                                    const marcado = (sl.diasIds || []).includes(d.id);
                                    return (
                                      <button
                                        key={d.id}
                                        onClick={() => alternarDiaSlot(b.id, sl.id, d.id)}
                                        aria-pressed={marcado}
                                        title={`Dia ${d.n} · ${d.data}`}
                                        className={`w-7 h-7 rounded-lg text-[11px] font-bold transition-all focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70 ${
                                          marcado ? "bg-fuchsia-400 text-[#0d0b14]" : "bg-[#fbebd9]/[0.07] text-[#fbebd9]/55 hover:bg-[#fbebd9]/15"
                                        }`}
                                      >
                                        {d.n}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>

                            {on && (
                              <div className="pt-3 border-t border-[#fbebd9]/10 space-y-2.5">
                                <Pagamento
                                  l={{ ...(sl.lanc || {}), moeda: sl.moeda, valor: local }}
                                  aliquota={estado.iof}
                                  compacto
                                  onChange={(c, v) => atualizarLancSlot(b.id, sl.id, c, v)}
                                />
                                <Localizador
                                  codigo={sl.localizador}
                                  link={sl.link}
                                  onChange={(campo, v) => atualizarSlot(b.id, sl.id, campo, v)}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <button
                        onClick={() => adicionarSlot(b.id)}
                        className="flex items-center gap-2 text-sm font-semibold text-fuchsia-300 hover:text-fuchsia-200 px-3 py-2 rounded-lg hover:bg-[#fbebd9]/10 transition-colors focus:outline-none focus:ring-2 focus:ring-fuchsia-300/70"
                      >
                        <Plus size={15} /> Adicionar hotel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <footer className="mt-8 text-center text-[11px] text-[#fbebd9]/50">
          {configurado
            ? `Sincronizado na nuvem · ${ID_VIAGEM}`
            : "Salvo apenas neste navegador — configure a sincronização para usar em outros aparelhos."}
        </footer>
        </div>
      </div>
    </div>
  );
}
