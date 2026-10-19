import { ipDoCliente } from './ip-do-cliente.js';

const pedido = (headers: Record<string, string | string[]>, remoteAddress?: string) =>
  ({ headers, socket: { remoteAddress } }) as unknown as Parameters<typeof ipDoCliente>[0];

describe('ipDoCliente', () => {
  it('usa o IP que a Cloudflare põe na frente do Render', () => {
    expect(ipDoCliente(pedido({ 'cf-connecting-ip': '200.10.20.30' }, '10.0.0.1'))).toBe('200.10.20.30');
    expect(ipDoCliente(pedido({ 'true-client-ip': '200.10.20.31' }, '10.0.0.1'))).toBe('200.10.20.31');
  });

  it('não confia no X-Forwarded-For, que a pessoa pode inventar', () => {
    expect(ipDoCliente(pedido({ 'x-forwarded-for': '1.2.3.4, 200.10.20.30' }, '10.0.0.1'))).toBe('10.0.0.1');
  });

  it('sem os cabeçalhos, usa o endereço da conexão; IPv4 dentro de IPv6 vira IPv4', () => {
    expect(ipDoCliente(pedido({}, '::ffff:127.0.0.1'))).toBe('127.0.0.1');
    expect(ipDoCliente(pedido({}, '127.0.0.1'))).toBe('127.0.0.1');
  });

  it('ignora cabeçalho que não é um IP', () => {
    expect(ipDoCliente(pedido({ 'cf-connecting-ip': 'abc' }, '10.0.0.1'))).toBe('10.0.0.1');
    expect(ipDoCliente(pedido({ 'cf-connecting-ip': '' }, undefined))).toBeNull();
  });

  it('IPv6 conta pelo bloco /64, escrito sempre do mesmo jeito', () => {
    const bloco = '2804:14c:5b:8001::/64';
    expect(ipDoCliente(pedido({ 'cf-connecting-ip': '2804:14c:5b:8001:a1b2:c3d4:e5f6:1' }))).toBe(bloco);
    expect(ipDoCliente(pedido({ 'cf-connecting-ip': '2804:014c:005b:8001::9' }))).toBe(bloco);
    expect(ipDoCliente(pedido({ 'cf-connecting-ip': '2804:14C:5B:8001:0:0:0:2' }))).toBe(bloco);
    expect(ipDoCliente(pedido({ 'cf-connecting-ip': '2001:db8::1' }))).toBe('2001:db8:0:0::/64');
    expect(ipDoCliente(pedido({}, '::1'))).toBe('0:0:0:0::/64');
  });
});
