import { createHash } from 'node:crypto';
import { png, mp4 } from './arquivos-falsos.teste.js';
import {
  ArmazenamentoCloudinary,
  assinarParametros,
  assinaturaResposta,
  mesmaAssinatura,
  urlsCloudinary,
} from './cloudinary.js';
import { CloudinaryFalso } from './cloudinary-falso.teste.js';

describe('assinatura do Cloudinary', () => {
  it('confere com o exemplo da documentação', () => {
    const params = {
      timestamp: 1315060510,
      public_id: 'sample_image',
      eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop',
    };
    expect(assinarParametros(params, 'abcd')).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('deixa de fora file, api_key, resource_type, cloud_name e valores vazios', () => {
    const base = { public_id: 'sample_image', timestamp: 1315060510, eager: 'w_400,h_300,c_pad|w_260,h_200,c_crop' };
    expect(
      assinarParametros(
        { ...base, file: 'x', api_key: '123', resource_type: 'image', cloud_name: 'demo', folder: '' },
        'abcd',
      ),
    ).toBe('bfd09f95f331f558cbd1320e67aa8d488770583e');
  });

  it('assina a resposta do envio com public_id e version', () => {
    const esperado = createHash('sha1').update('public_id=arroba/lotes/l1/foto_1&version=1712345678abcd').digest('hex');
    expect(assinaturaResposta('arroba/lotes/l1/foto_1', 1712345678, 'abcd')).toBe(esperado);
    expect(assinaturaResposta('arroba/lotes/l1/foto_1', 1712345679, 'abcd')).not.toBe(esperado);
  });

  it('compara assinaturas sem diferenciar maiúsculas', () => {
    expect(mesmaAssinatura('abc123', 'ABC123')).toBe(true);
    expect(mesmaAssinatura('abc123', 'abc124')).toBe(false);
    expect(mesmaAssinatura('abc123', 'abc12')).toBe(false);
  });
});

describe('urlsCloudinary', () => {
  it('monta foto em tamanho de tela e miniatura 600x450', () => {
    expect(urlsCloudinary('demo', { tipo: 'foto', publicId: 'arroba/lotes/l1/foto_1', versao: 1712345678 })).toEqual({
      url: 'https://res.cloudinary.com/demo/image/upload/c_limit,w_1600,q_auto,f_auto/v1712345678/arroba/lotes/l1/foto_1',
      miniatura: 'https://res.cloudinary.com/demo/image/upload/c_fill,w_600,h_450,q_auto,f_auto/v1712345678/arroba/lotes/l1/foto_1',
    });
  });

  it('monta vídeo em MP4 e a capa com o primeiro quadro', () => {
    expect(urlsCloudinary('demo', { tipo: 'video', publicId: 'arroba/lotes/l1/video_1', versao: 1712345678 })).toEqual({
      url: 'https://res.cloudinary.com/demo/video/upload/q_auto/v1712345678/arroba/lotes/l1/video_1.mp4',
      miniatura: 'https://res.cloudinary.com/demo/video/upload/so_0,c_fill,w_600,h_450,q_auto/v1712345678/arroba/lotes/l1/video_1.jpg',
    });
  });

  it('funciona sem versão', () => {
    expect(urlsCloudinary('demo', { tipo: 'foto', publicId: 'a/b', versao: null }).url).toBe(
      'https://res.cloudinary.com/demo/image/upload/c_limit,w_1600,q_auto,f_auto/a/b',
    );
  });
});

describe('ArmazenamentoCloudinary contra um Cloudinary falso', () => {
  const conta = { apiKey: '987654321', apiSecret: 'segredo-do-teste', cloudName: 'demo' };
  let falso: CloudinaryFalso;
  let armazenamento: ArmazenamentoCloudinary;

  beforeAll(async () => {
    falso = await new CloudinaryFalso(conta).subir();
    armazenamento = new ArmazenamentoCloudinary({ ...conta, apiBase: falso.base });
  });

  afterAll(() => falso.fechar());

  beforeEach(() => {
    falso.falharBusca = false;
    falso.falharApagar = false;
  });

  async function enviar(tipo: 'foto' | 'video', publicId: string, arquivo: Buffer) {
    const envio = armazenamento.prepararEnvio({
      loteId: 'l1',
      tipo,
      mime: tipo === 'foto' ? 'image/png' : 'video/mp4',
      publicId,
      expiraEm: new Date(Date.now() + 60_000),
    });
    const form = new FormData();
    for (const [k, v] of Object.entries(envio.campos)) form.append(k, v);
    form.append(envio.campoArquivo, new Blob([new Uint8Array(arquivo)]), 'arquivo');
    const res = await fetch(envio.url, { method: 'POST', body: form });
    return { envio, status: res.status, corpo: await res.json() };
  }

  it('o envio assinado chega, a resposta é conferida e os dados reais são lidos', async () => {
    const { envio, status, corpo } = await enviar('foto', 'arroba/lotes/l1/foto_a', png(1200, 900, 500));
    expect(envio.url).toBe(`${falso.base}/v1_1/demo/image/upload`);
    expect(Object.keys(envio.campos).sort()).toEqual(['api_key', 'overwrite', 'public_id', 'signature', 'timestamp']);
    expect(JSON.stringify(envio)).not.toContain(conta.apiSecret);
    expect(status).toBe(200);
    expect(corpo).toMatchObject({ public_id: 'arroba/lotes/l1/foto_a', version: expect.any(Number) });
    expect(armazenamento.assinaturaValida(corpo.public_id, corpo.version, corpo.signature)).toBe(true);
    expect(armazenamento.assinaturaValida(corpo.public_id, corpo.version + 1, corpo.signature)).toBe(false);
    expect(armazenamento.assinaturaValida('arroba/lotes/l2/foto_a', corpo.version, corpo.signature)).toBe(false);

    expect(await armazenamento.buscarDados('foto', 'arroba/lotes/l1/foto_a')).toEqual({
      bytes: png(1200, 900, 500).length,
      largura: 1200,
      altura: 900,
      duracaoSeg: null,
      formato: 'png',
      url: `https://res.cloudinary.com/demo/image/upload/v${corpo.version}/arroba/lotes/l1/foto_a.png`,
    });
    expect(await armazenamento.buscarDados('video', 'arroba/lotes/l1/foto_a')).toBeNull();
    expect(await armazenamento.buscarDados('foto', 'arroba/lotes/l1/nao_existe')).toBeNull();
  });

  it('repetir o envio com o mesmo ticket não troca o arquivo (overwrite=false)', async () => {
    const primeiro = await enviar('foto', 'arroba/lotes/l1/foto_b', png(10, 10));
    const segundo = await enviar('foto', 'arroba/lotes/l1/foto_b', png(4000, 3000));
    expect(segundo.corpo.version).toBe(primeiro.corpo.version);
    expect((await armazenamento.buscarDados('foto', 'arroba/lotes/l1/foto_b'))?.largura).toBe(10);
  });

  it('lê a duração do vídeo e apaga com destroy assinado', async () => {
    const { corpo } = await enviar('video', 'arroba/lotes/l1/video_a', mp4(75));
    expect(armazenamento.assinaturaValida(corpo.public_id, corpo.version, corpo.signature)).toBe(true);
    expect(await armazenamento.buscarDados('video', 'arroba/lotes/l1/video_a')).toMatchObject({
      duracaoSeg: 75,
      formato: 'mp4',
    });
    await armazenamento.apagar('video', 'arroba/lotes/l1/video_a');
    expect(falso.apagados).toContainEqual({ recurso: 'video', publicId: 'arroba/lotes/l1/video_a' });
    expect(await armazenamento.buscarDados('video', 'arroba/lotes/l1/video_a')).toBeNull();
  });

  it('o Cloudinary recusa envio com assinatura alterada', async () => {
    const envio = armazenamento.prepararEnvio({
      loteId: 'l1',
      tipo: 'foto',
      mime: 'image/png',
      publicId: 'arroba/lotes/l1/foto_c',
      expiraEm: new Date(Date.now() + 60_000),
    });
    const form = new FormData();
    for (const [k, v] of Object.entries({ ...envio.campos, public_id: 'arroba/lotes/outro/foto_c' })) form.append(k, v);
    form.append('file', new Blob([new Uint8Array(png(1, 1))]), 'a.png');
    const res = await fetch(envio.url, { method: 'POST', body: form });
    expect(res.status).toBe(401);
  });

  it('falhas do Cloudinary viram erro para quem chamou', async () => {
    falso.falharBusca = true;
    await expect(armazenamento.buscarDados('foto', 'arroba/lotes/l1/foto_a')).rejects.toThrow(/Cloudinary respondeu 500/);
    falso.falharApagar = true;
    await expect(armazenamento.apagar('foto', 'arroba/lotes/l1/foto_a')).rejects.toThrow(/Cloudinary respondeu 500/);
  });
});
