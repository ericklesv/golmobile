/**
 * Design system do GolMobile — tema "Estádio à noite".
 * Fundo azul-meia-noite + gramado luminoso + linhas de cal + âmbar de refletor.
 * Toda cor/tipografia/espaçamento da UI deve sair daqui (nada de hex solto nas telas).
 */
export const colors = {
  night0: '#04101B', // céu mais profundo (topo do gradiente)
  night1: '#0A1B2B', // arquibancada escura (base do gradiente)
  panel: '#11253C', // painéis/cards sob a luz
  panelHi: '#16324F', // topo iluminado do painel
  line: '#22405F', // divisórias, bordas discretas

  turf: '#22E58A', // gramado — ação principal / positivo
  turfDeep: '#0E3B2A', // sombra do gramado
  turfGlow: 'rgba(34,229,138,0.35)',

  chalk: '#EDF4F3', // linhas de cal — texto principal
  haze: '#8098AE', // névoa dos holofotes — texto secundário
  hazeDim: '#54697E', // texto terciário / desabilitado

  flood: '#FFC24B', // refletor âmbar — placar, recordes, liderança
  floodGlow: 'rgba(255,194,75,0.30)',

  red: '#FF5470', // cartão / defendido / perdendo
  redGlow: 'rgba(255,84,112,0.30)',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

// Famílias carregadas em App.tsx (@expo-google-fonts)
export const font = {
  poster: 'Anton_400Regular', // display ultra-condensado (GOL!, títulos fortes)
  score: 'SairaCondensed_700Bold', // numerais de placar
  scoreMed: 'SairaCondensed_600SemiBold',
  body: 'Inter_400Regular',
  bodyMed: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
} as const;

// Sombra/brilho reutilizável (funciona no nativo; no web vira boxShadow)
export const glow = (color: string, radius = 16) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: 0 },
  shadowOpacity: 1,
  shadowRadius: radius,
  elevation: 8,
});
