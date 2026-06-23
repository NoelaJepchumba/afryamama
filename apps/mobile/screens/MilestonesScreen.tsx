import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { fetchMilestones, type MobileMilestone } from '../lib/firestoreData';

interface MilestonesScreenProps {
  email: string;
  onBack: () => void;
}

export default function MilestonesScreen({ email, onBack }: MilestonesScreenProps) {
  const [loading, setLoading] = useState(true);
  const [milestones, setMilestones] = useState<MobileMilestone[]>([]);

  useEffect(() => {
    async function loadMilestones() {
      try {
        if (!email) {
          setMilestones([]);
          return;
        }

        const rows = await fetchMilestones(email.toLowerCase());
        setMilestones(rows);
      } finally {
        setLoading(false);
      }
    }

    loadMilestones();
  }, [email]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Milestones</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.emptyText}>Loading milestones...</Text> : null}

        {!loading && milestones.length === 0 ? (
          <Text style={styles.emptyText}>No milestone entries found in Firestore.</Text>
        ) : null}

        {milestones.map((item) => (
          <View style={styles.card} key={item.id}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.weekChip}>{item.week}</Text>
            </View>
            <Text style={styles.cardMeta}>Status: {item.status}</Text>
            <Text style={styles.cardText}>{item.details}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0b0f19',
    paddingTop: 48,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#243049',
  },
  backBtn: {
    marginRight: 16,
  },
  backBtnText: {
    color: '#22d3ee',
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
  },
  content: {
    padding: 24,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  card: {
    backgroundColor: '#121826',
    borderColor: '#243049',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  weekChip: {
    color: '#0f172a',
    backgroundColor: '#22d3ee',
    fontSize: 11,
    fontWeight: '700',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
  },
  cardMeta: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 4,
  },
  cardText: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
});
