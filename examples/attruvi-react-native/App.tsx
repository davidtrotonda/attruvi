import {Attruvi} from '@attruvi/react-native';
import {useEffect, useState} from 'react';
import {
  Button,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native';
import {SafeAreaProvider, useSafeAreaInsets} from 'react-native-safe-area-context';

function App() {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <AppContent />
    </SafeAreaProvider>
  );
}

function AppContent() {
  const safeAreaInsets = useSafeAreaInsets();
  const [status, setStatus] = useState('Inicializando…');

  useEffect(() => {
    const unsubscribe = Attruvi.onAttributionChanged(attribution => {
      setStatus(`Atribución: ${attribution?.source ?? attribution?.method ?? 'orgánico'}`);
    });
    void Attruvi.initialize({
      appKey: 'attruvi_test_replace_me',
      endpoint: 'https://ingest.example.com',
      environment: 'development',
      consent: 'granted',
      propertyAllowlist: {
        events: {
          purchase: ['transactionId', 'valueMinor', 'currency', 'productId'],
          subscription_started: [
            'transactionId',
            'valueMinor',
            'currency',
            'productId',
            'subscriptionId',
          ],
        },
      },
    }).then(() => setStatus('SDK preparado'));
    return unsubscribe;
  }, []);

  const run = async (label: string, action: () => Promise<unknown>) => {
    try {
      await action();
      setStatus(`${label}: evento encolado`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Error desconocido');
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[
        styles.container,
        {paddingTop: safeAreaInsets.top + 24, paddingBottom: safeAreaInsets.bottom + 24},
      ]}>
      <Text style={styles.eyebrow}>ATTRUVI · REACT NATIVE 0.87</Text>
      <Text style={styles.title}>Ejemplo del SDK</Text>
      <Text style={styles.copy}>
        Los eventos permanecen en el dispositivo si no hay red y conservan el mismo event_id al
        reintentarse.
      </Text>
      <View style={styles.actions}>
        <Button
          title="Simular install"
          onPress={() => run('Install', () => Attruvi.track('install_simulation'))}
        />
        <Button title="Enviar sign_up" onPress={() => run('Registro', () => Attruvi.track('sign_up'))} />
        <Button
          title="Enviar purchase"
          onPress={() =>
            run('Compra', () =>
              Attruvi.track('purchase', {
                transactionId: `demo-${Date.now()}`,
                valueMinor: 4990,
                currency: 'EUR',
                productId: 'tour-premium',
              }),
            )
          }
        />
        <Button
          title="Enviar subscription"
          onPress={() =>
            run('Suscripción', () =>
              Attruvi.track('subscription_started', {
                transactionId: `sub-${Date.now()}`,
                valueMinor: 999,
                currency: 'EUR',
                productId: 'premium-monthly',
                subscriptionId: 'demo-subscription',
              }),
            )
          }
        />
        <Button title="Forzar envío" onPress={() => run('Flush', () => Attruvi.flush())} />
      </View>
      <Text accessibilityLiveRegion="polite" style={styles.status}>
        {status}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    gap: 16,
    paddingHorizontal: 24,
    backgroundColor: '#fffaf7',
  },
  eyebrow: {
    color: '#ff5a1f',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    color: '#18181b',
    fontSize: 36,
    fontWeight: '800',
  },
  copy: {
    color: '#52525b',
    fontSize: 17,
    lineHeight: 25,
  },
  actions: {
    gap: 12,
    marginVertical: 12,
  },
  status: {
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    color: '#7c2d12',
    backgroundColor: '#fff7ed',
  },
});

export default App;
