/** Arquivos mínimos para os testes: só os cabeçalhos que a API e o Cloudinary falso leem. */

function caixa(tipo: string, ...dados: Buffer[]): Buffer {
  const corpo = Buffer.concat(dados);
  const tamanho = Buffer.alloc(4);
  tamanho.writeUInt32BE(8 + corpo.length);
  return Buffer.concat([tamanho, Buffer.from(tipo, 'latin1'), corpo]);
}

export function png(largura: number, altura: number, extra = 0): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr.set([8, 2, 0, 0, 0], 8);
  const bloco = (tipo: string, dados: Buffer) => {
    const t = Buffer.alloc(4);
    t.writeUInt32BE(dados.length);
    return Buffer.concat([t, Buffer.from(tipo, 'latin1'), dados, Buffer.alloc(4)]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco('IHDR', ihdr),
    bloco('IEND', Buffer.alloc(0)),
    Buffer.alloc(extra, 7),
  ]);
}

export function jpg(largura: number, altura: number): Buffer {
  const app0 = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const sof = Buffer.from([0xff, 0xc0, 0x00, 0x11, 8, 0, 0, 0, 0, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  sof.writeUInt16BE(altura, 5);
  sof.writeUInt16BE(largura, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof, Buffer.alloc(64, 3), Buffer.from([0xff, 0xd9])]);
}

/** MP4 (ou MOV) com a duração na caixa mvhd. moovNoFim imita câmeras que gravam o índice depois do vídeo. */
export function mp4(segundos: number, { mov = false, versao1 = false, moovNoFim = false, extra = 256 } = {}): Buffer {
  const escala = 600;
  const mvhd = Buffer.alloc(versao1 ? 112 : 100);
  mvhd[0] = versao1 ? 1 : 0;
  if (versao1) {
    mvhd.writeUInt32BE(escala, 20);
    mvhd.writeBigUInt64BE(BigInt(Math.round(segundos * escala)), 24);
  } else {
    mvhd.writeUInt32BE(escala, 12);
    mvhd.writeUInt32BE(Math.round(segundos * escala), 16);
  }
  const ftyp = caixa('ftyp', Buffer.from(mov ? 'qt  ' : 'isom', 'latin1'), Buffer.alloc(4), Buffer.from('isom'));
  const moov = caixa('moov', caixa('mvhd', mvhd));
  const mdat = caixa('mdat', Buffer.alloc(extra, 9));
  return Buffer.concat(moovNoFim ? [ftyp, mdat, moov] : [ftyp, moov, mdat]);
}
