import type { GameId } from "./game-config";
export const GAME_INFO: Record<GameId, { name: string; icon: string; description: string; difficulty: string }> = {
  reflejos: { name: "Prueba de reflejos", icon: "⚡", description: "Reacciona en cuanto aparezca la señal.", difficulty: "Fácil" },
  memoria: { name: "Memoria visual", icon: "🧠", description: "Repite la secuencia de símbolos en orden.", difficulty: "Media" },
  trivia: { name: "Trivia comunitaria", icon: "❓", description: "Preguntas sobre la comunidad y cultura general.", difficulty: "Media" },
};
