export type TriviaQuestion = { prompt: string; options: [string, string, string, string]; answer: 0 | 1 | 2 | 3 };

/** Banco de preguntas para retos. Las respuestas correctas solo viven en el servidor. */
export const TRIVIA_BANK: TriviaQuestion[] = [
  { prompt: "¿Qué significa XP en un sistema de progresión?", options: ["Experiencia", "Monedas", "Donación", "Contraseña"], answer: 0 },
  { prompt: "¿Dónde se debe validar el resultado oficial de una partida?", options: ["En el navegador", "En el servidor", "En el chat", "En ningún sitio"], answer: 1 },
  { prompt: "¿Las donaciones deben dar ventajas competitivas?", options: ["Sí, siempre", "Solo en el ranking", "No", "Solo si son grandes"], answer: 2 },
  { prompt: "¿Cuál es la capital de Colombia?", options: ["Medellín", "Cali", "Cartagena", "Bogotá"], answer: 3 },
  { prompt: "¿Cuántos jugadores participan en un reto uno contra uno?", options: ["Uno", "Dos", "Tres", "Cuatro"], answer: 1 },
  { prompt: "¿Qué planeta es conocido como el planeta rojo?", options: ["Marte", "Venus", "Júpiter", "Mercurio"], answer: 0 },
  { prompt: "¿Las monedas del Refugio se pueden cambiar por dinero?", options: ["Sí", "Con un descuento", "No", "Solo en eventos"], answer: 2 },
  { prompt: "¿Cuántos colores tiene el arcoíris tradicional?", options: ["Cinco", "Seis", "Ocho", "Siete"], answer: 3 },
  { prompt: "¿Qué debes hacer si alguien te pide tu contraseña?", options: ["No compartirla", "Enviarla por chat", "Publicarla", "Cambiarla por la suya"], answer: 0 },
  { prompt: "¿Cuál es el océano más grande del mundo?", options: ["Atlántico", "Pacífico", "Índico", "Ártico"], answer: 1 },
  { prompt: "¿Qué pasa con un reto si nadie juega antes del plazo?", options: ["Gana el retador", "Gana el invitado", "Se devuelven las monedas", "Se pierden las monedas"], answer: 2 },
  { prompt: "¿Qué gas necesitan las plantas para la fotosíntesis?", options: ["Oxígeno", "Helio", "Nitrógeno", "Dióxido de carbono"], answer: 3 },
];

export function pickQuestions(count: number, random: () => number = Math.random): TriviaQuestion[] {
  const pool = [...TRIVIA_BANK];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count);
}
