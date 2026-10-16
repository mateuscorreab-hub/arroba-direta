import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  FOTO_MAX_BYTES,
  LIMITES_MIDIA,
  MAX_FOTOS_LOTE,
  MAX_VIDEOS_LOTE,
  MIMES_FOTO,
  MIMES_VIDEO,
  VIDEO_MAX_BYTES,
  VIDEO_MAX_SEGUNDOS,
  duracaoVideoAceita,
  envioMidiaSchema,
  mimePelaExtensao,
  ordemMidiasSchema,
  registrarMidiaSchema,
} from './midias.js';

const MB = 1024 * 1024;

function camposComErro(dados: unknown): string[] {
  const r = envioMidiaSchema.safeParse(dados);
  return r.success ? [] : r.error.issues.map((i) => i.path.join('.'));
}

describe('limites', () => {
  it('são os combinados para o anúncio', () => {
    expect(MAX_FOTOS_LOTE).toBe(10);
    expect(MAX_VIDEOS_LOTE).toBe(1);
    expect(FOTO_MAX_BYTES).toBe(10 * MB);
    expect(VIDEO_MAX_BYTES).toBe(100 * MB);
    expect(VIDEO_MAX_SEGUNDOS).toBe(60);
    expect(LIMITES_MIDIA.foto).toEqual({ maximo: 10, maxBytes: 10 * MB, mimes: MIMES_FOTO });
    expect(LIMITES_MIDIA.video).toEqual({ maximo: 1, maxBytes: 100 * MB, mimes: MIMES_VIDEO });
  });

  it('aceita vídeo de até 62 segundos', () => {
    expect(duracaoVideoAceita(60)).toBe(true);
    expect(duracaoVideoAceita(62)).toBe(true);
    expect(duracaoVideoAceita(62.1)).toBe(false);
    expect(duracaoVideoAceita(90)).toBe(false);
  });
});

describe('envioMidiaSchema', () => {
  it.each(MIMES_FOTO)('aceita foto %s', (mime) => {
    expect(envioMidiaSchema.safeParse({ tipo: 'foto', mime, tamanho: 2 * MB }).success).toBe(true);
  });

  it.each(MIMES_VIDEO)('aceita vídeo %s', (mime) => {
    expect(envioMidiaSchema.safeParse({ tipo: 'video', mime, tamanho: 40 * MB }).success).toBe(true);
  });

  it('confere o formato pelo tipo escolhido', () => {
    expect(camposComErro({ tipo: 'foto', mime: 'video/mp4', tamanho: MB })).toEqual(['mime']);
    expect(camposComErro({ tipo: 'video', mime: 'image/jpeg', tamanho: MB })).toEqual(['mime']);
    expect(camposComErro({ tipo: 'foto', mime: 'image/gif', tamanho: MB })).toEqual(['mime']);
    expect(camposComErro({ tipo: 'video', mime: 'video/3gpp', tamanho: MB })).toEqual(['mime']);
  });

  it('confere o tamanho pelo tipo escolhido', () => {
    expect(camposComErro({ tipo: 'foto', mime: 'image/jpeg', tamanho: FOTO_MAX_BYTES })).toEqual([]);
    expect(camposComErro({ tipo: 'foto', mime: 'image/jpeg', tamanho: FOTO_MAX_BYTES + 1 })).toEqual(['tamanho']);
    expect(camposComErro({ tipo: 'video', mime: 'video/mp4', tamanho: FOTO_MAX_BYTES + 1 })).toEqual([]);
    expect(camposComErro({ tipo: 'video', mime: 'video/mp4', tamanho: VIDEO_MAX_BYTES })).toEqual([]);
    expect(camposComErro({ tipo: 'video', mime: 'video/mp4', tamanho: VIDEO_MAX_BYTES + 1 })).toEqual(['tamanho']);
  });

  it('explica o erro em português', () => {
    const r = envioMidiaSchema.safeParse({ tipo: 'video', mime: 'video/avi', tamanho: 200 * MB });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.message)).toEqual([
      'O vídeo precisa ser MP4 ou MOV',
      'Este vídeo é pesado demais (o limite é 100 MB). Grave um vídeo mais curto, de uns 30 segundos, ou mude a câmera para HD (720p).',
    ]);
    const foto = envioMidiaSchema.safeParse({ tipo: 'foto', mime: 'image/png', tamanho: 11 * MB });
    expect(foto.error?.issues[0].message).toBe('A foto passa de 10 MB. Escolha outra foto.');
  });

  it('recusa arquivo vazio, tamanho quebrado e tipo desconhecido', () => {
    expect(camposComErro({ tipo: 'foto', mime: 'image/jpeg', tamanho: 0 })).toEqual(['tamanho']);
    expect(camposComErro({ tipo: 'foto', mime: 'image/jpeg', tamanho: 1.5 })).toEqual(['tamanho']);
    expect(camposComErro({ tipo: 'audio', mime: 'image/jpeg', tamanho: MB })).toEqual(['tipo']);
  });

  it('corrige maiúsculas e o "image/jpg" de alguns Android', () => {
    expect(envioMidiaSchema.parse({ tipo: 'foto', mime: 'image/jpg', tamanho: MB }).mime).toBe('image/jpeg');
    expect(envioMidiaSchema.parse({ tipo: 'foto', mime: ' IMAGE/HEIC ', tamanho: MB }).mime).toBe('image/heic');
  });
});

