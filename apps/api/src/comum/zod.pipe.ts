import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida o corpo ou a query com um schema do pacote @arroba/shared. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const r = this.schema.safeParse(value);
    if (!r.success) {
      throw new BadRequestException({
        mensagem: 'Dados inválidos',
        erros: r.error.issues.map((i) => ({ campo: i.path.join('.'), mensagem: i.message })),
      });
    }
    return r.data;
  }
}
