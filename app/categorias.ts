// Categorías de los planes: el id se guarda en Appwrite (columna "categoria"); el nombre va en i18n.ts
export const CATEGORIAS = [
  { id: "viajes", emoji: "✈️" },
  { id: "restaurantes", emoji: "🍽️" },
  { id: "peliculas", emoji: "🎬" },
  { id: "series", emoji: "📺" },
  { id: "conciertos", emoji: "🎵" },
  { id: "actividades", emoji: "🎈" },
  { id: "libros", emoji: "📚" },
] as const;

export type Categoria = (typeof CATEGORIAS)[number]["id"];

export const esCategoria = (v: unknown): v is Categoria => CATEGORIAS.some((c) => c.id === v);
export const emojiDe = (id: Categoria) => CATEGORIAS.find((c) => c.id === id)!.emoji;
