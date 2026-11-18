// Mapa do Bolso: lê data/hoje.json e data/mundo.json e monta o resumo, o mapa e o painel do país.
(function () {
  "use strict";

  const PRAZOS = [
    ["semanas", "Nas próximas semanas"],
    ["meses", "Nos próximos meses"],
    ["longo_prazo", "Em um ano ou mais"]
  ];
  const CONF = { alto: ["alto", "Confiança alta"], "médio": ["medio", "Confiança média"], medio: ["medio", "Confiança média"], baixo: ["baixo", "Confiança baixa"] };

  // Cria elementos sem usar innerHTML, para o texto vindo da IA nunca virar código.
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

  function linkSeguro(url) {
    try { const u = new URL(url); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; }
    catch (e) { return null; }
  }

  function formatarData(iso) {
    const [a, m, d] = iso.split("-").map(Number);
    const dt = new Date(a, m - 1, d);
    return dt.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }

  let dados, porPais, selecionado = null, noticiaFoco = null, svgPaises;

  function iniciar([hoje, mundo]) {
    dados = hoje;
    porPais = new Map();
    for (const n of dados.noticias) {
      if (!porPais.has(n.pais)) porPais.set(n.pais, []);
      porPais.get(n.pais).push(n);
    }
    document.getElementById("data").textContent = formatarData(dados.data);
    montarMinuto();
    montarMapa(mundo);
    const primeiro = dados.noticias.slice().sort((a, b) => b.relevancia - a.relevancia)[0];
    selecionar(primeiro ? primeiro.pais : null, primeiro ? primeiro.id : null, false);
  }

  function nomePais(cod) {
    const lista = porPais.get(cod);
    return lista ? lista[0].pais_nome : "";
  }

  function montarMinuto() {
    const ul = document.getElementById("lista-minuto");
    ul.replaceChildren();
    for (const item of dados.resumo.itens) {
      const noticia = dados.noticias.find(n => n.id === item.noticia);
      const cod = noticia ? noticia.pais : null;
      ul.append(h("li", null,
        h("button", {
          type: "button", "data-id": noticia ? noticia.id : "", "aria-pressed": "false",
          onclick: () => selecionar(cod, noticia ? noticia.id : null, true)
        },
          h("span", { class: "pais" }, noticia ? noticia.pais_nome : ""),
          h("span", { class: "txt" }, item.texto)
        )
      ));
    }
    document.getElementById("de-olho").replaceChildren(h("strong", null, "Amanhã em diante: "), dados.resumo.de_olho.replace(/^Fique de olho:\s*/i, ""));
  }

  function corRelevancia(r) {
    const css = getComputedStyle(document.documentElement);
    if (r >= 9) return css.getPropertyValue("--heat-3").trim();
    if (r >= 7) return css.getPropertyValue("--heat-2").trim();
    return css.getPropertyValue("--heat-1").trim();
  }

  function pintar() {
    if (!svgPaises) return;
    svgPaises
      .attr("style", d => {
        const lista = porPais.get(d.id);
        if (!lista) return null;
        return "fill:" + corRelevancia(Math.max(...lista.map(n => n.relevancia)));
      })
      .classed("sel", d => d.id === selecionado);
  }

  function montarMapa(mundo) {
    const W = 960, H = 540;
    const svg = d3.select("#mapa").attr("viewBox", `0 0 ${W} ${H}`);
    const paises = topojson.feature(mundo, mundo.objects.countries).features
      .filter(f => f.properties.name !== "Antarctica");
    const proj = d3.geoNaturalEarth1().fitExtent([[10, 10], [W - 10, H - 10]], { type: "FeatureCollection", features: paises });
    const caminho = d3.geoPath(proj);
    const g = svg.append("g");
    g.append("path").attr("class", "esfera").attr("d", caminho({ type: "Sphere" }));

    const dica = document.getElementById("dica");
    const caixa = document.querySelector(".mapa-box");

    svgPaises = g.selectAll("path.pais-shape").data(paises).join("path")
      .attr("class", d => "pais-shape" + (porPais.has(d.id) ? " tem" : ""))
      .attr("d", caminho)
      .on("click", (ev, d) => { if (porPais.has(d.id)) selecionar(d.id, null, true); })
      .on("mousemove", (ev, d) => {
        if (!porPais.has(d.id)) { dica.hidden = true; return; }
        const r = caixa.getBoundingClientRect();
        const qtd = porPais.get(d.id).length;
        dica.textContent = `${nomePais(d.id)} · ${qtd} ${qtd === 1 ? "notícia" : "notícias"}`;
        dica.style.left = (ev.clientX - r.left + 12) + "px";
        dica.style.top = (ev.clientY - r.top + 12) + "px";
        dica.hidden = false;
      })
      .on("mouseleave", () => { dica.hidden = true; });

    const zoom = d3.zoom().scaleExtent([1, 8]).translateExtent([[0, 0], [W, H]])
      .on("zoom", ev => g.attr("transform", ev.transform));
    svg.call(zoom);
    document.getElementById("zoom-mais").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1.6);
    document.getElementById("zoom-menos").onclick = () => svg.transition().duration(250).call(zoom.scaleBy, 1 / 1.6);
    document.getElementById("zoom-reset").onclick = () => svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);

    pintar();
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", pintar);
    new MutationObserver(pintar).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  }

  function selecionar(cod, idNoticia, rolar) {
    selecionado = cod;
    noticiaFoco = idNoticia;
    pintar();
    document.querySelectorAll("#lista-minuto button").forEach(b => {
      b.setAttribute("aria-pressed", String(idNoticia ? b.dataset.id === idNoticia : false));
    });
    montarPainel();
    if (rolar && window.matchMedia("(max-width: 960px)").matches) {
      const alvo = idNoticia ? document.getElementById("n-" + idNoticia) : document.getElementById("painel");
      if (alvo) alvo.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function cartaoNoticia(n) {
    const conf = CONF[n.confianca] || CONF["médio"];
    const fontes = (n.fontes || []).map(f => {
      const href = linkSeguro(f.url);
      return href ? h("a", { href, target: "_blank", rel: "noopener noreferrer" }, f.nome || new URL(href).hostname) : null;
    });
    return h("article", { class: "noticia" + (n.id === noticiaFoco ? " foco" : ""), id: "n-" + n.id },
      h("div", { class: "chips" },
        h("span", { class: "chip" }, n.categoria),
        h("span", { class: "chip conf-" + conf[0], title: n.justificativa_confianca }, conf[1])
      ),
      h("h3", null, n.titulo_curto),
      h("p", null, n.fato),
      h("div", null,
        h("p", { class: "rotulo" }, "Por que importa"),
        h("ol", { class: "cadeia" }, (n.por_que_importa || []).map(p => h("li", null, p)))
      ),
      h("div", null,
        h("p", { class: "rotulo" }, "Como chega até você"),
        h("div", { class: "tempo" }, PRAZOS.map(([k, rotulo]) =>
          h("div", { class: "prazo" }, h("b", null, rotulo), h("span", null, (n.impacto && n.impacto[k]) || "Sem efeito relevante esperado neste prazo."))
        ))
      ),
      n.virada ? h("p", { class: "virada" }, h("strong", null, "Atenção à virada: "), n.virada) : null,
      h("p", { class: "fontes" }, h("span", { class: "rotulo" }, "Fontes"), fontes)
    );
  }

  function montarPainel() {
    const painel = document.getElementById("painel");
    const lista = (porPais.get(selecionado) || []).slice().sort((a, b) => b.relevancia - a.relevancia);
    if (!lista.length) {
      painel.replaceChildren(h("p", { class: "vazio" }, "Clique em um país colorido no mapa para ver as notícias e o impacto no seu bolso."));
      return;
    }
    painel.replaceChildren(
      h("header", { class: "painel-cab" },
        h("h2", null, lista[0].pais_nome),
        h("p", null, `${lista.length} ${lista.length === 1 ? "notícia" : "notícias"} hoje`)
      ),
      ...lista.map(cartaoNoticia)
    );
  }

  Promise.all([
    fetch("data/hoje.json").then(r => r.json()),
    fetch("data/mundo.json").then(r => r.json())
  ]).then(iniciar).catch(err => {
    console.error(err);
    document.getElementById("painel").replaceChildren(h("p", { class: "vazio" }, "Não foi possível carregar as notícias de hoje. Recarregue a página em alguns instantes."));
  });
})();
