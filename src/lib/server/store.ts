/** Interfaz mínima de acceso a datos: permite probar la lógica con un almacén en memoria. */
export interface Store {
  get<T = unknown>(path: string): Promise<T | null>;
  set(path: string, value: unknown): Promise<void>;
  /** Escritura multi-ruta atómica; `null` borra. */
  update(updates: Record<string, unknown>): Promise<void>;
  /**
   * Transacción. `fn` puede recibir `null` aunque el dato exista (caché local de Firebase) y se
   * reintenta con el valor real. Devolver `undefined` aborta.
   */
  transaction<T>(path: string, fn: (cur: T | null) => T | null | undefined): Promise<{ committed: boolean; value: T | null }>;
  /** Hijos de `path` ordenados por `orderBy`. Por defecto los últimos `limitLast` (mayores); con dir:"asc", los primeros (menores). Siempre devuelve de menor a mayor. */
  list<T>(path: string, opts: { orderBy: string; limitLast: number; dir?: "asc" | "desc" }): Promise<Array<T & { id: string }>>;
  /** Hijos cuya clave empieza por `prefix` (orden alfabético), hasta `limit`. */
  listKeys<T>(path: string, prefix: string, limit: number): Promise<Array<{ key: string; value: T }>>;
  newKey(path: string): string;
}
