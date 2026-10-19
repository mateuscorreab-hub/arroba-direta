import { useKeepAwake } from 'expo-keep-awake';

/** Tela apagada manda o app para segundo plano, e o envio para. Cada tela que monta este componente tem a sua trava. */
export function ManterTelaLigada() {
  useKeepAwake(undefined, { suppressDeactivateWarnings: true });
  return null;
}
