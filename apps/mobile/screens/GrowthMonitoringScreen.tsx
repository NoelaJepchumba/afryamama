import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import { fetchGrowthMonitoring, type MobileGrowthPoint } from '../lib/firestoreData';

interface GrowthMonitoringScreenProps {
  email: string;
  onBack: () => void;
}

function toNumeric(value: string): number {
  const match = value.match(/[0-9]+(\.[0-9]+)?/);
  if (!match) return 0;
  return Number.parseFloat(match[0]);
}

export default function GrowthMonitoringScreen({ email, onBack }: GrowthMonitoringScreenProps) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<MobileGrowthPoint[]>([]);

  useEffect(() => {
    async function loadGrowthRows() {
      try {
        if (!email) {
          setRows([]);
          return;
        }

        const items = await fetchGrowthMonitoring(email.toLowerCase());
        setRows(items);
      } finally {
        setLoading(false);
      }
    }

    loadGrowthRows();
  }, [email]);

  const maxWeight = useMemo(() => {
    if (rows.length === 0) return 0;
    return rows.reduce((max, row) => Math.max(max, toNumeric(row.weight)), 0);
  }, [rows]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Growth Monitoring Charts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {loading ? <Text style={styles.emptyText}>Loading growth data...</Text> : null}

        {!loading && rows.length === 0 ? (
          <Text style={styles.emptyText}>No growth monitoring rows found in Firestore.</Text>
        ) : null}

        {rows.map((row) => {
          const weight = toNumeric(row.weight);
          const widthPercent = maxWeight > 0 ? Math.max((weight / maxWeight) * 100, 6) : 6;
          return (
            <View key={row.id} style={styles.card}>
              <View style={styles.rowTop}>
                <Text style={styles.date}>{row.date}</Text>
                <Text style={styles.value}>{row.weight}</Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.bar, { width: `${widthPercent}%` as `${number}%` }]} />
              </View>
              <Text style={styles.meta}>Height: {row.height}</Text>
              <Text style={styles.meta}>Head Circumference: {row.headCircumference}</Text>
            </View>
          );
        })}
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
    color: '#34d399',
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
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  date: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  value: {
    color: '#34d399',
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#1f2a40',
    overflow: 'hidden',
    marginBottom: 8,
  },
  bar: {
    height: '100%',
    backgroundColor: '#34d399',
    borderRadius: 999,
  },
  meta: {
    color: '#94a3b8',
    fontSize: 12,
    marginBottom: 2,
  },
});
