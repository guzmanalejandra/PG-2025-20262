import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View, Image } from "react-native";
import * as Speech from "expo-speech";

export default function IntroScreen({ navigation }: any) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start();
    Speech.speak("Bienvenido a Doritapp. Toca la pantalla para comenzar.", {
      language: "es-ES",
      rate: 0.95,
    });
  }, []);

  const handleTap = () => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 600,
      useNativeDriver: true,
    }).start(() => {
      navigation.replace("Onboarding");
    });
  };

  return (
    <Pressable style={styles.container} onPress={handleTap}>
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        <Image
          source={require("./assets/doritapp-logo.png")}
          style={{ width: 140, height: 140 }}
          resizeMode="contain"
        />
        <Text style={styles.title}>DORITAPP</Text>
        <Text style={styles.subtitle}>Aprende a leer paso a paso</Text>
        <Text style={styles.tap}>Toca la pantalla para comenzar</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  content: { alignItems: "center", gap: 8 },
  title: { fontSize: 32, fontWeight: "900", color: "#43A047", letterSpacing: 2 },
  subtitle: { fontSize: 16, color: "#4B5563" },
  tap: { fontSize: 14, color: "#FF8A00", marginTop: 20 },
});
