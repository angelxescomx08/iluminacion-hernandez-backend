import type { Greeting } from "../domain/greeting.js";

/**
 * Caso de uso: orquesta la regla de negocio del saludo.
 * No conoce HTTP ni Express.
 */
export class GreetUseCase {
  execute(): Greeting {
    return { message: "Hola mundo" };
  }
}
