import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { VIDEO_MAX_SEGUNDOS, mimePelaExtensao, normalizarMime, type TipoMidia } from '@arroba/shared';

/** Foto ou vídeo escolhido no celular, pronto para entrar na fila de envio. */
export type ArquivoEscolhido = {
  tipo: TipoMidia;
  uri: string;
  nome: string;
  mime: string;
  /** Bytes. Alguns Android não informam; aí é medido antes do envio. */
  tamanho: number | null;
  duracaoSeg: number | null;
  /** Só na web: o próprio arquivo escolhido. */
  arquivoWeb?: Blob;
};

export type ResultadoEscolha =
  | { tipo: 'ok'; arquivos: ArquivoEscolhido[] }
  | { tipo: 'cancelado' }
  | { tipo: 'sem-permissao'; recurso: 'camera' | 'galeria'; podePedirDeNovo: boolean }
  | { tipo: 'erro'; mensagem: string };

const opcoesFoto: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  // Bem mais leve que o original e ainda boa para ver o gado.
  quality: 0.7,
  // No iPhone entrega JPG em vez de HEIC, que o Android e muitos navegadores não mostram.
  preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
};

/** Galeria, várias fotos de uma vez. Na web o limite não vale: quem chama corta o excesso. */
export function escolherFotos(maximo: number) {
  return abrir('galeria', 'foto', () =>
    ImagePicker.launchImageLibraryAsync({
      ...opcoesFoto,
      allowsMultipleSelection: maximo > 1,
      selectionLimit: maximo,
      orderedSelection: true,
    }),
  );
}

export async function tirarFoto(): Promise<ResultadoEscolha> {
  try {
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) {
      return { tipo: 'sem-permissao', recurso: 'camera', podePedirDeNovo: permissao.canAskAgain };
    }
  } catch {
    return { tipo: 'erro', mensagem: 'Não foi possível abrir a câmera. Tente de novo.' };
  }
  return abrir('camera', 'foto', () => ImagePicker.launchCameraAsync(opcoesFoto));
}

export function escolherVideo() {
  return abrir('galeria', 'video', () =>
    ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: VIDEO_MAX_SEGUNDOS }),
  );
}

// Chamada direto do toque no botão, sem await antes: o navegador só abre o seletor durante o toque.
async function abrir(
  recurso: 'camera' | 'galeria',
  tipo: TipoMidia,
  seletor: () => Promise<ImagePicker.ImagePickerResult>,
): Promise<ResultadoEscolha> {
  try {
    const r = await seletor();
    if (r.canceled || !r.assets?.length) return { tipo: 'cancelado' };
    return { tipo: 'ok', arquivos: r.assets.map((a) => arquivoDoAsset(a, tipo)) };
  } catch (e) {
    // Sem permissão o seletor falha com uma mensagem em inglês; o resto é arquivo que não abre.
    if (e instanceof Error && /permission/i.test(e.message)) {
      return { tipo: 'sem-permissao', recurso, podePedirDeNovo: false };
    }
    return {
      tipo: 'erro',
      mensagem:
        tipo === 'foto'
          ? 'Não foi possível abrir a foto. Escolha uma foto JPG ou PNG.'
          : 'Não foi possível abrir o vídeo. Escolha um vídeo MP4 ou MOV.',
    };
  }
}

const EXTENSAO_DO_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
};

function arquivoDoAsset(a: ImagePicker.ImagePickerAsset, tipo: TipoMidia): ArquivoEscolhido {
  const mime =
    normalizarMime(a.mimeType ?? '') ||
    mimePelaExtensao(a.fileName || a.uri) ||
    (tipo === 'foto' ? 'image/jpeg' : 'video/mp4');
  return {
    tipo,
    uri: a.uri,
    nome: a.fileName || `${tipo}-${Date.now()}.${EXTENSAO_DO_MIME[mime] ?? 'bin'}`,
    mime,
    tamanho: a.fileSize || a.file?.size || null,
    // O seletor dá a duração em milissegundos no celular, mas em segundos na web.
    duracaoSeg: a.duration ? (Platform.OS === 'web' ? a.duration : a.duration / 1000) : null,
    arquivoWeb: a.file,
  };
}

/** Para quando o seletor não informa o tamanho. No celular o Blob fica fora da memória do JavaScript. */
export async function medirArquivo(uri: string): Promise<number | null> {
  try {
    const blob = await (await fetch(uri)).blob();
    return blob.size || null;
  } catch {
    return null;
  }
}
