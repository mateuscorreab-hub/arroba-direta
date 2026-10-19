import { NotFoundException, ParseUUIDPipe } from '@nestjs/common';

/** Id (UUID) da URL. Um id malformado responde 404 com a mesma mensagem de um id que não existe. */
export function idPipe(mensagem: string) {
  return new ParseUUIDPipe({ exceptionFactory: () => new NotFoundException({ mensagem }) });
}
