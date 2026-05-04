import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native';
import { useAuth } from '../context/AuthContext';
import { TEAMS } from '../constants/teams';

export default function ProfileScreen() {
  const { profile, logout } = useAuth();
  const team = TEAMS.find((t) => t.id === profile?.teamId);

  function handleLogout() {
    Alert.alert('Sair', 'Tem certeza que quer sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: logout },
    ]);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar */}
      <View style={styles.avatarCircle}>
        <Text style={styles.avatarText}>
          {profile?.nick?.charAt(0).toUpperCase() ?? '?'}
        </Text>
      </View>

      <Text style={styles.nick}>{profile?.nick ?? ''}</Text>
      <View style={styles.teamBadge}>
        <Text style={styles.teamEmoji}>{team?.shield ?? '⚽'}</Text>
        <Text style={[styles.teamName, { color: team?.color ?? '#00e676' }]}>
          {team?.name ?? ''}
        </Text>
      </View>

      {/* Stats */}
      <View style={styles.statsContainer}>
        <Text style={styles.statsTitle}>Suas Estatísticas</Text>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{profile?.totalGoals ?? 0}</Text>
            <Text style={styles.statLabel}>Gols Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>3 min</Text>
            <Text style={styles.statLabel}>Cooldown</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>65%</Text>
            <Text style={styles.statLabel}>Taxa de Gol</Text>
          </View>
        </View>
      </View>

      {/* Como jogar */}
      <View style={styles.rulesCard}>
        <Text style={styles.rulesTitle}>📜 Como Jogar</Text>
        <Text style={styles.rulesText}>
          1. Clique em <Text style={{ color: '#00e676', fontWeight: 'bold' }}>CHUTAR</Text> na tela inicial.{'\n'}
          2. Cada chute tem <Text style={{ color: '#fff' }}>65% de chance</Text> de virar gol.{'\n'}
          3. Aguarde o cooldown de <Text style={{ color: '#fff' }}>3 minutos</Text> para chutar de novo.{'\n'}
          4. Seus gols somam no ranking de hora, rodada e temporada.{'\n'}
          5. Seja o <Text style={{ color: '#FFD700' }}>#1 no ranking</Text> e conquiste o título!
        </Text>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>Sair da conta</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center',
  },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#00e676',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  avatarText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#0a1628',
  },
  nick: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  teamBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 30,
  },
  teamEmoji: { fontSize: 22 },
  teamName: { fontSize: 16, fontWeight: '600' },
  statsContainer: {
    width: '100%',
    marginBottom: 20,
  },
  statsTitle: {
    color: '#aaa',
    fontSize: 14,
    marginBottom: 12,
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#1a2a40',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2a3a50',
  },
  statValue: {
    color: '#00e676',
    fontSize: 20,
    fontWeight: 'bold',
  },
  statLabel: {
    color: '#888',
    fontSize: 11,
    marginTop: 4,
  },
  rulesCard: {
    width: '100%',
    backgroundColor: '#1a2a40',
    borderRadius: 16,
    padding: 20,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#2a3a50',
  },
  rulesTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  rulesText: {
    color: '#aaa',
    fontSize: 14,
    lineHeight: 24,
  },
  logoutButton: {
    borderWidth: 1,
    borderColor: '#ff5252',
    borderRadius: 12,
    paddingHorizontal: 36,
    paddingVertical: 14,
  },
  logoutText: {
    color: '#ff5252',
    fontSize: 16,
    fontWeight: '600',
  },
});
