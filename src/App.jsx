import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mountain, Wallet, ListChecks, CalendarDays, MapPin, Clock,
  Check, Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  BedDouble, Pencil, RotateCcw, Ship, Utensils, Car, Footprints,
  Cloud, CloudOff, RefreshCw,
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
  pago:      { rot: "Pago",           curto: "Pago",      cor: "emerald", desc: "Fatura já quitada" },
  faturar:   { rot: "Cai na fatura",  curto: "Fatura",    cor: "amber",   desc: "Reservado, cobrança antes da viagem" },
  chegada:   { rot: "Pago na chegada",curto: "Chegada",   cor: "sky",     desc: "Reservado, paga no local" },
  aberto:    { rot: "Não reservado",  curto: "Aberto",    cor: "slate",   desc: "Ainda sem reserva" },
};

const PAGAMENTOS = {
  credito: { rot: "Crédito", iof: true },
  especie: { rot: "Espécie", iof: false },
  debito:  { rot: "Débito/Global", iof: true },
};

const CORES = {
  emerald: { txt: "text-emerald-300", bg: "bg-emerald-500/10", bd: "border-emerald-400/30", solid: "bg-emerald-400" },
  amber:   { txt: "text-amber-300",   bg: "bg-amber-500/10",   bd: "border-amber-400/30",   solid: "bg-amber-400" },
  sky:     { txt: "text-sky-300",     bg: "bg-sky-500/10",     bd: "border-sky-400/30",     solid: "bg-sky-400" },
  slate:   { txt: "text-white/50",    bg: "bg-white/5",        bd: "border-white/15",       solid: "bg-white/40" },
};

