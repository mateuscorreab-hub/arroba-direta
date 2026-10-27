import { isIP } from 'node:net';
import type { Request } from 'express';

/**
 * O IP de quem fez o pedido, completo: é o que fica nos registros de acesso (Marco Civil, art. 15).
 *
 * No Render todo pedido passa pela Cloudflare, que põe o IP de verdade em CF-Connecting-IP (e recusa o
 * pedido que já chega com esse cabeçalho) e em True-Client-IP. O X-Forwarded-For não serve: a pessoa pode
 * mandar um valor qualquer, e o Render só acrescenta o dele no fim. Sem os cabeçalhos (rodando no
 * computador, nos testes), vale o endereço da conexão. IPv4 escrito como IPv6 (::ffff:1.2.3.4) vira IPv4.
 */
export function ipCompleto(req: Pick<Request, 'headers' | 'socket'>): string | null {
  const doCabecalho = [req.headers['cf-connecting-ip'], req.headers['true-client-ip']]
    .map((v) => (Array.isArray(v) ? v[0] : v)?.trim())
    .find((v) => v && isIP(v));
  const ip = doCabecalho ?? req.socket.remoteAddress;
  if (!ip || !isIP(ip)) return null;
  return /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1] ?? ip.toLowerCase();
}

/**
 * O IP para limitar os códigos por conexão. Endereço IPv6 vira o bloco /64: um aparelho costuma ter o
 * bloco inteiro e troca de endereço dentro dele.
 */
export function ipDoCliente(req: Pick<Request, 'headers' | 'socket'>): string | null {
  const ip = ipCompleto(req);
  return ip && agrupar(ip);
}

function agrupar(ip: string): string {
  if (isIP(ip) === 4) return ip;
  const [inicio, fim = ''] = ip.split('::');
  const a = inicio ? inicio.split(':') : [];
  const b = ip.includes('::') && fim ? fim.split(':') : [];
  const grupos = ip.includes('::') ? [...a, ...Array<string>(8 - a.length - b.length).fill('0'), ...b] : a;
  return `${grupos
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}
