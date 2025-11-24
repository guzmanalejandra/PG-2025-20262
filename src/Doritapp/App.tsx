// App.tsx — Fonema /m/ con audio local (expo-av) + TTS fall-back + fix de audio en Onboarding
import React, { useEffect, useRef, useState, useMemo } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  Animated,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Speech from "expo-speech";
import { Audio } from "expo-av";                            // 🔊 expo-av para reproducir audio local
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { COLORS as BASE_COLORS } from "./themes";

// Fonts
import {
  useFonts as useOutfit,
  Outfit_400Regular,
  Outfit_600SemiBold,
  Outfit_800ExtraBold,
} from "@expo-google-fonts/outfit";
import {
  useFonts as useAHL,
  AtkinsonHyperlegible_400Regular,
  AtkinsonHyperlegible_700Bold,
} from "@expo-google-fonts/atkinson-hyperlegible";

// Intro
import IntroScreen from "./IntroScreen";

/* =========================================================
   NAV TYPES
========================================================= */
type RootStackParamList = {
  Intro: undefined;
  Onboarding: undefined;
  Home: undefined;
  Lesson: { lessonId: string };
  Practice: { lessonId: string };
  Settings: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const isExpoGo = Constants.appOwnership === "expo";

/* =========================================================
   APP ROOT
========================================================= */
export default function App() {
  const [fontsOutfitLoaded] = useOutfit({
    Outfit_400Regular,
    Outfit_600SemiBold,
    Outfit_800ExtraBold,
  });
  const [fontsAHLLoaded] = useAHL({
    AtkinsonHyperlegible_400Regular,
    AtkinsonHyperlegible_700Bold,
  });

  if (!fontsOutfitLoaded || !fontsAHLLoaded) return null;

  const FONTS = {
    heading: "Outfit_800ExtraBold",
    subheading: "Outfit_600SemiBold",
    body: "AtkinsonHyperlegible_400Regular",
    bodyBold: "AtkinsonHyperlegible_700Bold",
  } as const;

  return <RootApp FONTS={FONTS} />;
}

/* =========================================================
   ROOT APP
========================================================= */
function RootApp({ FONTS }: { FONTS: any }) {
  const [prefs, setPrefs] = useAsyncState("prefs", {
    // Accesibilidad
    fontScale: 1.15,
    bigButtons: true,
    highContrast: false,

    // Andragogía
    guidedMode: true,
    syllableHelper: true,
    speechRate: 0.95,
    repetitions: 2,

    // Validación
    errorTolerance: 0.6,

    // Configuración básica de voz
    speechRate: 0.95,
  });

  const [progress, setProgress] =
    useAsyncState<Record<string, { score: number }>>("progress", {});
  const [seenOnboarding, setSeenOnboarding] =
    useAsyncState("seenOnboarding", false);

  // 🔧 Configurar el modo de audio global: iOS suena en silencio, duck en Android.
  useEffect(() => {
    (async () => {
      try {
        await Audio.setAudioModeAsync({
          playsInSilentModeIOS: true,
          allowsRecordingIOS: false,
          interruptionModeIOS: Audio.INTERRUPTION_MODE_IOS_DUCK_OTHERS,
          shouldDuckAndroid: true,
          interruptionModeAndroid: Audio.INTERRUPTION_MODE_ANDROID_DUCK_OTHERS,
          playThroughEarpieceAndroid: false,
          staysActiveInBackground: false,
        });
      } catch {}
    })();
  }, []);

  // Paleta condicionada por alto contraste
  const COLORS = useMemo(() => {
    if (!prefs?.highContrast) return BASE_COLORS;
    return {
      ...BASE_COLORS,
      bg: "#FFFFFF",
      text: "#111111",
      sub: "#1F2937",
      card: "#F2F2F2",
      line: "#11111133",
      green: "#0B8457",
      greenSoft: "#D1FADF",
      orange: "#C2410C",
      yellow: "#A16207",
    };
  }, [prefs?.highContrast]);

  // Voces en español disponibles
  const esVoices = useSpanishVoices();

  return (
    <NavigationContainer theme={DefaultTheme}>
      <Stack.Navigator initialRouteName="Intro">
        <Stack.Screen name="Intro" options={{ headerShown: false }}>
          {(p) => <IntroScreen {...p} />}
        </Stack.Screen>

        <Stack.Screen name="Onboarding" options={{ headerShown: false }}>
          {(p) => (
            <OnboardingScreen
              {...p}
              FONTS={FONTS}
              COLORS={COLORS}
              onDone={() => {
                setSeenOnboarding(true);
                p.navigation.replace("Home");
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen name="Home" options={{ headerShown: false }}>
          {(p) => (
            <HomeScreen
              {...p}
              FONTS={FONTS}
              COLORS={COLORS}
              progress={progress}
              prefs={prefs}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Lesson"
          options={{ title: "Lección", headerTitleStyle: { fontWeight: "800" } }}
        >
          {(p) => (
            <LessonScreen
              {...p}
              FONTS={FONTS}
              COLORS={COLORS}
              prefs={prefs}
              progress={progress}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Practice"
          options={{ title: "Práctica guiada", headerTitleStyle: { fontWeight: "800" } }}
        >
          {(p) => (
            <PracticeScreen
              {...p}
              FONTS={FONTS}
              COLORS={COLORS}
              prefs={prefs}
              onFinish={(id: string, score: number) => {
                setProgress((old) => ({ ...old, [id]: { score } }));
                p.navigation.goBack();
              }}
            />
          )}
        </Stack.Screen>

        <Stack.Screen
          name="Settings"
          options={{ title: "Ajustes", headerTitleStyle: { fontWeight: "800" } }}
        >
          {(p) => (
            <SettingsScreen
              {...p}
              FONTS={FONTS}
              COLORS={COLORS}
              prefs={prefs}
              setPrefs={setPrefs}
              esVoices={esVoices}
            />
          )}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/* =========================================================
   HELPERS — persistencia, sílabas, utilidades
========================================================= */
function useAsyncState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(initial);
  useEffect(() => {
    (async () => {
      const raw = await AsyncStorage.getItem(key);
      if (raw) setState(JSON.parse(raw));
    })();
  }, [key]);
  useEffect(() => {
    AsyncStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState] as const;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^\p{L}\s]/gu, "").trim();

function splitWords(s: string) { return s.trim().split(/\s+/).filter(Boolean); }
const isSentence = (s: string) => /\s/.test(s.trim());
const fs = (base: number, scale = 1) => Math.round(base * scale);

function splitSyllables(str: string) {
  const V = /[aeiouáéíóúü]/i;
  const isVowel = (c: string) => V.test(c);
  const isStrong = (c: string) => /[aeoáéó]/i.test(c);
  const isWeak = (c: string) => /[iuüíú]/i.test(c);
  const hasAccent = (c: string) => /[áéíóú]/i.test(c);
  const DIGR = ["ch", "ll", "rr"];
  const CAN_START = new Set([
    "pr","pl","br","bl","cr","cl","dr","tr","fr","fl","gr","gl","ch","ll","rr"
  ]);

  const original = str;
  const lower = str.toLowerCase();
  if (!lower) return [];

  const tokens: string[] = [];
  for (let i = 0; i < lower.length; i++) {
    const two = lower.slice(i, i + 2);
    if (DIGR.includes(two)) { tokens.push(two); i++; continue; }
    tokens.push(lower[i]);
  }

  type Nuc = { start: number; end: number };
  const nuclei: Nuc[] = [];
  let i = 0;
  while (i < tokens.length) {
    if (!isVowel(tokens[i])) { i++; continue; }
    let j = i;
    while (j + 1 < tokens.length && isVowel(tokens[j + 1])) j++;
    const seq = tokens.slice(i, j + 1);

    const decide = (vs: string[]): number[] => {
      if (vs.length === 1) return [1];
      if (vs.length === 2) {
        const [a,b] = vs;
        if ((isStrong(a) && isStrong(b)) || (isWeak(a) && hasAccent(a)) || (isWeak(b) && hasAccent(b))) return [1,1];
        return [2];
      }
      if (vs.length >= 3) {
        const a = vs[0], b = vs[1], c = vs[2];
        const trip = isWeak(a) && !hasAccent(a) && isStrong(b) && isWeak(c) && !hasAccent(c);
        if (trip) return [3];
        const firstTwo = decide(vs.slice(0,2));
        return [...firstTwo, ...decide(vs.slice(firstTwo.reduce((s,n)=>s+n,0)))];
      }
      return [vs.length];
    };

    const groups = decide(seq);
    let off = 0;
    for (const g of groups) { nuclei.push({ start: i + off, end: i + off + g - 1 }); off += g; }
    i = j + 1;
  }

  if (!nuclei.length) return [original];

  const syllables: string[][] = [];
  let start = 0;
  for (let k = 0; k < nuclei.length - 1; k++) {
    const left = nuclei[k];
    const right = nuclei[k + 1];
    let cStart = left.end + 1;
    let cEnd = right.start - 1;
    const cons = cStart <= cEnd ? tokens.slice(cStart, cEnd + 1) : [];
    if (cons.length <= 1) {
      syllables.push(tokens.slice(start, left.end + 1));
      start = left.end + 1;
    } else if (cons.length === 2) {
      const pair = cons.join("");
      if (CAN_START.has(pair)) {
        syllables.push(tokens.slice(start, left.end + 1));
        start = left.end + 1;
      } else {
        syllables.push(tokens.slice(start, left.end + 2));
        start = left.end + 2;
      }
    } else {
      const leftCount = cons.length - 2;
      syllables.push(tokens.slice(start, left.end + 1 + leftCount));
      start = left.end + 1 + leftCount;
    }
  }
  syllables.push(tokens.slice(start));
  return syllables.map(seg => seg.join(""));
}

/* =========================================================
   TTS + AUDIO LOCAL — helpers
========================================================= */
type TtsVoice = {
  identifier: string;
  name?: string;
  quality?: number;   // 0=Default, 1=Enhanced (depende dispositivo)
  language?: string;  // ej. "es-MX"
};

function isSpanish(lang?: string) { return !!lang && /^es(-|$)/i.test(lang || ""); }
function sortVoicesForQuality(a: TtsVoice, b: TtsVoice) {
  const qa = a.quality ?? 0, qb = b.quality ?? 0;
  if (qa !== qb) return qb - qa;
  const pref = (l?: string) =>
    l?.startsWith("es-MX") ? 3 : l?.startsWith("es-ES") ? 2 : l?.startsWith("es-US") ? 1 : 0;
  const pa = pref(a.language), pb = pref(b.language);
  if (pa !== pb) return pb - pa;
  return (a.name || a.identifier).localeCompare(b.name || b.identifier);
}

/** Hook: cargar voces de TTS en español, ordenadas por calidad/preferencia */
function useSpanishVoices() {
  const [voices, setVoices] = useState<TtsVoice[]>([]);
  useEffect(() => {
    (async () => {
      try {
        const raw = (await Speech.getAvailableVoicesAsync()) as any[];
        const onlyEs = (raw || [])
          .map(v => ({
            identifier: v?.identifier ?? v?.id ?? String(v?.name ?? Math.random()),
            name: v?.name,
            quality: v?.quality,
            language: v?.language,
          }))
          .filter(v => isSpanish(v.language))
          .sort(sortVoicesForQuality);
        setVoices(onlyEs);
      } catch {
        setVoices([]);
      }
    })();
  }, []);
  return voices;
}

type TtsProfile = "natural" | "claro";
function profileParams(profile: TtsProfile, baseRate: number) {
  if (profile === "natural") {
    return { rate: Math.min(1.0, Math.max(0.82, baseRate * 0.95)), pitch: 1.02 };
  }
  return { rate: Math.min(0.95, Math.max(0.75, baseRate * 0.9)), pitch: 1.0 };
}

type SpeakOpts = {
  text: string;
  voiceId?: string;
  language?: string;
  rate?: number;
  pitch?: number;
  repetitions?: number;
};

async function speakTTS(text: string, prefs: any, reps = 1) {
  try {
    await Speech.stop();
  } catch {}

  const rate = Math.min(0.95, Math.max(0.75, (prefs.speechRate ?? 0.95)));
  
  for (let i = 0; i < Math.max(1, reps); i++) {
    Speech.speak(text, { 
      language: "es-ES",
      rate: rate,
      pitch: 1.0 
    });
    if (i < reps - 1) await delay(350);
  }
}

/* ---------- /m/ con AUDIO LOCAL (expo-av) + fall-back TTS ---------- */
// ⚠️ Cambia el nombre si tu archivo es distinto (p. ej. "mmmm.wav").
const M_AUDIO = require("./assets/audio/m-v2.mp3");

let mSound: Audio.Sound | null = null;
let mSoundLoaded = false;

async function ensureMSoundLoaded() {
  if (mSoundLoaded && mSound) return;
  // Descargar previo si ya existía cargado mal
  if (mSound) {
    try { await mSound.unloadAsync(); } catch {}
    mSound = null;
  }
  mSound = new Audio.Sound();
  await mSound.loadAsync(M_AUDIO, { shouldPlay: false, isLooping: false }, false);
  mSoundLoaded = true;
}

async function playMSoundOrFallback(prefs: any) {
  try {
    await ensureMSoundLoaded();
    // Reproducir desde el inicio siempre
    await mSound!.replayAsync();
  } catch {
    // Último recurso: TTS “hmmmmmmm…”
    const prof = profileParams(prefs.ttsProfile ?? "natural", prefs.speechRate ?? 0.95);
    const payload = "h" + "m".repeat(12);
    await speakWithVoice({
      text: payload,
      voiceId: prefs.ttsVoiceId,
      language: prefs.ttsLanguage || "es-ES",
      rate: Math.min(prof.rate, 0.9),
      pitch: prof.pitch,
      repetitions: 1,
    });
  }
}

async function playVowel(v: "a"|"e"|"i"|"o"|"u", prefs: any, reps = 1) {
  await speakTTS(v, prefs, reps);
}
async function playSyllable(syl: string, prefs: any, reps = 1) {
  await speakTTS(syl, prefs, reps);
}
async function playEquationSequence(v: "a"|"e"|"i"|"o"|"u", out: string, prefs: any) {
  await playMSoundOrFallback(prefs);   // ⬅️ ahora usa audio local
  await delay(120);
  await playVowel(v, prefs, 1);
  await delay(120);
  await playSyllable(out, prefs, 1);
}

/* =========================================================
   COMPONENTE SpeakText (usa TTS mejorado)
========================================================= */
function SpeakableText({
  children,
  style,
  prefs,
  reps = 1,
  Component = Text,
  COLORS
}: {
  children: string | string[];
  style?: any;
  prefs: any;
  reps?: number;
  Component?: typeof Text;
  COLORS: any;
}) {
  const text = Array.isArray(children) ? children.join("") : children;
  return (
    <Pressable onPress={() => speakTTS(text, prefs, reps)}>
      <Component style={[style, { color: COLORS.text }]}>
        {text}
      </Component>
    </Pressable>
  );
}

/* =========================================================
   CONTENIDO (reordenado: Oraciones antes, Palabras frecuentes al final)
========================================================= */
type LessonItem =
  | string
  | { type: "phonemeM"; label: string }
  | { type: "vowelRow"; vowels: Array<"a"|"e"|"i"|"o"|"u"> }
  | { type: "equations"; entries: Array<{ v: "a"|"e"|"i"|"o"|"u"; out: string }> };

const LESSONS: Array<{
  id: string;
  title: string;
  objective: string;
  items: LessonItem[] | string[];
  practice?: string[];
}> = [
  {
    id: "l1",
    title: "Vocales: a, e, i, o, u",
    objective: "Reconocer y pronunciar vocales.",
    items: ["a", "e", "i", "o", "u"],
    practice: ["a", "e", "i", "o", "u"],
  },

  // 🔊 Letra M: solo práctica con sumas dentro de la lección (sin botón 'Practicar')
  {
    id: "lM",
    title: "Letra M (sonido + vocal)",
    objective: "Escuchar /m/ (mmmm), tocar vocales y combinar: m + vocal = sílaba.",
    items: [
      { type: "phonemeM", label: "Sonido de M (mmmm)" },
      { type: "vowelRow", vowels: ["a","e","i","o","u"] },
      { type: "equations", entries: [
        { v: "a", out: "ma" },
        { v: "e", out: "me" },
        { v: "i", out: "mi" },
        { v: "o", out: "mo" },
        { v: "u", out: "mu" },
      ]},
    ],
  },

  {
    id: "l2",
    title: "Sílabas con m",
    objective: "Combinar vocal + m: ma, me, mi, mo, mu.",
    items: ["ma", "me", "mi", "mo", "mu"],
    practice: ["mamá", "mima", "mi", "meme", "mima", "amo", "ama", "mimo", "mío"],
  },

  // 🆕 Oraciones antes que Palabras frecuentes
  {
    id: "l4",
    title: "Oraciones con m",
    objective: "Leer y comprender oraciones simples con m.",
    items: [
      "Mi mamá me ama",
      "Mi mamá me mima",
      "Amo a mi mami",
      "Meme ama a Emi",
      "Oí a mi mama"
    ],
    practice: [
      "Mi mamá me ama",
      "Mi mamá me mima",
      "Amo a mi mami",
      "Meme ama a Emi",
      "Oí a mi mama"
    ],
  },

  // 🔚 Palabras frecuentes al final
  {
    id: "l3",
    title: "Palabras frecuentes",
    objective: "Leer palabras de uso cotidiano.",
    items: ["yo", "tú", "sí", "no", "sol", "pan"],
    practice: ["yo sí", "no pan", "sol y pan"],
  },
];

/* =========================================================
   ONBOARDING — forzar audio aun en silencio + pequeña espera
========================================================= */
function OnboardingScreen({ navigation, onDone, FONTS, COLORS }: any) {
  const slide = useRef(new Animated.Value(20)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 600, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 800, useNativeDriver: true }),
    ]).start();

    // 🔊 Pequeña espera para garantizar que el modo de audio esté listo y voces cargadas
    (async () => {
      try { await Speech.getAvailableVoicesAsync(); } catch {}
      try { await Speech.stop(); } catch {}
      setTimeout(() => {
        Speech.speak("Bienvenida. DoritApp te acompaña paso a paso.", {
          language: "es-ES",
          rate: 0.95,
        });
      }, 250);
    })();
  }, []);

  const cards = [
    { title: "Bienvenida", desc: "+ te acompaña paso a paso para leer y escribir.", cta: "Siguiente" },
    { title: "Escucha y repite", desc: "Toca cualquier texto y la app te lo leerá en voz alta.", cta: "Siguiente" },
    { title: "Comencemos", desc: "Avanza por tarjetas sencillas. Practica a tu ritmo.", cta: "¡Empezar!" },
  ];
  const [step, setStep] = useState(0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <View style={styles(COLORS).headerBanner}>
          <Image source={require("./assets/doritapp-logo.png")} style={{ width: 48, height: 48 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles(COLORS).brand, { fontFamily: FONTS.heading }]}>DORITAPP</Text>
            <Text style={[styles(COLORS).brandSub, { fontFamily: FONTS.body }]}>
              Lectura y escritura para adultos
            </Text>
          </View>
        </View>

        <View style={styles(COLORS).onbTop}>
          <Image
            source={require("./assets/illus-onboarding.png")}
            style={{ width: 220, height: 160 }}
            resizeMode="contain"
          />
        </View>

        <Animated.View style={{ transform: [{ translateY: slide }], opacity: fade }}>
          {cards.map((c, i) =>
            i === step ? (
              <View key={i} style={styles(COLORS).cardBox}>
                <Text style={[styles(COLORS).onbTitle, { fontFamily: FONTS.heading }]}>{c.title}</Text>
                <Text style={[styles(COLORS).onbDesc, { fontFamily: FONTS.body }]}>{c.desc}</Text>
                <Pressable
                  onPress={() => { if (step < cards.length - 1) setStep(step + 1); else onDone(); }}
                  style={[styles(COLORS).btn, { backgroundColor: COLORS.orange, marginTop: 8 }]}
                >
                  <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>{c.cta}</Text>
                </Pressable>
                <Text style={{ textAlign: "center", marginTop: 8, color: COLORS.sub, fontFamily: FONTS.body }}>
                  Desliza o toca “{c.cta}”.
                </Text>
              </View>
            ) : null
          )}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   HOME
========================================================= */
function HomeScreen({ navigation, progress, prefs, FONTS, COLORS }: any) {
  useEffect(() => {
    if (prefs.guidedMode) speakTTS("Inicio. Tu ruta de aprendizaje.", prefs, 1);
  }, [prefs.guidedMode]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <View style={styles(COLORS).headerBanner}>
          <Image source={require("./assets/doritapp-logo.png")} style={{ width: 48, height: 48 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles(COLORS).brand, { fontFamily: FONTS.heading }]}>DORITAPP</Text>
            <Text style={[styles(COLORS).brandSub, { fontFamily: FONTS.body }]}>
              Lectura y escritura para adultos
            </Text>
          </View>
        </View>

        <SpeakableText 
          prefs={prefs}
          COLORS={COLORS}
          style={[styles(COLORS).h1, { fontFamily: FONTS.heading, fontSize: fs(24, prefs.fontScale) }]}>
          Tu ruta de aprendizaje
        </SpeakableText>
        <SpeakableText 
          prefs={prefs}
          COLORS={COLORS}
          style={[styles(COLORS).sub, { fontFamily: FONTS.body, fontSize: fs(14, prefs.fontScale) }]}>
          Toca una tarjeta para comenzar.
        </SpeakableText>

        <FlatList
          data={LESSONS}
          keyExtractor={(i) => i.id}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("Lesson", { lessonId: item.id })}
              style={[styles(COLORS).card, prefs.bigButtons && { paddingVertical: 22 }]}
            >
              <View style={{ flex: 1 }}>
                <SpeakableText 
                  prefs={prefs}
                  COLORS={COLORS}
                  style={[styles(COLORS).cardTitle, { fontFamily: FONTS.subheading, fontSize: fs(17, prefs.fontScale) }]}>
                  {item.title}
                </SpeakableText>
                <SpeakableText 
                  prefs={prefs}
                  COLORS={COLORS}
                  style={[styles(COLORS).cardDesc, { fontFamily: FONTS.body, fontSize: fs(13, prefs.fontScale) }]}>
                  {item.objective}
                </SpeakableText>
              </View>
              {progress?.[item.id]?.score ? (
                <View style={styles(COLORS).badge}>
                  <Text style={{ color: "#fff", fontFamily: FONTS.subheading }}>
                    {progress[item.id].score}%
                  </Text>
                </View>
              ) : null}
            </Pressable>
          )}
        />

        <Pressable
          onPress={() => navigation.navigate("Settings")}
          style={[styles(COLORS).card, { borderLeftColor: COLORS.yellow }, prefs.bigButtons && { paddingVertical: 22 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles(COLORS).cardTitle, { fontFamily: FONTS.subheading, fontSize: fs(17, prefs.fontScale) }]}>
              Ajustes y accesibilidad
            </Text>
            <Text style={[styles(COLORS).cardDesc, { fontFamily: FONTS.body, fontSize: fs(13, prefs.fontScale) }]}>
              Tamaño de letra, voz y ayudas de lectura.
            </Text>
          </View>
          <Text>⚙️</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* =========================================================
   LESSON — incluye maquetado especial para lM
========================================================= */
function LessonScreen({ navigation, route, prefs, FONTS, COLORS, progress }: any) {
  const lesson = LESSONS.find((l) => l.id === route.params.lessonId);
  useEffect(() => {
    if (prefs.guidedMode && lesson)
      speakTTS(`Lección. ${lesson.title}. ${lesson.objective}`, prefs, prefs.repetitions);
  }, [lesson, prefs.guidedMode, prefs.speechRate, prefs.repetitions]);

  if (!lesson) return <Text style={{ padding: 16 }}>Lección no encontrada</Text>;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={[styles(COLORS).card, { borderLeftColor: COLORS.green }, { paddingVertical: 18 }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles(COLORS).cardTitle, { fontFamily: FONTS.subheading, fontSize: 17 }]}>
              {lesson.title}
            </Text>
            <Text style={[styles(COLORS).cardDesc, { fontFamily: FONTS.body, fontSize: 13 }]}>
              {lesson.objective}
            </Text>
          </View>
          {progress?.[lesson.id]?.score ? (
            <View style={styles(COLORS).badge}><Text style={{ color: "#fff", fontFamily: FONTS.subheading }}>
              {progress[lesson.id].score}%
            </Text></View>
          ) : null}
        </View>

        {lesson.id !== "lM" ? (
          <DefaultLessonItems lesson={lesson} prefs={prefs} FONTS={FONTS} COLORS={COLORS} />
        ) : (
          <MLessonItems prefs={prefs} FONTS={FONTS} COLORS={COLORS} />
        )}

        {/* Botón Practicar (oculto para lM) */}
        {lesson.id !== "lM" ? (
          <View style={{ alignItems: "flex-end", marginTop: 4 }}>
            <Pressable
              onPress={() => navigation.navigate("Practice", { lessonId: lesson.id })}
              style={[styles(COLORS).btn, { backgroundColor: COLORS.green }]}
            >
              <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>Practicar</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---- Render estándar (otras lecciones) ---- */
function DefaultLessonItems({ lesson, prefs, FONTS, COLORS }: any) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 12 }}>
      {lesson.items.map((it: LessonItem, i: number) => {
        if (typeof it !== "string") return null;
        const asStr = it;
        if (!isSentence(asStr)) {
          return (
            <Pressable key={i} onPress={() => speakTTS(asStr, prefs, prefs.repetitions)}
              style={[styles(COLORS).pill, { backgroundColor: COLORS.greenSoft }]}>
              <Text style={[styles(COLORS).pillText, { fontFamily: FONTS.heading, fontSize: fs(18, prefs.fontScale) }]}>
                {(prefs.syllableHelper ? splitSyllables(asStr) : [asStr]).map((p, j) => (
                  <Text key={j} style={/^[aeiouáéíóú]/i.test(p) ? { textDecorationLine: "underline" } : undefined}>
                    {p}
                  </Text>
                ))}
              </Text>
            </Pressable>
          );
        }
        const words = splitWords(asStr);
        return (
          <View key={i} style={[styles(COLORS).cardBox, { backgroundColor: COLORS.greenSoft + "44" }]}>
            <Text style={[styles(COLORS).cardTitle, { fontFamily: FONTS.heading, marginBottom: 6 }]}>{asStr}</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {words.map((w, k) => (
                <Pressable key={k} onPress={() => speakTTS(w, prefs, prefs.repetitions)}
                  onLongPress={() => speakTTS(asStr, prefs, prefs.repetitions)}
                  style={[styles(COLORS).pill, { backgroundColor: COLORS.greenSoft, paddingVertical: 10 }]}>
                  <Text style={{ fontFamily: FONTS.heading, fontSize: fs(18, prefs.fontScale), color: COLORS.text }}>{w}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/* ---- Render especial para Lección "lM": botones + tarjetas apiladas ---- */
function MLessonItems({ prefs, FONTS, COLORS }: any) {
  return (
    <View style={{ gap: 12 }}>
      {/* 1) Botón del fonema M */}
      <View style={[styles(COLORS).cardBox, { gap: 10 }]}>
        <Text style={{ fontFamily: FONTS.subheading, color: COLORS.text, fontSize: fs(18, prefs.fontScale) }}>
          Toca el sonido de la letra
        </Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SoundButton label="m (mmmm)" onPress={() => playMSoundOrFallback(prefs)} COLORS={COLORS} FONTS={FONTS} prefs={prefs} />
        </View>
      </View>

      {/* 2) Fila de vocales */}
      <View style={[styles(COLORS).cardBox, { gap: 10 }]}>
        <Text style={{ fontFamily: FONTS.subheading, color: COLORS.text, fontSize: fs(18, prefs.fontScale) }}>
          Toca una vocal
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(["a","e","i","o","u"] as const).map((v) => (
            <SoundButton key={v} label={v} onPress={() => playVowel(v, prefs)} COLORS={COLORS} FONTS={FONTS} prefs={prefs} />
          ))}
        </View>
      </View>

      {/* 3) Tarjetas apiladas: m + vocal = sílaba */}
      <View style={{ gap: 10 }}>
        {(["a","e","i","o","u"] as const).map((v) => {
          const out = v === "a" ? "ma" : v === "e" ? "me" : v === "i" ? "mi" : v === "o" ? "mo" : "mu";
          return (
            <EquationCard
              key={v}
              vowel={v}
              result={out}
              prefs={prefs}
              FONTS={FONTS}
              COLORS={COLORS}
              onPressWhole={() => playEquationSequence(v, out, prefs)}
              onPressM={() => playMSoundOrFallback(prefs)}
              onPressV={() => playVowel(v, prefs, 1)}
              onPressResult={() => playSyllable(out, prefs, 1)}
            />
          );
        })}
      </View>
    </View>
  );
}

function SoundButton({ label, onPress, COLORS, FONTS, prefs }:{
  label: string; onPress: () => void; COLORS:any; FONTS:any; prefs:any;
}) {
  return (
    <Pressable onPress={onPress}
      style={[styles(COLORS).pill, { backgroundColor: COLORS.greenSoft, paddingVertical: prefs.bigButtons ? 14 : 10 }]}>
      <Text style={{ fontFamily: FONTS.heading, fontSize: fs(18, prefs.fontScale), color: COLORS.text }}>{label}</Text>
    </Pressable>
  );
}

function EquationCard({
  vowel, result, onPressWhole, onPressM, onPressV, onPressResult, prefs, FONTS, COLORS
}:{
  vowel: "a"|"e"|"i"|"o"|"u";
  result: string;
  onPressWhole: () => void;
  onPressM: () => void;
  onPressV: () => void;
  onPressResult: () => void;
  prefs:any; FONTS:any; COLORS:any;
}) {
  return (
    <Pressable onPress={onPressWhole} style={[styles(COLORS).card, { borderLeftColor: COLORS.yellow }]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <SoundButton label="m" onPress={onPressM} COLORS={COLORS} FONTS={FONTS} prefs={prefs} />
        <Text style={{ fontFamily: FONTS.heading, fontSize: fs(18, prefs.fontScale), color: COLORS.text }}>+</Text>
        <SoundButton label={vowel} onPress={onPressV} COLORS={COLORS} FONTS={FONTS} prefs={prefs} />
        <Text style={{ fontFamily: FONTS.heading, fontSize: fs(18, prefs.fontScale), color: COLORS.text }}>=</Text>
        <SoundButton label={result} onPress={onPressResult} COLORS={COLORS} FONTS={FONTS} prefs={prefs} />
      </View>
      <Text style={[styles(COLORS).cardDesc, { 
        fontFamily: FONTS.body, 
        marginLeft: 4, 
        marginTop: 6,
        flexShrink: 1,
        flexWrap: 'wrap'
      }]}>
        Toca la tarjeta para oír la secuencia: m → {vowel} → {result}
      </Text>
    </Pressable>
  );
}

/* =========================================================
   PRACTICE (MC / Build / Order) — bloquea lM
========================================================= */
type Round =
  | { kind: "mc"; prompt: string; choices: string[]; answer: string }
  | { kind: "build"; target: string; syllables: string[] }
  | { kind: "order"; target: string; words: string[] };

function PracticeScreen({ route, FONTS, prefs, COLORS, onFinish }: any) {
  const lesson = LESSONS.find((l) => l.id === route.params.lessonId);

  // 🚫 Sin práctica externa para lM
  if (lesson?.id === "lM") {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center", padding: 24 }}>
        <Text style={{ fontFamily: FONTS.heading, fontSize: fs(20, prefs.fontScale), color: COLORS.text, textAlign: "center" }}>
          Esta lección solo tiene práctica con las tarjetas: m + vocal = sílaba.
        </Text>
        <View style={{ height: 12 }} />
        <Pressable onPress={() => onFinish(lesson.id, 0)} style={[styles(COLORS).btn, { backgroundColor: COLORS.green }]}>
          <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>Volver</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);

  const rounds: Round[] = useMemo(() => {
    if (!lesson) return [];
    const bank = [
      ...(lesson.practice?.length ? lesson.practice : lesson.items.filter((x): x is string => typeof x === "string")),
    ];

    const singleChar = bank.every((x) => typeof x === "string" && x.trim().length === 1);
    const mcCount = singleChar ? bank.length : Math.min(3, bank.length);
    const mc: Round[] = bank.slice(0, mcCount).map((w) => {
      const distractores = shuffle(bank.filter((x) => x !== w)).slice(0, Math.min(3, bank.length - 1));
      const choices = shuffle([w, ...distractores]) as string[];
      return { kind: "mc", prompt: w as string, choices, answer: w as string };
    });

    if (singleChar) return mc;

    const tail = bank.slice(mcCount) as string[];
    const orderCandidates = tail.filter((w) => splitWords(w).length > 1);
    const order: Round[] = orderCandidates.map((w) => {
      const words = splitWords(w);
      return { kind: "order", target: w, words: shuffle(words) };
    });

    const nonOrderTail = tail.filter((w) => !orderCandidates.includes(w));
    const buildCandidates = nonOrderTail.filter((w) => splitSyllables(w).length > 1 && w.trim().length >= 2);
    const build: Round[] = buildCandidates.map((w) => {
      const syl = splitSyllables(w);
      return { kind: "build", target: w, syllables: shuffle(syl) };
    });

    const fallbackMC: Round[] = nonOrderTail
      .filter((w) => !(splitSyllables(w).length > 1 && w.trim().length >= 2))
      .map((w) => {
        const distractores = shuffle(bank.filter((x) => x !== w)).slice(0, Math.min(3, bank.length - 1));
        const choices = shuffle([w, ...distractores]) as string[];
        return { kind: "mc", prompt: w, choices, answer: w };
      });

    return [...mc, ...order, ...build, ...fallbackMC];
  }, [lesson]);

  useEffect(() => {
    if (!lesson || !rounds[idx]) return;
    if (prefs.guidedMode) {
      const r = rounds[idx];
      if (r.kind === "mc") { speakTTS(`Escucha y elige la opción correcta.`, prefs, 1); speakTTS(r.prompt, prefs, prefs.repetitions); }
      else if (r.kind === "build") { speakTTS(`Arma la palabra tocando las sílabas.`, prefs, 1); speakTTS(r.target, prefs, prefs.repetitions); }
      else if (r.kind === "order") { speakTTS(`Ordena la oración.`, prefs, 1); speakTTS(r.target, prefs, prefs.repetitions); }
    }
  }, [idx, rounds, prefs.guidedMode, prefs.repetitions, lesson]);

  if (!lesson) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg, justifyContent: "center", alignItems: "center" }}>
        <Text>Lección no encontrada</Text>
      </SafeAreaView>
    );
  }

  const done = idx >= rounds.length;
  const percent = rounds.length ? Math.round((score / rounds.length) * 100) : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <View style={[styles(COLORS).card, { borderLeftColor: COLORS.green }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles(COLORS).cardTitle, { fontFamily: FONTS.subheading }]}>
              {lesson.title}
            </Text>
            <Text style={[styles(COLORS).cardDesc, { fontFamily: FONTS.body }]}>
              Progreso: {Math.min(idx, rounds.length)} / {rounds.length}  •  Puntaje: {percent}%
            </Text>
          </View>
          <Pressable
            onPress={() => {
              const r = rounds[idx]; if (!r) return;
              if (r.kind === "mc") speakTTS(r.prompt, prefs, prefs.repetitions);
              if (r.kind === "build") speakTTS(r.target, prefs, prefs.repetitions);
              if (r.kind === "order") speakTTS(r.target, prefs, prefs.repetitions);
            }}
            style={[styles(COLORS).btn, { backgroundColor: COLORS.green }]}
          >
            <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>🔊 Repetir</Text>
          </Pressable>
        </View>

        {!done ? (
          <View style={{ gap: 12 }}>
            {rounds[idx].kind === "mc" ? (
              <MCActivity
                round={rounds[idx] as Extract<Round, { kind: "mc" }>}
                prefs={prefs}
                COLORS={COLORS}
                FONTS={FONTS}
                onResult={(ok) => { if (ok) setScore((s) => s + 1); setIdx((i) => i + 1); }}
              />
            ) : rounds[idx].kind === "build" ? (
              <BuildActivity
                round={rounds[idx] as Extract<Round, { kind: "build" }>}
                prefs={prefs}
                COLORS={COLORS}
                FONTS={FONTS}
                onResult={(ok) => { if (ok) setScore((s) => s + 1); setIdx((i) => i + 1); }}
              />
            ) : (
              <OrderActivity
                round={rounds[idx] as Extract<Round, { kind: "order" }>}
                prefs={prefs}
                COLORS={COLORS}
                FONTS={FONTS}
                onResult={(ok) => { if (ok) setScore((s) => s + 1); setIdx((i) => i + 1); }}
              />
            )}
          </View>
        ) : (
          <View style={{ alignItems: "center", marginTop: 24 }}>
            <Text style={{ fontFamily: FONTS.heading, fontSize: fs(22, prefs.fontScale), color: COLORS.text }}>
              ¡Listo! Puntaje: {percent}%
            </Text>
            <Pressable
              style={[styles(COLORS).btn, { backgroundColor: COLORS.green, marginTop: 16 }]}
              onPress={() => onFinish(route.params.lessonId, percent)}
            >
              <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>
                Guardar y volver
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/* ---------- Actividad 1: Opción múltiple ---------- */
function MCActivity({ round, prefs, COLORS, FONTS, onResult }:{
  round: Extract<Round, { kind: "mc" }>; prefs:any; COLORS:any; FONTS:any; onResult:(ok:boolean)=>void;
}) {
  return (
    <View style={[styles(COLORS).cardBox, { gap: 12 }]}>
      <Text style={{ fontFamily: FONTS.heading, fontSize: fs(20, prefs.fontScale), color: COLORS.text }}>
        Toca la palabra que escuchaste
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {round.choices.map((c, i) => (
          <Pressable key={i} onPress={() => onResult(c === round.answer)}
            style={[styles(COLORS).pill, { backgroundColor: COLORS.greenSoft, paddingVertical: prefs.bigButtons ? 14 : 10 }]}>
            <Text style={{ fontFamily: FONTS.heading, fontSize: fs(18, prefs.fontScale), color: COLORS.text }}>
              {(prefs.syllableHelper ? splitSyllables(c) : [c]).map((p, j) => (
                <Text key={j} style={/^[aeiouáéíóú]/i.test(p) ? { textDecorationLine: "underline" } : undefined}>{p}</Text>
              ))}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

/* ---------- Actividad 2: Construye la palabra ---------- */
function BuildActivity({ round, prefs, COLORS, FONTS, onResult }:{
  round: Extract<Round, { kind: "build" }>; prefs:any; COLORS:any; FONTS:any; onResult:(ok:boolean)=>void;
}) {
  const [built, setBuilt] = useState<string[]>([]);
  const target = round.target;
  const textBuilt = built.join("");
  const canValidate = built.length >= 1;
  const ok = (() => {
    const a = norm(textBuilt), b = norm(target);
    if (!b.length) return 0;
    const setB = new Set(b.split(/\s+/));
    const score = a.split(/\s+/).filter((w) => setB.has(w)).length / b.split(/\s+/).length;
    return score >= (prefs.errorTolerance ?? 0.6);
  })();

  return (
    <View style={[styles(COLORS).cardBox, { gap: 12 }]}>
      <Text style={{ fontFamily: FONTS.heading, fontSize: fs(20, prefs.fontScale), color: COLORS.text }}>
        Arma la palabra
      </Text>

      <Text style={{ fontFamily: FONTS.body, color: COLORS.sub }}>
        Objetivo: <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.text }}>{target}</Text>
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {round.syllables.map((s, i) => (
          <Pressable
            key={i}
            onPress={() => setBuilt((b) => [...b, s])}
            style={[
              styles(COLORS).pill,
              { backgroundColor: COLORS.yellow + "22", borderWidth: 1, borderColor: COLORS.line, paddingVertical: prefs.bigButtons ? 14 : 10 },
            ]}
          >
            <Text style={{ fontFamily: FONTS.subheading, fontSize: fs(18, prefs.fontScale), color: COLORS.text }}>
              {s}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles(COLORS).card, { borderLeftColor: COLORS.orange }]}>
        <Text style={{ fontFamily: FONTS.subheading, color: COLORS.sub, marginRight: 8 }}>Construido:</Text>
        <Text style={{ fontFamily: FONTS.heading, fontSize: fs(20, prefs.fontScale), color: COLORS.text }}>
          {textBuilt || "—"}
        </Text>
        {textBuilt ? (
          <Pressable onPress={() => speakTTS(textBuilt, prefs, 1)} style={[styles(COLORS).btn, { backgroundColor: COLORS.green, marginLeft: "auto" }]}>
            <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>🔊</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end" }}>
        <Pressable onPress={() => setBuilt([])} style={[styles(COLORS).btn, { backgroundColor: COLORS.orange }]}>
          <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>Borrar</Text>
        </Pressable>
        <Pressable
          disabled={!canValidate}
          onPress={() => onResult(ok)}
          style={[styles(COLORS).btn, { backgroundColor: ok ? COLORS.green : COLORS.yellow }, !canValidate && { opacity: 0.5 }]}
        >
          <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>Validar</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* ---------- Actividad 3: Ordena la oración ---------- */
function OrderActivity({ round, prefs, COLORS, FONTS, onResult }:{
  round: Extract<Round, { kind: "order" }>; prefs:any; COLORS:any; FONTS:any; onResult:(ok:boolean)=>void;
}) {
  const [built, setBuilt] = useState<string[]>([]);
  const [pool, setPool] = useState<string[]>(round.words);

  useEffect(() => { setBuilt([]); setPool([...round.words]); }, [round]);

  const target = norm(round.target);
  const builtText = norm(built.join(" "));
  const canValidate = built.length >= 1;
  const ok = builtText === target;

  const pick = (w: string, idx: number) => { setBuilt((b) => [...b, w]); setPool((p) => p.filter((_, i) => i !== idx)); };
  const removeLast = () => { if (!built.length) return; const last = built[built.length - 1]; setBuilt((b)=>b.slice(0,-1)); setPool((p)=>[...p, last]); };

  return (
    <View style={[styles(COLORS).cardBox, { gap: 12 }]}>
      <Text style={{ fontFamily: FONTS.heading, fontSize: fs(20, prefs.fontScale), color: COLORS.text }}>Ordena la oración</Text>
      <Text style={{ fontFamily: FONTS.body, color: COLORS.sub }}>Objetivo: <Text style={{ fontFamily: FONTS.bodyBold, color: COLORS.text }}>{round.target}</Text></Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {pool.map((w, i) => (
          <Pressable key={i} onPress={() => pick(w, i)}
            style={[styles(COLORS).pill, { backgroundColor: COLORS.greenSoft, borderWidth: 1, borderColor: COLORS.line, paddingVertical: prefs.bigButtons ? 14 : 10 }]}>
            <Text style={{ fontFamily: FONTS.subheading, fontSize: fs(18, prefs.fontScale), color: COLORS.text }}>{w}</Text>
          </Pressable>
        ))}
      </View>

      <View style={[styles(COLORS).card, { borderLeftColor: COLORS.orange, flexWrap: "wrap" }]}>
        <Text style={{ fontFamily: FONTS.subheading, color: COLORS.sub, marginRight: 8 }}>Construido:</Text>
        <Text style={{ fontFamily: FONTS.heading, fontSize: fs(20, prefs.fontScale), color: COLORS.text, flexShrink: 1 }}>
          {built.length ? built.join(" ") : "—"}
        </Text>
        {built.length ? (
          <Pressable onPress={() => speakTTS(built.join(" "), prefs, 1)}
            style={[styles(COLORS).btn, { backgroundColor: COLORS.green, marginLeft: "auto" }]}>
            <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>🔊</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
        <Pressable onPress={() => { setPool(shuffle([...round.words])); setBuilt([]); }} style={[styles(COLORS).btn, { backgroundColor: COLORS.orange }]}>
          <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>Reiniciar</Text>
        </Pressable>
        <Pressable onPress={removeLast} style={[styles(COLORS).btn, { backgroundColor: COLORS.yellow }]}>
          <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>↩ Deshacer</Text>
        </Pressable>
        <Pressable disabled={!canValidate} onPress={() => onResult(ok)}
          style={[styles(COLORS).btn, { backgroundColor: ok ? COLORS.green : COLORS.yellow }, !canValidate && { opacity: 0.5 }]}>
          <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>Validar</Text>
        </Pressable>
      </View>
    </View>
  );
}

/* =========================================================
   SETTINGS — agrega selector de Perfil y Voz TTS
========================================================= */
function SettingsScreen({ FONTS, COLORS, prefs, setPrefs, esVoices }: any) {
  const toggle = (key: "syllableHelper" | "guidedMode" | "bigButtons" | "highContrast") =>
    setPrefs((p: any) => ({ ...p, [key]: !p[key] }));

  const stepNum = (key: "repetitions" | "speechRate" | "fontScale" | "errorTolerance", delta: number) =>
    setPrefs((p: any) => {
      const next: any = { ...p };
      if (key === "repetitions") next.repetitions = Math.max(1, Math.min(5, (p.repetitions ?? 2) + delta));
      if (key === "speechRate") next.speechRate = Math.max(0.6, Math.min(1.2, +(p.speechRate ?? 0.95) + delta));
      if (key === "fontScale") next.fontScale = Math.max(0.9, Math.min(1.6, +(p.fontScale ?? 1.15) + delta));
      if (key === "errorTolerance") next.errorTolerance = Math.max(0.3, Math.min(1.0, +(p.errorTolerance ?? 0.6) + delta));
      return next;
    });

  const Row = ({ title, desc, right }: any) => (
    <View style={styles(COLORS).card}>
      <View style={{ flex: 1 }}>
        <SpeakableText prefs={prefs} COLORS={COLORS} style={[styles(COLORS).cardTitle, { fontFamily: FONTS.subheading }]}>
          {title}
        </SpeakableText>
        {desc ? (
          <SpeakableText prefs={prefs} COLORS={COLORS} style={[styles(COLORS).cardDesc, { fontFamily: FONTS.body }]}>
            {desc}
          </SpeakableText>
        ) : null}
      </View>
      {right}
    </View>
  );

  const Stepper = ({ value, onMinus, onPlus, unit }: any) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Pressable onPress={onMinus} style={[styles(COLORS).btn, { backgroundColor: COLORS.orange }]}><Text style={styles(COLORS).btnLabel}>–</Text></Pressable>
      <Text style={{ width: 70, textAlign: "center", color: COLORS.text, fontFamily: FONTS.bodyBold }}>
        {typeof value === "number" ? value.toFixed(unit === "x" ? 2 : 2).replace(/\.00$/, "") : value}{unit ? ` ${unit}` : ""}
      </Text>
      <Pressable onPress={onPlus} style={[styles(COLORS).btn, { backgroundColor: COLORS.green }]}><Text style={styles(COLORS).btnLabel}>+</Text></Pressable>
    </View>
  );

  const ProfilePicker = () => (
    <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
      {(["natural","claro"] as const).map(p => (
        <Pressable
          key={p}
          onPress={() => setPrefs((v:any)=>({ ...v, ttsProfile: p }))}
          style={[
            styles(COLORS).pill,
            { backgroundColor: (prefs.ttsProfile ?? "natural") === p ? COLORS.green : COLORS.greenSoft }
          ]}
        >
          <Text style={{ color: (prefs.ttsProfile ?? "natural") === p ? "#fff" : COLORS.text, fontFamily: FONTS.subheading }}>
            {p === "natural" ? "Natural" : "Claro/Lento"}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  const VoicePicker = () => {
    const currentId = prefs.ttsVoiceId as string | undefined;
    const options = esVoices && esVoices.length ? esVoices : [];
    return (
      <View style={{ gap: 8 }}>
        {options.length === 0 ? (
          <Text style={{ color: COLORS.sub, fontFamily: FONTS.body }}>
            No se detectaron voces en español. Se usará el idioma por defecto ({prefs.ttsLanguage}).
          </Text>
        ) : (
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            {options.map((v: TtsVoice) => {
              const active = currentId === v.identifier;
              const label = `${v.name || v.identifier} · ${v.language}${v.quality === 1 ? " · Enhanced" : ""}`;
              return (
                <Pressable
                  key={v.identifier}
                  onPress={() => setPrefs((p:any)=>({ ...p, ttsVoiceId: v.identifier, ttsLanguage: v.language || "es-ES" }))}
                  style={[
                    styles(COLORS).pill,
                    { backgroundColor: active ? COLORS.green : COLORS.greenSoft }
                  ]}
                >
                  <Text style={{ color: active ? "#fff" : COLORS.text, fontFamily: FONTS.body }}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <Pressable
          onPress={() => setPrefs((p:any)=>({ ...p, ttsVoiceId: undefined }))}
          style={[styles(COLORS).btn, { backgroundColor: COLORS.orange, alignSelf: "flex-start" }]}
        >
          <Text style={styles(COLORS).btnLabel}>Usar solo idioma ({prefs.ttsLanguage})</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }}>
        <SpeakableText prefs={prefs} COLORS={COLORS} style={[styles(COLORS).h1, { fontFamily: FONTS.heading }]}>Ajustes</SpeakableText>

        {/* Andragogía */}
        <SpeakableText prefs={prefs} COLORS={COLORS} style={{ marginTop: 8, marginBottom: 4, color: COLORS.sub, fontFamily: FONTS.bodyBold }}>
          Andragogía (aprendizaje adulto)
        </SpeakableText>
        <Row title="Modo guiado por voz" desc="Lee instrucciones y ejemplos automáticamente."
          right={<ToggleBtn on={prefs.guidedMode} onPress={() => toggle("guidedMode")} COLORS={COLORS} FONTS={FONTS} />} />
        <Row title="Repeticiones de audio" desc="Cuántas veces se repite cada ejemplo."
          right={<Stepper value={prefs.repetitions} unit="" onMinus={() => stepNum("repetitions", -1)} onPlus={() => stepNum("repetitions", +1)} />} />
        <Row title="Velocidad de lectura" desc="Ajusta el ritmo base de la voz."
          right={<Stepper value={prefs.speechRate} unit="x" onMinus={() => stepNum("speechRate", -0.05)} onPlus={() => stepNum("speechRate", +0.05)} />} />
        <Row title="Tolerancia de error" desc="Permisividad al validar palabras construidas."
          right={<Stepper value={prefs.errorTolerance} unit="" onMinus={() => stepNum("errorTolerance", -0.05)} onPlus={() => stepNum("errorTolerance", +0.05)} />} />

        {/* Configuración de voz básica */}
        <Text style={{ marginTop: 12, marginBottom: 4, color: COLORS.sub, fontFamily: FONTS.bodyBold }}>Voz</Text>

        {/* Accesibilidad */}
        <Text style={{ marginTop: 12, marginBottom: 4, color: COLORS.sub, fontFamily: FONTS.bodyBold }}>Accesibilidad</Text>
        <Row title="Tamaño de letra" desc="Escala general del texto."
          right={<Stepper value={prefs.fontScale} unit="x" onMinus={() => stepNum("fontScale", -0.05)} onPlus={() => stepNum("fontScale", +0.05)} />} />
        <Row title="Botones grandes" desc="Aumenta áreas táctiles."
          right={<ToggleBtn on={prefs.bigButtons} onPress={() => toggle("bigButtons")} COLORS={COLORS} FONTS={FONTS} />} />
        <Row title="Alto contraste" desc="Mejora legibilidad de colores."
          right={<ToggleBtn on={prefs.highContrast} onPress={() => toggle("highContrast")} COLORS={COLORS} FONTS={FONTS} />} />
        <Row title="Ayuda de sílabas" desc="Subraya vocales al inicio de sílaba."
          right={<ToggleBtn on={prefs.syllableHelper} onPress={() => toggle("syllableHelper")} COLORS={COLORS} FONTS={FONTS} />} />
      </ScrollView>
    </SafeAreaView>
  );
}

function ToggleBtn({ on, onPress, COLORS, FONTS }: any) {
  return (
    <Pressable onPress={onPress} style={[styles(COLORS).btn, { backgroundColor: on ? COLORS.green : COLORS.orange }]}>
      <Text style={[styles(COLORS).btnLabel, { fontFamily: FONTS.subheading }]}>{on ? "ON" : "OFF"}</Text>
    </Pressable>
  );
}

/* =========================================================
   UTILS
========================================================= */
function shuffle<T>(arr: T[]) { const a = [...arr]; for (let i=a.length-1; i>0; i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]];} return a; }

/* =========================================================
   STYLES
========================================================= */
const styles = (COLORS: any) =>
  StyleSheet.create({
    headerBanner: {
      flexDirection: "row",
      gap: 12,
      alignItems: "center",
      backgroundColor: COLORS.card,
      borderRadius: 20,
      padding: 16,
      borderWidth: 1,
      borderColor: COLORS.line,
    },
    brand: { fontSize: 20, color: COLORS.text },
    brandSub: { color: COLORS.sub, fontSize: 13 },
    h1: { fontSize: 24, color: COLORS.text, marginTop: 18 },
    sub: { fontSize: 14, color: COLORS.sub, marginBottom: 8 },
    card: {
      backgroundColor: COLORS.card,
      borderRadius: 20,
      padding: 16,
      marginVertical: 7,
      borderWidth: 1,
      borderColor: COLORS.line,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      borderLeftWidth: 6,
      borderLeftColor: COLORS.green,
    },
    cardTitle: { color: COLORS.text, fontSize: 17 },
    cardDesc: { color: COLORS.sub, fontSize: 13 },
    badge: {
      backgroundColor: COLORS.green,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    onbTop: {
      width: "100%",
      backgroundColor: COLORS.greenSoft,
      borderRadius: 20,
      alignItems: "center",
      paddingVertical: 14,
      borderWidth: 1,
      borderColor: COLORS.line,
    },
    onbTitle: { fontSize: 22, color: COLORS.text },
    onbDesc: { fontSize: 14, color: COLORS.sub },
    btn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12 },
    btnLabel: { color: "#fff", textAlign: "center" },
    cardBox: {
      backgroundColor: COLORS.card,
      borderRadius: 18,
      padding: 16,
      borderWidth: 1,
      borderColor: COLORS.line,
      gap: 8,
    },
    pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, marginBottom: 6 },
    pillText: { fontSize: 18, color: COLORS.text },
  });
