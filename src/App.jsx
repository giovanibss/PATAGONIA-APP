import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Mountain, Wallet, ListChecks, CalendarDays, MapPin, Clock,
  Check, Plus, Trash2, ChevronLeft, ChevronRight, AlertTriangle,
  BedDouble, Pencil, RotateCcw, Ship, Utensils, Car, Footprints,
} from "lucide-react";

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

const HOSPEDAGENS = [
  { base: "El Calafate", noites: "Dias 1–2, 9–11", eco: "Kau Kaleshen · US$ 80–100", meio: "Mirador del Lago · US$ 130–150", top: "Xelena Hotel & Suites · US$ 200–250" },
  { base: "El Chaltén", noites: "Dias 3–5", eco: "Vientos del Sur Aparts · US$ 90–110", meio: "Hostería Senderos · US$ 150–170", top: "Destino Sur Hotel & Spa · US$ 190–220" },
  { base: "Torres del Paine", noites: "Dias 6–7", eco: "Reservado por você", meio: "—", top: "—" },
  { base: "Puerto Natales", noites: "Dias 8–9", eco: "Pire Mapu Cottage · US$ 80–100", meio: "Natalino Hotel · US$ 130–150", top: "Simple Patagonia · US$ 200–240" },
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

const ESTADO_INICIAL = { roteiro: ROTEIRO_INICIAL, alertas: ALERTAS_INICIAIS, orcamento: ORCAMENTO_ALVO };
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

/* ─────────────────────────  APP  ───────────────────────── */

export default function App() {
  const [estado, setEstado] = useState(ESTADO_INICIAL);
  const [carregado, setCarregado] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const [aba, setAba] = useState("roteiro");
  const [fundo, setFundo] = useState(0);

  useEffect(() => {
    const reduzir = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduzir) return;
    const t = setInterval(() => setFundo((i) => (i + 1) % FUNDOS.length), INTERVALO_FUNDO);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE);
      if (salvo) setEstado({ ...ESTADO_INICIAL, ...JSON.parse(salvo) });
    } catch (e) { /* começa do zero */ }
    setCarregado(true);
  }, []);

  useEffect(() => {
    if (!carregado) return;
    try { window.localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (e) { /* sem persistência */ }
  }, [estado, carregado]);

  const total = useMemo(() => estado.roteiro.reduce((s, d) => s + (Number(d.custo) || 0), 0), [estado.roteiro]);
  const pct = Math.min(100, (total / (estado.orcamento || 1)) * 100);
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

  const restaurar = () => {
    if (window.confirm("Restaurar o roteiro original? Suas edições serão perdidas.")) setEstado(ESTADO_INICIAL);
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
          <div className="flex items-center gap-2 text-cyan-300/90 text-[11px] font-semibold tracking-[0.25em] uppercase mb-2">
            <Mountain size={14} /> 06 – 17 de dezembro
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tight leading-none">Patagônia</h1>
          <p className="mt-2 text-white/60 text-sm">2 adultos + 1 criança · 12 dias · Argentina e Chile</p>
        </header>

        {/* Resumo */}
        <div className={`${vidro} rounded-2xl p-5 mb-6 grid grid-cols-2 sm:grid-cols-4 gap-4`}>
          {[
            { rot: "Total estimado", val: `US$ ${total.toLocaleString("pt-BR")}` },
            { rot: "Orçamento", val: <Editavel valor={estado.orcamento} numero prefixo="US$ " onChange={(v) => setEstado((s) => ({ ...s, orcamento: v }))} /> },
            { rot: restante >= 0 ? "Folga" : "Acima do teto", val: `US$ ${Math.abs(restante).toLocaleString("pt-BR")}`, cor: restante >= 0 ? "text-emerald-300" : "text-rose-300" },
            { rot: "Pendências", val: `${feitos}/${estado.alertas.length}`, cor: feitos === estado.alertas.length ? "text-emerald-300" : "text-amber-300" },
          ].map((k, i) => (
            <div key={i}>
              <div className="text-[10px] uppercase tracking-widest text-white/45 mb-1">{k.rot}</div>
              <div className={`text-lg font-bold ${k.cor || ""}`}>{k.val}</div>
            </div>
          ))}
          <div className="col-span-2 sm:col-span-4">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${restante >= 0 ? "bg-gradient-to-r from-cyan-400 to-emerald-400" : "bg-gradient-to-r from-amber-400 to-rose-500"}`}
                style={{ width: `${pct}%` }}
              />
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
                  <div className="text-xl font-bold text-emerald-300">
                    <Editavel valor={dia.custo} numero prefixo="US$ " onChange={(v) => atualizarDia(dia.id, "custo", v)} />
                  </div>
                </div>
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
          <div className={`${vidro} rounded-2xl p-6`}>
            <h2 className="text-xl font-bold mb-1">Custos por dia</h2>
            <p className="text-sm text-white/50 mb-6">Clique em qualquer valor para ajustar. O total recalcula na hora.</p>
            <ul className="space-y-1.5">
              {estado.roteiro.map((d, i) => {
                const largura = (d.custo / Math.max(...estado.roteiro.map((x) => x.custo || 1))) * 100;
                return (
                  <li key={d.id} className="relative rounded-xl overflow-hidden border border-white/10 hover:border-white/25 transition-colors">
                    <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/25 to-transparent transition-all duration-500" style={{ width: `${largura}%` }} />
                    <button
                      onClick={() => { setAba("roteiro"); setAtivo(i); }}
                      className="relative w-full flex items-center gap-4 px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                    >
                      <span className="text-sm font-bold w-14 shrink-0 text-white/50 tabular-nums">Dia {d.n}</span>
                      <span className="flex-1 text-sm truncate text-white/85">{d.titulo}</span>
                    </button>
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-300 tabular-nums">
                      <Editavel valor={d.custo} numero prefixo="US$ " onChange={(v) => atualizarDia(d.id, "custo", v)} />
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-6 pt-5 border-t border-white/15 flex items-baseline justify-between">
              <span className="text-sm uppercase tracking-widest text-white/50">Total</span>
              <span className="text-3xl font-black tabular-nums">US$ {total.toLocaleString("pt-BR")}</span>
            </div>
            <p className="mt-3 text-xs text-white/40 leading-relaxed">
              Não inclui as diárias das cidades nem as passagens aéreas. Somando as 2 noites no hotel do parque, a estimativa fecha entre US$ 4.500 e 4.700.
            </p>
            <button onClick={restaurar} className="mt-5 flex items-center gap-2 text-xs text-white/40 hover:text-white/80 transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-300/70 rounded px-1">
              <RotateCcw size={12} /> Restaurar roteiro original
            </button>
          </div>
        )}

        {/* CHECKLIST */}
        {aba === "checklist" && (
          <div className={`${vidro} rounded-2xl p-6`}>
            <h2 className="text-xl font-bold mb-1">Antes de viajar</h2>
            <p className="text-sm text-white/50 mb-6">Sem a autorização do carro vocês são barrados nas travessias dos dias 6 e 9.</p>
            <ul className="space-y-2">
              {estado.alertas.map((a) => (
                <li key={a.id}>
                  <button
                    onClick={() => alternarAlerta(a.id)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl border text-left transition-all duration-300 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-cyan-300/70 ${
                      a.feito ? "bg-emerald-500/10 border-emerald-400/30" : a.critico ? "bg-amber-500/10 border-amber-400/30" : "bg-white/[0.05] border-white/15 hover:bg-white/[0.12]"
                    }`}
                  >
                    <span className={`shrink-0 w-5 h-5 mt-0.5 rounded-md border-2 flex items-center justify-center transition-all ${
                      a.feito ? "bg-emerald-400 border-emerald-400" : "border-white/35"
                    }`}>
                      {a.feito && <Check size={13} className="text-slate-900" strokeWidth={3.5} />}
                    </span>
                    <span className={`flex-1 text-[15px] leading-relaxed ${a.feito ? "line-through text-white/35" : "text-white/85"}`}>
                      {a.texto}
                    </span>
                    {a.critico && !a.feito && <AlertTriangle size={15} className="shrink-0 mt-0.5 text-amber-300" />}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* HOSPEDAGEM */}
        {aba === "hotel" && (
          <div className="space-y-3">
            {HOSPEDAGENS.map((h) => (
              <div key={h.base} className={`${vidro} rounded-2xl p-5 transition-all duration-300 hover:-translate-y-1`}>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="text-lg font-bold">{h.base}</h3>
                  <span className="text-[11px] uppercase tracking-widest text-white/45">{h.noites}</span>
                </div>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[["Econômica", h.eco], ["Custo-benefício", h.meio], ["Refinada", h.top]].map(([rot, val]) => (
                    <div key={rot} className="rounded-xl bg-white/[0.05] border border-white/10 p-3">
                      <div className="text-[10px] uppercase tracking-widest text-cyan-300/70 mb-1.5">{rot}</div>
                      <div className="text-sm text-white/85 leading-snug">{val}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <footer className="mt-8 text-center text-[11px] text-white/30">
          Suas edições ficam salvas neste navegador.
        </footer>
      </div>
    </div>
  );
}