/* Lançamento padrão. Todo custo — de dia ou de hotel — vira um destes. */
const lanc = (valor = 0) => ({
  status: "aberto", pagamento: "credito", moeda: "USD", iofIsento: false, valor,
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
const hosp = (id, nome) => ({
  id, nome, escolhido: null,
  slots: [
    { id: `${id}-s1`, hotel: "", modo: "diaria", moeda: "USD", diaria: 0, noites: 0, taxas: 0, fechado: 0 },
    { id: `${id}-s2`, hotel: "", modo: "diaria", moeda: "USD", diaria: 0, noites: 0, taxas: 0, fechado: 0 },
    { id: `${id}-s3`, hotel: "", modo: "diaria", moeda: "USD", diaria: 0, noites: 0, taxas: 0, fechado: 0 },
  ],
});

const HOSPEDAGENS_INICIAIS = [
  { ...hosp("h1", "El Calafate"), noites: "Dias 1–2, 9–11" },
  { ...hosp("h2", "El Chaltén"), noites: "Dias 3–5" },
  { ...hosp("h3", "Torres del Paine"), noites: "Dias 6–7" },
  { ...hosp("h4", "Puerto Natales"), noites: "Dias 8–9" },
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
};

/* Converte dados salvos no formato antigo (custo solto por dia, hospedagem
   sem status) para a estrutura nova. Roda a cada carga — é idempotente. */
function migrar(bruto) {
  const e = { ...ESTADO_INICIAL, ...(bruto || {}) };

  e.roteiro = (e.roteiro || []).map((d) => {
    if (d.lanc) return d;
    return { ...d, lanc: { ...lanc(Number(d.custo) || 0) } };
  });

  e.hospedagens = (e.hospedagens || []).map((b) => ({
    ...b,
    slots: (b.slots || []).map((s) => ({
      ...s,
      lanc: {
        status: "aberto",
        pagamento: "credito",
        iofIsento: false,
        ...(s.lanc || {}),
      },
    })),
  }));

  if (typeof e.iof !== "number") e.iof = IOF_PADRAO;
  return e;
}
const CHAVE = "patagonia-dez-2026";

/* Fundos cênicos em rotação. Troque por fotos suas colocando os arquivos
   em public/fundos/ e usando caminhos como "/fundos/fitzroy.jpg". */
const FUNDOS = [
  "https://images.unsplash.com/photo-1531572753322-ad063cecc140?auto=format&fit=crop&w=2400&q=80",
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

/* ─────────────────────────  CAMPO EDITÁVEL  ───────────────────────── */

function Editavel({ valor, onChange, className = "", numero = false, prefixo = "", multiline = false }) {
  const [editando, setEditando] = useState(false);
  const [rascunho, setRascunho] = useState(String(valor));
  const ref = useRef(null);

  useEffect(() => { setRascunho(String(valor)); }, [valor]);
  useEffect(() => { if (editando && ref.current) { ref.current.focus(); ref.current.select?.(); } }, [editando]);

  const salvar = () => {
    setEditando(false);
    onChange(numero ? (parseFloat(String(rascunho).replace(",", ".")) || 0) : rascunho);
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
        className={`${className} w-full bg-white/15 border border-cyan-300/60 rounded-md px-2 py-1 outline-none resize-none text-white placeholder-white/40`}
      />
    );
  }

  return (
    <span
      onClick={() => setEditando(true)}
      tabIndex={0}
      role="button"
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditando(true); } }}
      className={`${className} group/ed inline-flex items-start gap-1.5 cursor-text rounded-md px-1 -mx-1 transition-colors hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/70`}
      title="Clique para editar"
    >
      {prefixo}{valor}
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
              className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                on ? `${c.bg} ${c.bd} ${c.txt}` : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
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
            className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
              dado.pagamento === k ? "bg-white/20 text-white" : "bg-white/5 text-white/40 hover:bg-white/10"
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
            className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
              temIOF ? "bg-rose-500/15 text-rose-300" : "bg-white/5 text-white/30 line-through"
            }`}
          >
            IOF
          </button>
        )}
      </div>

      {temIOF && iof > 0 && (
        <div className="text-[11px] text-rose-300/80 tabular-nums">
          + {MOEDAS[dado.moeda]?.rot || ""} {fmt(iof, 2)} de IOF ({aliquota}%)
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────  APP  ───────────────────────── */

export default function App() {
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const [carregado, setCarregado] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [aba, setAba] = useState("roteiro");
  const [fundo, setFundo] = useState(0);
  const [sinc, setSinc] = useState(configurado ? "carregando" : "local");
  const [erroSinc, setErroSinc] = useState("");

  /* Evita que a gravação dispare por mudanças vindas da própria nuvem */
  const ignorarProximo = useRef(false);
  const primeiroSalvamento = useRef(true);

  useEffect(() => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) return;
    const t = setInterval(() => setFundo((i) => (i + 1) % FUNDOS.length), INTERVALO_FUNDO);
    return () => clearInterval(t);
  }, []);

  /* 1. Cache local primeiro — app abre instantâneo, funciona sem sinal */
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE);
      if (salvo) setEstado(migrar(JSON.parse(salvo)));
    } catch (e) { /* começa do zero */ }
    setCarregado(true);
  }, []);

  /* 2. Depois busca a nuvem e sobrepõe */
  useEffect(() => {
    if (!carregado || !configurado) return;
    let vivo = true;

    (async () => {
      try {
        const remoto = await carregarNuvem();
        if (!vivo) return;
        if (remoto?.dados) {
          ignorarProximo.current = true;
          setEstado(migrar(remoto.dados));
        }
        setSinc("ok");
      } catch (e) {
        if (!vivo) return;
        setErroSinc(e.message || "falha ao conectar");
        setSinc("erro");
      }
    })();

    return () => { vivo = false; };
  }, [carregado]);

  /* 3. Escuta alterações feitas em outros aparelhos */
  useEffect(() => {
    if (!carregado || !configurado) return;
    return ouvirNuvem(({ dados }) => {
      ignorarProximo.current = true;
      setEstado(migrar(dados));
    });
  }, [carregado]);

  /* 4. Grava: local na hora, nuvem com atraso para não spammar */
  useEffect(() => {
    if (!carregado) return;
    try { window.localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* sem cache */ }

    if (!configurado) return;

    if (ignorarProximo.current) { ignorarProximo.current = false; return; }
    if (primeiroSalvamento.current) { primeiroSalvamento.current = false; return; }

    setSinc("salvando");
    const t = setTimeout(async () => {
      try {
        await salvarNuvem(estado);
        setSinc("ok");
        setErroSinc("");
      } catch (e) {
        setErroSinc(e.message || "falha ao salvar");
        setSinc("erro");
      }
    }, 1200);

    return () => clearTimeout(t);
  }, [estado, carregado]);

  /* Junta todos os custos — dias e hospedagens — numa lista só */
  const lancamentos = useMemo(() => {
    const out = [];
    (estado.roteiro || []).forEach((d) => {
      if (!d.lanc) return;
      out.push({ chave: `dia-${d.id}`, rotulo: `Dia ${d.n} · ${d.titulo}`, l: d.lanc, origem: "roteiro", ref: d });
    });
    (estado.hospedagens || []).forEach((b) => {
      const slot = b.slots.find((s) => s.id === b.escolhido);
      if (!slot) return;
      const l = { ...(slot.lanc || {}), moeda: slot.moeda, valor: totalLocal(slot) };
      out.push({ chave: `hosp-${b.id}`, rotulo: `${b.nome} · ${slot.hotel || "hotel"}`, l, origem: "hospedagem", ref: b });
    });
    return out;
  }, [estado.roteiro, estado.hospedagens]);

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

  const totalRoteiro = useMemo(
    () => (estado.roteiro || []).reduce((s, d) => s + lancEmUSD(d.lanc, estado.cambio, estado.iof), 0),
    [estado.roteiro, estado.cambio, estado.iof]
  );

  const totalHosp = useMemo(
    () => (estado.hospedagens || []).reduce((s, b) => {
      const slot = b.slots.find((x) => x.id === b.escolhido);
      if (!slot) return s;
      return s + lancEmUSD({ ...(slot.lanc || {}), moeda: slot.moeda, valor: totalLocal(slot) }, estado.cambio, estado.iof);
    }, 0),
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
      : { ...b, escolhido: b.escolhido === slotId ? null : slotId }) }));

  const atualizarCambio = (moeda, valor) =>
    setEstado((s) => ({ ...s, cambio: { ...s.cambio, [moeda]: valor } }));

  const atualizarLancDia = (diaId, campo, valor) =>
    setEstado((s) => ({ ...s, roteiro: s.roteiro.map((d) => d.id !== diaId ? d
      : { ...d, lanc: { ...(d.lanc || lanc()), [campo]: valor } }) }));

  const atualizarLancSlot = (baseId, slotId, campo, valor) =>
    setEstado((s) => ({ ...s, hospedagens: s.hospedagens.map((b) => b.id !== baseId ? b
      : { ...b, slots: b.slots.map((sl) => sl.id !== slotId ? sl
          : { ...sl, lanc: { ...(sl.lanc || {}), [campo]: valor } }) }) }));

  const restaurar = () => {
    if (window.confirm("Restaurar tudo ao estado original? Roteiro, hospedagens e checklist serão zerados.")) setEstado(ESTADO_INICIAL);
  };

  const vidro = "backdrop-blur-2xl bg-white/[0.07] border border-white/15 shadow-[0_8px_40px_rgba(0,0,0,0.45)]";

  return (
    <div className="relative min-h-screen w-full font-sans text-white overflow-x-hidden">
      {/* Fundos cênicos em crossfade */}
      {FUNDOS.map((url, i) => (
        <div
          key={url}
          aria-hidden="true"
          className="fixed inset-0 bg-cover bg-center transition-opacity duration-[2500ms] ease-in-out"
          style={{ backgroundImage: `url('${url}')`, opacity: i === fundo ? 1 : 0 }}
        />
      ))}
      <div className="fixed inset-0 bg-gradient-to-b from-slate-950/80 via-slate-900/70 to-slate-950/90" />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* Cabeçalho */}
        <header className="mb-6">
          <div className="flex items-center justify-between gap-3 mb-2">
            <div className="flex items-center gap-2 text-cyan-300/90 text-[11px] font-semibold tracking-[0.25em] uppercase">
              <Mountain size={14} /> 06 – 17 de dezembro
            </div>
            <div
              title={
                sinc === "erro" ? `Erro: ${erroSinc}`
                : sinc === "local" ? "Sincronização não configurada — salvo apenas neste navegador"
                : "Sincronizado entre seus aparelhos"
              }
              className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border shrink-0 ${
                sinc === "ok" ? "text-emerald-300 border-emerald-400/30 bg-emerald-500/10"
                : sinc === "erro" ? "text-rose-300 border-rose-400/30 bg-rose-500/10"
                : sinc === "local" ? "text-white/40 border-white/15 bg-white/5"
                : "text-cyan-300 border-cyan-400/30 bg-cyan-500/10"
              }`}
            >
              {sinc === "ok" && <><Cloud size={12} /> Sincronizado</>}
              {sinc === "salvando" && <><RefreshCw size={12} className="animate-spin" /> Salvando</>}
              {sinc === "carregando" && <><RefreshCw size={12} className="animate-spin" /> Carregando</>}
              {sinc === "erro" && <><CloudOff size={12} /> Sem conexão</>}
              {sinc === "local" && <><CloudOff size={12} /> Só neste aparelho</>}
            </div>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none">Patagônia</h1>
          <p className="mt-2 text-white/60 text-sm">2 adultos + 1 criança · 12 dias · Argentina e Chile</p>
        </header>

        {/* Resumo */}
        <div className={`${vidro} rounded-2xl p-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4`}>
          {[
            { rot: "Já pago", val: `US$ ${fmt(fin.pago)}`, cor: "text-emerald-300" },
            { rot: "A pagar", val: `US$ ${fmt(fin.pendente)}`, cor: "text-amber-300" },
            { rot: "Total", val: `US$ ${fmt(total)}` },
            { rot: restante >= 0 ? "Folga" : "Acima do teto", val: `US$ ${fmt(Math.abs(restante))}`, cor: restante >= 0 ? "text-emerald-300" : "text-rose-300" },
          ].map((k, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-widest text-white/45 mb-1">{k.rot}</div>
              <div className={`text-lg font-bold ${k.cor || ""}`}>{k.val}</div>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden flex">
              <div className="h-full bg-emerald-400 transition-all duration-700" style={{ width: `${pctPago}%` }} />
              <div
                className={`h-full transition-all duration-700 ${restante >= 0 ? "bg-amber-400/70" : "bg-rose-500"}`}
                style={{ width: `${Math.max(0, pct - pctPago)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1.5 text-[10px] text-white/40">
              <span>Orçamento <Editavel valor={estado.orcamento} numero prefixo="US$ " onChange={(v) => setEstado((s) => ({ ...s, orcamento: v }))} /></span>
              {fin.iof > 0 && <span className="text-rose-300/70">IOF embutido: US$ {fmt(fin.iof)}</span>}
            </div>
          </div>
        </div>

        {/* Abas */}
        <nav className={`${vidro} rounded-xl p-1.5 mb-6 flex gap-1.5`}>
          {[
            { id: "roteiro", rot: "Roteiro", Icone: CalendarDays },
            { id: "custos", rot: "Custos", Icone: Wallet },
            { id: "checklist", rot: "Checklist", Icone: ListChecks },
            { id: "hotel", rot: "Hospedagem", Icone: BedDouble },
          ].map(({ id, rot, Icone }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                aba === id ? "bg-white text-slate-900 shadow-lg" : "text-white/65 hover:bg-white/10"
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
                  className={`shrink-0 w-16 py-2.5 rounded-xl border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                    i === ativo
                      ? "bg-white text-slate-900 border-white -translate-y-1 shadow-xl"
                      : "bg-white/[0.07] border-white/15 text-white/70 hover:bg-white/15 hover:-translate-y-0.5"
                  }`}
                >
                  <div className="text-[9px] uppercase tracking-widest opacity-60">Dia</div>
                  <div className="text-xl font-black leading-none">{d.n}</div>
                  <div className="text-[9px] opacity-60 mt-0.5">{d.data}</div>
                </button>
              ))}
            </div>

            <article className={`${vidro} rounded-2xl p-6`}>
              <div className="flex items-start justify-between gap-4 mb-1">
                <div className="flex items-center gap-2 text-cyan-300 text-[11px] font-bold uppercase tracking-[0.2em]">
                  <MapPin size={13} /> <Editavel valor={dia.base} onChange={(v) => atualizarDia(dia.id, "base", v)} />
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-widest text-white/45">Custo do dia</div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <div className="text-xl font-bold text-emerald-300">
                      <Editavel valor={dia.lanc?.valor ?? 0} numero onChange={(v) => atualizarLancDia(dia.id, "valor", v)} />
                    </div>
                    <select
                      value={dia.lanc?.moeda || "USD"}
                      onChange={(e) => atualizarLancDia(dia.id, "moeda", e.target.value)}
                      aria-label="Moeda do dia"
                      className="text-[10px] font-bold py-1 px-1 rounded-md bg-white/10 text-white/80 border-0 outline-none cursor-pointer focus:ring-2 focus:ring-cyan-300/70 [&>option]:bg-slate-800"
                    >
                      {Object.keys(MOEDAS).map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  {dia.lanc?.moeda !== "USD" && (
                    <div className="text-[11px] text-white/40 tabular-nums mt-0.5">
                      ≈ US$ {fmt(lancEmUSD(dia.lanc, estado.cambio, estado.iof))}
                    </div>
                  )}
                </div>
              </div>

              <div className="mb-4 pb-4 border-b border-white/10">
                <Pagamento
                  l={dia.lanc}
                  aliquota={estado.iof}
                  onChange={(c, v) => atualizarLancDia(dia.id, c, v)}
                />
              </div>

              <h2 className="text-2xl font-bold mb-1 leading-snug">
                <Editavel valor={dia.titulo} multiline onChange={(v) => atualizarDia(dia.id, "titulo", v)} />
              </h2>
              <p className="text-sm text-white/50 mb-6">
                <Editavel valor={dia.nota} onChange={(v) => atualizarDia(dia.id, "nota", v)} />
              </p>

              <ul className="space-y-2.5">
                {dia.atividades.map((a) => {
                  const Icone = ic[a.tipo] || MapPin;
                  return (
                    <li
                      key={a.id}
                      className="group flex gap-4 items-start rounded-xl border border-white/10 bg-white/[0.05] p-4 transition-all duration-300 hover:bg-white/[0.12] hover:-translate-y-0.5 hover:shadow-[0_10px_30px_rgba(0,0,0,0.4)]"
                    >
                      <div className="shrink-0 flex flex-col items-center gap-2 w-14">
                        <span className="flex items-center gap-1 text-sm font-bold tabular-nums text-cyan-200">
                          <Clock size={11} className="opacity-50" />
                        </span>
                        <Editavel valor={a.hora} className="text-sm font-bold tabular-nums text-cyan-200 -mt-7 pl-4"
                          onChange={(v) => atualizarAtiv(dia.id, a.id, "hora", v)} />
                        <Icone size={15} className="text-white/35" />
                      </div>
                      <p className="flex-1 text-[15px] leading-relaxed text-white/85 pt-0.5">
                        <Editavel valor={a.texto} multiline onChange={(v) => atualizarAtiv(dia.id, a.id, "texto", v)} />
                      </p>
                      <button
                        onClick={() => removerAtiv(dia.id, a.id)}
                        aria-label="Remover atividade"
                        className="shrink-0 p-1.5 rounded-lg text-white/25 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-300 hover:bg-rose-500/15 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300/70"
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
                  className="flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                >
                  <Plus size={15} /> Adicionar atividade
                </button>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => setAtivo((i) => Math.max(0, i - 1))}
                    disabled={ativo === 0}
                    aria-label="Dia anterior"
                    className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    onClick={() => setAtivo((i) => Math.min(estado.roteiro.length - 1, i + 1))}
                    disabled={ativo === estado.roteiro.length - 1}
                    aria-label="Próximo dia"
                    className="p-2.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-25 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </article>
          </div>
        )}

        {/* CUSTOS */}
        {aba === "custos" && (
          <div className="space-y-3">
            {/* Resumo por status */}
            <div className={`${vidro} rounded-2xl p-6`}>
              <h2 className="text-xl font-bold mb-4">Situação financeira</h2>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 mb-5">
                {Object.entries(STATUS).map(([k, st]) => {
                  const c = CORES[st.cor];
                  const v = fin[k] || 0;
                  const n = lancamentos.filter((x) => x.l.status === k).length;
                  return (
                    <div key={k} className={`rounded-xl border p-3.5 ${c.bg} ${c.bd}`}>
                      <div className={`text-[10px] uppercase tracking-widest mb-1 ${c.txt}`}>{st.rot}</div>
                      <div className="text-xl font-bold tabular-nums">US$ {fmt(v)}</div>
                      <div className="text-[10px] text-white/35 mt-0.5">{n} {n === 1 ? "item" : "itens"}</div>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2 pt-4 border-t border-white/15">
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-emerald-300 font-semibold">Gasto alocado pago</span>
                  <span className="tabular-nums font-bold text-emerald-300">US$ {fmt(fin.pago)}</span>
                </div>
                <div className="flex items-baseline justify-between text-sm">
                  <span className="text-amber-300 font-semibold">Gasto alocado pendente</span>
                  <span className="tabular-nums font-bold text-amber-300">US$ {fmt(fin.pendente)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-white/40 pl-3">
                  <span>· na fatura antes da viagem</span>
                  <span className="tabular-nums">US$ {fmt(fin.faturar)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-white/40 pl-3">
                  <span>· a pagar na chegada</span>
                  <span className="tabular-nums">US$ {fmt(fin.chegada)}</span>
                </div>
                <div className="flex items-baseline justify-between text-xs text-white/40 pl-3">
                  <span>· ainda sem reserva</span>
                  <span className="tabular-nums">US$ {fmt(fin.aberto)}</span>
                </div>
                {fin.iof > 0 && (
                  <div className="flex items-baseline justify-between text-xs text-rose-300/80 pt-2 border-t border-white/10">
                    <span>IOF incluído nos valores acima</span>
                    <span className="tabular-nums">US$ {fmt(fin.iof)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between pt-3 border-t border-white/15">
                  <span className="text-sm uppercase tracking-widest text-white/50">Total</span>
                  <span className="text-3xl font-black tabular-nums">US$ {fmt(total)}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/10 flex items-center justify-between gap-3">
                <div className="text-xs text-white/45">
                  Alíquota do IOF{" "}
                  <span className="font-bold text-white/80">
                    <Editavel valor={estado.iof} numero onChange={(v) => setEstado((s) => ({ ...s, iof: v }))} />%
                  </span>
                </div>
                <div className="text-xs text-white/35 text-right">
                  Passeios US$ {fmt(totalRoteiro)} · Hospedagem US$ {fmt(totalHosp)}
                </div>
              </div>
            </div>

            {/* Lista de lançamentos */}
            <div className={`${vidro} rounded-2xl p-6`}>
              <h3 className="text-base font-bold mb-1">Lançamentos</h3>
              <p className="text-sm text-white/50 mb-5">
                Cada dia e cada hotel escolhido. Clique para abrir e ajustar.
              </p>
              <ul className="space-y-1.5">
                {lancamentos.map((x) => {
                  const st = STATUS[x.l.status] || STATUS.aberto;
                  const c = CORES[st.cor];
                  const usd = lancEmUSD(x.l, estado.cambio, estado.iof);
                  const i = estado.roteiro.findIndex((d) => `dia-${d.id}` === x.chave);
                  return (
                    <li key={x.chave}>
                      <button
                        onClick={() => { if (i >= 0) { setAba("roteiro"); setAtivo(i); } else setAba("hotel"); }}
                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 hover:border-white/25 hover:bg-white/[0.06] transition-all text-left focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                      >
                        <span className={`shrink-0 w-1.5 h-8 rounded-full ${c.solid}`} />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm truncate text-white/85">{x.rotulo}</span>
                          <span className={`text-[10px] uppercase tracking-wider ${c.txt}`}>
                            {st.curto} · {PAGAMENTOS[x.l.pagamento]?.rot || "—"}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-bold tabular-nums text-white/90">
                          US$ {fmt(usd)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 text-xs text-white/40 leading-relaxed">
                Não inclui passagens aéreas. A hospedagem soma apenas as opções marcadas como escolhidas.
              </p>
              <button onClick={restaurar} className="mt-4 flex items-center gap-2 text-xs text-white/40 hover:text-white/80 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300/70 rounded px-1">
                <RotateCcw size={12} /> Restaurar tudo ao original
              </button>
            </div>
          </div>
        )}

        {/* CHECKLIST */}
        {aba === "checklist" && (
          <div className={`${vidro} rounded-2xl p-6`}>
            <div className="flex items-baseline justify-between gap-3 mb-1">
              <h2 className="text-xl font-bold">Antes de viajar</h2>
              <span className="text-sm text-white/45 tabular-nums shrink-0">{feitos}/{estado.alertas.length}</span>
            </div>
            <p className="text-sm text-white/50 mb-6">
              Clique no texto para editar. O sino marca as pendências críticas.
            </p>

            {estado.alertas.length === 0 && (
              <p className="text-sm text-white/30 italic py-6 text-center">
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
                      ? "bg-amber-500/10 border-amber-400/30"
                      : "bg-white/[0.05] border-white/15 hover:bg-white/[0.09]"
                  }`}
                >
                  <button
                    onClick={() => alternarAlerta(a.id)}
                    aria-pressed={a.feito}
                    aria-label={a.feito ? "Desmarcar" : "Marcar como concluída"}
                    className={`shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                      a.feito ? "bg-emerald-400 border-emerald-400" : "border-white/35 hover:border-white/70"
                    }`}
                  >
                    {a.feito && <Check size={13} className="text-slate-900" strokeWidth={3.5} />}
                  </button>

                  <div className={`flex-1 text-[15px] leading-relaxed ${a.feito ? "line-through text-white/35" : "text-white/85"}`}>
                    <Editavel valor={a.texto} multiline onChange={(v) => atualizarAlerta(a.id, "texto", v)} />
                  </div>

                  <button
                    onClick={() => atualizarAlerta(a.id, "critico", !a.critico)}
                    aria-pressed={a.critico}
                    aria-label={a.critico ? "Remover marcação de crítica" : "Marcar como crítica"}
                    title={a.critico ? "Crítica" : "Marcar como crítica"}
                    className={`shrink-0 p-1.5 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-amber-300/70 ${
                      a.critico
                        ? "text-amber-300 hover:bg-amber-500/15"
                        : "text-white/25 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-amber-300 hover:bg-amber-500/15"
                    }`}
                  >
                    <AlertTriangle size={15} />
                  </button>

                  <button
                    onClick={() => removerAlerta(a.id)}
                    aria-label="Excluir pendência"
                    className="shrink-0 p-1.5 rounded-lg text-white/25 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-rose-300 hover:bg-rose-500/15 transition-all focus:outline-none focus:ring-2 focus:ring-rose-300/70"
                  >
                    <Trash2 size={15} />
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={adicionarAlerta}
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-cyan-300 hover:text-cyan-200 px-3 py-2 rounded-lg hover:bg-white/10 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
            >
              <Plus size={15} /> Adicionar pendência
            </button>
          </div>
        )}

        {/* HOSPEDAGEM */}
        {aba === "hotel" && (
          <div className="space-y-3">
            <div className={`${vidro} rounded-2xl p-5`}>
              <h2 className="text-xl font-bold mb-1">Hospedagem</h2>
              <p className="text-sm text-white/50">
                Preencha até três opções por base e marque a escolhida — só ela entra no total da viagem.
              </p>
            </div>

            {estado.hospedagens.map((b) => {
              const escolhido = b.slots.find((s) => s.id === b.escolhido);
              return (
                <div key={b.id} className={`${vidro} rounded-2xl p-5`}>
                  <div className="flex items-baseline justify-between mb-4 gap-3">
                    <h3 className="text-lg font-bold">{b.nome}</h3>
                    <div className="text-right">
                      <span className="text-[11px] uppercase tracking-widest text-white/45">{b.noites}</span>
                      {escolhido && (
                        <div className="text-sm font-bold text-emerald-300 tabular-nums">
                          US$ {fmt(lancEmUSD({ ...(escolhido.lanc || {}), moeda: escolhido.moeda, valor: totalLocal(escolhido) }, estado.cambio, estado.iof))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid lg:grid-cols-3 gap-3">
                    {b.slots.map((sl, i) => {
                      const ativo = b.escolhido === sl.id;
                      const local = totalLocal(sl);
                      return (
                        <div
                          key={sl.id}
                          className={`rounded-xl border p-3.5 transition-all duration-300 ${
                            ativo ? "bg-emerald-500/10 border-emerald-400/40" : "bg-white/[0.05] border-white/10 hover:bg-white/[0.09]"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-[10px] uppercase tracking-widest text-cyan-300/70">Opção {i + 1}</span>
                            <button
                              onClick={() => escolherSlot(b.id, sl.id)}
                              aria-pressed={ativo}
                              className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                                ativo ? "bg-emerald-400 text-slate-900" : "bg-white/10 text-white/50 hover:bg-white/20"
                              }`}
                            >
                              {ativo && <Check size={11} strokeWidth={3.5} />}
                              {ativo ? "Escolhido" : "Escolher"}
                            </button>
                          </div>

                          <div className="text-[15px] font-semibold mb-3 min-h-[24px]">
                            <Editavel
                              valor={sl.hotel || "Nome do hotel"}
                              onChange={(v) => atualizarSlot(b.id, sl.id, "hotel", v)}
                              className={sl.hotel ? "" : "text-white/30 italic"}
                            />
                          </div>

                          <div className="flex gap-1.5 mb-3">
                            {["diaria", "fechado"].map((m) => (
                              <button
                                key={m}
                                onClick={() => atualizarSlot(b.id, sl.id, "modo", m)}
                                className={`flex-1 text-[10px] font-bold uppercase tracking-wider py-1.5 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                                  sl.modo === m ? "bg-white text-slate-900" : "bg-white/10 text-white/50 hover:bg-white/20"
                                }`}
                              >
                                {m === "diaria" ? "Diária" : "Fechado"}
                              </button>
                            ))}
                            <select
                              value={sl.moeda}
                              onChange={(e) => atualizarSlot(b.id, sl.id, "moeda", e.target.value)}
                              aria-label="Moeda"
                              className="text-[10px] font-bold uppercase tracking-wider py-1.5 px-1.5 rounded-md bg-white/10 text-white/80 border-0 outline-none cursor-pointer focus:ring-2 focus:ring-cyan-300/70 [&>option]:bg-slate-800"
                            >
                              {Object.keys(MOEDAS).map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                          </div>

                          <div className="space-y-1.5 text-sm">
                            {sl.modo === "diaria" ? (
                              <>
                                {[["Diária", "diaria"], ["Noites", "noites"], ["Taxas", "taxas"]].map(([rot, campo]) => (
                                  <div key={campo} className="flex items-center justify-between gap-2">
                                    <span className="text-white/45 text-xs">{rot}</span>
                                    <span className="tabular-nums font-semibold text-right">
                                      <Editavel valor={sl[campo]} numero onChange={(v) => atualizarSlot(b.id, sl.id, campo, v)} />
                                    </span>
                                  </div>
                                ))}
                              </>
                            ) : (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-white/45 text-xs">Valor total</span>
                                <span className="tabular-nums font-semibold text-right">
                                  <Editavel valor={sl.fechado} numero onChange={(v) => atualizarSlot(b.id, sl.id, "fechado", v)} />
                                </span>
                              </div>
                            )}
                          </div>

                          <div className="mt-3 pt-2.5 border-t border-white/10">
                            <div className="flex items-baseline justify-between mb-2">
                              <span className="text-xs text-white/45">{MOEDAS[sl.moeda].rot} {fmt(local, 0)}</span>
                              <span className="text-base font-bold text-emerald-300 tabular-nums">
                                US$ {fmt(lancEmUSD({ ...(sl.lanc || {}), moeda: sl.moeda, valor: local }, estado.cambio, estado.iof))}
                              </span>
                            </div>
                            {ativo && (
                              <Pagamento
                                l={{ ...(sl.lanc || {}), moeda: sl.moeda, valor: local }}
                                aliquota={estado.iof}
                                compacto
                                onChange={(c, v) => atualizarLancSlot(b.id, sl.id, c, v)}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Câmbio */}
            <div className={`${vidro} rounded-2xl p-5`}>
              <h3 className="text-base font-bold mb-1">Câmbio</h3>
              <p className="text-xs text-white/45 mb-4 leading-relaxed">
                Quanto vale 1 unidade em dólar. Valores de referência — confira a cotação do dia e ajuste aqui.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(MOEDAS).map(([cod, m]) => (
                  <div key={cod} className="rounded-xl bg-white/[0.05] border border-white/10 p-3">
                    <div className="text-[10px] uppercase tracking-widest text-cyan-300/70 mb-1">{cod} · {m.nome}</div>
                    {cod === "USD" ? (
                      <div className="text-sm font-semibold text-white/40">1,00 (base)</div>
                    ) : (
                      <div className="text-sm font-semibold tabular-nums">
                        <Editavel valor={estado.cambio[cod]} numero onChange={(v) => atualizarCambio(cod, v)} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-xs text-white/40">
                Total em hospedagem: <span className="font-bold text-emerald-300">US$ {fmt(totalHosp)}</span>
              </p>
            </div>
          </div>
        )}

        <footer className="mt-8 text-center text-[11px] text-white/30">
          {configurado
            ? `Sincronizado na nuvem · ${ID_VIAGEM}`
            : "Salvo apenas neste navegador — configure a sincronização para usar em outros aparelhos."}
        </footer>
      </div>
    </div>
  );
}