describe('mimePelaExtensao', () => {
  it.each([
    ['file:///data/user/0/cache/IMG_0001.JPG', 'image/jpeg'],
    ['foto.jpeg', 'image/jpeg'],
    ['foto.heic', 'image/heic'],
    ['captura.png?v=2', 'image/png'],
    ['video.MOV', 'video/quicktime'],
    ['video.mp4', 'video/mp4'],
  ])('%s é %s', (nome, mime) => {
    expect(mimePelaExtensao(nome)).toBe(mime);
  });

  it.each(['sem-extensao', 'animado.gif', 'arquivo.constructor', ''])('não sabe dizer para "%s"', (nome) => {
    expect(mimePelaExtensao(nome)).toBeNull();
  });
});

describe('registrarMidiaSchema', () => {
  const valido = {
    tipo: 'foto',
    publicId: `arroba/lotes/${randomUUID()}/f_${randomUUID()}`,
    versao: 1791942823,
    assinatura: 'bfd09f95f331f558cbd1320e67aa8d488770583e',
  };

  it('aceita a resposta do envio', () => {
    expect(registrarMidiaSchema.parse(valido)).toEqual(valido);
  });

  it.each(['arroba/lotes/../../etc/passwd', '/arroba/lotes/x', 'arroba//lotes', 'foto.jpg', 'a/b/', ''])(
    'recusa publicId "%s"',
    (publicId) => {
      expect(registrarMidiaSchema.safeParse({ ...valido, publicId }).success).toBe(false);
    },
  );

  it('recusa assinatura que não é hexadecimal e versão que não é inteira', () => {
    expect(registrarMidiaSchema.safeParse({ ...valido, assinatura: 'xyz' }).success).toBe(false);
    expect(registrarMidiaSchema.safeParse({ ...valido, assinatura: 'g'.repeat(40) }).success).toBe(false);
    expect(registrarMidiaSchema.safeParse({ ...valido, versao: 1.5 }).success).toBe(false);
    expect(registrarMidiaSchema.safeParse({ ...valido, versao: '1791942823' }).success).toBe(false);
  });
});

describe('ordemMidiasSchema', () => {
  const ids = (n: number) => Array.from({ length: n }, () => randomUUID());

  it('aceita de 1 até todas as fotos e o vídeo', () => {
    expect(ordemMidiasSchema.safeParse({ ids: ids(1) }).success).toBe(true);
    expect(ordemMidiasSchema.safeParse({ ids: ids(MAX_FOTOS_LOTE + MAX_VIDEOS_LOTE) }).success).toBe(true);
  });

  it('recusa lista vazia, grande demais, repetida ou com id inválido', () => {
    expect(ordemMidiasSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(ordemMidiasSchema.safeParse({ ids: ids(MAX_FOTOS_LOTE + MAX_VIDEOS_LOTE + 1) }).success).toBe(false);
    const [a, b] = ids(2);
    const repetida = ordemMidiasSchema.safeParse({ ids: [a, b, a] });
    expect(repetida.error?.issues[0]).toMatchObject({
      path: ['ids'],
      message: 'A mesma foto aparece duas vezes na ordem',
    });
    expect(ordemMidiasSchema.safeParse({ ids: [a, 'nao-e-uuid'] }).success).toBe(false);
  });
});
