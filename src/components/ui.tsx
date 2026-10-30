import { type ReactNode } from 'react';
import {
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, useColorScheme, View, type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { isValidISO, todayISO, addDays } from '../lib/dates';

const light = {
  bg: '#F4F6FA', panel: '#FFFFFF', text: '#111827', sub: '#6B7280', border: '#E5E7EB', accent: '#1E5EFF',
  accentText: '#FFFFFF', good: '#0E9F6E', goodBg: '#E6F6EF', warn: '#B45309', warnBg: '#FEF3C7', bad: '#DC2626',
  badBg: '#FDECEC', track: '#E5E7EB', inputBg: '#F9FAFB',
};
const dark: typeof light = {
  bg: '#0B0F17', panel: '#151B26', text: '#F3F4F6', sub: '#9CA3AF', border: '#263041', accent: '#5B8CFF',
  accentText: '#FFFFFF', good: '#34D399', goodBg: '#0F2E24', warn: '#FBBF24', warnBg: '#33280B', bad: '#F87171',
  badBg: '#3A1515', track: '#263041', inputBg: '#0F141D',
};

export type Theme = typeof light;
export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const t = useTheme();
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>
      ) : (
        <View style={[styles.screen, { flex: 1 }]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function Panel({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useTheme();
  const s = [styles.panel, { backgroundColor: t.panel, borderColor: t.border }, style];
  return onPress ? (
    <Pressable onPress={onPress} style={({ pressed }) => [...s, pressed && { opacity: 0.7 }]}>{children}</Pressable>
  ) : (
    <View style={s}>{children}</View>
  );
}

export function H1({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[styles.h1, { color: t.text }]}>{children}</Text>;
}

export function H2({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.h2row}>
      <Text style={[styles.h2, { color: t.text }]}>{children}</Text>
      {right}
    </View>
  );
}

export function T({ children, sub, bold, tone, size, style, numberOfLines }: {
  children: ReactNode; sub?: boolean; bold?: boolean; tone?: 'good' | 'warn' | 'bad' | 'accent'; size?: number;
  style?: object; numberOfLines?: number;
}) {
  const t = useTheme();
  const color = tone ? t[tone] : sub ? t.sub : t.text;
  return (
    <Text numberOfLines={numberOfLines} style={[{ color, fontSize: size ?? (sub ? 13 : 15), fontWeight: bold ? '600' : '400' }, style]}>
      {children}
    </Text>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

export function KV({ k, v, tone }: { k: string; v: ReactNode; tone?: 'good' | 'warn' | 'bad' }) {
  return (
    <Row style={{ paddingVertical: 3 }}>
      <T sub>{k}</T>
      {typeof v === 'string' || typeof v === 'number' ? <T bold tone={tone}>{v}</T> : v}
    </Row>
  );
}

export function Tag({ label, tone }: { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const t = useTheme();
  const map = {
    good: [t.goodBg, t.good], warn: [t.warnBg, t.warn], bad: [t.badBg, t.bad], neutral: [t.track, t.sub],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function Progress({ pct, tone = 'accent' }: { pct: number; tone?: 'accent' | 'good' | 'warn' | 'bad' }) {
  const t = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: t.track }]}>
      <View style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%`, backgroundColor: t[tone], height: '100%', borderRadius: 4 }} />
    </View>
  );
}

export function Button({ title, onPress, kind = 'primary', disabled, small }: {
  title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; disabled?: boolean; small?: boolean;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'danger' ? t.badBg : t.panel;
  const fg = kind === 'primary' ? t.accentText : kind === 'danger' ? t.bad : t.accent;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button, small && styles.buttonSmall,
        { backgroundColor: bg, borderColor: kind === 'secondary' ? t.border : bg, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, hint, ...props }: TextInputProps & { label: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      <T sub>{label}</T>
      <TextInput
        placeholderTextColor={t.sub}
        {...props}
        style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.inputBg }, props.multiline && { minHeight: 90, textAlignVertical: 'top' }]}
      />
      {hint ? <T sub size={12}>{hint}</T> : null}
    </View>
  );
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const today = todayISO();
  const bad = value !== '' && !isValidISO(value);
  return (
    <View>
      <Field label={label} value={value} onChangeText={onChange} placeholder="YYYY-MM-DD" autoCapitalize="none"
        hint={bad ? 'Use the format YYYY-MM-DD' : undefined} />
      <Row style={{ justifyContent: 'flex-start', gap: 8, marginTop: -6, marginBottom: 12 }}>
        <Chip label="Today" selected={value === today} onPress={() => onChange(today)} />
        <Chip label="Yesterday" selected={value === addDays(today, -1)} onPress={() => onChange(addDays(today, -1))} />
      </Row>
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.accent : t.panel }]}
    >
      <Text style={{ color: selected ? t.accentText : t.text, fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Select<V extends string | number>({ label, options, value, onChange }: {
  label?: string; options: { label: string; value: V }[]; value: V | null; onChange: (v: V) => void;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <T sub>{label}</T> : null}
      <View style={styles.wrap}>
        {options.map((o) => (
          <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
        ))}
      </View>
    </View>
  );
}

export function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <View style={{ marginBottom: 10 }}>
      <Row>
        <T>{label}</T>
        <Switch value={value} onValueChange={onChange} />
      </Row>
      {hint ? <T sub size={12}>{hint}</T> : null}
    </View>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <Panel style={{ alignItems: 'center', paddingVertical: 28 }}>
      <T bold>{title}</T>
      {children ? <View style={{ marginTop: 8, alignItems: 'center', gap: 8 }}>{children}</View> : null}
    </Panel>
  );
}

export const styles = StyleSheet.create({
  screen: { padding: 16, paddingBottom: 48, gap: 12 },
  panel: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 6 },
  h1: { fontSize: 22, fontWeight: '700' },
  h2row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  h2: { fontSize: 17, fontWeight: '700' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden', marginVertical: 4 },
  button: { borderRadius: 10, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderWidth: 1 },
  buttonSmall: { paddingVertical: 7, paddingHorizontal: 12 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginTop: 4 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
});
