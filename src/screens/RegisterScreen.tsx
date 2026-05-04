import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { TEAMS } from '../constants/teams';

export default function RegisterScreen({ navigation }: any) {
  const { register } = useAuth();
  const [nick, setNick] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister() {
    if (!nick.trim() || !email.trim() || !password || !selectedTeam) {
      Alert.alert('Atenção', 'Preencha todos os campos e escolha um time.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Atenção', 'A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await register(email.trim(), password, nick.trim(), selectedTeam);
    } catch (e: any) {
      const code = e?.code ?? '';
      let msg = 'Verifique os dados e tente novamente.';
      if (code === 'auth/email-already-in-use') msg = 'Este e-mail já está cadastrado.';
      else if (code === 'auth/weak-password') msg = 'Senha muito fraca. Use pelo menos 6 caracteres.';
      else if (code === 'auth/invalid-email') msg = 'E-mail inválido.';
      else if (code === 'auth/network-request-failed') msg = 'Sem conexão com a internet.';
      else if (code) msg = `Erro: ${code}`;
      Alert.alert('Erro ao cadastrar', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0a1628' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>⚽ Criar Conta</Text>

        <TextInput
          style={styles.input}
          placeholder="Seu nick / apelido"
          placeholderTextColor="#666"
          value={nick}
          onChangeText={setNick}
          maxLength={20}
        />
        <TextInput
          style={styles.input}
          placeholder="E-mail"
          placeholderTextColor="#666"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          style={styles.input}
          placeholder="Senha (mín. 6 caracteres)"
          placeholderTextColor="#666"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        <Text style={styles.sectionLabel}>Escolha seu time:</Text>
        <View style={styles.teamsGrid}>
          {TEAMS.map((team) => (
            <TouchableOpacity
              key={team.id}
              style={[
                styles.teamCard,
                selectedTeam === team.id && { borderColor: team.color, backgroundColor: '#1a2a40' },
              ]}
              onPress={() => setSelectedTeam(team.id)}
            >
              <Text style={styles.teamShield}>{team.shield}</Text>
              <Text style={[styles.teamName, selectedTeam === team.id && { color: '#fff' }]}>
                {team.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.button, !selectedTeam && styles.buttonDisabled]}
          onPress={handleRegister}
          disabled={loading || !selectedTeam}
        >
          {loading ? (
            <ActivityIndicator color="#0a1628" />
          ) : (
            <Text style={styles.buttonText}>CRIAR CONTA</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginBottom: 30 }}>
          <Text style={styles.link}>Já tenho conta</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 24,
    paddingTop: 60,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#00e676',
    marginBottom: 28,
  },
  input: {
    width: '100%',
    backgroundColor: '#1a2a40',
    color: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#2a3a50',
  },
  sectionLabel: {
    alignSelf: 'flex-start',
    color: '#aaa',
    fontSize: 15,
    marginBottom: 12,
    marginTop: 4,
  },
  teamsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 24,
  },
  teamCard: {
    width: '30%',
    backgroundColor: '#1a2a40',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2a3a50',
    alignItems: 'center',
    paddingVertical: 10,
    marginBottom: 10,
  },
  teamShield: {
    fontSize: 20,
    marginBottom: 4,
  },
  teamName: {
    color: '#888',
    fontSize: 11,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    backgroundColor: '#00e676',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  buttonDisabled: {
    backgroundColor: '#1a4a30',
  },
  buttonText: {
    color: '#0a1628',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  link: {
    color: '#00e676',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});
