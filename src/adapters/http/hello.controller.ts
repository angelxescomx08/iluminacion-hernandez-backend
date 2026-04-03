import type { Request, Response } from "express";
import type { GreetUseCase } from "../../use-cases/greet.use-case.js";

/**
 * Adaptador HTTP: traduce la petición/respuesta Express al caso de uso.
 */
export class HelloController {
  constructor(private readonly greetUseCase: GreetUseCase) {}

  getHello = (_req: Request, res: Response): void => {
    const greeting = this.greetUseCase.execute();
    res.json(greeting);
  };
}
