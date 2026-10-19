/**
 * Cierra un <dialog> con animación: le pone la clase "cerrando" (la animación está en el CSS de cada uno)
 * y lo cierra de verdad al acabar. Con "reducir movimiento", al momento.
 */
export function cerrarConAnimacion(d: HTMLDialogElement | null) {
  if (!d?.open || d.classList.contains("cerrando")) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return d.close();
  d.classList.add("cerrando");
  let hecho = false;
  const fin = () => {
    if (hecho) return;
    hecho = true;
    d.removeEventListener("animationend", alAcabar);
    d.classList.remove("cerrando");
    d.close();
  };
  // Solo la animación del propio diálogo (o su fondo), no las de lo que hay dentro
  const alAcabar = (e: AnimationEvent) => e.target === d && fin();
  d.addEventListener("animationend", alAcabar);
  setTimeout(fin, 400); // por si el navegador no lanza animationend (p. ej. pestaña oculta)
}
