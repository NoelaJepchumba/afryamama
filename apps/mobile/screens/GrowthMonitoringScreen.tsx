import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View, TouchableOpacity, ScrollView } from 'react-native';
import {
  fetchChildrenProfiles,
  fetchGrowthMonitoring,
  type MobileChildProfile,
  type MobileGrowthPoint,
} from '../lib/firestoreData';

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
  const [children, setChildren] = useState<MobileChildProfile[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [babyRows, setBabyRows] = useState<MobileGrowthPoint[]>([]);

  useEffect(() => {
    async function loadGrowthRows() {
      try {
        if (!email) {
          setChildren([]);
          setSelectedChildId(null);
          setBabyRows([]);
          return;
        }

        const loadedChildren = await fetchChildrenProfiles(email.toLowerCase());
        const activeChildId = selectedChildId || loadedChildren[0]?.id || null;
        const childItems = await fetchGrowthMonitoring(email.toLowerCase(), activeChildId || undefined);
        setChildren(loadedChildren);
        setSelectedChildId(activeChildId);
        setBabyRows(childItems);
      } finally {
        setLoading(false);
      }
    }

    loadGrowthRows();
  }, [email, selectedChildId]);

  const chartRows = useMemo(() => {
    return [...babyRows].sort((left, right) => {
      const leftTime = new Date(left.date).getTime();
      const rightTime = new Date(right.date).getTime();
      const safeLeft = Number.isNaN(leftTime) ? 0 : leftTime;
      const safeRight = Number.isNaN(rightTime) ? 0 : rightTime;
      return safeLeft - safeRight;
    });
  }, [babyRows]);

  const maxBabyWeight = useMemo(() => {
    if (babyRows.length === 0) return 0;
    return babyRows.reduce((max, row) => Math.max(max, toNumeric(row.weight)), 0);
  }, [babyRows]);

  const maxBabyHeight = useMemo(() => {
    if (babyRows.length === 0) return 0;
    return babyRows.reduce((max, row) => Math.max(max, toNumeric(row.height)), 0);
  }, [babyRows]);

  const latestRow = chartRows.length > 0 ? chartRows[chartRows.length - 1] : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Child Growth Charts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.bubbleOne} />
          <View style={styles.bubbleTwo} />
          <Text style={styles.heroTag}>CHILD METRICS</Text>
          <Text style={styles.heroTitle}>Child Growth Journey</Text>
          <Text style={styles.heroText}>
            Follow child growth trends from doctor visits with visual bars for weight and height over time.
          </Text>
        </View>

        {children.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.switcherRow}>
            {children.map((child) => {
              const active = child.id === selectedChildId;
              return (
                <TouchableOpacity
                  key={child.id}
                  style={[styles.switcherChip, active ? styles.switcherChipActive : null]}
                  onPress={() => setSelectedChildId(child.id)}
                >
                  <Text style={[styles.switcherChipText, active ? styles.switcherChipTextActive : null]}>{child.childName}</Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        ) : null}

        {loading ? <Text style={styles.emptyText}>Loading growth data...</Text> : null}

        {!loading && babyRows.length === 0 ? (
          <Text style={styles.emptyText}>No child growth rows found in Firestore.</Text>
        ) : null}

        {!loading && latestRow ? (
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Latest Weight</Text>
              <Text style={styles.statValue}>{latestRow.weight}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Latest Height</Text>
              <Text style={styles.statValue}>{latestRow.height}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Head Circ.</Text>
              <Text style={styles.statValue}>{latestRow.headCircumference}</Text>
            </View>
          </View>
        ) : null}

        {!loading && chartRows.length > 0 ? (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Weight Trend</Text>
            <Text style={styles.chartHint}>Each bar is one visit</Text>
            <View style={styles.chartArea}>
              {chartRows.map((row) => {
                const weight = toNumeric(row.weight);
                const barHeight = maxBabyWeight > 0 ? Math.max((weight / maxBabyWeight) * 100, 8) : 8;
                return (
                  <View key={`w-${row.id}`} style={styles.chartColumn}>
                    <View style={[styles.chartBarWeight, { height: `${barHeight}%` as `${number}%` }]} />
                    <Text style={styles.chartDate}>{row.date.slice(5, 10)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {!loading && chartRows.length > 0 ? (
          <View style={styles.chartCard}>
            <Text style={styles.chartTitle}>Height Trend</Text>
            <Text style={styles.chartHint}>Watch steady height progression</Text>
            <View style={styles.chartArea}>
              {chartRows.map((row) => {
                const height = toNumeric(row.height);
                const barHeight = maxBabyHeight > 0 ? Math.max((height / maxBabyHeight) * 100, 8) : 8;
                return (
                  <View key={`h-${row.id}`} style={styles.chartColumn}>
                    <View style={[styles.chartBarHeight, { height: `${barHeight}%` as `${number}%` }]} />
                    <Text style={styles.chartDate}>{row.date.slice(5, 10)}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {chartRows.map((row) => {
          const weight = toNumeric(row.weight);
          const widthPercent = maxBabyWeight > 0 ? Math.max((weight / maxBabyWeight) * 100, 6) : 6;
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
    backgroundColor: '#F8FAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 52,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#3a0440',
  },
  backBtn: {
    marginRight: 12,
  },
  backBtnText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 15,
    fontWeight: '600',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
  },
  content: {
    padding: 18,
    paddingBottom: 50,
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#55075c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  bubbleOne: {
    position: 'absolute',
    right: -30,
    top: -25,
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: '#f8e7fb',
  },
  bubbleTwo: {
    position: 'absolute',
    right: 40,
    bottom: -36,
    width: 90,
    height: 90,
    borderRadius: 999,
    backgroundColor: '#fceefc',
  },
  heroTag: {
    color: '#55075c',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  heroTitle: {
    color: '#1a1a2e',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroText: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 18,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  switcherRow: {
    gap: 8,
    paddingBottom: 10,
  },
  switcherChip: {
    borderWidth: 1,
    borderColor: '#EBD6ED',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  switcherChipActive: {
    borderColor: '#55075c',
    backgroundColor: '#fdf5f9',
  },
  switcherChipText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '700',
  },
  switcherChipTextActive: {
    color: '#55075c',
  },
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  statLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '700',
  },
  statValue: {
    color: '#55075c',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 4,
  },
  chartCard: {
    backgroundColor: '#ffffff',
    borderColor: '#EBD6ED',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
  },
  chartTitle: {
    color: '#1f2937',
    fontSize: 15,
    fontWeight: '800',
  },
  chartHint: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 10,
  },
  chartArea: {
    height: 130,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1e0f5',
    paddingTop: 12,
    gap: 6,
  },
  chartColumn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  chartBarWeight: {
    width: '100%',
    maxWidth: 18,
    backgroundColor: '#55075c',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  chartBarHeight: {
    width: '100%',
    maxWidth: 18,
    backgroundColor: '#0ea5a4',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  chartDate: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 6,
  },
  card: {
    backgroundColor: '#ffffff',
    borderColor: '#EBD6ED',
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#55075c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  date: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  value: {
    color: '#55075c',
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#e2e8f0',
    overflow: 'hidden',
    marginBottom: 8,
  },
  bar: {
    height: '100%',
    backgroundColor: '#55075c',
    borderRadius: 999,
  },
  meta: {
    color: '#64748b',
    fontSize: 12,
    marginBottom: 2,
  },
});
