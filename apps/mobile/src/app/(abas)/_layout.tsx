import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useTheme } from '@/hooks/use-theme';

export default function Abas() {
  const tema = useTheme();
  return (
    <NativeTabs
      backgroundColor={tema.background}
      indicatorColor={tema.backgroundSelected}
      labelStyle={{ selected: { color: tema.brand } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Buscar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="anunciar">
        <NativeTabs.Trigger.Label>Anunciar</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="plus.circle" md="add_circle" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="perfil">
        <NativeTabs.Trigger.Label>Perfil</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.crop.circle" md="account_circle" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
