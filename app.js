// Mapa do Bolso: lê data/hoje.json e data/mundo.json e conta a edição do dia de cima para baixo.
(function () {
  "use strict";

  const PRAZOS = [
    ["semanas", "Nas próximas semanas"],
    ["meses", "Nos próximos meses"],
    ["longo_prazo", "Em um ano ou mais"]
  ];
  // Linhas fixas da tabela do bolso, na ordem em que aparecem.
  const ITENS = [
    ["credito", "Financiamento, empréstimo e cartão"],
    ["renda_fixa", "Rendimento de CDB, Tesouro e poupança"],
    ["dolar", "Dólar, viagens e importados"],
    ["combustivel", "Gasolina e diesel"],
    ["alimentos", "Supermercado"],
    ["energia", "Conta de luz"],
    ["emprego", "Emprego e renda"]
  ];
  const SETA = { sobe: "↑", cai: "↓", "estável": "→", estavel: "→", oscila: "↕" };
  const CONF = { alto: "alta", "médio": "média", medio: "média", baixo: "baixa" };
  // Para onde puxar o rótulo de cada país no mapa (em pixels do mapa).
  const DESLOCA = { "076": [70, 18], "840": [90, -48], "364": [30, -70], "156": [-30, 110], "032": [-70, 30] };

  function h(tag, attrs, ...filhos) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (const f of filhos.flat()) {
      if (f === null || f === undefined || f === "") continue;
      el.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return el;
  }
  const linkSeguro = url => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.href : null; } catch (e) { return null; } };

  function formatarData(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    return new Date(a, m - 1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  let dados, numero, svgPaises, focado = null;

  function iniciar([hoje, mundo]) {
    dados = hoje;
    dados.noticias.sort((a, b) => b.relevancia - a.relevancia);
    numero = new Map(dados.noticias.map((n, i) => [n.id, i + 1]));
    montarLead();
    montarBolso();
    montarFatos();
    montarMapa(mundo);
  }

  function irPara(id) {
    focado = id;
    document.querySelectorAll(".fato").forEach(el => el.classList.toggle("foco", el.id === "f-" + id));
    const alvo = document.getElementById("f-" + id);
    if (alvo) { alvo.scrollIntoView({ block: "start" }); alvo.focus({ preventScroll: true }); }
    pintar();
  }

  function montarLead() {
    const r = dados.resumo, c = dados.curadoria || {};
    document.getElementById("edicao").textContent = "Edição de " + formatarData(dados.data);
    document.getElementById("manchete").textContent = r.manchete;
    document.getElementById("linha-fina").textContent = r.linha_fina;
    const fontes = new Set(dados.noticias.flatMap(n => n.fontes.map(f => f.nome)));
    document.getElementById("curadoria").replaceChildren(
      h("span", null, h("b", null, dados.noticias.length), " fatos selecionados"),
      h("span", null, "a partir de ", h("b", null, c.noticias_lidas || "?"), " notícias de ", h("b", null, c.fontes_lidas || fontes.size), " veículos"),
      h("span", null, "leitura de 1 min")
    );
    document.getElementById("de-olho").textContent = r.de_olho;
  }

  function montarBolso() {
    const corpo = document.getElementById("bolso-corpo");
    const linhas = [];
    for (const [chave, rotulo] of ITENS) {
      const porPrazo = PRAZOS.map(([p]) => []);
      for (const n of dados.noticias) for (const b of n.bolso || []) {
        const i = PRAZOS.findIndex(([p]) => p === b.prazo);
        if (b.item === chave && i >= 0) porPrazo[i].push([n, b]);
      }
      if (porPrazo.every(c => !c.length)) continue;
      linhas.push(h("tr", null,
        h("th", { scope: "row" }, rotulo),
        porPrazo.map(lista => h("td", null, lista.length
          ? h("div", { class: "efeitos" }, lista.map(([n, b]) => h("div", { class: "ef " + (b.efeito || "neutro") },
              h("span", { class: "seta", "aria-hidden": "true" }, SETA[b.direcao] || "·"),
              h("span", null, h("span", { class: "dir" }, b.direcao), " ", b.texto.charAt(0).toLowerCase() + b.texto.slice(1)),
              h("button", { type: "button", class: "ref", title: "Ver o fato: " + n.titulo_curto, onclick: () => irPara(n.id) }, numero.get(n.id))
            )))
          : h("span", { class: "vazio", "aria-label": "sem efeito relevante" }, "—")))
      ));
    }
    corpo.replaceChildren(...linhas);
  }

  function arvore(n) {
    const href = f => linkSeguro(f.url);
    return h("article", { class: "fato", id: "f-" + n.id, tabindex: "-1" },
      h("div", { class: "galho" },
        h("div", { class: "raiz-cab" },
          h("span", { class: "raiz-num" }, numero.get(n.id)),
          h("span", { class: "rotulo" }, n.pais_nome + " · " + n.categoria)
        ),
        h("h3", null, n.titulo_curto),
        h("p", { class: "raiz-txt" }, n.fato),
        h("p", { class: "conf" }, h("b", null, "Confiança " + (CONF[n.confianca] || "média") + "."), " " + n.justificativa_confianca),
        h("p", { class: "fontes" }, "Fontes:", n.fontes.map(f => href(f) ? h("a", { href: href(f), target: "_blank", rel: "noopener noreferrer" }, f.nome) : null))
      ),
      h("div", { class: "galho" },
        h("p", { class: "rotulo" }, "Por que importa"),
        h("ol", { class: "cadeia" }, (n.por_que_importa || []).map(p => h("li", null, p)))
      ),
      h("div", { class: "galho" },
        h("p", { class: "rotulo" }, "Quando chega até você"),
        h("ol", { class: "prazos" }, PRAZOS.map(([k, rot]) => h("li", null,
          h("span", { class: "quando" }, rot),
          h("span", { class: "txt" }, (n.impacto && n.impacto[k]) || "Sem efeito relevante esperado neste prazo.")
        ))),
        n.virada ? h("p", { class: "virada" }, h("b", null, "O efeito pode virar. "), n.virada) : null
      )
    );
  }

  function montarFatos() {
    document.getElementById("fatos").replaceChildren(...dados.noticias.map(arvore));
  }

  function pintar() {
    if (!svgPaises) return;
    const sel = focado ? (dados.noticias.find(n => n.id === focado) || {}).pais : null;
    svgPaises.classed("sel", d => d.id === sel);
  }

  function montarMapa(mundo) {
    const W = 960, H = 480;
    const svg = d3.select("#mapa").attr("viewBox", `0 0 ${W} ${H}`);
    const paises = topojson.feature(mundo, mundo.objects.countries).features.filter(f => f.properties.name !== "Antarctica");
    const proj = d3.geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: "FeatureCollection", features: paises });
    const caminho = d3.geoPath(proj);
    const g = svg.append("g");
    g.append("path").attr("class", "esfera").attr("d", caminho({ type: "Sphere" }));

    const porPais = d3.group(dados.noticias, n => n.pais);
    const primeiroDe = cod => porPais.get(cod)[0].id;

    svgPaises = g.selectAll("path.pais-shape").data(paises).join("path")
      .attr("class", d => "pais-shape" + (porPais.has(d.id) ? " tem" : ""))
      .attr("d", caminho)
      .on("click", (ev, d) => { if (porPais.has(d.id)) irPara(primeiroDe(d.id)); });
    svgPaises.filter(d => porPais.has(d.id)).append("title").text(d => porPais.get(d.id)[0].pais_nome);

    // Rótulos diretos no mapa, no lugar de legenda.
    const anotacoes = [];
    for (const f of paises) {
      if (!porPais.has(f.id)) continue;
      const lista = porPais.get(f.id);
      const [cx, cy] = caminho.centroid(f);
      const [dx, dy] = DESLOCA[f.id] || [40, -40];
      const a = g.append("g").attr("class", "anota").on("click", () => irPara(lista[0].id));
      const linha = a.append("line");
      const ponto = a.append("circle");
      const texto = a.append("text");
      texto.append("tspan").attr("class", "num").text(lista.map(n => numero.get(n.id)).join(" · ") + "  ");
      texto.append("tspan").attr("font-weight", 600).text(lista[0].pais_nome);
      const sub = a.append("text");
      sub.text(lista.length > 1 ? lista.length + " fatos" : lista[0].titulo_curto);
      anotacoes.push({ cx, cy, dx, dy, linha, ponto, texto, sub, esquerda: dx < 0 });
    }
    function posicionar(k) {
      // Em telas estreitas o mapa encolhe; aumenta o rótulo para continuar legível.
      const larg = document.getElementById("mapa").clientWidth || W;
      const f = Math.min(2.2, Math.max(1, W / larg * 0.6));
      k = k / f;
      const curto = larg < 600;
      for (const a of anotacoes) {
        const x = a.cx + a.dx / k, y = a.cy + a.dy / k;
        a.linha.attr("x1", a.cx).attr("y1", a.cy).attr("x2", x).attr("y2", y);
        a.ponto.attr("cx", a.cx).attr("cy", a.cy).attr("r", 2.5 / k);
        const anc = a.esquerda ? "end" : "start", tx = x + (a.esquerda ? -4 : 4) / k;
        a.texto.attr("x", tx).attr("y", y - 2 / k).attr("text-anchor", anc).attr("font-size", 13 / k).style("stroke-width", 3 / k);
        a.sub.attr("display", curto ? "none" : null).attr("x", tx).attr("y", y + 13 / k).attr("text-anchor", anc).attr("font-size", 11.5 / k).style("stroke-width", 3 / k);
      }
    }
    posicionar(1);
    let kAtual = 1;
    window.addEventListener("resize", () => posicionar(kAtual));

    const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]])
      .on("zoom", ev => { g.attr("transform", ev.transform); kAtual = ev.transform.k; posicionar(kAtual); });
    svg.call(zoom).on("wheel.zoom", null); // rolar a página não dá zoom sem querer; use os botões ou pinça
    document.getElementById("zoom-mais").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.6);
    document.getElementById("zoom-menos").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6);
    document.getElementById("zoom-reset").onclick = () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
    pintar();
  }

  Promise.all([
    fetch("data/hoje.json").then(r => r.json()),
    fetch("data/mundo.json").then(r => r.json())
  ]).then(iniciar).catch(err => {
    console.error(err);
    document.getElementById("manchete").textContent = "Não foi possível carregar a edição de hoje. Recarregue a página em alguns instantes.";
  });
})();
