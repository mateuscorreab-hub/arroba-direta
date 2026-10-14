import path from 'node:path';
import { PASTA_LOCAL_PADRAO, lerCloudinaryUrl, lerConfigMidia } from './config-midia.js';

const URL_CLOUDINARY = 'cloudinary://123456789012345:Segredo_Muito-Secreto9@minha-conta';

describe('lerConfigMidia', () => {
  it('usa "local" sem variáveis, com a pasta apps/api/uploads e a porta da API', () => {
    const c = lerConfigMidia({});
    expect(c.modo).toBe('local');
    if (c.modo !== 'local') return;
    expect(c.local.pasta).toBe(PASTA_LOCAL_PADRAO);
    expect(c.local.pasta.endsWith(path.join('apps', 'api', 'uploads'))).toBe(true);
    expect(c.local.urlPublica).toBe('http://localhost:3333');
    expect(c.local.segredo).toMatch(/^[0-9a-f]{64}$/);

    const outra = lerConfigMidia({ PORT: '4000' });
    expect(outra.modo === 'local' && outra.local.urlPublica).toBe('http://localhost:4000');
    // Segredo aleatório por processo (aqui, por leitura).
    expect(outra.modo === 'local' && outra.local.segredo).not.toBe(c.local.segredo);
  });

  it('usa "cloudinary" quando CLOUDINARY_URL existe', () => {
    expect(lerConfigMidia({ CLOUDINARY_URL: URL_CLOUDINARY, RENDER: 'true' })).toEqual({
      modo: 'cloudinary',
      cloudinary: {
        apiKey: '123456789012345',
        apiSecret: 'Segredo_Muito-Secreto9',
        cloudName: 'minha-conta',
        apiBase: 'https://api.cloudinary.com',
      },
    });
  });

  it('usa "desligado" no Render sem CLOUDINARY_URL (o disco de lá é apagado a cada reinício)', () => {
    expect(lerConfigMidia({ RENDER: 'true' })).toEqual({ modo: 'desligado' });
    expect(lerConfigMidia({ RENDER: 'true', CLOUDINARY_URL: ' ' })).toEqual({ modo: 'desligado' });
  });

  it('respeita o modo escolhido', () => {
    expect(lerConfigMidia({ MIDIA_ARMAZENAMENTO: 'desligado', CLOUDINARY_URL: URL_CLOUDINARY })).toEqual({
      modo: 'desligado',
    });
    expect(lerConfigMidia({ MIDIA_ARMAZENAMENTO: 'local', CLOUDINARY_URL: URL_CLOUDINARY }).modo).toBe('local');
    expect(lerConfigMidia({ MIDIA_ARMAZENAMENTO: ' local ', RENDER: 'true' }).modo).toBe('local');
  });

  it('não sobe com "cloudinary" sem CLOUDINARY_URL', () => {
    expect(() => lerConfigMidia({ MIDIA_ARMAZENAMENTO: 'cloudinary' })).toThrow(
      /MIDIA_ARMAZENAMENTO=cloudinary precisa de CLOUDINARY_URL no formato cloudinary:\/\/API_KEY:API_SECRET@CLOUD_NAME/,
    );
  });

  it('não sobe com CLOUDINARY_URL inválida e não mostra o segredo na mensagem', () => {
    for (const valor of [
      'https://123:Segredo_Muito-Secreto9@minha-conta',
      'cloudinary://123@minha-conta',
      'cloudinary://123:Segredo_Muito-Secreto9@',
      'Segredo_Muito-Secreto9',
    ]) {
      let mensagem = '';
      try {
        lerConfigMidia({ CLOUDINARY_URL: valor });
      } catch (e) {
        mensagem = (e as Error).message;
      }
      expect(mensagem).toMatch(/^CLOUDINARY_URL inválida/);
      expect(mensagem).not.toContain('Segredo_Muito-Secreto9');
    }
  });

  it('não sobe com modo desconhecido', () => {
    expect(() => lerConfigMidia({ MIDIA_ARMAZENAMENTO: 's3' })).toThrow(
      'MIDIA_ARMAZENAMENTO inválido: "s3". Use "cloudinary", "local" ou "desligado".',
    );
    expect(() => lerConfigMidia({ MIDIA_ARMAZENAMENTO: 'Local' })).toThrow(/MIDIA_ARMAZENAMENTO inválido/);
  });

  it('aceita a base da API do Cloudinary para testes', () => {
    const c = lerConfigMidia({ CLOUDINARY_URL: URL_CLOUDINARY, CLOUDINARY_API_BASE: 'http://127.0.0.1:3456/' });
    expect(c.modo === 'cloudinary' && c.cloudinary.apiBase).toBe('http://127.0.0.1:3456');
    expect(() => lerConfigMidia({ CLOUDINARY_URL: URL_CLOUDINARY, CLOUDINARY_API_BASE: 'ftp://x' })).toThrow(
      /CLOUDINARY_API_BASE inválida/,
    );
  });

  it('lê pasta, endereço público e segredo do modo local', () => {
    const c = lerConfigMidia({
      MIDIA_ARMAZENAMENTO: 'local',
      MIDIA_PASTA_LOCAL: 'tmp/fotos',
      API_URL_PUBLICA: 'http://192.168.0.10:3333/',
      MIDIA_SEGREDO_LOCAL: 'um-segredo-bem-comprido',
    });
    expect(c).toEqual({
      modo: 'local',
      local: {
        pasta: path.resolve('tmp/fotos'),
        urlPublica: 'http://192.168.0.10:3333',
        segredo: 'um-segredo-bem-comprido',
      },
    });
    expect(() => lerConfigMidia({ API_URL_PUBLICA: 'localhost:3333' })).toThrow(/API_URL_PUBLICA inválida/);
    expect(() => lerConfigMidia({ API_URL_PUBLICA: 'nada' })).toThrow(/API_URL_PUBLICA inválida/);
    expect(() => lerConfigMidia({ MIDIA_SEGREDO_LOCAL: 'curto' })).toThrow(/MIDIA_SEGREDO_LOCAL muito curto/);
  });
});

describe('lerCloudinaryUrl', () => {
  it('separa chave, segredo e nome da conta', () => {
    expect(lerCloudinaryUrl(` ${URL_CLOUDINARY} `)).toEqual({
      apiKey: '123456789012345',
      apiSecret: 'Segredo_Muito-Secreto9',
      cloudName: 'minha-conta',
    });
    expect(lerCloudinaryUrl('cloudinary://1:abc@demo/').cloudName).toBe('demo');
    expect(lerCloudinaryUrl('cloudinary://1:abc@demo?secure=true').cloudName).toBe('demo');
  });

  it('recusa formato errado', () => {
    expect(() => lerCloudinaryUrl('cloudinary://1:abc@')).toThrow(/CLOUDINARY_URL inválida/);
    expect(() => lerCloudinaryUrl('cloudinary://1:a b@demo')).toThrow(/CLOUDINARY_URL inválida/);
  });
});
