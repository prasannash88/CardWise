import Ionicons from '@expo/vector-icons/Ionicons';
import Tabs from 'expo-router/tabs';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';
import { useTheme } from '../../components/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

export default function TabsLayout() {
  const t = useTheme();
  const icon = (name: IconName) => ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color as string} size={size} />
  );
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.panel },
        headerTintColor: t.text,
        tabBarStyle: { backgroundColor: t.panel, borderTopColor: t.border },
        tabBarActiveTintColor: t.accent,
        tabBarInactiveTintColor: t.sub,
        sceneStyle: { backgroundColor: t.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: icon('home-outline') }} />
      <Tabs.Screen name="lounge" options={{ title: 'Lounge', tabBarIcon: icon('airplane-outline') }} />
      <Tabs.Screen name="transactions" options={{ title: 'Spends', tabBarIcon: icon('receipt-outline') }} />
      <Tabs.Screen name="best" options={{ title: 'Best card', tabBarIcon: icon('sparkles-outline') }} />
      <Tabs.Screen name="more" options={{ title: 'More', tabBarIcon: icon('ellipsis-horizontal') }} />
    </Tabs>
  );
}
