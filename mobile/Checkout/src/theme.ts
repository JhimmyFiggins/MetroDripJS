// Centralize the Figma color variables so every component uses the same tokens.
export const colors = {
  paper: '#FFFFFF',
  ink: '#141414',
  muted: '#63635C',
  border: '#E4E4DF',
  surface: '#F4F4F2',
  volt: '#D3EE42',
  onVolt: '#141414',
  olive: '#5C6B12',
  danger: '#B42318',
  overlay: 'rgba(20, 20, 20, 0.34)',
} as const;

// Name the installed font files once so styles remain easy to audit.
export const fonts = {
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
  monoRegular: 'IBMPlexMono_400Regular',
  monoSemiBold: 'IBMPlexMono_600SemiBold',
  anton: 'Anton_400Regular',
  helveticaNeue: 'Helvetica Neue',
  helveticaNeueBold: 'HelveticaNeue-Bold',
  helveticaNeueMedium: 'HelveticaNeue-Medium',
  default: 'System',
};
