// Mapa do Bolso: lê data/hoje.json e data/mundo.json. O mapa é a interface; cada fato abre num balão ao lado do país.
(function () {
  "use strict";

  const PRAZOS = [
    ["semanas", "Nas próximas semanas"],
    ["meses", "Nos próximos meses"],
    ["longo_prazo", "Em um ano ou mais"]
  ];
  const CONF = { alto: "alta", "médio": "média", medio: "média", baixo: "baixa" };
  // Para onde puxar o rótulo de cada país (em pixels do mapa).
  const DESLOCA = { "076": [70, 18], "840": [90, -48], "364": [30, -70], "156": [-30, 110], "032": [-70, 30] };
  const W = 960, H = 480;

  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === "") continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }
  const linkSeguro = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; } };
  const primeiraFrase = t => (t.match(/^.*?[.!?](\s|$)/) || [t])[0].trim();
  const ponto = t => /[.!?]$/.test(t) ? t : t + ".";

  function formatarData(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    const s = new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  let dados, atual = -1, centros = new Map(), transformar = d3.zoomIdentity, svgPaises, anotacoes = [];
  const balao = () => document.getElementById("balao");

  function iniciar([hoje, mundo]) {
    dados = hoje;
    dados.noticias.sort((a, b) => b.relevancia - a.relevancia);
    const c = dados.curadoria || {};
    document.getElementById("data").textContent = formatarData(dados.data) +
      (c.noticias_lidas ? ` · ${c.noticias_lidas} reportagens de ${c.fontes_lidas} veículos` : "");
    document.getElementById("manchete").textContent = dados.resumo.manchete;
    document.getElementById("linha-fina").textContent = dados.resumo.linha_fina;
    document.getElementById("agenda").textContent = dados.resumo.de_olho ? "Próximas datas: " + dados.resumo.de_olho : "";
    montarMapa(mundo);
    abrir(0);
    document.addEventListener("keydown", ev => {
      if (atual < 0 || ev.target.closest("input, textarea")) return;
      if (ev.key === "Escape") fechar();
      else if (ev.key === "ArrowRight") abrir(Math.min(atual + 1, dados.noticias.length - 1));
      else if (ev.key === "ArrowLeft") abrir(Math.max(atual - 1, 0));
    });
    window.addEventListener("resize", () => { rotular(); posicionarBalao(); });
  }

  // Junta os efeitos no bolso de um prazo numa frase curta, colorida pelo efeito.
  function bolsoDoPrazo(n, prazo) {
    const lista = (n.bolso || []).filter(b => b.prazo === prazo);
    return lista.flatMap((b, i) => [i ? " " : "", h("span", { class: b.efeito || "neutro" }, ponto(b.texto))]);
  }

  function conteudo(n, i) {
    const total = dados.noticias.length;
    const vistos = {};
    const fontes = n.fontes.map(f => {
      if (!linkSeguro(f.url)) return null;
      vistos[f.nome] = (vistos[f.nome] || 0) + 1;
      const nome = vistos[f.nome] > 1 ? `${f.nome} (${vistos[f.nome]})` : f.nome;
      return h("a", { href: linkSeguro(f.url), target: "_blank", rel: "noopener noreferrer" }, nome);
    })
      .filter(Boolean).flatMap((a, j, arr) => j < arr.length - 1 ? [a, ", "] : [a]);
    return [
      h("div", { class: "balao-top" },
        h("span", null, `${i + 1} de ${total} · ${n.pais_nome}`),
        h("span", { class: "nav" },
          h("button", { type: "button", "aria-label": "Fato anterior", disabled: i === 0 ? "" : null, onclick: () => abrir(i - 1) }, "‹"),
          h("button", { type: "button", "aria-label": "Próximo fato", disabled: i === total - 1 ? "" : null, onclick: () => abrir(i + 1) }, "›"),
          h("button", { type: "button", class: "fechar", "aria-label": "Fechar", onclick: fechar }, "×")
        )
      ),
      h("h3", { id: "balao-titulo" }, n.titulo_curto),
      h("p", { class: "fato-txt" }, n.fato),
      (n.por_que_importa || []).length ? h("p", { class: "porque" }, h("b", null, "Por quê: "), n.por_que_importa.join(" → ")) : null,
      h("ol", { class: "linha" }, PRAZOS.map(([k, rot]) => {
        const efeitos = bolsoDoPrazo(n, k);
        const resumo = efeitos.length ? efeitos : primeiraFrase((n.impacto && n.impacto[k]) || "Sem efeito relevante esperado.");
        return h("li", null, h("span", { class: "quando" }, rot), resumo);
      })),
      h("details", { class: "mais" },
        h("summary", null, "Explicação completa"),
        h("div", { class: "mais-corpo" },
          PRAZOS.map(([k, rot]) => (n.impacto && n.impacto[k]) ? h("p", null, h("b", null, rot + ": "), n.impacto[k]) : null),
          n.virada ? h("p", null, h("b", null, "Mas atenção: "), n.virada) : null,
          n.justificativa_confianca ? h("p", null, h("b", null, "Sobre a confiança: "), n.justificativa_confianca) : null
        )
      ),
      h("p", { class: "base" }, `Confiança ${CONF[n.confianca] || "média"}. Fontes: `, fontes, ".")
    ];
  }

  function abrir(i) {
    atual = i;
    const n = dados.noticias[i];
    const b = balao();
    b.replaceChildren(...conteudo(n, i));
    b.hidden = false;
    b.scrollTop = 0;
    svgPaises.classed("sel", d => d.id === n.pais);
    posicionarBalao();
  }

  function fechar() {
    atual = -1;
    balao().hidden = true;
    svgPaises.classed("sel", false);
  }

  function posicionarBalao() {
    const b = balao();
    if (atual < 0 || window.matchMedia("(max-width: 760px)").matches) { b.style.left = b.style.top = ""; return; }
    const palco = document.querySelector(".palco").getBoundingClientRect();
    const c = centros.get(dados.noticias[atual].pais);
    if (!c) return;
    const esc = palco.width / W;
    const x = transformar.applyX(c[0]) * esc, y = transformar.applyY(c[1]) * esc;
    const bw = b.offsetWidth, bh = b.offsetHeight, m = 12;
    let left = x < palco.width / 2 ? x + 48 : x - 48 - bw;
    left = Math.max(m, Math.min(left, palco.width - bw - m));
    const top = Math.max(m, Math.min(y - 80, palco.height - bh - m));
    b.style.left = left + "px";
    b.style.top = top + "px";
  }

  function rotular() {
    const larg = document.getElementById("mapa").clientWidth || W;
    const f = Math.min(2.2, Math.max(1, (W / larg) * 0.6));
    const k = transformar.k / f, curto = larg < 600;
    for (const a of anotacoes) {
      const x = a.cx + a.dx / k, y = a.cy + a.dy / k;
      a.linha.attr("x1", a.cx).attr("y1", a.cy).attr("x2", x).attr("y2", y);
      a.ponto.attr("cx", a.cx).attr("cy", a.cy).attr("r", 2.5 / k);
      const anc = a.dx < 0 ? "end" : "start", tx = x + (a.dx < 0 ? -4 : 4) / k;
      a.texto.attr("x", tx).attr("y", y - 2 / k).attr("text-anchor", anc).attr("font-size", 13 / k).style("stroke-width", 3 / k);
      a.sub.attr("display", curto ? "none" : null).attr("x", tx).attr("y", y + 13 / k).attr("text-anchor", anc).attr("font-size", 11.5 / k).style("stroke-width", 3 / k);
    }
  }

  function montarMapa(mundo) {
    const svg = d3.select("#mapa").attr("viewBox", `0 0 ${W} ${H}`);
    const paises = topojson.feature(mundo, mundo.objects.countries).features.filter(f => f.properties.name !== "Antarctica");
    const proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: "FeatureCollection", features: paises });
    const caminho = d3.geoPath(proj);
    const g = svg.append("g");
    g.append("path").attr("class", "esfera").attr("d", caminho({ type: "Sphere" }));

    const indice = new Map();
    dados.noticias.forEach((n, i) => { if (!indice.has(n.pais)) indice.set(n.pais, []); indice.get(n.pais).push(i); });

    svgPaises = g.selectAll("path.pais-shape").data(paises).join("path")
      .attr("class", d => "pais-shape" + (indice.has(d.id) ? " tem" : ""))
      .attr("d", caminho)
      .on("click", (ev, d) => {
        if (!indice.has(d.id)) return;
        const lista = indice.get(d.id);
        // Clicar de novo no mesmo país passa para o próximo fato dele.
        const pos = lista.indexOf(atual);
        abrir(pos >= 0 ? lista[(pos + 1) % lista.length] : lista[0]);
      });

    for (const f of paises) {
      if (!indice.has(f.id)) continue;
      const lista = indice.get(f.id);
      const [cx, cy] = caminho.centroid(f);
      centros.set(f.id, [cx, cy]);
      const [dx, dy] = DESLOCA[f.id] || [40, -40];
      const a = g.append("g").attr("class", "anota").on("click", () => abrir(lista[0]));
      const linha = a.append("line"), pt = a.append("circle"), texto = a.append("text");
      texto.append("tspan").attr("class", "num").text(lista.map(i => i + 1).join(" e ") + "  ");
      texto.append("tspan").attr("font-weight", 600).text(dados.noticias[lista[0]].pais_nome);
      const sub = a.append("text").text(lista.length > 1 ? lista.length + " fatos" : dados.noticias[lista[0]].titulo_curto);
      anotacoes.push({ cx, cy, dx, dy, linha, ponto: pt, texto, sub });
    }
    rotular();

    const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]])
      .on("zoom", ev => { transformar = ev.transform; g.attr("transform", ev.transform); rotular(); posicionarBalao(); });
    svg.call(zoom).on("wheel.zoom", null);
    document.getElementById("zoom-mais").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.6);
    document.getElementById("zoom-menos").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6);
    document.getElementById("zoom-reset").onclick = () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  }

  Promise.all([
    fetch("data/hoje.json").then(r => r.json()),
    fetch("data/mundo.json").then(r => r.json())
  ]).then(iniciar).catch(err => {
    console.error(err);
    document.getElementById("manchete").textContent = "Não foi possível carregar a edição de hoje. Recarregue a página em alguns instantes.";
  });
})();
