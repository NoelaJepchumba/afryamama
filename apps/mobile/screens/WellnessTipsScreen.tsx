import React from 'react';
import { StyleSheet, Text, View, ScrollView, TouchableOpacity } from 'react-native';

interface WellnessTipsProps {
  email: string;
  onBack: () => void;
}

const HARDCODED_MCH_BOOKLET_CARDS: Array<{
  id: string;
  title: string;
  category: string;
  lines: string[];
}> = [
  {
    id: 'mch-hardcoded-danger-signs',
    title: 'Danger Signs To Know',
    category: 'MCH BOOKLET',
    lines: [
      'Severe headache, blurred vision, or swelling of face and hands.',
      'Vaginal bleeding, leaking fluid, or severe abdominal pain.',
      'High fever, convulsions, or difficulty breathing.',
      'Reduced baby movement in pregnancy or baby refusing to feed after birth.',
      'Seek care immediately at the nearest health facility when any sign appears.',
    ],
  },
  {
    id: 'mch-hardcoded-child-steps',
    title: 'Steps Of Your Child Development',
    category: 'MCH BOOKLET',
    lines: [
      '0-2 months: responds to sound, begins smiling, follows faces.',
      '3-5 months: better head control, reaches for objects, laughs.',
      '6-8 months: sits with little support, starts babbling, rolls over.',
      '9-12 months: crawls, stands with support, says simple sounds.',
      '12+ months: takes first steps, responds to name, explores actively.',
    ],
  },
];

export default function WellnessTipsScreen({ email, onBack }: WellnessTipsProps) {
  void email;

  function cardStyles(index: number) {
    const themes = [
        { bg: '#fdf5f9', border: '#EBD6ED', tagColor: '#55075c' },
        { bg: '#f8fafc', border: '#e2e8f0', tagColor: '#334155' },
        { bg: '#f0fdf4', border: '#bbf7d0', tagColor: '#15803d' },
        { bg: '#fffbeb', border: '#fde68a', tagColor: '#b45309' },
    ];
    return themes[index % themes.length];
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Wellness Center</Text>
        <Text style={styles.heroSub}>Practical guidance based on your MCH journey.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTag}>MOTHER KNOWLEDGE</Text>
          <Text style={styles.heroTitle}>What You Need To Know</Text>
          <Text style={styles.heroText}>Stage-aware guidance cards from the MCH booklet.</Text>
        </View>

        <Text style={styles.sectionTitle}>MCH Booklet Essentials</Text>
        {HARDCODED_MCH_BOOKLET_CARDS.map((card, index) => {
          const theme = cardStyles(index);
          return (
            <View style={[styles.tipCard, { backgroundColor: theme.bg, borderColor: theme.border }]} key={card.id}>
              <Text style={[styles.tipCategory, { color: theme.tagColor }]}>{card.category}</Text>
              <Text style={styles.tipTitle}>{card.title}</Text>
              {card.lines.map((line) => (
                <Text key={`${card.id}-${line}`} style={styles.bulletLine}>• {line}</Text>
              ))}
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
  hero: {
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
  },
  heroCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EBD6ED',
    borderRadius: 16,
    padding: 16,
    marginBottom: 18,
    shadowColor: '#55075c',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
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
    fontSize: 22,
    fontWeight: '800',
    marginBottom: 4,
  },
  heroText: {
    color: '#64748b',
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
  },
  emptyText: {
    color: '#94a3b8',
    fontSize: 13,
    marginBottom: 12,
  },
  tipCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#55075c',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  tipCategory: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  tipTitle: {
    color: '#1a1a2e',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  bulletLine: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 4,
  },
});
