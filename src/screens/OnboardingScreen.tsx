import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  LayoutChangeEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import NightBackground from '../components/NightBackground';
import { colors, font, radius, spacing, glow } from '../theme';

export const ONBOARDING_KEY = 'onboarding_seen';

type Slide = {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  tint: string;
  title: string;
  body: string;
};

const SLIDES: Slide[] = [
  {
    icon: 'soccer',
    tint: colors.turf,
    title: 'CHUTE A GOL',
    body: 'Quatro modos de chute: Auto, Falta, Pênalti e Trilha. Cada um recarrega no seu tempo — volte sempre pra mandar mais uma na rede.',
  },
  {
    icon: 'tshirt-crew',
    tint: colors.turf,
    title: 'JOGUE PELO SEU TIME',
    body: 'Todo gol seu soma na partida de 24h do seu time no Brasileirão. É a torcida inteira chutando junto que decide a rodada.',
  },
  {
    icon: 'podium-gold',
    tint: colors.flood,
    title: 'SUBA NA ARTILHARIA',
    body: 'Dispute os rankings de hora, rodada e temporada. Mire na Bola de Ouro e vire o craque que todo mundo persegue.',
  },
];

export default function OnboardingScreen({ navigation }: any) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== width) setWidth(w);
  };

  const onMomentumEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (width > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  async function finish(dest: 'Register' | 'Login') {
    await AsyncStorage.setItem(ONBOARDING_KEY, '1').catch(() => {});
    navigation.replace(dest);
  }

  const next = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
      setIndex(index + 1);
    } else {
      finish('Register');
    }
  };

  const isLast = index === SLIDES.length - 1;

  return (
    <NightBackground>
      <View style={styles.root} onLayout={onLayout}>
        {/* pular */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => finish('Login')} hitSlop={10}>
            <Text style={styles.skip}>Pular</Text>
          </TouchableOpacity>
        </View>

        {width > 0 && (
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
            onMomentumScrollEnd={onMomentumEnd}
            scrollEventThrottle={16}
            style={{ flexGrow: 0 }}
          >
            {SLIDES.map((s) => (
              <View key={s.title} style={[styles.slide, { width }]}>
                <View style={[styles.ring, { borderColor: s.tint + '44' }, glow(s.tint + '66', 26)]}>
                  <MaterialCommunityIcons name={s.icon} size={72} color={s.tint} />
                </View>
                <Text style={styles.title}>{s.title}</Text>
                <Text style={styles.body}>{s.body}</Text>
              </View>
            ))}
          </Animated.ScrollView>
        )}

        {/* dots */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
            const opacity = scrollX.interpolate({ inputRange, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' });
            const scale = scrollX.interpolate({ inputRange, outputRange: [1, 1.5, 1], extrapolate: 'clamp' });
            return <Animated.View key={i} style={[styles.dot, { opacity, transform: [{ scale }] }]} />;
          })}
        </View>

        {/* CTA */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.button} onPress={next} activeOpacity={0.9}>
            <Text style={styles.buttonText}>{isLast ? 'ESCOLHER MEU TIME' : 'PRÓXIMO'}</Text>
            <MaterialCommunityIcons name={isLast ? 'shield-check' : 'arrow-right'} size={20} color={colors.night0} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => finish('Login')} style={styles.linkWrap} hitSlop={8}>
            <Text style={styles.link}>Já tenho conta</Text>
          </TouchableOpacity>
        </View>
      </View>
    </NightBackground>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  skip: { color: colors.haze, fontFamily: font.bodyMed, fontSize: 14 },

  slide: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.xxl, gap: spacing.lg },
  ring: {
    width: 148, height: 148, borderRadius: radius.pill, borderWidth: 2,
    backgroundColor: colors.panel, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  title: { color: colors.chalk, fontFamily: font.poster, fontSize: 34, letterSpacing: 1, textAlign: 'center' },
  body: { color: colors.haze, fontFamily: font.body, fontSize: 15, lineHeight: 23, textAlign: 'center', maxWidth: 320 },

  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: spacing.xl },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.turf },

  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.turf, borderRadius: radius.md, paddingVertical: 16, ...glow(colors.turfGlow, 14),
  },
  buttonText: { color: colors.night0, fontFamily: font.bodyBold, fontSize: 16, letterSpacing: 1 },
  linkWrap: { alignItems: 'center' },
  link: { color: colors.haze, fontFamily: font.bodyMed, fontSize: 14 },
});
