import { Aviso } from '@/componentes/aviso';

const DICA = 'Fotos de dia, mostrando o lote inteiro e alguns animais de perto. Vídeo de até 1 minuto com os animais andando.';

export function DicaFotos() {
  return <Aviso>{`Dica: ${DICA}`}</Aviso>;
}
