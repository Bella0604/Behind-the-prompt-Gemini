(() => {
  "use strict";
  const root = document.getElementById("app");
  if (!root) return;

  const scriptURL = document.currentScript.src;
  const assetURL = file => new URL("./assets/" + file, scriptURL).href;
  const manifestPromise = fetch(assetURL("visual-manifest.json"))
    .then(response => {
      if (!response.ok) throw new Error("Artwork manifest could not load");
      return response.json();
    });

  const cardAssets = {
    2: [
      { paper: "surface-02-02.png", grain: "surface-02-04.png", offset: true },
      { paper: "surface-02-01.png", grain: "surface-02-03.png" }
    ],
    3: [
      { paper: "surface-03-05.png", grain: "surface-03-07.png" },
      { paper: "surface-03-06.png", grain: "surface-03-08.png", offset: true }
    ],
    4: [
      { grain: "surface-04-11.png" },
      { paper: "surface-04-09.png", grain: "surface-04-10.png" }
    ],
    5: [
      { paper: "surface-05-12.png", grain: "surface-05-13.png" },
      { grain: "surface-05-14.png" }
    ]
  };

  function makePre(text, className) {
    const pre = document.createElement("pre");
    pre.className = className;
    pre.textContent = text;
    pre.setAttribute("aria-hidden", "true");
    return pre;
  }

  let latestRun = 0;
  async function applyArtwork() {
    const run = ++latestRun;
    const number = root.querySelector(".page-number");
    const page = Number(number?.textContent.trim().split("/")[0] || 1);
    root.dataset.page = String(page);
    root.style.setProperty("--page-artwork",
      'url("' + assetURL("background-" + String(page).padStart(2, "0") + ".png") + '")');

    const oldParticle = root.querySelector(":scope > .chapter-particle");
    if (oldParticle) oldParticle.remove();

    const cards = root.querySelectorAll(".two-column > .card");
    cards.forEach((card, index) => {
      const entry = cardAssets[page]?.[index];
      if (!entry) return;
      const shell = document.createElement("div");
      shell.className = "surface-shell";
      card.replaceWith(shell);
      shell.appendChild(card);

      if (entry.paper) {
        const paper = document.createElement("img");
        paper.className = "surface-paper" + (entry.offset ? " surface-paper-offset" : "");
        paper.src = assetURL(entry.paper);
        paper.alt = "";
        paper.setAttribute("aria-hidden", "true");
        shell.prepend(paper);
      }
      if (entry.grain) {
        card.dataset.grain = "true";
        card.style.setProperty("--card-grain", 'url("' + assetURL(entry.grain) + '")');
      }
    });

    try {
      const manifest = await manifestPromise;
      // The view may have changed while the asset file loaded.
      if (run !== latestRun) return;
      const visiblePage = Number(root.querySelector(".page-number")?.textContent.trim().split("/")[0] || 1);
      if (visiblePage !== page) return;

      if (page === 1) {
        const panel = root.querySelector(".character-panel");
        if (!panel) return;
        if (!panel.querySelector(".character-field")) {
          panel.prepend(makePre(manifest.homepageCharacter, "character-field"));
        }
        if (!panel.querySelector(".home-data-word")) {
          panel.appendChild(makePre(manifest.homepageDataWord, "home-data-word"));
        }
      } else {
        const source = manifest.particles.find(p => p.page === page);
        if (source && !root.querySelector(":scope > .chapter-particle")) {
          const particle = makePre(source.text, "chapter-particle");
          particle.dataset.figmaNode = source.id;
          particle.style.left = (source.x / manifest.width * 100) + "%";
          root.appendChild(particle);
        }
      }
    } catch (error) {
      console.error("Behind the Prompt artwork:", error);
    }
  }

  let queued = false;
  function scheduleArtwork() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyArtwork();
    });
  }
  const observer = new MutationObserver(records => {
    const viewChanged = records.some(record =>
      [...record.addedNodes, ...record.removedNodes].some(node =>
        node.nodeType === 1 && ["MAIN", "HEADER"].includes(node.tagName)
      )
    );
    if (viewChanged) scheduleArtwork();
  });
  observer.observe(root, { childList: true });
  scheduleArtwork();
})();
