import { open } from 'node:fs/promises';
import { crc32, deflateSync } from 'node:zlib';
import type { TipoMidia } from '@arroba/shared';

/** Formatos aceitos, com a extensão usada no arquivo. */
export type Formato = 'jpg' | 'png' | 'webp' | 'heic' | 'mp4' | 'mov';

export const TIPO_DO_FORMATO: Record<Formato, TipoMidia> = {
  jpg: 'foto',
  png: 'foto',
  webp: 'foto',
  heic: 'foto',
  mp4: 'video',
  mov: 'video',
};

/** Formatos que o Cloudinary informa e que aceitamos em cada tipo. */
export const FORMATOS_ACEITOS: Record<TipoMidia, readonly string[]> = {
  foto: ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'],
  video: ['mp4', 'mov'],
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MARCAS_HEIC = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1', 'heif']);
const CAIXAS_MOV = new Set(['moov', 'mdat', 'wide', 'free', 'skip', 'pnot']);

/** Descobre o formato pelos primeiros bytes (não confia no nome nem no tipo informado). */
export function detectarFormato(c: Buffer): Formato | null {
  if (c.length < 12) return null;
  if (c[0] === 0xff && c[1] === 0xd8 && c[2] === 0xff) return 'jpg';
  if (c.subarray(0, 8).equals(PNG)) return 'png';
  if (c.toString('latin1', 0, 4) === 'RIFF' && c.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  const caixa = c.toString('latin1', 4, 8);
  if (caixa === 'ftyp') {
    const marca = c.toString('latin1', 8, 12);
    if (MARCAS_HEIC.has(marca)) return 'heic';
    if (marca === 'avif' || marca === 'avis') return null;
    return marca === 'qt  ' ? 'mov' : 'mp4';
  }
  return CAIXAS_MOV.has(caixa) ? 'mov' : null;
}

export interface Dimensoes {
  largura: number | null;
  altura: number | null;
}

/** Largura e altura a partir do começo do arquivo (JPG, PNG e WEBP; HEIC fica sem). */
export function dimensoesImagem(formato: Formato, c: Buffer): Dimensoes {
  const nada = { largura: null, altura: null };
  try {
    if (formato === 'png') return { largura: c.readUInt32BE(16), altura: c.readUInt32BE(20) };
    if (formato === 'webp') {
      const bloco = c.toString('latin1', 12, 16);
      if (bloco === 'VP8X') return { largura: 1 + c.readUIntLE(24, 3), altura: 1 + c.readUIntLE(27, 3) };
      if (bloco === 'VP8L') {
        const bits = c.readUInt32LE(21);
        return { largura: (bits & 0x3fff) + 1, altura: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (bloco === 'VP8 ') return { largura: c.readUInt16LE(26) & 0x3fff, altura: c.readUInt16LE(28) & 0x3fff };
      return nada;
    }
    if (formato === 'jpg') {
      let i = 2;
      while (i + 9 < c.length) {
        if (c[i] !== 0xff) return nada;
        const marcador = c[i + 1];
        // SOF0..SOF15, menos DHT (C4), JPG (C8) e DAC (CC).
        if (marcador >= 0xc0 && marcador <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marcador)) {
          return { altura: c.readUInt16BE(i + 5), largura: c.readUInt16BE(i + 7) };
        }
        i += 2 + c.readUInt16BE(i + 2);
      }
    }
  } catch {
    // Arquivo truncado: fica sem dimensões.
  }
  return nada;
}

type Ler = (posicao: number, tamanho: number) => Promise<Buffer>;

async function acharCaixa(ler: Ler, inicio: number, fim: number, tipo: string) {
  let pos = inicio;
  for (let i = 0; i < 10_000 && pos + 8 <= fim; i++) {
    const h = await ler(pos, 16);
    if (h.length < 8) return null;
    let tamanho = h.readUInt32BE(0);
    let cabecalho = 8;
    if (tamanho === 1) {
      if (h.length < 16) return null;
      tamanho = Number(h.readBigUInt64BE(8));
      cabecalho = 16;
    } else if (tamanho === 0) {
      tamanho = fim - pos;
    }
    if (tamanho < cabecalho) return null;
    if (h.toString('latin1', 4, 8) === tipo) return { dados: pos + cabecalho, fim: Math.min(pos + tamanho, fim) };
    pos += tamanho;
  }
  return null;
}

/** Duração em segundos de um MP4/MOV, lida da caixa moov/mvhd. */
export async function duracaoVideo(ler: Ler, tamanhoArquivo: number): Promise<number | null> {
  const moov = await acharCaixa(ler, 0, tamanhoArquivo, 'moov');
  const mvhd = moov && (await acharCaixa(ler, moov.dados, moov.fim, 'mvhd'));
  if (!mvhd) return null;
  const b = await ler(mvhd.dados, 32);
  if (b.length < 20) return null;
  const v1 = b[0] === 1;
  if (v1 && b.length < 32) return null;
  const escala = v1 ? b.readUInt32BE(20) : b.readUInt32BE(12);
  const duracao = v1 ? Number(b.readBigUInt64BE(24)) : b.readUInt32BE(16);
  return escala > 0 ? Math.round((duracao / escala) * 1000) / 1000 : null;
}

export const lerDeBuffer =
  (buf: Buffer): Ler =>
  async (posicao, tamanho) =>
    buf.subarray(posicao, posicao + tamanho);

/** Dados reais de um arquivo já gravado (modo local). Sem dados quando não dá para ler. */
export async function lerDadosArquivo(caminho: string, formato: Formato) {
  const arquivo = await open(caminho, 'r');
  try {
    const { size } = await arquivo.stat();
    const ler: Ler = async (posicao, tamanho) => {
      const b = Buffer.alloc(tamanho);
      const { bytesRead } = await arquivo.read(b, 0, tamanho, posicao);
      return b.subarray(0, bytesRead);
    };
    if (TIPO_DO_FORMATO[formato] === 'video') {
      return { bytes: size, largura: null, altura: null, duracaoSeg: await duracaoVideo(ler, size) };
    }
    // Os metadados (EXIF) ficam antes das dimensões no JPG; 256 KB bastam.
    return { bytes: size, ...dimensoesImagem(formato, await ler(0, 256 * 1024)), duracaoSeg: null };
  } finally {
    await arquivo.close();
  }
}

let capaVideo: Buffer | undefined;

/** PNG 600x450 com um "play", usado como capa de vídeo no modo local (lá não há quadro do vídeo). */
export function capaVideoPng(): Buffer {
  if (capaVideo) return capaVideo;
  const [l, a] = [600, 450];
  const linhas = Buffer.alloc(a * (1 + l * 3));
  for (let y = 0; y < a; y++) {
    const inicio = y * (1 + l * 3);
    for (let x = 0; x < l; x++) {
      // Triângulo apontando para a direita, no centro.
      const dx = x - 265;
      const dy = Math.abs(y - a / 2);
      const play = dx >= 0 && dx <= 90 && dy <= 52 - (dx * 52) / 90;
      linhas.fill(play ? 0xe0 : 0x3a, inicio + 1 + x * 3, inicio + 4 + x * 3);
    }
  }
  const bloco = (tipo: string, dados: Buffer) => {
    const tamanho = Buffer.alloc(4);
    tamanho.writeUInt32BE(dados.length);
    const corpo = Buffer.concat([Buffer.from(tipo, 'latin1'), dados]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(corpo));
    return Buffer.concat([tamanho, corpo, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(l, 0);
  ihdr.writeUInt32BE(a, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  capaVideo = Buffer.concat([
    PNG,
    bloco('IHDR', ihdr),
    bloco('IDAT', deflateSync(linhas, { level: 9 })),
    bloco('IEND', Buffer.alloc(0)),
  ]);
  return capaVideo;
}

const MB = 1024 * 1024;

export function mensagemTamanho(tipo: TipoMidia, maxBytes: number): string {
  return tipo === 'foto'
    ? `A foto passa de ${Math.round(maxBytes / MB)} MB. Escolha outra foto.`
    : `O vídeo passa de ${Math.round(maxBytes / MB)} MB. Grave um vídeo mais curto, de até 1 minuto.`;
}

export function mensagemFormato(tipo: TipoMidia): string {
  return tipo === 'foto'
    ? 'O arquivo não é uma foto. Envie JPG, PNG, WEBP ou HEIC.'
    : 'O arquivo não é um vídeo. Envie MP4 ou MOV.';
}
