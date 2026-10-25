/* Quando chega uma leitura nova do TSE, os números sobem (ou descem) do valor anterior até o novo em ~1 s.
   Só anima entre dois valores que o TSE publicou: nada é inventado entre as leituras.
   Sem animação para quem pede menos movimento (prefers-reduced-motion) ou com a aba oculta. */
(() => {
  'use strict';
  const ultimo = new Map(), rodando = new WeakMap();
  const calmo = matchMedia('(prefers-reduced-motion: reduce)');
  const DUR = 1000, ease = (t) => 1 - Math.pow(1 - t, 3);
  // conta(elemento, chave, valor, formata): chave identifica o número (lugar + candidato + campo) entre uma leitura e outra
  window.conta = (el, chave, valor, fmt) => {
    const antes = ultimo.get(chave);
    ultimo.set(chave, valor);
    const ant = rodando.get(el); if (ant) cancelAnimationFrame(ant);
    if (antes == null || valor == null || !isFinite(antes) || !isFinite(valor) || antes === valor || calmo.matches || document.hidden) { el.textContent = fmt(valor); return; }
    el.classList.add('subindo');
    const t0 = performance.now();
    const passo = (t) => {
      const k = Math.min(1, (t - t0) / DUR);
      el.textContent = fmt(k < 1 ? antes + (valor - antes) * ease(k) : valor);
      if (k < 1) rodando.set(el, requestAnimationFrame(passo)); else { rodando.delete(el); el.classList.remove('subindo'); }
    };
    el.textContent = fmt(antes);
    rodando.set(el, requestAnimationFrame(passo));
  };
})();
